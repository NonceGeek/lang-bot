# EPUB 外挂到 LLM：离线检索库（TF‑IDF 版）

这是一套**不需要联网、不要向量数据库**的最小可用 RAG 外挂方案。
核心思路：把 EPUB 切块 -> 用 TF‑IDF（中文用 char ngram）建索引 -> 查询时返回最相关 chunks。

> 适合你想先跑通“外挂知识库”的完整链路；后续再换成 Embedding + 向量库即可。

## 本目录内容
- `chunks.jsonl`：切块后的文本与元数据（已从《八万四千问》抽取）
- `tfidf_vectorizer.joblib`：TF‑IDF 向量化器
- `tfidf_matrix.npz`：全部 chunk 的 TF‑IDF 矩阵
- `query.py`：离线检索脚本
- `build_index.py`：对任意 epub 重新构建索引

## 快速使用
基于 epub 建立 `chunks.jsonl` 等文件：
```bash
python build_index.py ./example.epub --out ./index_dir
```

在本目录下运行：
```bash
python query.py "藏传佛教如何看待死亡" --topk 5
```

## 如何接到 LLM（RAG Prompt）
1. 用 `query.py`（或把里面的 search 逻辑搬进服务）得到 top-k chunks
2. 把 chunks 拼成 `context`
3. Prompt 里要求模型：
   - 只基于 context 回答
   - 给出引用：`chapter_title + href + chunk_index`

示例 Prompt（伪）：
```
你是严谨的问答助手。只允许依据【资料】回答；若资料不足请说不知道。
【资料】
{top_chunks}
【问题】
{user_question}
```

## 后续升级路径（推荐）
- 把 TF‑IDF 换成 Embedding（如 OpenAI / bge-m3 / text2vec）
- 存进向量库（pgvector / chroma / faiss）
- 加 rerank（cross-encoder）提升命中率
