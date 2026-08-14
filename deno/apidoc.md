# Lang ChatBot — API Documentation

> Deno backend for LangChatbot: chat, TF-IDF / vector search, RAG, Cantonese ASR & TTS, Zhihu search, and certificate helpers (`agent_lib_cert_master`).
>
> LLM, embeddings, ASR & TTS via **Alibaba DashScope / 百炼**:
> - Chat: `qwen3-30b-a3b` → `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`
> - Embeddings: `text-embedding-v4` (1024 dims) → `.../compatible-mode/v1/embeddings`
> - ASR: `qwen3-asr-flash` → same chat completions path with `input_audio`
> - TTS: `qwen3-tts-flash` → DashScope multimodal generation API
>
> Zhihu on-site search via **[知乎开放平台](https://developer.zhihu.com/docs?key=zhihu_search)** `zhihu_search`.

## Base URL

```
http://localhost:3003
```

---

## Public Endpoints

### `GET /`

Server greeting.

**Response:** Plain text, e.g. `Hello from Lang ChatBot Server`.

---

### `GET /health`

Health check for monitoring and load balancers.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-07-16T01:00:00.000Z"
}
```

---

### `GET /docs`

API documentation in Markdown.

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `doc` | string | No | `apidoc` | Basename of a `.md` file in the server working directory (e.g. `whitepaper` → `./whitepaper.md`). Single segment only: letters, digits, `.`, `_`, `-`; no path separators. |

**Response:** Raw Markdown (`text/markdown`).

**Error Responses:**

- `400` — Invalid `doc` parameter
- `404` — File not found
- `500` — Could not read file

**Examples:**
```bash
curl "http://localhost:3003/docs"
curl "http://localhost:3003/docs?doc=whitepaper"
```

---

### `GET /docs/html`

Same as `GET /docs`, rendered as HTML with GitHub Flavored Markdown styling.

**Examples:**
```bash
curl "http://localhost:3003/docs/html"
curl "http://localhost:3003/docs/html?doc=apidoc"
```

---

## Chat Endpoints

### `POST /api/chat`

Chat **without retrieval** — same request shape as `/api/search_and_chat`, but skips TF-IDF / vector search (no `search_mode`, `lib`, `topk`, or `sources`).

Requires `DASHSCOPE_API_KEY` (or `ALI_API_KEY`).

**Request Body:**
```json
{
  "q": "ສະບາຍດີ ແປນວ່າ «ຂອບໃຈ» ເປັນພາສາອັງກິດແນວໃດ?",
  "messages": [],
  "system_prompt": null
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `q` | string | Yes | — | User question |
| `messages` | array | No | `[]` | Prior turns (`role` + `content`) for multi-turn context |
| `system_prompt` | string \| number | No | built-in template `[0]` | See **System prompt** below. Alias: `systemPrompt` |

#### System prompt (`system_prompt`)

| Value | Behavior |
|-------|----------|
| omitted, `null`, or `""` | Built-in template **index `0`** |
| integer `0`, `1`, `2` or string `"0"`, `"1"`, `"2"` | Built-in template at that index |
| any other non-empty string | Used verbatim as a custom system prompt |

| Index | Summary |
|-------|---------|
| `0` | Lao language assistant (default) |
| `1` | Cantonese language assistant |
| `2` | Multilingual assistant |

Out-of-range index → `400` with `available_templates` count.

**Success Response (200):**
```json
{
  "text": "ສະບາຍດີ! «ຂອບໃຈ» ແປນວ່າ thank you ຫຼື thanks ເປັນພາສາອັງກິດ……",
  "system_prompt_template_index": 0
}
```

| Response field | Description |
|----------------|-------------|
| `text` | LLM answer |
| `system_prompt_template_index` | Present when a built-in template index was used (`0`–`2`); omitted for a custom string prompt |

**Error Responses:**

- `400` — Missing `q`; invalid `system_prompt` index
- `500` — `DASHSCOPE_API_KEY` not configured or DashScope error

**Example — default template `[0]` (Lao assistant):**
```bash
curl -X POST http://localhost:3003/api/chat \
  -H "Content-Type: application/json" \
  -d '{"q": "ສະບາຍດີ ແປນວ່າ «ຂອບໃຈ» ເປັນພາສາອັງກິດແນວໃດ?"}'
```

**Example — template `[1]` (Cantonese assistant):**
```bash
curl -X POST http://localhost:3003/api/chat \
  -H "Content-Type: application/json" \
  -d '{"q": "「掂」系咩意思？点样先算地道粤语？", "system_prompt": 1}'
```

**Example — custom system prompt:**
```bash
curl -X POST http://localhost:3003/api/chat \
  -H "Content-Type: application/json" \
  -d '{"q": "How do I greet someone in Lao?", "system_prompt": "You are a friendly Lao tutor. Reply in English with Lao phrases and romanization."}'
```

**Example — multi-turn (Cantonese assistant):**
```bash
curl -X POST http://localhost:3003/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "q": "咁「hea」又系点讲？",
    "system_prompt": 1,
    "messages": [
      {"role": "user", "content": "「掂」系咩意思？"},
      {"role": "assistant", "content": "「掂」喺粤语入面通常表示 OK、得、顶得住，例如「搞掂」即系搞掂晒。"}
    ]
  }'
```

**Example — template `[2]` (multilingual):**
```bash
curl -X POST http://localhost:3003/api/chat \
  -H "Content-Type: application/json" \
  -d '{"q": "How do you say thank you in Japanese?", "system_prompt": "2"}'
```

---

## Search Endpoints

### `GET /api/search`

TF-IDF full-text search. At startup the server discovers every `data_*` folder and registers it as a library (e.g. `data_tfidf/` → `lib=tfidf`).

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `q` | string | Yes | — | Search query |
| `lib` | string | Yes | — | Library name → `data_<lib>/chunks.jsonl` |
| `topk` | number | No | `10` | Number of results (1–50) |

**Success Response (200):**
```json
{
  "query": "老挝泼水节",
  "lib": "tfidf",
  "topk": 10,
  "total_chunks": 137,
  "results": [
    {
      "rank": 1,
      "score": 0.4321,
      "chunk": {
        "book_title": "…",
        "author": "…",
        "spine_index": 10,
        "href": "text/part0009.html",
        "chapter_title": "…",
        "chunk_index": 2,
        "char_start": 0,
        "char_end": 900,
        "text": "..."
      }
    }
  ]
}
```

**Error Responses:**

- `400` — Missing `lib` or `q`
- `404` — Library not found

**Example:**
```bash
curl "http://localhost:3003/api/search?lib=tfidf&q=老水节&topk=10"
```

---

### `GET /api/vector_search`

Semantic search via Supabase pgvector. Each `lib` maps to RPC `match_lib_<lib>` and table `agent_lib_<lib>`. Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Embeddings from DashScope `text-embedding-v4` (1024 dims).

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `q` | string | Yes | — | Search query |
| `lib` | string | No | `psy` | Vector library name (letters, digits, underscores) |
| `topk` | number | No | `10` | Number of results (1–50) |

**Success Response (200):**
```json
{
  "query": "粤语饮茶",
  "lib": "psy",
  "topk": 10,
  "results": [
    {
      "rank": 1,
      "similarity": 0.8234,
      "text": "...",
      "resource_name": "source-file-name"
    }
  ]
}
```

**Examples:**
```bash
curl "http://localhost:3003/api/vector_search?q=粤语饮茶&topk=10"
curl "http://localhost:3003/api/vector_search?q=「掂」系咩意思&lib=dao&topk=10"
```

---

### `GET|POST /api/zhihu-search`

知乎站内搜索 — proxy to [知乎开放平台 `zhihu_search`](https://developer.zhihu.com/docs?key=zhihu_search).

Upstream: `GET https://developer.zhihu.com/api/v1/content/zhihu_search`  
Auth (server-side): `Authorization: Bearer <ZHIHU_ACCESS_SECRET>` + `X-Request-Timestamp` (unix seconds).

Requires `ZHIHU_ACCESS_SECRET`. Returns questions / answers / articles with title, URL, author, summary, votes, comments.

**Query Parameters (GET) / Body fields (POST):**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `q` / `query` | string | Yes | — | Search keyword |
| `count` | number | No | `10` | Number of results (1–10; Zhihu API max) |

Aliases: `Query`, `Count`, `topk`.

**Success Response (200):**
```json
{
  "query": "粤语文化",
  "count": 5,
  "code": 0,
  "message": "success",
  "item_count": 2,
  "items": [
    {
      "title": "粤语文化知多少",
      "url": "https://zhuanlan.zhihu.com/p/123456789",
      "author_name": "张三",
      "summary": "本文介绍了……",
      "vote_up_count": 128,
      "comment_count": 15,
      "edit_time": 1710000000
    }
  ]
}
```

**Error Responses:**

- `400` — Missing `q` / `query`
- `500` — Missing `ZHIHU_ACCESS_SECRET`, or Zhihu upstream error

**Examples:**
```bash
curl "http://localhost:3003/api/zhihu-search?q=粤语&count=5"

curl -X POST http://localhost:3003/api/zhihu-search \
  -H "Content-Type: application/json" \
  -d '{"q": "粤语文化", "count": 5}'
```

**Notes:**

- Official docs: [zhihu_search](https://developer.zhihu.com/docs?key=zhihu_search)
- Access Secret: [知乎开放平台个人中心](https://developer.zhihu.com/personal)
- Optional overrides: `ZHIHU_OPENAPI_BASE_URL`, `ZHIHU_ZHIHU_SEARCH_URL`

---

### `POST /api/search_and_chat`

RAG: retrieve context (TF-IDF or vector), inject into the prompt, call DashScope chat, return answer + sources.

| Mode | Backend | `lib` behavior |
|------|---------|----------------|
| `"tfidf"` (default) | In-memory TF-IDF | **Required** — `data_<lib>/chunks.jsonl` |
| `"vector"` | Supabase pgvector `match_lib_<lib>` | Optional, default `"psy"` |

Requires `DASHSCOPE_API_KEY`. Vector mode also needs Supabase env + matching RPC / table.

**Request Body:**
```json
{
  "q": "介绍下粤语地区的饮茶文化",
  "lib": "tfidf",
  "topk": 10,
  "messages": [],
  "search_mode": "tfidf",
  "system_prompt": null
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `q` | string | Yes | — | User question |
| `search_mode` | string | No | `"tfidf"` | `"tfidf"` or `"vector"` |
| `lib` | string | Conditional | `""` / `"psy"` | TF-IDF: required. Vector: selects `match_lib_<lib>` |
| `topk` | number | No | `10` | Chunks to retrieve (1–50) |
| `messages` | array | No | `[]` | Prior conversation |
| `system_prompt` | string \| number | No | template `[0]` | Same as `/api/chat`. Alias: `systemPrompt` |

The server builds two system messages: (1) resolved system prompt, (2) retrieved citations.

**Success — TF-IDF (200):**
```json
{
  "text": "根据资料，粤语地区的饮茶……",
  "sources": [
    {
      "rank": 1,
      "score": 0.4321,
      "chunk": {
        "book_title": "…",
        "author": "…",
        "chapter_title": "…",
        "chunk_index": 2,
        "text": "..."
      }
    }
  ]
}
```

**Success — Vector (200):**
```json
{
  "text": "根据资料，……",
  "sources": [
    {
      "rank": 1,
      "score": 0.8234,
      "text": "...",
      "resource_name": "source-file-name"
    }
  ],
  "system_prompt_template_index": 0
}
```

**Error Responses:**

- `400` — Missing `q`; missing `lib` for tfidf; invalid `system_prompt` index
- `404` — TF-IDF `lib` not found
- `500` — DashScope / Supabase / invalid vector `lib`

**Example — TF-IDF:**
```bash
curl -X POST http://localhost:3003/api/search_and_chat \
  -H "Content-Type: application/json" \
  -d '{"q": "介绍下粤语地区的饮茶文化", "lib": "tfidf", "topk": 10}'
```

**Example — Vector + Lao template `[0]`:**
```bash
curl -X POST http://localhost:3003/api/search_and_chat \
  -H "Content-Type: application/json" \
  -d '{"q": "介绍下老挝的泼水节", "search_mode": "vector", "topk": 10}'
```

**Example — Vector + Cantonese template `[1]`:**
```bash
curl -X POST http://localhost:3003/api/search_and_chat \
  -H "Content-Type: application/json" \
  -d '{"q": "「掂」同「hea」有咩分别", "search_mode": "vector", "lib": "dao", "system_prompt": 1, "topk": 10}'
```

**Example — multi-turn + custom prompt:**
```bash
curl -X POST http://localhost:3003/api/search_and_chat \
  -H "Content-Type: application/json" \
  -d '{
    "q": "那具体怎么用「唔该」？",
    "search_mode": "vector",
    "lib": "psy",
    "topk": 10,
    "system_prompt": "你是粤语助教，用粤语解释词语用法，必要时给普通话对照。",
    "messages": [
      {"role": "user", "content": "「唔该」同「多谢」有咩分别？"},
      {"role": "assistant", "content": "「唔该」多用喺麻烦人、致谢服务；「多谢」多用喺收礼物或者别人帮忙之后。"}
    ]
  }'
```

**Example — multilingual template `[2]`:**
```bash
curl -X POST http://localhost:3003/api/search_and_chat \
  -H "Content-Type: application/json" \
  -d '{"q": "How do you say thank you in Lao and Cantonese?", "search_mode": "vector", "system_prompt": "2"}'
```

---

## Cantonese Audio Endpoints

### `POST /api/trans_cantonese`

Transcribe (or translate) uploaded audio with **DashScope Qwen3-ASR-Flash** via OpenAI-compatible chat completions (`input_audio` as a Base64 data URL).

Requires `DASHSCOPE_API_KEY`.

**Request:** `multipart/form-data`

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `file` | Yes | — | Audio upload (parsed in memory, up to 25MB) |
| `language` | No | `yue` | ASR language hint (`yue` = Cantonese, `zh` = Chinese, …) |
| `prompt` | No | — | Extra context for the model |
| `task` | No | `transcribe` | `transcribe` or `translate` (English output) |

**Success (200):** `{ "text": "..." }`

**Example:**
```bash
curl -X POST "http://localhost:3003/api/trans_cantonese" \
  -F "file=@./recording.wav" \
  -F "language=yue" \
  -F "task=transcribe"
```

Default model: `qwen3-asr-flash` (override with `DASHSCOPE_ASR_MODEL`).

**Notes:**

- Docs: [Qwen-ASR API](https://help.aliyun.com/zh/model-studio/qwen-asr-api-reference)
- Uploads stay in memory (no temp dir), suitable for Deno Deploy.
- Cantonese: keep `language=yue` (default).

---

### `POST /api/tts_cantonese`

Synthesize Cantonese speech with **DashScope Qwen3-TTS** (non-realtime).

Requires `DASHSCOPE_API_KEY`. Voices from the [Qwen-TTS voice list](https://help.aliyun.com/zh/model-studio/qwen-tts-voice-list):

| Voice | Description |
|-------|-------------|
| `Kiki` (default) | Cantonese female |
| `Rocky` | Cantonese male |

**Request Body:**
```json
{
  "text": "小朋友打疫苗后唔舒服，系正常咩？",
  "voice": "Kiki",
  "language_type": "Chinese"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `text` | string | Yes | — | Text to synthesize |
| `voice` | string | No | `Kiki` | `Kiki` or `Rocky` |
| `language_type` | string | No | `"Chinese"` | DashScope language hint |
| `model` | string | No | `qwen3-tts-flash` | TTS model id |

**Success Response (200):**
```json
{
  "text": "小朋友打疫苗后唔舒服，系正常咩？",
  "voice": "Kiki",
  "model": "qwen3-tts-flash",
  "audio_url": "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/....wav?...",
  "expires_at": 1766113409,
  "request_id": "5c63c65c-cad8-4bf4-959d-xxxxxxxxxxxx"
}
```

| Response field | Description |
|----------------|-------------|
| `audio_url` | Temporary WAV URL (~24h) |
| `expires_at` | UNIX expiry timestamp |

**Error Responses:**

- `400` — Missing `text`; unsupported `voice`
- `500` — Missing key or DashScope error

**Examples:**
```bash
curl -X POST http://localhost:3003/api/tts_cantonese \
  -H "Content-Type: application/json" \
  -d '{"text": "小朋友打疫苗后唔舒服，系正常咩？"}'

curl -X POST http://localhost:3003/api/tts_cantonese \
  -H "Content-Type: application/json" \
  -d '{"text": "今晚打边炉好唔好啊？", "voice": "Rocky"}'
```

**Notes:**

- API: [Qwen-TTS API](https://help.aliyun.com/zh/model-studio/qwen-tts-api)
- Default Beijing endpoint; override with `DASHSCOPE_TTS_URL` for intl if needed.

---

## Certificate Endpoints

Uses Supabase table **`agent_lib_cert_master`**. Needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Creating a cert also needs env `PASSWD`.

### `POST /api/new_cert`

Insert a certificate row. Protected by `passwd` === server `PASSWD`.

**Request Body:**
```json
{
  "passwd": "<same as server PASSWD>",
  "owner": "display or wallet id",
  "cert_name": "Human-readable certificate name"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `passwd` | string | Yes | Must equal env `PASSWD` |
| `owner` | string | Yes | Owner id (non-empty) |
| `cert_name` | string | Yes | Certificate name (non-empty) |

**Success (200):**
```json
{
  "success": true,
  "data": {
    "cert_id": "...",
    "owner": "...",
    "cert_name": "...",
    "created_at": "..."
  }
}
```

**Errors:** `401` bad passwd · `400` missing fields · `500` Supabase error

**Example:**
```bash
curl -X POST http://localhost:3003/api/new_cert \
  -H "Content-Type: application/json" \
  -d '{"passwd":"YOUR_PASSWD","owner":"alice","cert_name":"Agent Lib 2026"}'
```

---

### `GET /api/verify_cert`

Lookup by `cert_id`.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `cert_id` | string | Yes | Certificate id |

**Success (200):**
```json
{
  "valid": true,
  "cert": {
    "cert_id": "...",
    "owner": "...",
    "cert_name": "...",
    "created_at": "..."
  }
}
```

**Errors:** `400` missing id · `404` not found · `500` Supabase error

**Example:**
```bash
curl "http://localhost:3003/api/verify_cert?cert_id=<id-from-new_cert-response>"
```

---

## Vector search setup (Supabase)

For each vector library `lib` (e.g. `psy`, `dao`):

1. Table `agent_lib_<lib>` with text rows and a `vector(1024)` embedding column.
2. SQL RPC `match_lib_<lib>(query_embedding, match_threshold, match_count)` returning `embedding_input`, `similarity`, and optionally `source_name`.

The server calls `supabase.rpc("match_lib_" + lib, …)` with embeddings from DashScope `text-embedding-v4` (1024 dimensions). Re-embed the corpus if you change the embedding model.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DASHSCOPE_API_KEY` | Yes | — | Alibaba DashScope / 百炼 key for chat, embeddings, ASR, TTS (alias: `ALI_API_KEY`) |
| `DASHSCOPE_COMPAT_BASE` | No | `https://dashscope.aliyuncs.com/compatible-mode/v1` | OpenAI-compatible base (Beijing). Use Singapore/intl URL if needed |
| `DASHSCOPE_CHAT_MODEL` | No | `qwen3-30b-a3b` | Chat model for `/api/chat` and `/api/search_and_chat` |
| `DASHSCOPE_EMBEDDING_MODEL` | No | `text-embedding-v4` | Embedding model for vector search |
| `DASHSCOPE_ASR_MODEL` | No | `qwen3-asr-flash` | ASR model for `/api/trans_cantonese` |
| `DASHSCOPE_TTS_MODEL` | No | `qwen3-tts-flash` | TTS model for `/api/tts_cantonese` |
| `DASHSCOPE_TTS_VOICE` | No | `Kiki` | Default Cantonese voice (`Kiki` or `Rocky`) |
| `DASHSCOPE_TTS_URL` | No | Beijing multimodal generation URL | Override DashScope TTS HTTP endpoint |
| `ZHIHU_ACCESS_SECRET` | For `/api/zhihu-search` | — | Zhihu Open Platform Access Secret (Bearer) |
| `ZHIHU_OPENAPI_BASE_URL` | No | `https://developer.zhihu.com` | Zhihu Open API base URL |
| `ZHIHU_ZHIHU_SEARCH_URL` | No | `${BASE}/api/v1/content/zhihu_search` | Full endpoint override for zhihu_search |
| `SUPABASE_URL` | No | — | Required for vector search & certificates |
| `SUPABASE_SERVICE_ROLE_KEY` | No | — | Required for vector search & certificates |
| `PASSWD` | No | — | Shared secret for `POST /api/new_cert` |

Default listen port in code: **`3003`** (`http://localhost:3003`).

---

**Built with Deno and Oak · LLM via Alibaba DashScope**
