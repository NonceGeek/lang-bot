"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { marked } from "marked";
import { DeepChat } from "deep-chat-react";
import { Header } from "@/components/header";

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

type TagFormat = "single" | "dao";

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
  /** Public CSV path for「随便聊聊」 */
  tagCsvUrl?: string;
  /** `single`: tag,content — `dao`: tag,tag_1,content */
  tagFormat?: TagFormat;
  /** Page heading; defaults to `${homepageName} Chat` */
  chatTitle?: string;
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
  requestInterceptor?: (details: InterceptorDetails) => InterceptorDetails;
  responseInterceptor?: (response: ResponseDetails) => ResponseDetails;
  submitUserMessage?: (text: string) => void;
  addMessage?: (message: { role?: string; text?: string; html?: string }, isUpdate?: boolean) => void;
};

const MOOD_PROMPT = "今天心情怎么样？";
const MOOD_BUTTONS = ["非常高兴", "开心", "平淡", "难过", "崩溃"];

const RANDOM_CHAT_SUFFIX = "\n\n 要进一步解析一下吗？";

type TagRow = { tag: string; tag_1?: string; content: string };

function formatTagLabel(row: TagRow): string {
  return row.tag_1 ? `${row.tag}·${row.tag_1}` : row.tag;
}

/** Dao CSV: random tag or tag_1, then a random content line that matches that word */
function pickDaoRandomChat(tagRows: TagRow[]): { userWord: string; content: string } | null {
  if (tagRows.length === 0) return null;
  const words: string[] = [];
  for (const row of tagRows) {
    if (row.tag) words.push(row.tag);
    if (row.tag_1) words.push(row.tag_1);
  }
  if (words.length === 0) return null;
  const userWord = words[Math.floor(Math.random() * words.length)];
  const matching = tagRows.filter((r) => r.tag === userWord || r.tag_1 === userWord);
  const pool = matching.length > 0 ? matching : tagRows;
  const row = pool[Math.floor(Math.random() * pool.length)];
  return { userWord, content: row.content };
}

function parseTagCsv(csvText: string, format: TagFormat = "single"): TagRow[] {
  const lines = csvText.trim().split(/\r?\n/);
  const rows: TagRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (format === "dao") {
      const parts = line.split(",");
      if (parts.length >= 3) {
        rows.push({
          tag: parts[0].trim(),
          tag_1: parts[1].trim(),
          content: parts.slice(2).join(",").trim(),
        });
      }
    } else {
      const commaIdx = line.indexOf(",");
      if (commaIdx >= 0) {
        rows.push({
          tag: line.slice(0, commaIdx).trim(),
          content: line.slice(commaIdx + 1).trim(),
        });
      }
    }
  }
  return rows;
}

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
  tagFormat = "single",
  chatTitle,
}: ChatClientProps) {
  const chatRef = useRef<DeepChatElement | null>(null);
  const historyRef = useRef<HistoryMessage[]>([]);
  const lastQuestionRef = useRef<string>("");
  const [initialHistory, setInitialHistory] = useState<
    Array<{ role: string; text?: string; html?: string }>
  >([]);
  const [tagRows, setTagRows] = useState<TagRow[]>([]);
  const heading = chatTitle ?? `${homepageName} Chat`;

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

  // Load tag CSV from public for "随便聊聊" button
  useEffect(() => {
    fetch(tagCsvUrl)
      .then((r) => r.text())
      .then((text) => setTagRows(parseTagCsv(text, tagFormat)))
      .catch(() => setTagRows([]));
  }, [tagCsvUrl, tagFormat]);

  const clearChatHistory = useCallback(() => {
    localStorage.removeItem(historyStorageKey);
    window.location.reload();
  }, [historyStorageKey]);

  const sendMood = useCallback((text: string) => {
    const el = chatRef.current;
    if (el?.submitUserMessage) el.submitUserMessage("我今天感到" + text);
  }, []);

  const sendRandomChat = useCallback(() => {
    if (tagRows.length === 0) return;
    const el = chatRef.current;
    if (!el?.addMessage) return;

    let userText: string;
    let displayText: string;

    if (tagFormat === "dao") {
      const picked = pickDaoRandomChat(tagRows);
      if (!picked) return;
      userText = picked.userWord;
      displayText = "【" + picked.userWord + "】" + picked.content + RANDOM_CHAT_SUFFIX;
    } else {
      const row = tagRows[Math.floor(Math.random() * tagRows.length)];
      const tagLabel = formatTagLabel(row);
      userText = tagLabel;
      displayText = "【" + tagLabel + "】" + row.content + RANDOM_CHAT_SUFFIX;
    }

    // Add user message and assistant message directly — no API call
    el.addMessage({ role: "user", text: userText }, false);
    el.addMessage({ role: "ai", html: `<div class="markdown-body">${markdownToHtml(displayText)}</div>` }, false);
    historyRef.current = [
      ...historyRef.current,
      { role: "user", content: userText },
      { role: "assistant", content: displayText },
    ];
    saveHistory(historyStorageKey, historyRef.current);
  }, [tagRows, tagFormat, historyStorageKey]);

  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;

    el.request = {
      url: chatApiUrl,
      method: "POST",
      headers: { "Content-Type": "application/json" },
    };

    // Transform Deep Chat messages into the search_and_chat RAG request format:
    // { q, search_mode, lib?, topk, messages }
    // Use historyRef (loaded from localStorage) as prior context for the API
    el.requestInterceptor = (details: InterceptorDetails) => {
      const allMessages = (details.body.messages || []).map((msg) => ({
        role: msg.role,
        content: msg.text ?? msg.content ?? "",
      }));

      const lastMessage = allMessages[allMessages.length - 1];
      const currentQuestion = lastMessage?.content ?? "";
      lastQuestionRef.current = currentQuestion;

      const priorMessages: Array<{ role: string; content: string }> =
        historyRef.current.map((m) => ({ role: m.role, content: m.content }));

      const payload: Record<string, unknown> = {
        q: currentQuestion,
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

      // Save the exchange with citations (filtered when calling API)
      historyRef.current = [
        ...historyRef.current,
        { role: "user", content: lastQuestionRef.current },
        {
          role: "assistant",
          content: answerText,
          citations: response.sources,
        },
      ];
      saveHistory(historyStorageKey, historyRef.current);

      if (!response.sources?.length) {
        return { html: `<div class="markdown-body">${markdownToHtml(answerText)}</div>` };
      }
      return { html: buildCitationHtml(answerText, response.sources) };
    };
  }, [chatApiUrl, chatLib, searchMode, prompt1, systemPromptEachRequest, historyStorageKey]);

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
            <DeepChat
              ref={chatRef}
              style={{ borderRadius: "12px", height: "550px" }}
              introMessage={{ text: chatbotIntroMessage }}
              history={initialHistory}
            />
            <br></br>
            <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
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
            </div>
            <div className="flex justify-center">
              <button
                type="button"
                onClick={sendRandomChat}
                disabled={tagRows.length === 0}
                className="rounded-lg border border-border bg-muted/50 px-8 py-2 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50 min-w-[12rem]"
              >
                👉&nbsp;&nbsp;随便聊聊&nbsp;&nbsp;👈
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
