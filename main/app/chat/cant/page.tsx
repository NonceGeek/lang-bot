import { getReadmeConfig } from "@/lib/readme-config";
import { ChatClient } from "@/app/chat/chat-client";

const CANT_HISTORY_KEY = "lang_chat_history_cant";
const CANT_TAG_CSV_URL = "/tag_content_cant.csv";
const CANT_INTRO =
  "你好！我係多語種智能助理 LangChatbot~ 歡迎用粤语同我傾偈，有咩想讲就开口啦！ヾ(◍°∇°◍)ﾉﾞ";

export default function ChatCantPage() {
  const config = getReadmeConfig();
  return (
    <ChatClient
      homepageName={config.homepageName}
      chatbotDescription={config.chatbotDescription}
      chatbotIntroMessage={CANT_INTRO}
      chatApiUrl={config.chatApiUrl}
      chatLib="dao"
      searchMode="vector"
      prompt1={1}
      systemPromptEachRequest
      additionalSourceUrl="https://backend.aidimsum.com"
      historyStorageKey={CANT_HISTORY_KEY}
      tagCsvUrl={CANT_TAG_CSV_URL}
      ttsApiUrl={config.chatApiUrl.replace(/\/[^/]*$/, "/tts_cantonese")}
      chatTitle={`${config.homepageName} 随便倾偈`}
    />
  );
}
