# Scaffold Agent Homepage — API Documentation

> Deno backend server providing chat, TF-IDF search, vector search (Supabase pgvector), RAG endpoints, Cantonese audio transcription, and certificate helpers (`agent_lib_cert_master`).
> LLM & embeddings powered by OpenRouter (`qwen/qwen3-30b-a3b` chat, `qwen/qwen3-embedding-4b` embeddings, 1024 dimensions).

## Base URL

```
http://localhost:4403
```

---

## Public Endpoints

### `GET /`

Server greeting.

**Response:** Plain text greeting, e.g. `Hello from Psy ChatBot Server`.

---

### `GET /health`

Health check endpoint for monitoring and load balancers.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-04T12:00:00.000Z"
}
```

---

### `GET /docs`

Get API documentation in Markdown format.

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `doc` | string | No | `apidoc` | Basename of a `.md` file in the server working directory (e.g. `whitepaper` → `./whitepaper.md`). Single segment only: letters, digits, `.`, `_`, `-`; no path separators. |

**Response:** Raw Markdown file content (`text/markdown`).

**Error Responses:**

- `400` — Invalid `doc` parameter
- `404` — File not found
- `500` — Could not read file

**Examples:**
```bash
curl "http://localhost:4403/docs"
curl "http://localhost:4403/docs?doc=whitepaper"
```

---

### `GET /docs/html`

Get API documentation rendered as HTML with GitHub Flavored Markdown styling. Same `doc` query parameter as `GET /docs`.

**Response:** HTML page with rendered documentation.

**Examples:**
```bash
curl "http://localhost:4403/docs/html"
curl "http://localhost:4403/docs/html?doc=apidoc"
```

---

## Chat Endpoints

### `POST /api/chat`

Chat with the AI agent (powered by OpenRouter / Qwen).

**Request Body:**
```json
{
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello, what can you do?" }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `messages` | array | Yes | Array of chat messages in OpenAI-compatible format. Each message has `role` (`system`, `user`, or `assistant`) and `content`. |

**Success Response (200):**
```json
{
  "text": "I can help you with..."
}
```

**Error Responses:**

- `400` — Missing or invalid `messages` array
```json
{ "error": "messages array is required" }
```

- `500` — API key not configured or internal error
```json
{ "error": "API_KEY not configured" }
```

**Example:**
```bash
curl -X POST http://localhost:4403/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello, what can you do?"}]}'
```

---

## Search Endpoints

### `GET /api/search`

TF-IDF full-text search over a knowledge library. The server auto-discovers all `data_*` folders at startup; each folder is registered as a library (e.g. `data_tfidf/` → `lib=tfidf`).

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `q` | string | Yes | — | Search query |
| `lib` | string | Yes | — | Library name (maps to `data_<lib>/chunks.jsonl`) |
| `topk` | number | No | `10` | Number of top results to return (1–50) |

**Success Response (200):**
```json
{
  "query": "藏传佛教如何看待死亡",
  "lib": "tfidf",
  "topk": 10,
  "total_chunks": 137,
  "results": [
    {
      "rank": 1,
      "score": 0.4321,
      "chunk": {
        "book_title": "八万四千问",
        "author": "宗萨蒋扬钦哲仁波切",
        "spine_index": 10,
        "href": "text/part0009.html",
        "chapter_title": "第三章 死亡与转世",
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
```json
{ "error": "query parameter 'lib' is required", "available": ["tfidf"] }
```

- `404` — Library not found
```json
{ "error": "lib \"foo\" not found", "available": ["tfidf"] }
```

**Example:**
```bash
curl "http://localhost:4403/api/search?lib=tfidf&q=藏传佛教如何看待死亡&topk=10"
```

---

### `GET /api/vector_search`

Semantic search using Supabase pgvector embeddings. Each `lib` maps to a Supabase RPC `match_lib_<lib>` (e.g. `match_lib_psy`) and table `agent_lib_<lib>` (e.g. `agent_lib_psy`). Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `q` | string | Yes | — | Search query |
| `lib` | string | No | `psy` | Vector library name (letters, digits, underscores only) |
| `topk` | number | No | `10` | Number of top results to return (1–50) |

**Success Response (200):**
```json
{
  "query": "如何面对焦虑",
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

| Result field | Description |
|--------------|-------------|
| `similarity` | Cosine similarity from pgvector RPC |
| `text` | Matched chunk text (`embedding_input`) |
| `resource_name` | Optional source label from the table |

**Example:**
```bash
curl "http://localhost:4403/api/vector_search?q=如何面对焦虑&topk=10"
curl "http://localhost:4403/api/vector_search?q=如何定心安神&lib=dao&topk=10"
```

---

### `POST /api/search_and_chat`

RAG (Retrieval-Augmented Generation) endpoint. Retrieves relevant context via TF-IDF or vector search, builds a context-aware prompt, and sends it to the LLM. Returns the AI answer together with the sources used.

Supports two retrieval backends via `search_mode`:

| Mode | Backend | `lib` behavior |
|------|---------|----------------|
| `"tfidf"` (default) | In-memory TF-IDF sparse search | **Required** — maps to `data_<lib>/chunks.jsonl` |
| `"vector"` | Supabase pgvector via RPC `match_lib_<lib>` | **Optional**, default `"psy"` (e.g. `psy`, `dao`) |

Requires `API_KEY` for the LLM step. Vector mode also requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, plus the matching `match_lib_<lib>` SQL function and `agent_lib_<lib>` table.

**Request Body:**
```json
{
  "q": "藏传佛教如何看待死亡",
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
| `search_mode` | string | No | `"tfidf"` | Retrieval backend: `"tfidf"` or `"vector"` |
| `lib` | string | Conditional | `""` (tfidf) / `"psy"` (vector) | TF-IDF: required. Vector: selects `match_lib_<lib>` (default `psy`) |
| `topk` | number | No | `10` | Number of chunks to retrieve (1–50) |
| `messages` | array | No | `[]` | Prior conversation messages for multi-turn context. Each has `role` and `content`. |
| `system_prompt` | string \| number | No | built-in template `[0]` | See **System prompt** below. Alias: `systemPrompt`. |

#### System prompt (`system_prompt`)

The server builds two system messages: (1) the resolved system prompt, (2) retrieved citations.

| Value | Behavior |
|-------|----------|
| omitted, `null`, or `""` | Built-in template **index `0`** |
| integer `0`, `1`, `2` or string `"0"`, `"1"`, `"2"` | Built-in template at that index |
| any other non-empty string | Used verbatim as the custom system prompt |

Built-in templates (indices):

| Index | Summary |
|-------|---------|
| `0` | Professional counseling with Tibetan Buddhist worldview (default) |
| `1` | Professional counseling with Daoist worldview |
| `2` | Generic counseling — empathy plus practical advice from retrieved context |

Out-of-range index → `400` with `available_templates` count.

**Success Response — TF-IDF mode (200):**
```json
{
  "text": "根据资料，藏传佛教认为死亡是……",
  "sources": [
    {
      "rank": 1,
      "score": 0.4321,
      "chunk": {
        "book_title": "八万四千问",
        "author": "宗萨蒋扬钦哲仁波切",
        "chapter_title": "第三章 死亡与转世",
        "chunk_index": 2,
        "text": "..."
      }
    }
  ]
}
```

**Success Response — Vector mode (200):**
```json
{
  "text": "根据资料，面对焦虑时可以……",
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

| Response field | Description |
|----------------|-------------|
| `text` | LLM answer |
| `sources` | Retrieval hits used as context (shape depends on `search_mode`) |
| `system_prompt_template_index` | Present when a built-in template index was used (`0`–`2`); omitted for a custom string prompt |

**Error Responses:**

- `400` — Missing `q`; missing `lib` when `search_mode` is `"tfidf"`; invalid `system_prompt` index
```json
{ "error": "system_prompt index 9 out of range (0–2)", "available_templates": 3 }
```
- `404` — TF-IDF `lib` not found
- `500` — `API_KEY` not configured, Supabase not configured, invalid vector `lib`, or internal error

**Example — TF-IDF mode:**
```bash
curl -X POST http://localhost:4403/api/search_and_chat \
  -H "Content-Type: application/json" \
  -d '{"q": "藏传佛教如何看待死亡", "lib": "tfidf", "topk": 10}'
```

**Example — Vector mode (default lib `psy`, template `[0]`):**
```bash
curl -X POST http://localhost:4403/api/search_and_chat \
  -H "Content-Type: application/json" \
  -d '{"q": "如何面对焦虑", "search_mode": "vector", "topk": 10}'
```

**Example — Vector mode with `lib=dao` and built-in template `[1]` (Daoist counseling):**
```bash
curl -X POST http://localhost:4403/api/search_and_chat \
  -H "Content-Type: application/json" \
  -d '{"q": "如何定心安神", "search_mode": "vector", "lib": "dao", "system_prompt": 1, "topk": 10}'
```

**Example — Vector mode with multi-turn context and custom system prompt:**
```bash
curl -X POST http://localhost:4403/api/search_and_chat \
  -H "Content-Type: application/json" \
  -d '{
    "q": "那具体应该怎么做呢",
    "search_mode": "vector",
    "lib": "psy",
    "topk": 10,
    "system_prompt": "你是专业心理咨询师，用共情与接纳回应用户，并给出可实践的建议。",
    "messages": [
      {"role": "user", "content": "如何面对焦虑"},
      {"role": "assistant", "content": "面对焦虑时，可以尝试……"}
    ]
  }'
```

**Example — Built-in generic template `[2]`:**
```bash
curl -X POST http://localhost:4403/api/search_and_chat \
  -H "Content-Type: application/json" \
  -d '{"q": "最近压力很大", "search_mode": "vector", "system_prompt": "2"}'
```

---

### `POST /api/trans_cantonese`

Transcribe (or translate) uploaded audio using **OpenRouter chat completions** with `input_audio` (OpenRouter does **not** proxy OpenAI’s `/v1/audio/transcriptions`; Whisper multipart is not used here).

**Request:** `multipart/form-data`

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `file` | Yes | — | **WAV or MP3** are sent directly to OpenAI. **M4A / AAC / MP4 / FLAC / OGG / WebM** are converted to MP3 **in memory** with **ffmpeg** if `ffmpeg` is on `PATH` (or `FFMPEG_PATH`). Without ffmpeg, upload WAV/MP3 only. |
| `language` | No | `yue` | Language hint (e.g. `yue` for Cantonese) |
| `prompt` | No | — | Extra instructions for the model |
| `task` | No | `transcribe` | `transcribe` or `translate` (to English) |

**Success (200):** `{ "text": "..." }`

**Example:**

```bash
curl -X POST "http://localhost:4403/api/trans_cantonese" \
  -F "file=@./recording.m4a" \
  -F "language=yue" \
  -F "task=transcribe"
```

Default transcription model: `openai/gpt-4o-audio-preview`. Override with env `OPENROUTER_TRANSCRIPTION_MODEL`.

**Notes:**

- Uploads are parsed **in memory** (up to 25MB) so the handler works on hosts where `Deno.makeTempDir()` is unavailable.
- OpenAI’s `input_audio` only allows `format`: `wav` | `mp3`. M4A etc. require **ffmpeg** for server-side conversion (stdin/stdout, no temp files).
- Optional env **`FFMPEG_PATH`**: path to `ffmpeg` binary if not on `PATH`.

---

## Certificate Endpoints

These endpoints use Supabase table **`agent_lib_cert_master`**. Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Creating a certificate also requires env **`PASSWD`** (shared secret sent as `passwd` in the JSON body).

### `POST /api/new_cert`

Insert a new certificate row. **Protected** by `passwd` matching server env `PASSWD`.

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
| `passwd` | string | Yes | Must equal environment variable `PASSWD` |
| `owner` | string | Yes | Owner identifier (non-empty after trim) |
| `cert_name` | string | Yes | Certificate name (non-empty after trim) |

**Success Response (200):**
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

The exact fields in `data` match your Supabase schema (at minimum expect identifiers such as `cert_id` for use with `GET /api/verify_cert`).

**Error Responses:**

- `401` — `passwd` missing or does not match `PASSWD`
- `400` — Missing `owner` or `cert_name`
- `500` — Supabase not configured or insert error

**Example:**
```bash
curl -X POST http://localhost:4403/api/new_cert \
  -H "Content-Type: application/json" \
  -d '{"passwd":"YOUR_PASSWD","owner":"alice","cert_name":"Agent Lib 2026"}'
```

---

### `GET /api/verify_cert`

Public lookup: returns the certificate row if **`cert_id`** exists in `agent_lib_cert_master`.

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `cert_id` | string | Yes | Certificate id (column `cert_id` on the table) |

**Success Response (200):**
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

**Error Responses:**

- `400` — Missing `cert_id`
```json
{ "error": "query parameter 'cert_id' is required" }
```

- `404` — No row with that `cert_id`
```json
{ "error": "certificate not found", "cert_id": "..." }
```

- `500` — Supabase not configured or query error

**Example:**
```bash
curl "http://localhost:4403/api/verify_cert?cert_id=<id-from-new_cert-response>"
```

---

## Vector search setup (Supabase)

For each vector library name `lib` (e.g. `psy`, `dao`):

1. Table `agent_lib_<lib>` with text rows and a `vector(1024)` embedding column (see `scripts/vector.js` for backfill).
2. SQL RPC `match_lib_<lib>(query_embedding, match_threshold, match_count)` returning `embedding_input`, `similarity`, and optionally `source_name`.

The server calls `supabase.rpc("match_lib_" + lib, …)` with embeddings from OpenRouter `qwen/qwen3-embedding-4b` (1024 dimensions).

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_KEY` | Yes | — | OpenRouter API key for chat, embeddings, and RAG endpoints |
| `OPENROUTER_TRANSCRIPTION_MODEL` | No | `openai/gpt-4o-audio-preview` | Model for `/api/trans_cantonese` (must support audio input on OpenRouter) |
| `FFMPEG_PATH` | No | `ffmpeg` on PATH | Used to convert m4a/aac/… → mp3 in memory when file is not WAV/MP3 |
| `SUPABASE_URL` | No | — | Supabase project URL (required for vector search) |
| `SUPABASE_SERVICE_ROLE_KEY` | No | — | Supabase service-role key (required for vector search and certificate endpoints) |
| `PASSWD` | No | — | Shared secret for `POST /api/new_cert` (body field `passwd` must match) |
| `SERVER_PORT` | No | `4403` | Server listen port |

---

**Built with Deno and Oak**
