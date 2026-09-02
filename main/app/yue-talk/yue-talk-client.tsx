"use client";

import { useCallback, useRef, useState } from "react";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";

type YueTalkClientProps = {
  homepageName: string;
  chatApiUrl: string;
  ttsApiUrl: string;
};

export function YueTalkClient({
  homepageName,
  chatApiUrl,
  ttsApiUrl,
}: YueTalkClientProps) {
  const [text, setText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [translateStatus, setTranslateStatus] = useState<"idle" | "loading">("idle");
  const [speakStatus, setSpeakStatus] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const translate = useCallback(async () => {
    const input = text.trim();
    if (!input) return;

    setTranslateStatus("loading");
    try {
      const res = await fetch(chatApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: `请将以下文字翻译成地道粤语，只输出翻译结果，不要解释：\n\n${input}`,
          system_prompt: 1,
        }),
      });
      if (!res.ok) throw new Error(`translate ${res.status}`);
      const data = (await res.json()) as { text?: string };
      const translated = data.text?.trim();
      if (!translated) throw new Error("empty translation");
      setTranslatedText(translated);
    } catch (err) {
      // DO NOT REMOVE THIS CONSOLE.LOG
      console.log("translate error", err);
    } finally {
      setTranslateStatus("idle");
    }
  }, [chatApiUrl, text]);

  const speak = useCallback(async () => {
    const input = translatedText.trim();
    if (!input) return;

    setSpeakStatus("loading");
    try {
      const res = await fetch(ttsApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input }),
      });
      if (!res.ok) throw new Error(`tts ${res.status}`);
      const data = (await res.json()) as { audio_url?: string };
      if (!data.audio_url) throw new Error("no audio_url");

      if (!audioRef.current) audioRef.current = new Audio();
      const audio = audioRef.current;
      audio.src = data.audio_url;
      audio.onended = () => setSpeakStatus("idle");
      audio.onerror = () => setSpeakStatus("idle");
      setSpeakStatus("playing");
      await audio.play();
    } catch (err) {
      // DO NOT REMOVE THIS CONSOLE.LOG
      console.log("tts error", err);
      setSpeakStatus("idle");
    }
  }, [ttsApiUrl, translatedText]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header homepageName={homepageName} />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <h1 className="text-3xl font-bold tracking-tight text-foreground"><center>粤 Talk</center></h1>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setTranslatedText("");
            }}
            placeholder="输入文字…"
            rows={6}
            className="w-full resize-y rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
          {translatedText ? (
            <p className="text-lg leading-relaxed text-foreground whitespace-pre-wrap">
              {translatedText}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={translate}
              disabled={!text.trim() || translateStatus === "loading"}
            >
              {translateStatus === "loading" ? "翻译中…" : "翻译成粤语"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={speak}
              disabled={!translatedText.trim() || speakStatus === "loading"}
            >
              {speakStatus === "loading"
                ? "生成中…"
                : speakStatus === "playing"
                  ? "播放中"
                  : "发音"}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
