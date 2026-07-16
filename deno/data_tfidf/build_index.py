#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build an offline searchable index from an EPUB (zip-based parser).
Outputs:
  - chunks.jsonl
  - tfidf_vectorizer.joblib
  - tfidf_matrix.npz

Example:
  python build_index.py /path/to/book.epub --out ./index_dir
"""
import argparse, json, re, zipfile, xml.etree.ElementTree as ET, os
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning
import warnings
warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

import joblib
import numpy as np
import scipy.sparse as sp
from sklearn.feature_extraction.text import TfidfVectorizer

NS={'opf':'http://www.idpf.org/2007/opf','dc':'http://purl.org/dc/elements/1.1/'}

def parse_opf(zf):
    opf_name='content.opf'
    if opf_name not in zf.namelist():
        # try container.xml
        c=zf.read('META-INF/container.xml')
        r=ET.fromstring(c)
        # try common xpath
        for elem in r.iter():
            if elem.tag.endswith('rootfile'):
                opf_name=elem.attrib.get('full-path')
                break
    root=ET.fromstring(zf.read(opf_name))
    title=(root.find('.//dc:title', NS).text or '').strip()
    creator_el=root.find('.//dc:creator', NS)
    author=(creator_el.text or '').strip() if creator_el is not None else ''

    manifest={}
    for item in root.findall('.//opf:manifest/opf:item', NS):
        manifest[item.attrib['id']]={'href':item.attrib.get('href'), 'media_type':item.attrib.get('media-type')}
    spine=[]
    for itemref in root.findall('.//opf:spine/opf:itemref', NS):
        spine.append(itemref.attrib['idref'])
    spine_hrefs=[]
    for idref in spine:
        it=manifest.get(idref)
        if not it: 
            continue
        if it['media_type'] in ('application/xhtml+xml','text/html'):
            spine_hrefs.append(it['href'])
    return title, author, spine_hrefs

def html_to_blocks(html_bytes):
    soup=BeautifulSoup(html_bytes, 'html.parser')
    for tag in soup(['script','style']):
        tag.decompose()
    blocks=[]
    for el in soup.find_all(['h1','h2','h3','p','li']):
        text=el.get_text(" ", strip=True)
        text=re.sub(r'\s+', ' ', text).strip()
        if not text: 
            continue
        if el.name in ('h1','h2','h3'):
            blocks.append(('heading', text))
        else:
            blocks.append(('text', text))
    return blocks

def extract_chapter_title(html_bytes):
    soup=BeautifulSoup(html_bytes,'html.parser')
    for tag in soup(['script','style']):
        tag.decompose()
    for el in soup.find_all(['h1','h2','h3']):
        txt=re.sub(r'\s+',' ', el.get_text(" ", strip=True)).strip()
        if txt:
            return txt
    for el in soup.find_all(['p','div','span']):
        cls=" ".join(el.get('class',[]))
        if 'yinwen' in cls:
            txt=re.sub(r'\s+',' ', el.get_text(" ", strip=True)).strip()
            if txt:
                return txt[:40] + ('…' if len(txt)>40 else '')
    first=soup.find(['p','div'])
    if first:
        txt=re.sub(r'\s+',' ', first.get_text(" ", strip=True)).strip()
        if txt:
            return txt[:40] + ('…' if len(txt)>40 else '')
    return None

def make_chunks(book_title, author, chapters, target_chars=900, overlap_chars=150):
    chunks=[]
    for c in chapters:
        texts=[]
        for kind,txt in c['blocks']:
            if kind=='heading':
                texts.append(f"\n【{txt}】\n")
            else:
                texts.append(txt+"\n")
        full="".join(texts).strip()
        if not full:
            continue
        start=0
        idx=0
        while start < len(full):
            end=min(len(full), start+target_chars)
            piece=full[start:end].strip()
            if piece:
                chunks.append({
                    'book_title': book_title,
                    'author': author,
                    'spine_index': c['spine_index'],
                    'href': c['href'],
                    'chapter_title': c['heading'] or f"spine_{c['spine_index']}",
                    'chunk_index': idx,
                    'char_start': start,
                    'char_end': end,
                    'text': piece,
                })
                idx += 1
            if end==len(full):
                break
            start = end - overlap_chars
    return chunks

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("epub", help="path to epub")
    ap.add_argument("--out", default="./index_dir")
    ap.add_argument("--target_chars", type=int, default=900)
    ap.add_argument("--overlap_chars", type=int, default=150)
    args=ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    zf=zipfile.ZipFile(args.epub)
    book_title, author, spine_hrefs = parse_opf(zf)

    chapters=[]
    for i,href in enumerate(spine_hrefs):
        data=zf.read(href)
        blocks=html_to_blocks(data)
        heading=extract_chapter_title(data)
        chapters.append({'spine_index': i, 'href': href, 'heading': heading, 'blocks': blocks})

    chunks=make_chunks(book_title, author, chapters, target_chars=args.target_chars, overlap_chars=args.overlap_chars)

    chunks_path=os.path.join(args.out, "chunks.jsonl")
    with open(chunks_path,'w',encoding='utf-8') as f:
        for c in chunks:
            f.write(json.dumps(c, ensure_ascii=False)+"\n")

    corpus=[c['text'] for c in chunks]
    vectorizer=TfidfVectorizer(analyzer='char', ngram_range=(2,4), min_df=1)
    X=vectorizer.fit_transform(corpus)

    joblib.dump(vectorizer, os.path.join(args.out,"tfidf_vectorizer.joblib"))
    sp.save_npz(os.path.join(args.out,"tfidf_matrix.npz"), X)
    print(f"OK. chunks={len(chunks)}  out={args.out}")

if __name__ == "__main__":
    main()
