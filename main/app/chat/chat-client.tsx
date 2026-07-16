"use client";

import { useEffect, useRef, useState, useCallback, type RefObject } from "react";
import { marked } from "marked";
import { DeepChat } from "deep-chat-react";
import { Header } from "@/components/header";
import {
  corpusItemsToSources,
  fetchAdditionalCorpus,
  fetchCorpusItem,
  formatCorpusContext,
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

type HistoryMessage = {
  role: string;
  content: string;
  citations?: Source[];
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

function buildCitationHtml(content: string, sources: Source[]): string {
  const citationItems = sources
    .map((s) => {
      const resName = s.resource_name ?? s.source;
      const text = s.chunk
        ? `<strong>[${s.rank}] 《${s.chunk.book_title}》${s.chunk.chapter_title}</strong><br/>${s.chunk.text}`
        : `<strong>[${s.rank}]</strong><br/>${s.text ?? ""} —— ${resName ? `${resName}` : ""}`;

      return `<div style="margin-bottom:8px;padding:6px 8px;background:rgba(0,0,0,0.03);border-radius:6px;font-size:0.85em;line-height:1.5">${text}</div>`;
    })
    .join("");
  return (
    `<div class="markdown-body">${markdownToHtml(content)}</div>` +
    `<details style="margin-top:12px;cursor:pointer">` +
    `<summary style="font-size:0.9em;color:#666;user-select:none">📚 引用来源（${sources.length} 条）</summary>` +
    `<div style="margin-top:8px">${citationItems}</div>` +
    `</details>`
  );
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

/** pending = fetching corpus; string = prefill text; null = no uuid prefill */
type UuidInputPrefill = "pending" | string | null;

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
}: ChatClientProps) {
  const chatRef = useRef<DeepChatElement | null>(null);
  const historyRef = useRef<HistoryMessage[]>([]);
  const lastQuestionRef = useRef<string>("");
  const aidimsumCorpusRef = useRef<CorpusItem[]>([]);
  const [uuidInputPrefill, setUuidInputPrefill] = useState<UuidInputPrefill>(() =>
    getUrlUuid() ? "pending" : null,
  );
  const [initialHistory, setInitialHistory] = useState<
    Array<{ role: string; text?: string; html?: string }>
  >([]);
  const [randomQuestions, setRandomQuestions] = useState<string[]>([]);
  const heading = chatTitle ?? `${homepageName} Chat`;

  // ?uuid=… → fetch /v2/corpus_item, then mount DeepChat with defaultInput
  useEffect(() => {
    if (uuidInputPrefill !== "pending") return;

    const uuid = getUrlUuid();
    if (!uuid || !additionalSourceUrl) {
      setUuidInputPrefill(null);
      return;
    }

    let cancelled = false;
    fetchCorpusItem(additionalSourceUrl, { unique_id: uuid })
      .then((item) => {
        if (cancelled) return;
        setUuidInputPrefill(item ? JSON.stringify(item, null, 2) : null);
      })
      .catch(() => {
        if (!cancelled) setUuidInputPrefill(null);
      });

    return () => {
      cancelled = true;
    };
  }, [uuidInputPrefill, additionalSourceUrl]);

  // Load chat history from localStorage on mount, including citations for assistant messages
  useEffect(() => {
    const saved = loadHistory(historyStorageKey);
    historyRef.current = saved;
    setInitialHistory(
      saved.map((m) => {
        const role = m.role === "assistant" ? "ai" : m.role;
        if (m.role === "assistant") {
          if (m.citations?.length) {
            return { role, html: buildCitationHtml(m.content, m.citations) };
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

        const priorMessages: Array<{ role: string; content: string }> =
          historyRef.current.map((m) => ({ role: m.role, content: m.content }));

        let questionForApi = currentQuestion;

        if (additionalSourceUrl && currentQuestion.trim()) {
          const corpusItems = await fetchAdditionalCorpus(
            additionalSourceUrl,
            currentQuestion,
            additionalSourceTableName,
          );
          aidimsumCorpusRef.current = corpusItems;
          if (corpusItems.length > 0) {
            questionForApi = `${currentQuestion}\n\n--- AI Dimsum 语料参考 ---\n${formatCorpusContext(corpusItems)}`;
          }
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

      // Append source citations as collapsible <details>, persist history with citations
      el.responseInterceptor = (response: ResponseDetails) => {
        const answerText = response.text ?? "";
        const ragSources = response.sources ?? [];
        const aidimsumSources = corpusItemsToSources(
          aidimsumCorpusRef.current,
          ragSources.length + 1,
        );
        const allSources: Source[] = [...ragSources, ...aidimsumSources];

        // Save the exchange with citations (filtered when calling API)
        historyRef.current = [
          ...historyRef.current,
          { role: "user", content: lastQuestionRef.current },
          {
            role: "assistant",
            content: answerText,
            citations: allSources.length > 0 ? allSources : undefined,
          },
        ];
        saveHistory(historyStorageKey, historyRef.current);

        if (!allSources.length) {
          return { html: `<div class="markdown-body">${markdownToHtml(answerText)}</div>` };
        }
        return { html: buildCitationHtml(answerText, allSources) };
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
            {uuidInputPrefill === "pending" ? (
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
                defaultInput={
                  typeof uuidInputPrefill === "string"
                    ? { text: uuidInputPrefill }
                    : undefined
                }
                onComponentRender={handleChatRender}
              />
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
    </div>
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
