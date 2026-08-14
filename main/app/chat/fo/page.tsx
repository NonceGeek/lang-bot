import { getReadmeConfig } from "@/lib/readme-config";
import { ChatClient } from "@/app/chat/chat-client";

const FO_HISTORY_KEY = "lang_chat_history_fo";
const FO_TAG_CSV_URL = "/tag_content_fo.csv";
const FO_INTRO =
  "你好！我係 LangChatbot，專門陪你傾偈佛山嘅事~ 有咩想问就开口啦！ヾ(◍°∇°◍)ﾉﾞ";

export default function ChatFoPage() {
  const config = getReadmeConfig();
  return (
    <ChatClient
      homepageName={config.homepageName}
      chatbotDescription={config.chatbotDescription}
      chatbotIntroMessage={FO_INTRO}
      chatApiUrl={config.chatApiUrl}
      chatLib="dao"
      searchMode="vector"
      prompt1={1}
      systemPromptEachRequest
      additionalSourceUrl="https://backend.aidimsum.com"
      historyStorageKey={FO_HISTORY_KEY}
      tagCsvUrl={FO_TAG_CSV_URL}
      ttsApiUrl={config.chatApiUrl.replace(/\/[^/]*$/, "/tts_cantonese")}
      zhihuSearchApiUrl={config.chatApiUrl.replace(/\/[^/]*$/, "/zhihu-search")}
      chatTitle={`${config.homepageName} about 佛山`}
    />
  );
}
