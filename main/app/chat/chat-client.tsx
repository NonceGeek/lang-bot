"use client";

import { useEffect, useRef, useState, useCallback, type RefObject, type MutableRefObject } from "react";
import { marked } from "marked";
import { DeepChat } from "deep-chat-react";
import { Header } from "@/components/header";
import {
  buildCategoryNicknameMap,
  corpusItemLink,
  corpusItemSearchUrl,
  corpusItemsToSources,
  fetchAdditionalCorpus,
  fetchCorpusCategories,
  fetchCorpusItem,
  formatCorpusContext,
  formatCorpusItemText,
  resolveCategoryNickname,
  searchCorpusText,
  type CorpusItem,
} from "@/lib/aidimsum-corpus";

const DEFAULT_HISTORY_KEY = "psy_chat_history";
const DEFAULT_TAG_CSV_URL = "/tag_content.csv";

type Source = {
  rank: number;
  score: number;
  text?: string;
  /** Vector RAG source label (e.g. book/source name); API may send `source` instead */
  resource_name?: string;
  source?: string;
  chunk?: {
    book_title: string;
    author: string;
    chapter_title: string;
    chunk_index: number;
    text: string;
  };
};

type ZhihuSearchItem = {
  title: string;
  url: string;
  author_name?: string;
  summary?: string;
  vote_up_count?: number;
  comment_count?: number;
  /** zhihu (default) vs AI Dimsum /v2/text_search */
  source?: "zhihu" | "dimsum";
  /** AI Dimsum category key (maps to nickname via /corpus_categories) */
  category?: string;
};

type HistoryMessage = {
  role: string;
  content: string;
  citations?: Source[];
  /** Zhihu「联网搜索」titles shown under the answer */
  webSearchItems?: ZhihuSearchItem[];
};

function loadHistory(storageKey: string): HistoryMessage[] {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(storageKey: string, history: HistoryMessage[]) {
  localStorage.setItem(storageKey, JSON.stringify(history));
}

function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function encodeZhihuItem(item: ZhihuSearchItem): string {
  return encodeURIComponent(
    JSON.stringify({
      title: item.title ?? "",
      url: item.url ?? "",
      author_name: item.author_name ?? "",
      summary: item.summary ?? "",
      vote_up_count: Number(item.vote_up_count ?? 0) || 0,
      comment_count: Number(item.comment_count ?? 0) || 0,
      source: item.source ?? "zhihu",
      category: item.category ?? "",
    }),
  );
}

function decodeZhihuItem(raw: string | undefined): ZhihuSearchItem | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as ZhihuSearchItem;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function buildWebSearchListHtml(
  items: ZhihuSearchItem[],
  opts: { showVotes: boolean },
): string {
  return items
    .map((item, i) => {
      const title = escapeHtml(item.title || "(无标题)");
      const votes = Number(item.vote_up_count ?? 0) || 0;
      const comments = Number(item.comment_count ?? 0) || 0;
      const payload = encodeZhihuItem(item);
      const meta = opts.showVotes
        ? `<span style="color:#64748b;font-size:0.85em;white-space:nowrap">👍 ${votes}　💬 ${comments}</span>`
        : "";
      return (
        `<li style="margin:4px 0;display:flex;align-items:flex-start;gap:6px;flex-wrap:wrap">` +
        `<span style="color:#64748b;min-width:1.5em">${i + 1}.</span>` +
        `<button type="button" data-zhihu-item="${payload}" ` +
        `style="background:none;border:none;padding:0;margin:0;color:#2563eb;text-decoration:underline;cursor:pointer;font:inherit;text-align:left;flex:1;min-width:0">` +
        `${title}` +
        `</button>` +
        meta +
        `</li>`
      );
    })
    .join("");
}

function buildWebSearchHtml(items: ZhihuSearchItem[]): string {
  if (!items.length) return "";
  const zhihu = items
    .filter((item) => item.source !== "dimsum")
    .sort(
      (a, b) => (Number(b.vote_up_count ?? 0) || 0) - (Number(a.vote_up_count ?? 0) || 0),
    );
  const dimsum = items.filter((item) => item.source === "dimsum");
  const zhihuList = zhihu.length
    ? `<ol style="margin:0;padding-left:0;list-style:none">${buildWebSearchListHtml(zhihu, { showVotes: true })}</ol>`
    : "";
  const dimsumList = dimsum.length
    ? `<div style="font-weight:600;color:#475569;margin:8px 0 4px;font-size:0.85em">AI Dimsum</div>` +
      `<ol style="margin:0;padding-left:0;list-style:none">${buildWebSearchListHtml(dimsum, { showVotes: false })}</ol>`
    : "";
  return (
    `<div style="margin-top:12px;padding:8px 10px;background:rgba(37,99,235,0.06);border-radius:8px;font-size:0.9em;line-height:1.5">` +
    `<div style="font-weight:600;color:#334155;margin-bottom:6px">🌐 联网搜索</div>` +
    zhihuList +
    dimsumList +
    `</div>`
  );
}

function corpusItemsToWebSearchItems(
  items: CorpusItem[],
  baseUrl: string,
  categoryNicknames: Map<string, string>,
): ZhihuSearchItem[] {
  return items.map((item) => {
    const uuid = item.unique_id?.trim();
    const categoryKey = item.category?.trim() || "";
    const nickname = resolveCategoryNickname(categoryKey, categoryNicknames);
    return {
      title: item.data?.trim() || uuid || "(语料)",
      url: corpusItemSearchUrl(item) || corpusItemLink(baseUrl, item),
      author_name: nickname,
      category: categoryKey,
      summary: formatCorpusItemText(item),
      source: "dimsum" as const,
    };
  });
}

function buildAnswerHtml(
  content: string,
  webSearchItems?: ZhihuSearchItem[],
): string {
  const body = `<div class="markdown-body">${markdownToHtml(content)}</div>`;
  return body + buildWebSearchHtml(webSearchItems ?? []);
}

/** Format「联网搜索」hits for LLM context (appended to `q`). */
function formatWebSearchContext(items: ZhihuSearchItem[]): string {
  if (!items.length) return "";
  return items
    .map((item, i) => {
      const lines = [`[${i + 1}] ${item.title || "(无标题)"}`];
      if (item.source === "dimsum") {
        if (item.author_name?.trim()) lines.push(`分类: ${item.author_name.trim()}`);
      } else {
        if (item.author_name?.trim()) lines.push(`作者: ${item.author_name.trim()}`);
        lines.push(
          `赞同: ${Number(item.vote_up_count ?? 0) || 0}  评论: ${Number(item.comment_count ?? 0) || 0}`,
        );
      }
      if (item.summary?.trim()) lines.push(`摘要: ${item.summary.trim()}`);
      if (item.url?.trim()) lines.push(`链接: ${item.url.trim()}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

/** Pull a search keyword from the user question for Zhihu zhihu-search. */
function extractSearchKeyword(question: string): string {
  let q = question.trim();
  // Drop trailing punctuation / question marks common in Chinese & English
  q = q.replace(/[？?！!。．.、，,；;：:\s]+$/g, "");
  // Collapse whitespace
  q = q.replace(/\s+/g, " ").trim();
  // Zhihu Query is typically short; keep first ~80 chars
  if (q.length > 80) q = q.slice(0, 80).trim();
  return q;
}

/**
 * Abstract a short entity/topic keyword for AI Dimsum /v2/text_search.
 * e.g.「佛山有什么好吃的？」→「佛山」
 */
function extractDimsumKeyword(question: string): string {
  let q = question.trim();
  q = q.replace(/[？?！!。．.、，,；;：:\s]+$/g, "");
  q = q.replace(/\s+/g, " ").trim();
  if (!q) return "";

  // Drop leading prompt fillers
  q = q.replace(
    /^(介绍一下|介绍下|请问一下|请问|想问下|想问|帮我查下|帮我|请|说说|讲讲|查一下|查下)\s*/u,
    "",
  );

  // 「X有什么好吃的 / 有咩… / 有哪些…」→ X
  const hasWhat = q.match(
    /^(.{1,20}?)(有什么|有甚么|有咩|有冇|有哪些|有何)/u,
  );
  if (hasWhat?.[1]?.trim()) {
    return hasWhat[1].trim().replace(/[的地得]$/u, "");
  }

  // 「X是什么 / 系咩 / 点解 / 怎么样」→ X
  const isWhat = q.match(
    /^(.{1,20}?)(是什么|是甚么|系咩|是咩|点解|为什么|怎么样|点样|如何|怎么|几时|何时)/u,
  );
  if (isWhat?.[1]?.trim()) {
    return isWhat[1].trim().replace(/[的地得]$/u, "");
  }

  // Strip trailing descriptive / interrogative tails
  q = q
    .replace(/(好吃的|好玩的|好看的|好去处|特色|推荐|地方|美食|景点)$/u, "")
    .replace(/(呢|啊|呀|吗|嘛|啦|了|的|么|嘛)+$/u, "")
    .trim();

  // Prefer a short head noun-ish chunk (place/topic), max ~12 chars
  if (q.length > 12) q = q.slice(0, 12).trim();
  return q || extractSearchKeyword(question);
}

async function fetchZhihuSearch(
  apiUrl: string,
  query: string,
  count = 5,
): Promise<ZhihuSearchItem[]> {
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, count }),
  });
  if (!res.ok) throw new Error(`zhihu-search ${res.status}`);
  const data = (await res.json()) as { items?: ZhihuSearchItem[] };
  return Array.isArray(data.items) ? data.items.filter((i) => i?.title) : [];
}

type ChatClientProps = {
  homepageName: string;
  chatbotDescription: string;
  chatbotIntroMessage: string;
  chatApiUrl: string;
  chatLib: string;
  searchMode: string;
  /** When set, sent as system_prompt (numeric strings become JSON numbers for template index) */
  prompt1?: string | number | null;
  /** If true, send system_prompt on every request; default is first message only */
  systemPromptEachRequest?: boolean;
  /** localStorage key; use a unique value per chat route so pages do not share history */
  historyStorageKey?: string;
  /** Public CSV path for「随便聊聊」 — one question per line after header */
  tagCsvUrl?: string;
  /** Page heading; defaults to `${homepageName} Chat` */
  chatTitle?: string;
  /** Optional AI Dimsum base URL for extra corpus context (e.g. https://backend.aidimsum.com) */
  additionalSourceUrl?: string;
  /** Table name for /v2/text_search on the additional source */
  additionalSourceTableName?: string;
  /** When set, enables「发音」: select text → button → POST here for Cantonese TTS */
  ttsApiUrl?: string;
  /** Optional voice for TTS (e.g. "Kiki" female, "Rocky" male) */
  ttsVoice?: string;
  /** When set, shows「联网搜索」toggle (default on) and calls this Zhihu search API */
  zhihuSearchApiUrl?: string;
};

type ChatMessage = {
  role: string;
  text?: string;
  content?: string;
};

type InterceptorDetails = {
  body: {
    messages?: ChatMessage[];
  };
};

type ResponseDetails = {
  text?: string;
  html?: string;
  sources?: Source[];
};

type DeepChatElement = HTMLElement & {
  request?: {
    url: string;
    method: "POST";
    headers: Record<string, string>;
  };
  requestInterceptor?: (
    details: InterceptorDetails,
  ) => InterceptorDetails | Promise<InterceptorDetails>;
  responseInterceptor?: (response: ResponseDetails) => ResponseDetails;
  submitUserMessage?: (text: string) => void;
  focusInput?: () => void;
  addMessage?: (message: { role?: string; text?: string; html?: string }, isUpdate?: boolean) => void;
};

// const MOOD_PROMPT = "今天心情怎么样？";
// const MOOD_BUTTONS = ["非常高兴", "开心", "平淡", "难过", "崩溃"];

function parseQuestionCsv(csvText: string): string[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];
  return lines.slice(1).map((line) => line.trim()).filter(Boolean);
}

function getUrlUuid(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("uuid")?.trim() || undefined;
}

type SelectionInfo = { text: string; rect: DOMRect };

/**
 * Read the current text selection. Deep Chat renders messages inside a shadow
 * root, whose selection is NOT exposed via `window.getSelection()` in Chrome,
 * so we also probe the chat element's shadow root (non-standard getSelection).
 */
function getSelectionInfo(chatEl: HTMLElement | null): SelectionInfo | null {
  const collect = (sel: Selection | null | undefined): SelectionInfo | null => {
    if (!sel || sel.rangeCount === 0) return null;
    const text = sel.toString().trim();
    if (!text) return null;
    return { text, rect: sel.getRangeAt(0).getBoundingClientRect() };
  };

  const fromWindow = collect(window.getSelection());
  if (fromWindow) return fromWindow;

  const shadow = chatEl?.shadowRoot as
    | (ShadowRoot & { getSelection?: () => Selection | null })
    | undefined;
  return collect(shadow?.getSelection?.());
}

/** pending = fetching corpus; CorpusItem = loaded; null = no uuid */
type UuidCorpusState = "pending" | CorpusItem | null;

export function ChatClient({
  homepageName,
  chatbotDescription,
  chatbotIntroMessage,
  chatApiUrl,
  chatLib,
  searchMode,
  prompt1,
  systemPromptEachRequest = false,
  historyStorageKey = DEFAULT_HISTORY_KEY,
  tagCsvUrl = DEFAULT_TAG_CSV_URL,
  chatTitle,
  additionalSourceUrl,
  additionalSourceTableName,
  ttsApiUrl,
  ttsVoice,
  zhihuSearchApiUrl,
}: ChatClientProps) {
  const chatRef = useRef<DeepChatElement | null>(null);
  const historyRef = useRef<HistoryMessage[]>([]);
  const lastQuestionRef = useRef<string>("");
  const aidimsumCorpusRef = useRef<CorpusItem[]>([]);
  /** ?uuid= corpus — also appended to LLM `q` when present */
  const uuidCorpusRef = useRef<CorpusItem | null>(null);
  /** Read by requestInterceptor — updated by WebSearchToggle without re-rendering DeepChat */
  const webSearchEnabledRef = useRef(true);
  const zhihuItemsRef = useRef<ZhihuSearchItem[]>([]);
  const categoryNicknamesRef = useRef<Map<string, string>>(new Map());
  const categoriesReadyRef = useRef<Promise<void> | null>(null);
  const [categoryNicknames, setCategoryNicknames] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [uuidCorpus, setUuidCorpus] = useState<UuidCorpusState>(() =>
    getUrlUuid() ? "pending" : null,
  );
  const [initialHistory, setInitialHistory] = useState<
    Array<{ role: string; text?: string; html?: string }>
  >([]);
  const [randomQuestions, setRandomQuestions] = useState<string[]>([]);
  const heading = chatTitle ?? `${homepageName} Chat`;

  // Load AI Dimsum /corpus_categories once (name → nickname for modal & web search)
  useEffect(() => {
    if (!additionalSourceUrl) return;
    let cancelled = false;
    categoriesReadyRef.current = fetchCorpusCategories(additionalSourceUrl)
      .then((categories) => {
        if (cancelled) return;
        const map = buildCategoryNicknameMap(categories);
        categoryNicknamesRef.current = map;
        setCategoryNicknames(map);
      })
      .catch(() => {
        if (!cancelled) {
          categoryNicknamesRef.current = new Map();
          setCategoryNicknames(new Map());
        }
      });
    return () => {
      cancelled = true;
    };
  }, [additionalSourceUrl]);

  // ?uuid=… → GET /v2/corpus_item → show under input as「引用语料」JSON box
  useEffect(() => {
    if (uuidCorpus !== "pending") return;

    const uuid = getUrlUuid();
    if (!uuid || !additionalSourceUrl) {
      uuidCorpusRef.current = null;
      setUuidCorpus(null);
      return;
    }

    let cancelled = false;
    fetchCorpusItem(additionalSourceUrl, { unique_id: uuid })
      .then((item) => {
        if (cancelled) return;
        uuidCorpusRef.current = item;
        setUuidCorpus(item);
      })
      .catch(() => {
        if (!cancelled) {
          uuidCorpusRef.current = null;
          setUuidCorpus(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [uuidCorpus, additionalSourceUrl]);

  // Load chat history from localStorage on mount, including citations for assistant messages
  useEffect(() => {
    const saved = loadHistory(historyStorageKey);
    historyRef.current = saved;
    setInitialHistory(
      saved.map((m) => {
        const role = m.role === "assistant" ? "ai" : m.role;
        if (m.role === "assistant") {
          if (m.webSearchItems?.length) {
            return {
              role,
              html: buildAnswerHtml(m.content, m.webSearchItems),
            };
          }
          return { role, html: `<div class="markdown-body">${markdownToHtml(m.content)}</div>` };
        }
        return { role, text: m.content };
      }),
    );
  }, [historyStorageKey]);

  // Load question CSV from public for "随便聊聊" button
  useEffect(() => {
    fetch(tagCsvUrl)
      .then((r) => r.text())
      .then((text) => setRandomQuestions(parseQuestionCsv(text)))
      .catch(() => setRandomQuestions([]));
  }, [tagCsvUrl]);

  const clearChatHistory = useCallback(() => {
    localStorage.removeItem(historyStorageKey);
    window.location.reload();
  }, [historyStorageKey]);

  const sendMood = useCallback((text: string) => {
    const el = chatRef.current;
    if (el?.submitUserMessage) el.submitUserMessage("我今天感到" + text);
  }, []);

  const sendRandomChat = useCallback(() => {
    if (randomQuestions.length === 0) return;
    const el = chatRef.current;
    if (!el?.submitUserMessage) return;
    const question = randomQuestions[Math.floor(Math.random() * randomQuestions.length)];
    el.submitUserMessage(question);
  }, [randomQuestions]);

  const setupChatElement = useCallback(
    (el: DeepChatElement) => {
      chatRef.current = el;

      el.request = {
        url: chatApiUrl,
        method: "POST",
        headers: { "Content-Type": "application/json" },
      };

      // Transform Deep Chat messages into the search_and_chat RAG request format:
      // { q, search_mode, lib?, topk, messages }
      // Use historyRef (loaded from localStorage) as prior context for the API
      el.requestInterceptor = async (details: InterceptorDetails) => {
        const allMessages = (details.body.messages || []).map((msg) => ({
          role: msg.role,
          content: msg.text ?? msg.content ?? "",
        }));

        const lastMessage = allMessages[allMessages.length - 1];
        const currentQuestion = lastMessage?.content ?? "";
        lastQuestionRef.current = currentQuestion;
        aidimsumCorpusRef.current = [];
        zhihuItemsRef.current = [];

        const priorMessages: Array<{ role: string; content: string }> =
          historyRef.current.map((m) => ({ role: m.role, content: m.content }));

        let questionForApi = currentQuestion;

        // ?uuid= 引用语料 — always attach when present
        const uuidItem = uuidCorpusRef.current;
        if (uuidItem) {
          questionForApi = `${questionForApi}\n\n--- 引用语料 ---\n${JSON.stringify(uuidItem, null, 2)}`;
        }

        if (additionalSourceUrl && currentQuestion.trim()) {
          const dimsumKeyword =
            extractDimsumKeyword(currentQuestion) || currentQuestion.trim();
          const corpusItems = await fetchAdditionalCorpus(
            additionalSourceUrl,
            dimsumKeyword,
            additionalSourceTableName,
          );
          aidimsumCorpusRef.current = corpusItems;
          if (corpusItems.length > 0) {
            questionForApi = `${questionForApi}\n\n--- AI Dimsum 语料参考 ---\n${formatCorpusContext(corpusItems)}`;
          }
        }

        // 「联网搜索」: Zhihu uses fuller query; Dimsum uses abstracted keyword (e.g. 佛山)
        if (webSearchEnabledRef.current && currentQuestion.trim() && (zhihuSearchApiUrl || additionalSourceUrl)) {
          if (categoriesReadyRef.current) {
            await categoriesReadyRef.current;
          }
          const categoryNicknames = categoryNicknamesRef.current;
          const zhihuKeyword = extractSearchKeyword(currentQuestion);
          const dimsumKeyword = extractDimsumKeyword(currentQuestion);
          if (zhihuKeyword || dimsumKeyword) {
            const [zhihuItems, dimsumItems] = await Promise.all([
              zhihuSearchApiUrl && zhihuKeyword
                ? fetchZhihuSearch(zhihuSearchApiUrl, zhihuKeyword, 5).catch((err) => {
                    // DO NOT REMOVE THIS CONSOLE.LOG
                    console.log("zhihu-search error", err);
                    return [] as ZhihuSearchItem[];
                  })
                : Promise.resolve([] as ZhihuSearchItem[]),
              additionalSourceUrl && dimsumKeyword
                ? searchCorpusText(
                    additionalSourceUrl,
                    dimsumKeyword,
                    additionalSourceTableName,
                    5,
                  )
                    .then((items) =>
                      corpusItemsToWebSearchItems(
                        items,
                        additionalSourceUrl,
                        categoryNicknames,
                      ),
                    )
                    .catch((err) => {
                      // DO NOT REMOVE THIS CONSOLE.LOG
                      console.log("dimsum text_search error", err);
                      return [] as ZhihuSearchItem[];
                    })
                : Promise.resolve([] as ZhihuSearchItem[]),
            ]);
            zhihuItemsRef.current = [...zhihuItems, ...dimsumItems];
            // DO NOT REMOVE THIS CONSOLE.LOG
            console.log("web-search", { zhihuKeyword, dimsumKeyword }, zhihuItemsRef.current);
          }
        }

        if (zhihuItemsRef.current.length > 0) {
          questionForApi = `${questionForApi}\n\n--- 联网搜索参考 ---\n${formatWebSearchContext(zhihuItemsRef.current)}`;
        }

        const payload: Record<string, unknown> = {
          q: questionForApi,
          search_mode: searchMode,
          topk: 10,
          messages: priorMessages,
        };

        // system_prompt: first message only, or every request when systemPromptEachRequest
        if (
          prompt1 != null &&
          String(prompt1).trim() !== "" &&
          (priorMessages.length === 0 || systemPromptEachRequest)
        ) {
          const raw =
            typeof prompt1 === "number" ? String(prompt1) : String(prompt1).trim();
          payload.system_prompt = /^\d+$/.test(raw) ? parseInt(raw, 10) : raw;
        }

        // DO NOT REMOVE THIS CONSOLE.LOG
        console.log("payload", payload);

        if (searchMode === "tfidf" || (searchMode === "vector" && chatLib)) {
          payload.lib = chatLib;
        }

        details.body = payload as unknown as InterceptorDetails["body"];
        return details;
      };

      // Persist history; render answer + optional「联网搜索」, no citation UI
      el.responseInterceptor = (response: ResponseDetails) => {
        const answerText = response.text ?? "";
        const ragSources = response.sources ?? [];
        const aidimsumSources = corpusItemsToSources(
          aidimsumCorpusRef.current,
          ragSources.length + 1,
        );
        const allSources: Source[] = [...ragSources, ...aidimsumSources];
        const webSearchItems = zhihuItemsRef.current;

        // Save the exchange with citations (filtered when calling API)
        historyRef.current = [
          ...historyRef.current,
          { role: "user", content: lastQuestionRef.current },
          {
            role: "assistant",
            content: answerText,
            citations: allSources.length > 0 ? allSources : undefined,
            webSearchItems: webSearchItems.length > 0 ? webSearchItems : undefined,
          },
        ];
        saveHistory(historyStorageKey, historyRef.current);

        return {
          html: buildAnswerHtml(answerText, webSearchItems),
        };
      };
    },
    [
      chatApiUrl,
      chatLib,
      searchMode,
      prompt1,
      systemPromptEachRequest,
      historyStorageKey,
      additionalSourceUrl,
      additionalSourceTableName,
      zhihuSearchApiUrl,
    ],
  );

  const handleChatRender = useCallback(
    (el: HTMLElement) => {
      setupChatElement(el as DeepChatElement);
    },
    [setupChatElement],
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header homepageName={homepageName} />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{heading}</h1>
            <button
              onClick={clearChatHistory}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
            >
              🗑️ 清除记录
            </button>
          </div>
          {/* <p className="text-muted-foreground">{chatbotDescription}</p> */}
          <div className="rounded-xl border border-border bg-card p-3 shadow-sm [&>deep-chat]:!w-full [&>deep-chat]:!block">
            {uuidCorpus === "pending" ? (
              <div
                className="flex items-center justify-center text-sm text-muted-foreground"
                style={{ borderRadius: "12px", height: "550px" }}
              >
                加载语料…
              </div>
            ) : (
              <DeepChat
                style={{ borderRadius: "12px", height: "550px" }}
                introMessage={{ text: chatbotIntroMessage }}
                history={initialHistory}
                onComponentRender={handleChatRender}
              />
            )}
            {uuidCorpus && uuidCorpus !== "pending" && (
              <CitedCorpusBox item={uuidCorpus} categoryNicknames={categoryNicknames} />
            )}
            {zhihuSearchApiUrl && (
              <WebSearchToggle enabledRef={webSearchEnabledRef} />
            )}
            <br></br>
            {/* <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
              <p className="text-sm text-muted-foreground shrink-0">{MOOD_PROMPT}</p>
              <div className="flex flex-wrap gap-2">
                {MOOD_BUTTONS.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => sendMood(label)}
                    className="rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div> */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={sendRandomChat}
                disabled={randomQuestions.length === 0}
                className="rounded-lg border border-border bg-muted/50 px-8 py-2 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50 min-w-[12rem]"
              >
                👉&nbsp;&nbsp;随便聊聊&nbsp;&nbsp;👈
              </button>
              {ttsApiUrl && (
                <TtsSelectionButton
                  chatElRef={chatRef}
                  ttsApiUrl={ttsApiUrl}
                  ttsVoice={ttsVoice}
                />
              )}
            </div>
          </div>
        </div>
      </main>
      {(zhihuSearchApiUrl || additionalSourceUrl) && (
        <WebSearchItemModal categoryNicknamesRef={categoryNicknamesRef} />
      )}
    </div>
  );
}

/**
 * 「引用语料」box under DeepChat input.
 * Fixed fields (data / category / tags) use Chinese labels; note.context keys stay as-is.
 */
function CitedCorpusBox({
  item,
  categoryNicknames,
}: {
  item: CorpusItem;
  categoryNicknames: Map<string, string>;
}) {
  const data = item.data?.trim() || "—";
  const category = item.category?.trim()
    ? resolveCategoryNickname(item.category, categoryNicknames)
    : "—";
  const tags = item.tags?.filter((t) => t?.trim()) ?? [];
  const contextEntries = Object.entries(item.note?.context ?? {}).filter(
    ([, value]) => value != null && String(value).trim() !== "",
  );

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-2 text-sm font-semibold text-foreground">引用语料</div>
      <div className="max-h-64 overflow-auto space-y-2 rounded-md bg-background/80 p-3 text-sm leading-relaxed">
        <div>
          <span className="text-muted-foreground">摘要：</span>
          <span className="text-foreground">{data}</span>
        </div>
        <div>
          <span className="text-muted-foreground">分类：</span>
          <span className="text-foreground">{category}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground shrink-0">标签：</span>
          {tags.length ? (
            tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-foreground"
              >
                {tag}
              </span>
            ))
          ) : (
            <span className="text-foreground">—</span>
          )}
        </div>
        {contextEntries.map(([key, value]) => (
          <div key={key}>
            <span className="text-muted-foreground">{key}：</span>
            <span className="text-foreground whitespace-pre-wrap break-words">
              {String(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Modal for a Zhihu search title click. Isolated so opening it does not
 * re-render <DeepChat>. Uses composedPath() because titles live in the
 * Deep Chat shadow root.
 */
function WebSearchItemModal({
  categoryNicknamesRef,
}: {
  categoryNicknamesRef: MutableRefObject<Map<string, string>>;
}) {
  const [item, setItem] = useState<ZhihuSearchItem | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const path = event.composedPath();
      const trigger = path.find(
        (node): node is HTMLElement =>
          node instanceof HTMLElement && Boolean(node.dataset?.zhihuItem),
      );
      if (!trigger) return;
      event.preventDefault();
      event.stopPropagation();
      const decoded = decodeZhihuItem(trigger.dataset.zhihuItem);
      if (decoded) setItem(decoded);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!item) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setItem(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [item]);

  if (!item) return null;

  const url = item.url?.trim();
  const votes = Number(item.vote_up_count ?? 0) || 0;
  const comments = Number(item.comment_count ?? 0) || 0;
  const isDimsum = item.source === "dimsum";
  const categoryLabel = isDimsum
    ? resolveCategoryNickname(item.category, categoryNicknamesRef.current)
    : item.author_name?.trim() || "未知";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => setItem(null)}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex w-full max-w-lg max-h-[min(85vh,720px)] flex-col rounded-xl border border-border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-border px-5 pt-5 pb-3">
          <h2 className="text-lg font-semibold text-foreground leading-snug">
            {item.title || "(无标题)"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {isDimsum ? "分类" : "作者"}：{categoryLabel}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {item.summary?.trim() || "暂无摘要"}
          </p>
          {item.source !== "dimsum" && (
            <p className="mt-3 text-sm text-muted-foreground">
              👍 {votes}　💬 {comments}
            </p>
          )}
        </div>
        <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={() => setItem(null)}
            className="rounded-lg border border-border bg-muted/50 px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted"
          >
            关闭
          </button>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              打开原文
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 「联网搜索」toggle under DeepChat. Owns its own checked state so toggling
 * does not re-render <DeepChat> (which would reset the conversation).
 * Syncs into `enabledRef` for the request interceptor to read.
 */
function WebSearchToggle({
  enabledRef,
}: {
  enabledRef: MutableRefObject<boolean>;
}) {
  const [checked, setChecked] = useState(true);

  useEffect(() => {
    enabledRef.current = checked;
  }, [checked, enabledRef]);

  return (
    <label className="mt-2 flex cursor-pointer items-center gap-2 px-1 text-sm text-muted-foreground select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
        className="h-4 w-4 accent-primary"
      />
      <span>🌐 联网搜索</span>
      <span className="text-xs opacity-70">（勾选后用知乎搜索问题关键词，标题列在回答下方）</span>
    </label>
  );
}

/**
 * 「发音」button shown next to「随便聊聊」only when text is selected. Kept as a
 * separate component so selection-driven state updates re-render only this
 * button and NOT the parent (re-rendering the parent would pass new object
 * props to <DeepChat> and reset the conversation).
 */
function TtsSelectionButton({
  chatElRef,
  ttsApiUrl,
  ttsVoice,
}: {
  chatElRef: RefObject<DeepChatElement | null>;
  ttsApiUrl: string;
  ttsVoice?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const textRef = useRef<string>("");
  const [hasSelection, setHasSelection] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "playing">("idle");

  useEffect(() => {
    const updateFromSelection = () => {
      const info = getSelectionInfo(chatElRef.current);
      textRef.current = info?.text ?? "";
      setHasSelection(Boolean(info));
    };

    // Run after the selection has settled (mouseup fires before it updates)
    const handle = () => window.setTimeout(updateFromSelection, 0);
    document.addEventListener("mouseup", handle);
    document.addEventListener("touchend", handle);
    return () => {
      document.removeEventListener("mouseup", handle);
      document.removeEventListener("touchend", handle);
    };
  }, [chatElRef]);

  const playTts = useCallback(async () => {
    const text = textRef.current.trim();
    if (!text) return;

    setStatus("loading");
    try {
      const res = await fetch(ttsApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ttsVoice ? { text, voice: ttsVoice } : { text }),
      });
      if (!res.ok) throw new Error(`TTS ${res.status}`);
      const data = (await res.json()) as { audio_url?: string };
      if (!data.audio_url) throw new Error("no audio_url");

      if (!audioRef.current) audioRef.current = new Audio();
      const audio = audioRef.current;
      audio.src = data.audio_url;
      audio.onended = () => setStatus("idle");
      audio.onerror = () => setStatus("idle");
      setStatus("playing");
      await audio.play();
    } catch (err) {
      // DO NOT REMOVE THIS CONSOLE.LOG
      console.log("tts error", err);
      setStatus("idle");
    }
  }, [ttsApiUrl, ttsVoice]);

  if (!hasSelection) return null;

  return (
    <button
      type="button"
      // Keep the current selection when clicking (prevents mousedown from clearing it)
      onMouseDown={(e) => e.preventDefault()}
      onClick={playTts}
      disabled={status === "loading"}
      className="rounded-lg border border-border bg-muted/50 px-8 py-2 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50"
    >
      {status === "loading" ? "🔊 生成中…" : status === "playing" ? "🔊 播放中" : "🔊 发音"}
    </button>
  );
}
