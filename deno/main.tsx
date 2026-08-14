/* 
HINT（NOT DELETE):
- 优化这个后端代码，
- 环境变量有：
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_URL
- DASHSCOPE_API_KEY（阿里云百炼，chat / embeddings / ASR / TTS）
- ZHIHU_API_KEY（知乎开放平台 Access Secret，/api/zhihu-search）
 */

import { oakCors } from "cors";
import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { CSS, render } from "@deno/gfm";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Config — reads from environment variables:
//   DASHSCOPE_API_KEY         – Alibaba DashScope / 百炼 key (chat, embeddings, ASR, TTS)
//                               alias: ALI_API_KEY
//   SUPABASE_URL              – Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY – Supabase service-role key (bypasses RLS)
//   ZHIHU_API_KEY       – Zhihu Open Platform Access Secret (Bearer)
// ---------------------------------------------------------------------------

/** Alibaba DashScope / 百炼 API key (Beijing region by default). */
const DASHSCOPE_API_KEY =
  Deno.env.get("DASHSCOPE_API_KEY") || Deno.env.get("ALI_API_KEY") || "";
/** OpenAI-compatible base: https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions */
const DASHSCOPE_COMPAT_BASE =
  Deno.env.get("DASHSCOPE_COMPAT_BASE") ||
  "https://dashscope.aliyuncs.com/compatible-mode/v1";

const CHAT_MODEL = Deno.env.get("DASHSCOPE_CHAT_MODEL") || "qwen3-30b-a3b";
const EMBEDDING_MODEL =
  Deno.env.get("DASHSCOPE_EMBEDDING_MODEL") || "text-embedding-v4";
const EMBEDDING_DIMENSIONS = 1024;
/** Qwen3-ASR-Flash via OpenAI-compatible chat/completions. */
const TRANSCRIPTION_MODEL =
  Deno.env.get("DASHSCOPE_ASR_MODEL") || "qwen3-asr-flash";

const DASHSCOPE_TTS_URL =
  Deno.env.get("DASHSCOPE_TTS_URL") ||
  "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
/** Default: qwen3-tts-flash (Cantonese voices Rocky / Kiki). Override if needed. */
const DASHSCOPE_TTS_MODEL =
  Deno.env.get("DASHSCOPE_TTS_MODEL") || "qwen3-tts-flash";
/** Cantonese system voices: Rocky (male), Kiki (female). */
const DASHSCOPE_TTS_DEFAULT_VOICE =
  Deno.env.get("DASHSCOPE_TTS_VOICE") || "Kiki";
const CANTONESE_TTS_VOICES = new Set(["Rocky", "Kiki"]);

/** Zhihu Open Platform Access Secret — https://developer.zhihu.com/personal */
const ZHIHU_API_KEY = Deno.env.get("ZHIHU_API_KEY") || "";
/** Base URL for Zhihu Open API (override for proxy / staging). */
const ZHIHU_OPENAPI_BASE_URL =
  Deno.env.get("ZHIHU_OPENAPI_BASE_URL") || "https://developer.zhihu.com";
/** Full endpoint override for zhihu_search. Docs: https://developer.zhihu.com/docs?key=zhihu_search */
const ZHIHU_SEARCH_URL =
  Deno.env.get("ZHIHU_ZHIHU_SEARCH_URL") ||
  `${ZHIHU_OPENAPI_BASE_URL.replace(/\/$/, "")}/api/v1/content/zhihu_search`;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ---------------------------------------------------------------------------
// TF-IDF Search Module
// Pure-JS reimplementation of data_tfidf/query.py + build_index.py
// Builds an in-memory TF-IDF index from chunks.jsonl at startup.
// Matches sklearn defaults: analyzer='char', ngram_range=(2,4), smooth_idf,
// L2-normalized vectors.
// ---------------------------------------------------------------------------

type Chunk = {
  book_title: string;
  author: string;
  spine_index: number;
  href: string;
  chapter_title: string;
  chunk_index: number;
  char_start: number;
  char_end: number;
  text: string;
};

type SparseVec = Map<number, number>;

function charNgrams(text: string, minN: number, maxN: number): string[] {
  const ngrams: string[] = [];
  for (let n = minN; n <= maxN; n++) {
    for (let i = 0; i <= text.length - n; i++) {
      ngrams.push(text.slice(i, i + n));
    }
  }
  return ngrams;
}

function sparseDot(a: SparseVec, b: SparseVec): number {
  let dot = 0;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const [k, v] of smaller) {
    const bv = larger.get(k);
    if (bv !== undefined) dot += v * bv;
  }
  return dot;
}

function sparseL2Normalize(vec: SparseVec): SparseVec {
  let sum = 0;
  for (const v of vec.values()) sum += v * v;
  const norm = Math.sqrt(sum);
  if (norm === 0) return vec;
  const out: SparseVec = new Map();
  for (const [k, v] of vec) out.set(k, v / norm);
  return out;
}

class TfidfIndex {
  private vocab: Map<string, number> = new Map();
  private idf: Float64Array = new Float64Array(0);
  private matrix: SparseVec[] = [];
  chunks: Chunk[] = [];

  constructor(chunks: Chunk[]) {
    this.chunks = chunks;
    this.build();
  }

  private build() {
    const n = this.chunks.length;
    const df = new Map<string, number>();
    const docNgramsList: string[][] = [];

    for (const chunk of this.chunks) {
      const ngrams = charNgrams(chunk.text, 2, 4);
      docNgramsList.push(ngrams);
      const seen = new Set<string>();
      for (const ng of ngrams) {
        if (!seen.has(ng)) {
          seen.add(ng);
          df.set(ng, (df.get(ng) || 0) + 1);
        }
      }
    }

    // Build vocabulary (sorted for determinism, matching sklearn)
    const terms = [...df.keys()].sort();
    for (let i = 0; i < terms.length; i++) {
      this.vocab.set(terms[i], i);
    }

    // IDF: log((1 + n) / (1 + df)) + 1  (sklearn smooth_idf=True)
    this.idf = new Float64Array(terms.length);
    for (let i = 0; i < terms.length; i++) {
      this.idf[i] = Math.log((1 + n) / (1 + df.get(terms[i])!)) + 1;
    }

    // Build sparse TF-IDF vectors, L2-normalized
    this.matrix = [];
    for (const ngrams of docNgramsList) {
      const tf: SparseVec = new Map();
      for (const ng of ngrams) {
        const idx = this.vocab.get(ng)!;
        tf.set(idx, (tf.get(idx) || 0) + 1);
      }
      for (const [idx, count] of tf) {
        tf.set(idx, count * this.idf[idx]);
      }
      this.matrix.push(sparseL2Normalize(tf));
    }

    console.log(`  📚 TF-IDF index built: ${this.chunks.length} chunks, ${terms.length} terms`);
  }

  query(queryText: string, topk = 10) {
    const ngrams = charNgrams(queryText, 2, 4);
    const qvec: SparseVec = new Map();
    for (const ng of ngrams) {
      const idx = this.vocab.get(ng);
      if (idx !== undefined) qvec.set(idx, (qvec.get(idx) || 0) + 1);
    }
    for (const [idx, count] of qvec) {
      qvec.set(idx, count * this.idf[idx]);
    }
    const qNorm = sparseL2Normalize(qvec);

    const scored = this.matrix.map((dvec, i) => ({
      index: i,
      score: sparseDot(qNorm, dvec),
    }));
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topk).map((s, rank) => ({
      rank: rank + 1,
      score: +s.score.toFixed(4),
      chunk: this.chunks[s.index],
    }));
  }
}

async function loadChunksJsonl(path: string): Promise<Chunk[]> {
  const text = await Deno.readTextFile(path);
  return text.trim().split("\n").map((line) => JSON.parse(line));
}

// Map of lib name -> TfidfIndex, e.g. "tfidf" -> index built from data_tfidf/
const tfidfIndices: Map<string, TfidfIndex> = new Map();

async function loadAllIndices() {
  for await (const entry of Deno.readDir(".")) {
    if (!entry.isDirectory || !entry.name.startsWith("data_")) continue;
    const lib = entry.name.slice("data_".length); // "data_tfidf" -> "tfidf"
    const chunksPath = `./${entry.name}/chunks.jsonl`;
    try {
      const chunks = await loadChunksJsonl(chunksPath);
      const index = new TfidfIndex(chunks);
      tfidfIndices.set(lib, index);
      console.log(`  📚 Loaded lib="${lib}" from ${chunksPath}`);
    } catch (err) {
      console.warn(`  ⚠️  Skipping ${entry.name}: ${err}`);
    }
  }
}

let tfidfLoadPromise: Promise<void> | null = null;
async function ensureTfidfLoaded() {
  if (tfidfIndices.size > 0) return;
  if (!tfidfLoadPromise) tfidfLoadPromise = loadAllIndices();
  await tfidfLoadPromise;
}

// ---------------------------------------------------------------------------
// Shared helpers — DashScope LLM + embeddings + ASR, Supabase vector search
// ---------------------------------------------------------------------------

function requireDashScopeKey() {
  if (!DASHSCOPE_API_KEY) {
    throw new Error("DASHSCOPE_API_KEY (or ALI_API_KEY) not configured");
  }
}

function dashScopeHeaders(json = true): Record<string, string> {
  requireDashScopeKey();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
  };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

async function callLLM(
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  const resp = await fetch(`${DASHSCOPE_COMPAT_BASE}/chat/completions`, {
    method: "POST",
    headers: dashScopeHeaders(),
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      // Required for Qwen3 non-streaming calls on DashScope
      enable_thinking: false,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`DashScope chat ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function getQueryEmbedding(text: string): Promise<number[]> {
  const resp = await fetch(`${DASHSCOPE_COMPAT_BASE}/embeddings`, {
    method: "POST",
    headers: dashScopeHeaders(),
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
      encoding_format: "float",
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`DashScope embeddings ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  return data.data[0].embedding;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const sub = bytes.subarray(i, i + CHUNK);
    parts.push(String.fromCharCode.apply(null, sub as unknown as number[]));
  }
  return btoa(parts.join(""));
}

/** Map filename / MIME to audio format for DashScope ASR input_audio. */
function inferAudioFormat(filename: string, mimeType: string): string {
  const lower = filename.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
  const allowed = new Set([
    "wav",
    "mp3",
    "m4a",
    "flac",
    "ogg",
    "aac",
    "aiff",
    "webm",
    "pcm16",
    "pcm24",
  ]);
  if (ext && allowed.has(ext)) return ext;
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("webm")) return "webm";
  return "wav";
}

/** Map BCP-47 / Cantonese hints to DashScope ASR language codes. */
function asrLanguageHint(lang: string): string | undefined {
  const lower = lang.trim().toLowerCase();
  if (!lower || lower === "auto") return undefined;
  if (lower === "yue" || lower === "zh-yue" || lower.includes("cantonese")) {
    return "yue";
  }
  if (lower === "zh" || lower === "zh-cn" || lower.includes("chinese")) {
    return "zh";
  }
  return lower.length <= 3 ? lower : lower.slice(0, 2);
}

type CantoneseTtsResult = {
  text: string;
  voice: string;
  model: string;
  audio_url: string;
  expires_at?: number;
  request_id?: string;
};

/**
 * Cantonese TTS via Alibaba DashScope Qwen3-TTS (non-realtime).
 * Docs: https://help.aliyun.com/zh/model-studio/qwen-tts-api
 * Cantonese voices: Rocky (male), Kiki (female) — see Qwen-TTS voice list.
 */
async function synthesizeCantoneseTts(params: {
  text: string;
  voice?: string;
  language_type?: string;
  model?: string;
}): Promise<CantoneseTtsResult> {
  requireDashScopeKey();

  const text = params.text.trim();
  if (!text) throw new Error("'text' is required");

  const voice = (params.voice || DASHSCOPE_TTS_DEFAULT_VOICE).trim();
  const model = (params.model || DASHSCOPE_TTS_MODEL).trim();
  const languageType = (params.language_type || "Chinese").trim() || "Chinese";

  const resp = await fetch(DASHSCOPE_TTS_URL, {
    method: "POST",
    headers: dashScopeHeaders(),
    body: JSON.stringify({
      model,
      input: {
        text,
        voice,
        language_type: languageType,
      },
    }),
  });

  const data = await resp.json();
  if (!resp.ok) {
    const msg = data?.message || data?.code || JSON.stringify(data);
    throw new Error(`DashScope TTS ${resp.status}: ${msg}`);
  }

  const audioUrl: string = data?.output?.audio?.url || "";
  if (!audioUrl) {
    throw new Error(`DashScope TTS returned no audio url: ${JSON.stringify(data)}`);
  }

  return {
    text,
    voice,
    model,
    audio_url: audioUrl,
    expires_at: data?.output?.audio?.expires_at,
    request_id: data?.request_id,
  };
}

type ZhihuSearchItem = {
  title: string;
  url: string;
  author_name: string;
  summary: string;
  vote_up_count: number;
  comment_count: number;
  edit_time: number;
};

type ZhihuSearchResult = {
  query: string;
  count: number;
  code: number;
  message: string;
  item_count: number;
  items: ZhihuSearchItem[];
};

/**
 * Zhihu on-site search via Open Platform `zhihu_search`.
 * Docs: https://developer.zhihu.com/docs?key=zhihu_search
 * Auth: Authorization Bearer + X-Request-Timestamp (unix seconds).
 */
async function searchZhihu(params: {
  query: string;
  count?: number;
}): Promise<ZhihuSearchResult> {
  const secret = ZHIHU_API_KEY.trim();
  if (!secret) {
    throw new Error("ZHIHU_API_KEY is not set");
  }

  const query = params.query.trim();
  if (!query) throw new Error("'query' is required");

  const count = Math.min(Math.max(params.count ?? 10, 1), 10);
  const url = new URL(ZHIHU_SEARCH_URL);
  url.searchParams.set("Query", query);
  url.searchParams.set("Count", String(count));

  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      "X-Request-Timestamp": String(Math.floor(Date.now() / 1000)),
      "Content-Type": "application/json",
    },
  });

  const text = await resp.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Zhihu search non-JSON response (${resp.status}): ${text.slice(0, 500)}`);
  }

  if (!resp.ok) {
    throw new Error(`Zhihu search HTTP ${resp.status}: ${text.slice(0, 500)}`);
  }

  const payload = (data.Data && typeof data.Data === "object"
    ? data.Data
    : {}) as Record<string, unknown>;
  const rawItems = Array.isArray(payload.Items) ? payload.Items : [];
  const items: ZhihuSearchItem[] = rawItems
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      title: String(item.Title ?? ""),
      url: String(item.Url ?? ""),
      author_name: String(item.AuthorName ?? ""),
      summary: String(item.ContentText ?? ""),
      vote_up_count: Number(item.VoteUpCount ?? 0) || 0,
      comment_count: Number(item.CommentCount ?? 0) || 0,
      edit_time: Number(item.EditTime ?? 0) || 0,
    }));

  return {
    query,
    count,
    code: Number(data.Code ?? -1),
    message: String(data.Message ?? ""),
    item_count: items.length,
    items,
  };
}

/**
 * Cantonese ASR via DashScope OpenAI-compatible chat/completions (Qwen3-ASR-Flash).
 * Docs: https://help.aliyun.com/zh/model-studio/qwen-asr-api-reference
 * `task: "translate"` asks the model to output English translation.
 */
async function transcribeCantoneseAudio(params: {
  file: File;
  filename?: string;
  /** BCP-47 / Whisper-style hint; "yue" = Cantonese */
  language?: string;
  prompt?: string;
  task?: "transcribe" | "translate";
}): Promise<string> {
  requireDashScopeKey();

  const name = params.filename ?? params.file.name ?? "audio";
  const buf = new Uint8Array(await params.file.arrayBuffer());
  const base64Audio = uint8ArrayToBase64(buf);
  const format = inferAudioFormat(name, params.file.type || "");
  const mime = params.file.type || `audio/${format}`;
  const dataUrl = `data:${mime};base64,${base64Audio}`;

  const lang = (params.language ?? "yue").trim().toLowerCase();
  const task = params.task === "translate" ? "translate" : "transcribe";
  const asrLang = asrLanguageHint(lang);

  let instruction =
    task === "translate"
      ? "Listen to this audio and translate the speech into clear English. Output only the English translation, no labels or commentary."
      : "Transcribe the speech in this audio. Output only the transcript text.";
  if (params.prompt?.trim()) {
    instruction += ` Additional context: ${params.prompt.trim()}`;
  }

  const body: Record<string, unknown> = {
    model: TRANSCRIPTION_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: instruction },
          {
            type: "input_audio",
            input_audio: { data: dataUrl },
          },
        ],
      },
    ],
  };

  if (asrLang) {
    body.asr_options = { language: asrLang, enable_itn: false };
  }

  const resp = await fetch(`${DASHSCOPE_COMPAT_BASE}/chat/completions`, {
    method: "POST",
    headers: dashScopeHeaders(),
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`DashScope ASR ${resp.status}: ${err.slice(0, 2000)}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

type VectorResult = {
  id: number;
  embedding_input: string;
  similarity: number;
  /** Returned when `match_lib_*` selects `source_name` from the table */
  source_name?: string | null;
};

// Requires a Supabase SQL function per lib, e.g.:
//   match_lib_psy(query_embedding vector(1024), match_threshold float, match_count int)
async function vectorSearch(
  query: string,
  topk = 10,
  lib = "psy",
  threshold = 0.3,
): Promise<VectorResult[]> {
  if (!supabase) throw new Error("Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");

  const libName = lib.trim() || "psy";
  if (!/^[a-zA-Z0-9_]+$/.test(libName)) {
    throw new Error(`invalid lib "${libName}": use letters, digits, or underscores only`);
  }

  const rpcName = `match_lib_${libName}`;
  console.log("rpcName:", rpcName);
  const embedding = await getQueryEmbedding(query);
  const { data, error } = await supabase.rpc(rpcName, {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: topk,
  });

  if (error) throw error;
  return (data ?? []) as VectorResult[];
}

// // Admin password verification function
// async function verifyAdminPassword(
//   context: any,
//   password: string
// ): Promise<boolean> {
//   const adminPwd = Deno.env.get("ADMIN_PWD");
//   if (!password || password !== adminPwd) {
//     context.response.status = 401;
//     context.response.body = { error: "Unauthorized: Invalid password" };
//     return false;
//   }
//   return true;
// }

/** `?doc=name` → `./name.md`; omit → `./apidoc.md`. Basename only; rejects path segments. */
function resolveDocFile(
  params: URLSearchParams,
): { ok: true; filePath: string; title: string } | { ok: false; error: string } {
  const raw = (params.get("doc") || "").trim();
  let stem: string;
  if (!raw) {
    stem = "apidoc";
  } else {
    const base = raw.replace(/\\/g, "/").split("/").pop() || "";
    let s = base;
    if (s.toLowerCase().endsWith(".md")) s = s.slice(0, -3);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(s)) {
      return {
        ok: false,
        error:
          "invalid 'doc' parameter: use a single basename (letters, digits, . _ -), no paths",
      };
    }
    stem = s;
  }
  return { ok: true, filePath: `./${stem}.md`, title: stem };
}

// Built-in system prompts for /api/search_and_chat and /api/chat (select by index via system_prompt)
const DEFAULT_SYSTEM_PROMPT_TEMPLATES: string[] = [
  `
      你是 LangChatbot **基于老挝语的助手**。你的主要任务是用老挝语与用户交流，帮助他们学习老挝语、理解老挝文化、进行翻译与日常对话。

      在回答中，你需要：

      1. **默认使用老挝语回复**；若用户使用其他语言，可先简要回应，再给出老挝语表达
      2. 解释词语、句型、发音与文化背景时，清晰、耐心、实用
      3. 必要时提供中文或英文对照，帮助用户理解
      4. 回答简洁自然，适合日常学习与聊天场景
      `,
  `
      你是 LangChatbot **基于粤语的助手**。你的主要任务是用粤语与用户交流，帮助他们学习粤语、理解岭南文化、掌握地道表达。

      在回答中，你需要：

      1. **默认使用粤语**（繁体中文书面形式或口语化表达）回复
      2. 解释词语、俗语、发音与用法时，贴近日常口语。
      3. 结合语料与文化背景，让回答有生活感、可立即使用
      4. 用户用普通话或其他语言提问时，以粤语为主解答，并酌情补充对照
      `,
  `
      你是 LangChatbot **支持多种不同语言的助手**。你的主要任务是帮助用户跨越语言障碍，进行多语言对话、翻译与文化交流。

      在回答中，你需要：

      1. 识别用户使用的语言，**优先用相同或最接近的语言回复**
      2. 在用户需要时，提供翻译、双语对照或跨语言解释
      3. 介绍不同语言背后的文化习俗与表达差异，帮助用户轻松体验多国文化
      4. 回答清晰、友好、实用；若涉及检索到的背景资料，融入回答即可，无需单独列出参考资料
      `,
];

function resolveSystemPrompt(
  param: unknown,
  templates: string[] = DEFAULT_SYSTEM_PROMPT_TEMPLATES,
):
  | { ok: true; prompt: string; templateIndex: number | null }
  | { ok: false; error: string } {
  if (templates.length === 0) {
    return { ok: false, error: "no system prompt templates configured" };
  }

  if (param == null || param === "") {
    return { ok: true, prompt: templates[0].trim(), templateIndex: 0 };
  }

  let index: number | null = null;
  if (typeof param === "number" && Number.isInteger(param)) {
    index = param;
  } else {
    const s = String(param).trim();
    if (s === "") {
      return { ok: true, prompt: templates[0].trim(), templateIndex: 0 };
    }
    if (/^\d+$/.test(s)) index = parseInt(s, 10);
    else return { ok: true, prompt: s, templateIndex: null };
  }

  if (index !== null) {
    if (index < 0 || index >= templates.length) {
      return {
        ok: false,
        error: `system_prompt index ${index} out of range (0–${templates.length - 1})`,
      };
    }
    return { ok: true, prompt: templates[index].trim(), templateIndex: index };
  }

  return { ok: true, prompt: String(param).trim(), templateIndex: null };
}

// Initialize router
const router = new Router();

// API Routes
router
  .get("/", async (context) => {
    context.response.body = `Hello from Lang ChatBot Server`;
  })
  .get("/health", (context) => {
    // Health check endpoint
    context.response.body = {
      status: "healthy",
      timestamp: new Date().toISOString(),
    };
  })
  .get("/docs", async (context) => {
    const spec = resolveDocFile(context.request.url.searchParams);
    if (!spec.ok) {
      context.response.status = 400;
      context.response.body = { error: spec.error };
      return;
    }
    try {
      const readmeText = await Deno.readTextFile(spec.filePath);
      context.response.headers.set("Content-Type", "text/markdown; charset=utf-8");
      context.response.body = readmeText;
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        context.response.status = 404;
        context.response.body = { error: "documentation file not found", doc: spec.title };
        return;
      }
      console.error("Error reading doc:", err);
      context.response.status = 500;
      context.response.body = { error: "Could not load documentation" };
    }
  })
  .get("/docs/html", async (context) => {
    const spec = resolveDocFile(context.request.url.searchParams);
    if (!spec.ok) {
      context.response.status = 400;
      context.response.body = { error: spec.error };
      return;
    }
    try {
      const readmeText = await Deno.readTextFile(spec.filePath);

      // Render markdown to HTML with GFM styles
      const body = render(readmeText);

      // Create complete HTML document with GFM CSS
      const html = `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${spec.title} — API Documentation</title>
      <style>
        ${CSS}
        body {
          max-width: 900px;
          margin: 0 auto;
          padding: 20px;
        }
      </style>
    </head>
    <body>
    ${body}
    </body>
    </html>`;

      // Set response headers for HTML
      context.response.headers.set("Content-Type", "text/html; charset=utf-8");
      context.response.body = html;
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        context.response.status = 404;
        context.response.body = { error: "documentation file not found", doc: spec.title };
        return;
      }
      console.error("Error reading doc:", err);
      context.response.status = 500;
      context.response.body = { error: "Could not load documentation" };
    }
  })
  .post("/api/trans_cantonese", async (context) => {
    // Cantonese ASR via DashScope Qwen3-ASR-Flash (OpenAI-compatible chat/completions).
    // Request: multipart/form-data with:
    // - file: audio file (required)
    // - language: optional (default "yue")
    // - prompt: optional
    // - task: optional ("transcribe" | "translate")
    try {
      const body = context.request.body({ type: "form-data" });
      // Oak default maxSize is 0 → all files go to Deno.makeTempDir() (fails on Deno Deploy: NotSupported: tmpdir).
      // Set maxSize === maxFileSize so the whole upload stays in FormDataFile.content (in-memory only).
      const maxAudioBytes = 25 * 1024 * 1024; // 25MB
      const form = await body.value.read({
        maxFileSize: maxAudioBytes,
        maxSize: maxAudioBytes,
      });

      const fileField = form.files?.find((f) => f.name === "file") ?? form.files?.[0];
      if (!fileField) {
        context.response.status = 400;
        context.response.body = { error: "multipart field 'file' is required" };
        return;
      }

      // Oak may provide either a temporary filepath or raw content.
      let fileBytes: Uint8Array;
      if (fileField.content) {
        fileBytes = fileField.content;
      } else if (fileField.filename) {
        // If Oak wrote a temp file, it is exposed as `filename`? (varies by Oak version/config).
        // Prefer `tempfile` if present; otherwise try `filename` as a path.
        const path = (fileField as unknown as { tempfile?: string }).tempfile ?? fileField.filename;
        fileBytes = await Deno.readFile(path);
      } else {
        context.response.status = 400;
        context.response.body = { error: "could not read uploaded file" };
        return;
      }

      const filename = fileField.originalName ?? "audio";
      const mimeType = fileField.contentType ?? "application/octet-stream";
      // Ensure we pass an ArrayBuffer-backed BlobPart (avoid SharedArrayBuffer typing issues)
      const arrayBuffer: ArrayBuffer = Uint8Array.from(fileBytes).buffer;
      const file = new File([arrayBuffer], filename, { type: mimeType });

      const languageRaw = form.fields?.language ?? "yue";
      const prompt = form.fields?.prompt;
      const taskRaw = form.fields?.task;
      const task = taskRaw === "translate" ? "translate" : "transcribe";

      const text = await transcribeCantoneseAudio({
        file,
        filename,
        language: String(languageRaw || "").trim() || "yue",
        prompt: prompt ? String(prompt) : undefined,
        task,
      });

      context.response.body = { text };
    } catch (err) {
      console.error("trans_cantonese error:", err);
      context.response.status = 500;
      context.response.body = { error: String(err) };
    }
  })
  /*
    # Cantonese TTS (default voice Kiki)
    curl -X POST http://localhost:4403/api/tts_cantonese \
      -H "Content-Type: application/json" \
      -d '{"text": "小朋友打疫苗后唔舒服，系正常咩？"}'

    # Male Cantonese voice Rocky
    curl -X POST http://localhost:4403/api/tts_cantonese \
      -H "Content-Type: application/json" \
      -d '{"text": "今晚打边炉好唔好啊？", "voice": "Rocky"}'
  */
  .post("/api/tts_cantonese", async (context) => {
    // Cantonese TTS via Alibaba DashScope Qwen3-TTS (non-realtime).
    // Body: { text, voice?: "Kiki" | "Rocky", language_type?: string, model?: string }
    const body = await context.request.body({ type: "json" }).value;
    const text: string = String(body.text ?? "").trim();
    const voiceRaw: string = String(body.voice ?? DASHSCOPE_TTS_DEFAULT_VOICE).trim();
    const languageType: string = String(body.language_type ?? body.languageType ?? "Chinese").trim();
    const model: string | undefined = body.model
      ? String(body.model).trim()
      : undefined;

    if (!text) {
      context.response.status = 400;
      context.response.body = { error: "'text' is required" };
      return;
    }

    if (voiceRaw && !CANTONESE_TTS_VOICES.has(voiceRaw)) {
      context.response.status = 400;
      context.response.body = {
        error: `unsupported voice "${voiceRaw}" for Cantonese TTS`,
        available: [...CANTONESE_TTS_VOICES],
      };
      return;
    }

    try {
      const result = await synthesizeCantoneseTts({
        text,
        voice: voiceRaw,
        language_type: languageType || "Chinese",
        model,
      });
      context.response.body = result;
    } catch (err) {
      console.error("tts_cantonese error:", err);
      context.response.status = 500;
      context.response.body = { error: String(err) };
    }
  })
  .get("/api/search", async (context) => {
    // TF-IDF search endpoint
    // Usage: GET /api/search?q=藏传佛教如何看待死亡&topk=10&lib=tfidf
    await ensureTfidfLoaded();
    const params = context.request.url.searchParams;
    const q = params.get("q") || "";
    const lib = params.get("lib") || "";
    const topk = Math.min(Math.max(parseInt(params.get("topk") || "10", 10) || 10, 1), 50);

    if (!lib.trim()) {
      context.response.status = 400;
      context.response.body = {
        error: "query parameter 'lib' is required",
        available: [...tfidfIndices.keys()],
      };
      return;
    }

    const index = tfidfIndices.get(lib);
    if (!index) {
      context.response.status = 404;
      context.response.body = {
        error: `lib "${lib}" not found`,
        available: [...tfidfIndices.keys()],
      };
      return;
    }

    if (!q.trim()) {
      context.response.status = 400;
      context.response.body = { error: "query parameter 'q' is required" };
      return;
    }

    const results = index.query(q, topk);
    context.response.body = {
      query: q,
      lib,
      topk,
      total_chunks: index.chunks.length,
      results,
    };
  })
  .get("/api/vector_search", async (context) => {
    // Supabase pgvector semantic search
    // Usage: GET /api/vector_search?q=如何面对焦虑&topk=10&lib=psy
    const params = context.request.url.searchParams;
    const q = params.get("q") || "";
    const lib = (params.get("lib") || "psy").trim();
    const topk = Math.min(Math.max(parseInt(params.get("topk") || "10", 10) || 10, 1), 50);

    if (!q.trim()) {
      context.response.status = 400;
      context.response.body = { error: "query parameter 'q' is required" };
      return;
    }

    try {
      const results = await vectorSearch(q, topk, lib);
      context.response.body = {
        query: q,
        lib,
        topk,
        results: results.map((r, i) => ({
          rank: i + 1,
          similarity: +r.similarity.toFixed(4),
          text: r.embedding_input,
          resource_name: r.source_name ?? undefined,
        })),
      };
    } catch (err) {
      console.error("vector_search error:", err);
      context.response.status = 500;
      context.response.body = { error: String(err) };
    }
  })
  /*
    # Zhihu on-site search (requires ZHIHU_API_KEY)
    # Docs: https://developer.zhihu.com/docs?key=zhihu_search
    curl "http://localhost:3003/api/zhihu-search?q=粤语&count=5"
    curl -X POST http://localhost:3003/api/zhihu-search \
      -H "Content-Type: application/json" \
      -d '{"q": "粤语文化", "count": 5}'
  */
  .get("/api/zhihu-search", async (context) => {
    // Proxy to Zhihu Open Platform GET /api/v1/content/zhihu_search
    const params = context.request.url.searchParams;
    const q = (params.get("q") || params.get("query") || params.get("Query") || "").trim();
    const countRaw = params.get("count") || params.get("Count") || params.get("topk") || "10";
    const count = Math.min(Math.max(parseInt(countRaw, 10) || 10, 1), 10);

    if (!q) {
      context.response.status = 400;
      context.response.body = { error: "query parameter 'q' (or 'query') is required" };
      return;
    }
    if (!ZHIHU_API_KEY.trim()) {
      context.response.status = 500;
      context.response.body = { error: "ZHIHU_API_KEY is not set" };
      return;
    }

    try {
      context.response.body = await searchZhihu({ query: q, count });
    } catch (err) {
      console.error("zhihu-search error:", err);
      context.response.status = 500;
      context.response.body = { error: String(err) };
    }
  })
  .post("/api/zhihu-search", async (context) => {
    // Same as GET /api/zhihu-search, JSON body: { q|query, count? }
    const body = await context.request.body({ type: "json" }).value;
    const q = String(body.q ?? body.query ?? body.Query ?? "").trim();
    const countRaw = body.count ?? body.Count ?? body.topk ?? 10;
    const count = Math.min(Math.max(parseInt(String(countRaw), 10) || 10, 1), 10);

    if (!q) {
      context.response.status = 400;
      context.response.body = { error: "'q' (or 'query') is required" };
      return;
    }
    if (!ZHIHU_API_KEY.trim()) {
      context.response.status = 500;
      context.response.body = { error: "ZHIHU_API_KEY is not set" };
      return;
    }

    try {
      context.response.body = await searchZhihu({ query: q, count });
    } catch (err) {
      console.error("zhihu-search error:", err);
      context.response.status = 500;
      context.response.body = { error: String(err) };
    }
  })
  /*

    # default template [0]
    curl -X POST http://localhost:8000/api/search_and_chat \
      -H "Content-Type: application/json" \
      -d '{"q": "如何面对焦虑", "search_mode": "vector"}'
    # built-in template [1]
    curl -X POST http://localhost:8000/api/search_and_chat \
      -H "Content-Type: application/json" \
      -d '{"q": "如何面对焦虑", "search_mode": "vector", "lib": "dao", "system_prompt": 1}'
    # custom string (unchanged 8000)
    curl -X POST http://localhost:4403/api/search_and_chat \
      -H "Content-Type: application/json" \
      -d '{"q": "如何面对焦虑", "system_prompt": "你是专业心理咨询师……"}'

  */
  .post("/api/search_and_chat", async (context) => {
    // RAG endpoint: search for relevant chunks then ask the LLM
    // Body: { q, lib?, topk?, messages?, search_mode?: "tfidf" | "vector", system_prompt?: string | number }
    const body = await context.request.body({ type: "json" }).value;
    const q: string = body.q || "";
    const topk: number = Math.min(Math.max(Number(body.topk) || 10, 1), 50);
    const searchMode: string = body.search_mode || "tfidf";
    const lib: string = String(
      body.lib ?? (searchMode === "vector" ? "psy" : ""),
    ).trim();
    const systemPromptParam: unknown =
      body.system_prompt ?? body.systemPrompt ?? null;

    if (!q.trim()) {
      context.response.status = 400;
      context.response.body = { error: "'q' is required" };
      return;
    }

    try {
      // Step 1: retrieve relevant context based on search_mode
      let contextChunks: string;
      let sources: unknown[];

      if (searchMode === "vector") {
        console.log("vector way search");
        // Supabase pgvector semantic search (lib defaults to "psy")
        const results = await vectorSearch(q, topk, lib);
        console.log("results", results);
        sources = results.map((r, i) => ({
          rank: i + 1,
          score: +r.similarity.toFixed(4),
          text: r.embedding_input,
          resource_name: r.source_name ?? undefined,
        }));
        contextChunks = results
          .map((r, i) => `[vector result #${i + 1}, similarity ${r.similarity.toFixed(4)}]\n${r.embedding_input}\nSource: ${r.source_name}`)
          .join("\n\n---\n\n");
        console.log("vector search results:", contextChunks);
      } else {
        console.log("tfidf way search");
        // TF-IDF sparse search (requires lib)
        await ensureTfidfLoaded();
        if (!lib.trim()) {
          context.response.status = 400;
          context.response.body = {
            error: "'lib' is required for tfidf search mode",
            available: [...tfidfIndices.keys()],
          };
          return;
        }
        const index = tfidfIndices.get(lib);
        if (!index) {
          context.response.status = 404;
          context.response.body = {
            error: `lib "${lib}" not found`,
            available: [...tfidfIndices.keys()],
          };
          return;
        }

        const searchResults = index.query(q, topk);
        sources = searchResults;
        contextChunks = searchResults
          .map(
            (r) =>
              `[${r.chunk.chapter_title} | ${r.chunk.href} chunk#${r.chunk.chunk_index}]\n${r.chunk.text}`,
          )
          .join("\n\n---\n\n");
        console.log("tfidf search results:", contextChunks);
      }

      // Step 2: build RAG messages
      const promptResolved = resolveSystemPrompt(systemPromptParam);
      if (!promptResolved.ok) {
        context.response.status = 400;
        context.response.body = {
          error: promptResolved.error,
          available_templates: DEFAULT_SYSTEM_PROMPT_TEMPLATES.length,
        };
        return;
      }
      const systemPrompt = promptResolved.prompt;

      console.log("systemPrompt:", systemPrompt);

      const citations = `
      下面是可作为背景知识的资料：
      【资料】
      ${contextChunks}
      `;

      const priorMessages: Array<{ role: string; content: string }> =
        Array.isArray(body.messages) ? body.messages : [];

      const messages = [
        { role: "system", content: systemPrompt },
        { role: "system", content: citations },
        ...priorMessages,
        { role: "user", content: q },
      ];

      console.log("messages:", messages);

      // Step 3: call LLM via DashScope
      const text = await callLLM(messages);

      context.response.body = {
        text,
        sources,
        ...(promptResolved.templateIndex !== null
          ? { system_prompt_template_index: promptResolved.templateIndex }
          : {}),
      };
    } catch (err) {
      console.error("search_and_chat error:", err);
      context.response.status = 500;
      context.response.body = { error: String(err) };
    }
  })
  /*
    # default template [0]
    curl -X POST http://localhost:4403/api/chat \
      -H "Content-Type: application/json" \
      -d '{"q": "如何面对焦虑"}'
    # built-in template [1]
    curl -X POST http://localhost:4403/api/chat \
      -H "Content-Type: application/json" \
      -d '{"q": "如何定心安神", "system_prompt": 1}'
    # custom string
    curl -X POST http://localhost:4403/api/chat \
      -H "Content-Type: application/json" \
      -d '{"q": "如何面对焦虑", "system_prompt": "你是专业心理咨询师……"}'
    # multi-turn
    curl -X POST http://localhost:4403/api/chat \
      -H "Content-Type: application/json" \
      -d '{
        "q": "那具体应该怎么做呢",
        "messages": [
          {"role": "user", "content": "如何面对焦虑"},
          {"role": "assistant", "content": "面对焦虑时，可以尝试……"}
        ]
      }'

  */
  .post("/api/chat", async (context) => {
    // Chat endpoint: same as /api/search_and_chat without retrieval (no search_mode, lib, topk, sources)
    // Body: { q, messages?, system_prompt?: string | number }
    const body = await context.request.body({ type: "json" }).value;
    const q: string = body.q || "";
    const systemPromptParam: unknown =
      body.system_prompt ?? body.systemPrompt ?? null;

    if (!q.trim()) {
      context.response.status = 400;
      context.response.body = { error: "'q' is required" };
      return;
    }

    try {
      const promptResolved = resolveSystemPrompt(systemPromptParam);
      if (!promptResolved.ok) {
        context.response.status = 400;
        context.response.body = {
          error: promptResolved.error,
          available_templates: DEFAULT_SYSTEM_PROMPT_TEMPLATES.length,
        };
        return;
      }

      const priorMessages: Array<{ role: string; content: string }> =
        Array.isArray(body.messages) ? body.messages : [];

      const messages = [
        { role: "system", content: promptResolved.prompt },
        ...priorMessages,
        { role: "user", content: q },
      ];

      console.log("messages:", messages);

      const text = await callLLM(messages);

      context.response.body = {
        text,
        ...(promptResolved.templateIndex !== null
          ? { system_prompt_template_index: promptResolved.templateIndex }
          : {}),
      };
    } catch (err) {
      console.error("chat error:", err);
      context.response.status = 500;
      context.response.body = { error: String(err) };
    }
  })
  .post("/api/new_cert", async (context) => {
    // Create a new certificate record in agent_lib_cert_master.
    // Body: { passwd, owner, cert_name }
    const body = await context.request.body({ type: "json" }).value;
    const { passwd, owner, cert_name } = body;

    const expectedPasswd = Deno.env.get("PASSWD") || "";
    if (!passwd || passwd !== expectedPasswd) {
      context.response.status = 401;
      context.response.body = { error: "Unauthorized: invalid passwd" };
      return;
    }

    if (!owner?.trim() || !cert_name?.trim()) {
      context.response.status = 400;
      context.response.body = { error: "'owner' and 'cert_name' are required" };
      return;
    }

    if (!supabase) {
      context.response.status = 500;
      context.response.body = { error: "Supabase not configured" };
      return;
    }

    try {
      const { data, error } = await supabase
        .from("agent_lib_cert_master")
        .insert({ owner: owner.trim(), cert_name: cert_name.trim() })
        .select()
        .single();

      if (error) throw error;

      context.response.body = { success: true, data };
    } catch (err) {
      console.error("new_cert error:", err);
      context.response.status = 500;
      context.response.body = { error: String(err) };
    }
  })
  .get("/api/verify_cert", async (context) => {
    // Verify cert by query param cert_id (row id in agent_lib_cert_master).
    const params = context.request.url.searchParams;
    const certId = (params.get("cert_id") || "").trim();

    if (!certId) {
      context.response.status = 400;
      context.response.body = { error: "query parameter 'cert_id' is required" };
      return;
    }

    if (!supabase) {
      context.response.status = 500;
      context.response.body = { error: "Supabase not configured" };
      return;
    }

    try {
      const { data, error } = await supabase
        .from("agent_lib_cert_master")
        .select("*")
        .eq("cert_id", certId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        context.response.status = 404;
        context.response.body = { error: "certificate not found", cert_id: certId };
        return;
      }

      context.response.body = { valid: true, cert: data };
    } catch (err) {
      console.error("verify_cert error:", err);
      context.response.status = 500;
      context.response.body = { error: String(err) };
    }
  });

// Initialize application
const app = new Application();

// Middleware: Error handling
app.use(async (context, next) => {
  try {
    await next();
  } catch (err) {
    console.error("Error:", err);
    context.response.status = 500;
    context.response.body = {
      success: false,
      error: "Internal server error",
    };
  }
});

// Middleware: Logger
app.use(async (context, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${context.request.method} ${context.request.url} - ${ms}ms`);
});

// Enable CORS for All Routes
app.use(oakCors());

// Middleware: Router
app.use(router.routes());

// Start server
const port = 3003;

const isDeploy =
  Boolean(Deno.env.get("DENO_DEPLOYMENT_ID")) || Boolean(Deno.env.get("DENO_REGION"));

if (isDeploy) {
  console.info(`🚀 Server started (Deno Deploy)`);
  Deno.serve({
    handler: async (req) => {
      const resp = await app.handle(req);
      return resp ?? new Response("Not Found", { status: 404 });
    },
  });
} else {
  console.info(`
  🚀 CORS-enabled web server listening on port ${port}
  
  🌐 Visit: http://localhost:${port}
  `);

  await app.listen({ port });
}