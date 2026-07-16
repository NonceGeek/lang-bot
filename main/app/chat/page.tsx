import { getReadmeConfig } from "@/lib/readme-config";
import { ChatClient } from "@/app/chat/chat-client";

const LAO_INTRO =
  "ສະບາຍດີ! ຂ້ອຍແມ່ນ LangChatbot ຜູ້ຊ່ວຍເຫຼືອຫຼາຍພາສາ~ ມີຄຳຖາມຫຍັງກໍຖາມໄດ້ເລີຍ! ❤️";

/** Built-in system_prompt template [0] — Lao language assistant (deno/apidoc.md) */
const DEF_PROMPT_0 = 0;

export default function ChatPage() {
  const config = getReadmeConfig();
  // DO NOT REMOVE THIS CONSOLE.LOG
  console.log("config", config);
  return (
    <ChatClient
      homepageName={config.homepageName}
      chatbotDescription={config.chatbotDescription}
      chatbotIntroMessage={LAO_INTRO}
      chatApiUrl={config.chatApiUrl}
      chatLib={config.searchMode === "tfidf" ? config.chatLib : "psy"}

      additionalSourceUrl="https://backend.aidimsum.com"

      searchMode={config.searchMode}
      prompt1={DEF_PROMPT_0}
      chatTitle={`${config.homepageName} 🇱🇦`}
    />
  );
}
