#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Offline EPUB RAG demo (TF‑IDF char ngrams).
Usage:
  python query.py "你的问题" --topk 5
"""
import argparse, json
import joblib
import numpy as np
import scipy.sparse as sp
from sklearn.metrics.pairwise import cosine_similarity

def load_chunks(path):
    chunks=[]
    with open(path,'r',encoding='utf-8') as f:
        for line in f:
            chunks.append(json.loads(line))
    return chunks

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("query", help="search query")
    ap.add_argument("--topk", type=int, default=5)
    ap.add_argument("--chunks", default="chunks.jsonl")
    ap.add_argument("--vectorizer", default="tfidf_vectorizer.joblib")
    ap.add_argument("--matrix", default="tfidf_matrix.npz")
    args=ap.parse_args()

    chunks=load_chunks(args.chunks)
    vectorizer=joblib.load(args.vectorizer)
    X=sp.load_npz(args.matrix)

    qv=vectorizer.transform([args.query])
    sims=cosine_similarity(qv, X).ravel()
    idxs=np.argsort(-sims)[:args.topk]

    for rank,i in enumerate(idxs, start=1):
        c=chunks[int(i)]
        score=float(sims[int(i)])
        print(f"\n#{rank} score={score:.4f}")
        print(f"- chapter: {c.get('chapter_title')}")
        print(f"- href: {c.get('href')}  chunk: {c.get('chunk_index')}")
        print("----")
        print(c.get('text')[:1200])
        print("----")

if __name__ == "__main__":
    main()
