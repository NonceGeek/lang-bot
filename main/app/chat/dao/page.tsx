import { getReadmeConfig } from "@/lib/readme-config";
import { ChatClient } from "@/app/chat/chat-client";

const DAO_HISTORY_KEY = "psy_chat_history_dao";
const DAO_TAG_CSV_URL = "/tag_content_dao.csv";
const DAO_INTRO =
  "你好！这里是道心雅谈，随缘开示，助您定心安神。有什么想聊的，尽管开口~";

export default function ChatDaoPage() {
  const config = getReadmeConfig();
  return (
    <ChatClient
      homepageName={config.homepageName}
      chatbotDescription={config.chatbotDescription}
      chatbotIntroMessage={DAO_INTRO}
      chatApiUrl={config.chatApiUrl}
      chatLib="dao"
      searchMode="vector"
      prompt1={1}
      systemPromptEachRequest
      historyStorageKey={DAO_HISTORY_KEY}
      tagCsvUrl={DAO_TAG_CSV_URL}
      tagFormat="dao"
      chatTitle={`${config.homepageName} 道聊`}
    />
  );
}
