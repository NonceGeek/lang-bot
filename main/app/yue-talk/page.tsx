import { getReadmeConfig } from "@/lib/readme-config";
import { YueTalkClient } from "@/app/yue-talk/yue-talk-client";

export default function YueTalkPage() {
  const config = getReadmeConfig();
  return (
    <YueTalkClient
      homepageName={config.homepageName}
      chatApiUrl={config.chatApiUrl}
      ttsApiUrl={config.chatApiUrl.replace(/\/[^/]*$/, "/tts_cantonese")}
    />
  );
}
