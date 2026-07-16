import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Keys are prompt names (e.g. prompt1, prompt2, prompt3); values are blockquote body text from README */
export type PromptsConfig = Record<string, string>;

export type AppConfig = {
  homepageName: string;
  fullName: string;
  twitterUrl: string;
  twitterNicename: string;
  descriptionMarkdown: string;
  freeTierDescription: string;
  freeTierLink: string;
  agentTags: string[];
  premiumTierDescription: string;
  chatbotDescription: string;
  chatbotIntroMessage: string;
  chatApiUrl: string;
  chatLib: string;
  searchMode: string;
  /** Parsed from * **Prompts** / * **prompt1:** (prompt2, prompt3, ...) blockquotes in README; optional */
  prompts?: PromptsConfig;
};

const REQUIRED_KEYS: Array<keyof AppConfig> = [
  "homepageName",
  "fullName",
  "twitterUrl",
  "twitterNicename",
  "descriptionMarkdown",
  "freeTierDescription",
  "freeTierLink",
  "agentTags",
  "premiumTierDescription",
  "chatbotDescription",
  "chatbotIntroMessage",
  "chatApiUrl",
  "chatLib",
  "searchMode",
];

function parseValue(rawValue: string): unknown {
  const trimmed = rawValue.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

// Match blockquote line: optional leading spaces, ">", optional space, rest of line
const BLOCKQUOTE_LINE = /^\s*> ?(.*)$/;

function parseConfigFromReadme(readme: string): Partial<AppConfig> {
  const parsed: Partial<AppConfig> = {};
  const lines = readme.split("\n");
  let currentKey: string | null = null;
  let inPromptsSection = false;
  let collectingPrompt: string | null = null;
  const promptBuffer: string[] = [];

  function flushPrompt() {
    if (collectingPrompt && (parsed.prompts ?? (parsed.prompts = {}))) {
      parsed.prompts[collectingPrompt] = promptBuffer.join("\n").trim();
    }
    collectingPrompt = null;
    promptBuffer.length = 0;
  }

  for (const line of lines) {
    // If we're collecting a prompt value (blockquote body), consume blockquote lines or flush on next key
    if (collectingPrompt) {
      const blockMatch = line.match(BLOCKQUOTE_LINE);
      if (blockMatch) {
        promptBuffer.push(blockMatch[1]);
        continue;
      }
      // Flush only when we hit a new key line; skip blank/other lines so blockquote can start later
      const keyMatchWhileCollecting = line.match(/^\s*\* \*\*([A-Za-z0-9_]+):?\*\*:?\s*$/);
      if (keyMatchWhileCollecting) {
        flushPrompt();
        const key = keyMatchWhileCollecting[1];
        if (key === "Prompts") {
          inPromptsSection = true;
          currentKey = null;
          continue;
        }
        if (inPromptsSection && /^prompt\d+$/.test(key)) {
          collectingPrompt = key;
          continue;
        }
        currentKey = key;
        continue;
      }
      continue;
    }

    const keyMatch = line.match(/^\s*\* \*\*([A-Za-z0-9_]+):?\*\*:?\s*$/);
    if (keyMatch) {
      const key = keyMatch[1];
      if (key === "Prompts") {
        inPromptsSection = true;
        currentKey = null;
        continue;
      }
      if (inPromptsSection && /^prompt\d+$/.test(key)) {
        collectingPrompt = key;
        continue;
      }
      currentKey = key;
      continue;
    }

    const valueMatch = line.match(/^\s*\* \*\*value:\*\* `(.*)`\s*$/);
    if (valueMatch && currentKey) {
      const key = currentKey as keyof AppConfig;
      if (REQUIRED_KEYS.includes(key)) {
        parsed[key] = parseValue(valueMatch[1]) as never;
      }
      continue;
    }
  }

  flushPrompt();
  return parsed;
}

export function getReadmeConfig(): AppConfig {
  const readmePath = join(process.cwd(), "README.md");
  const readme = readFileSync(readmePath, "utf-8");
  const parsed = parseConfigFromReadme(readme);

  for (const key of REQUIRED_KEYS) {
    if (!(key in parsed)) {
      throw new Error(`Missing config key "${key}" in README.md configuration section`);
    }
  }

  return parsed as AppConfig;
}
