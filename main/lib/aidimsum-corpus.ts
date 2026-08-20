/** AI Dimsum corpus API — https://backend.aidimsum.com/docs */

export type CorpusItem = {
  unique_id?: string;
  data?: string;
  note?: {
    meaning?: string[];
    pinyin?: string[];
    context?: Record<string, string>;
  };
  category?: string;
  tags?: string[];
  structured_note?: {
    data?: Array<{
      blocks?: Array<{ type?: string; content?: string; url?: string }>;
    }>;
  };
};

export type CorpusCategory = {
  id?: number;
  name: string;
  nickname?: string;
  description?: string;
};

const DEFAULT_TABLE_NAME = "cantonese_corpus_all";
const DEFAULT_LIMIT = 5;

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

function isCorpusItem(value: unknown): value is CorpusItem {
  if (!value || typeof value !== "object") return false;
  const item = value as CorpusItem;
  return Boolean(item.unique_id || item.data);
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** GET /v2/text_search */
export async function searchCorpusText(
  baseUrl: string,
  keyword: string,
  tableName = DEFAULT_TABLE_NAME,
  limit = DEFAULT_LIMIT,
): Promise<CorpusItem[]> {
  const trimmed = keyword.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({
    keyword: trimmed,
    table_name: tableName,
    limit: String(limit),
  });
  const url = `${normalizeBaseUrl(baseUrl)}/v2/text_search?${params}`;
  const data = await fetchJson<unknown>(url);
  if (!Array.isArray(data)) return [];
  return data.filter(isCorpusItem);
}

/** GET /corpus_categories — all category metadata (name → nickname) */
export async function fetchCorpusCategories(baseUrl: string): Promise<CorpusCategory[]> {
  const url = `${normalizeBaseUrl(baseUrl)}/corpus_categories`;
  const data = await fetchJson<unknown>(url);
  if (!Array.isArray(data)) return [];
  return data.filter(
    (row): row is CorpusCategory =>
      !!row &&
      typeof row === "object" &&
      typeof (row as CorpusCategory).name === "string",
  );
}

export function buildCategoryNicknameMap(
  categories: CorpusCategory[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const cat of categories) {
    const name = cat.name?.trim();
    if (!name) continue;
    map.set(name, cat.nickname?.trim() || name);
  }
  return map;
}

export function resolveCategoryNickname(
  categoryName: string | undefined,
  nicknames: Map<string, string>,
): string {
  const key = categoryName?.trim();
  if (!key) return "AI Dimsum";
  return nicknames.get(key) ?? key;
}

/** GET /v2/corpus_item — lookup by unique_id or exact data */
export async function fetchCorpusItem(
  baseUrl: string,
  params: { unique_id?: string; data?: string },
): Promise<CorpusItem | null> {
  const searchParams = new URLSearchParams();
  if (params.unique_id) searchParams.set("unique_id", params.unique_id);
  else if (params.data) searchParams.set("data", params.data);
  else return null;

  const url = `${normalizeBaseUrl(baseUrl)}/v2/corpus_item?${searchParams}`;
  const data = await fetchJson<unknown>(url);
  return isCorpusItem(data) ? data : null;
}

/** text_search first; fall back to corpus_item for short queries */
export async function fetchAdditionalCorpus(
  baseUrl: string,
  keyword: string,
  tableName = DEFAULT_TABLE_NAME,
  limit = DEFAULT_LIMIT,
): Promise<CorpusItem[]> {
  const trimmed = keyword.trim();
  if (!trimmed) return [];

  const fromSearch = await searchCorpusText(baseUrl, trimmed, tableName, limit);
  if (fromSearch.length > 0) return fromSearch;

  if (trimmed.length <= 20) {
    const item = await fetchCorpusItem(baseUrl, { data: trimmed });
    if (item) return [item];
  }

  return [];
}

export function formatCorpusItemText(item: CorpusItem): string {
  const lines: string[] = [];
  // if (item.data) lines.push(item.data);

  if (item.note?.meaning?.length) {
    lines.push(`内容: ${item.note.meaning.join("；")}`);
  }
  if (item.note?.pinyin?.length) {
    lines.push(`拼音: ${item.note.pinyin.join("，")}`);
  }

  const yueText = item.note?.context?.["粤语文本"];
  if (yueText) lines.push(`粤语: ${yueText}`);

  const blocks = item.structured_note?.data?.[0]?.blocks ?? [];
  for (const block of blocks) {
    if (block.type === "definition" && block.content) {
      lines.push(`内容: ${block.content}`);
    }
  }
  if (item.tags?.length) lines.push(`标签: ${item.tags.join(", ")}`);

  return lines.join("\n");
}

/** Primary text to pre-fill chat input from a corpus item (ready to send). */
export function corpusItemToInputText(item: CorpusItem): string {
  const title = item.data?.trim() ?? "";
  const details = formatCorpusItemText(item);
  if (title && details) return `${title}\n\n${details}`;
  return title || details;
}

export function formatCorpusContext(items: CorpusItem[]): string {
  return items
    .map((item, i) => `[语料 #${i + 1}]\n${formatCorpusItemText(item)}`)
    .join("\n\n");
}

export type CorpusSource = {
  rank: number;
  score: number;
  text: string;
  resource_name: string;
};

export function corpusItemsToSources(items: CorpusItem[], startRank = 1): CorpusSource[] {
  return items.map((item, i) => ({
    rank: startRank + i,
    score: 1,
    text: formatCorpusItemText(item),
    resource_name: item.category ? `AI Dimsum · ${item.category}` : "AI Dimsum",
  }));
}

/** DimSum public search — opens corpus item on v1.search.aidimsum.com */
export function corpusItemSearchUrl(item: CorpusItem): string {
  const q = item.data?.trim();
  if (!q) return "";
  const params = new URLSearchParams({ q, dataset: "all" });
  return `https://v1.search.aidimsum.com/search?${params}`;
}

/** Prefer a block URL; otherwise /v2/corpus_item?unique_id=… */
export function corpusItemLink(baseUrl: string, item: CorpusItem): string {
  const blockUrl = item.structured_note?.data?.[0]?.blocks?.find((b) => b.url?.trim())?.url?.trim();
  if (blockUrl) return blockUrl;
  const uuid = item.unique_id?.trim();
  if (uuid) {
    return `${normalizeBaseUrl(baseUrl)}/v2/corpus_item?unique_id=${encodeURIComponent(uuid)}`;
  }
  return "";
}
