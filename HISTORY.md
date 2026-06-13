## v1

Chatbot integrated with the deno server's RAG (Retrieval-Augmented Generation) pipeline (`/api/search_and_chat`).

### RAG Flow

```
User question
  │
  ▼
TF-IDF search over chunked book corpus (data_<lib>/chunks.jsonl)
  │  top-k most relevant text chunks retrieved
  ▼
Chunks injected as context into a system prompt
  │  + prior conversation history for multi-turn
  ▼
LLM (DashScope / Qwen) generates an answer grounded in the retrieved context
  │
  ▼
Response returned with answer text + source citations
```

### Changes

- Chat client sends `{ q, lib, topk, messages }` to the `search_and_chat` endpoint.
- Prior conversation is forwarded as `messages` for multi-turn context.
- `chatLib` config (TF-IDF library name) added to `README.md` / `AppConfig`.
- Response interceptor appends RAG source citations (book, chapter, chunk, score) to the reply.

## v2

* Optimze the prompt in deno server
* use New Model (qwen/qwen3-30b-a3b) 
* Optimize the search way
    * tfidf way
    * vector way
    * allow history