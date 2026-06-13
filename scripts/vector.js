/*
环境变量：
  SUPABASE_URL              – Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY – Service-role key (bypasses RLS)
  API_KEY                   – OpenRouter API key

用法：
  node --env-file=.env scripts/vector.js
  node --env-file=.env scripts/vector.js --table agent_lib_psy
  node --env-file=.env scripts/vector.js agent_lib_psy
*/

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENROUTER_KEY = process.env.API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !OPENROUTER_KEY) {
  console.error(
    "Missing env vars. Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, API_KEY",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const EMBEDDING_MODEL = "qwen/qwen3-embedding-4b";
const EMBEDDING_DIMENSIONS = 1024;
const DEFAULT_TABLE = "agent_lib_psy";

function parseTableName() {
  const args = process.argv.slice(2);
  const flagIdx = args.indexOf("--table");
  if (flagIdx !== -1) {
    const name = args[flagIdx + 1];
    if (!name || name.startsWith("-")) {
      console.error("Missing value for --table");
      process.exit(1);
    }
    return name;
  }
  const positional = args.find((a) => !a.startsWith("-"));
  return positional || DEFAULT_TABLE;
}

const TABLE = parseTableName();
if (!/^[a-zA-Z0-9_]+$/.test(TABLE)) {
  console.error(`Invalid table name "${TABLE}": use letters, digits, or underscores only`);
  process.exit(1);
}
console.log(`Using table: ${TABLE}`);

async function retry(fn, { retries = 5, baseDelay = 1000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries) throw err;
      const delay = baseDelay * 2 ** attempt;
      console.warn(`  ⚠ attempt ${attempt + 1} failed: ${err.message} — retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// Call OpenRouter embeddings endpoint (OpenAI-compatible)
async function getEmbedding(text) {
  return retry(async () => {
    const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: text, dimensions: EMBEDDING_DIMENSIONS }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenRouter ${res.status}: ${body}`);
    }

    const json = await res.json();
    return json.data[0].embedding;
  });
}

async function backfillEmbeddings(batchSize = 10) {
  let totalProcessed = 0;

  while (true) {
    const { data: rows, error } = await supabase
      .from(TABLE)
      .select("id, embedding_input")
      .is("embedding", null)
      .order("id", { ascending: true })
      .limit(batchSize);

    if (error) throw error;
    if (!rows || rows.length === 0) {
      console.log(`done – ${totalProcessed} rows processed in total`);
      break;
    }

    for (const row of rows) {
      const embedding = await getEmbedding(row.embedding_input);

      await retry(async () => {
        const { error: updateErr } = await supabase
          .from(TABLE)
          .update({ embedding: JSON.stringify(embedding) })
          .eq("id", row.id);
        if (updateErr) throw updateErr;
      });
    }

    totalProcessed += rows.length;
    console.log(`processed ${rows.length} rows (total: ${totalProcessed})`);
  }
}

backfillEmbeddings().catch(console.error);