# Scripts — data pipeline

This folder contains tooling for preparing knowledge data and backfilling vector embeddings in Supabase.

## Data record workflow

### 1. Generate a CSV with an LLM

Use ChatGPT or another LLM with your source document(s). Ask it to produce a CSV with at least:

| Column        | Description |
|---------------|-------------|
| `answer`      | The text content; redundant paragraphs should be removed. |
| `source_name` | The source name only—use the **file name without the extension**. |

**Prompt (Chinese, as used in this project):**

```
基于这个文档，生成一个csv 表格，其中字段 answer 为文本内容，自动删除冗余的段落；字段 source_name 为来源名称，统一填写为文件名即可，不包含文件后缀。
```

**English equivalent:**

```
From this document, produce a CSV table with:
- column `answer`: the text content, with redundant paragraphs removed;
- column `source_name`: the source name only, use the file name without the extension.
```

Save the result as UTF-8 CSV. Column names must match what your Supabase table expects (e.g. align with `agent_lib_psy` or your import mapping).

### 2. Import the CSV into Supabase

1. Open the Supabase dashboard → **Table Editor** (or **SQL** if you use `COPY`).
2. Use **Import data from CSV** (or the storage/import flow your project uses) into the target table that stores rows for embedding (this repo’s `vector.js` uses table **`agent_lib_psy`**—confirm your schema matches).
3. Ensure required columns exist (e.g. text column(s), `embedding` nullable until the script runs, etc.).

### 3. Run `vector.js` to embed missing rows

The script calls OpenRouter embeddings (`qwen/qwen3-embedding-4b`, 1024 dimensions) and updates rows where the embedding is still null.

**Environment variables** (e.g. from repo root `.env`):

| Variable                    | Description                          |
|-----------------------------|--------------------------------------|
| `SUPABASE_URL`              | Supabase project URL                 |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS)      |
| `API_KEY`                   | OpenRouter API key                   |

**Run:**

```bash
node --env-file=.env scripts/vector.js
# optional table (default: agent_lib_psy)
node --env-file=.env scripts/vector.js --table agent_lib_psy
```

From the `scripts/` directory, point `--env-file` at the path where your `.env` lives.

The script retries transient network failures and only fills embeddings for rows that are still unembedded (see comments in `vector.js` for the exact filter).

## Related files

- `vector.js` — embedding backfill for Supabase `agent_lib_psy`
- Deno server RAG — uses the same Supabase / OpenRouter stack; see `deno-server/apidoc.md`
