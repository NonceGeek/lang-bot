"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DoughAvatar,
  EMOTIONS,
  MOCHI,
  mochiIn,
  type ColourwayName,
  type Emotion,
} from "mochi-avatar";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";

type MochiClientProps = {
  homepageName: string;
};

type Lang = "zh" | "en" | "yue";

const COLOURWAYS: ColourwayName[] = [
  "matcha",
  "sakura",
  "kinako",
  "yuzu",
  "ramune",
  "budo",
];

const MOTIONS = ["nod", "sway", "hop", "swing", "turn", "wander"] as const;

type MotionName = (typeof MOTIONS)[number];

const LANG_OPTIONS: { id: Lang; label: string }[] = [
  { id: "zh", label: "中文" },
  { id: "en", label: "English" },
  { id: "yue", label: "粵語" },
];

const COPY: Record<
  Lang,
  {
    hint: string;
    loading: string;
    emotion: string;
    motion: string;
    colourway: string;
    stop: string;
    poke: string;
    poweredBy: string;
    ariaAvatar: string;
    emotions: Record<Emotion, string>;
    motions: Record<MotionName, string>;
    colourways: Record<ColourwayName, string>;
  }
> = {
  zh: {
    hint: "移动鼠标让她看你 · 点击戳她 · 用下方控件互动",
    loading: "加载中…",
    emotion: "表情",
    motion: "动作",
    colourway: "配色",
    stop: "停止",
    poke: "戳一下",
    poweredBy: "技术支持",
    ariaAvatar: "可互动的 Mochi 形象",
    emotions: {
      neutral: "平静",
      happy: "开心",
      shy: "害羞",
      sad: "难过",
      angry: "生气",
      surprised: "惊讶",
      thinking: "思考",
      sleepy: "困倦",
    },
    motions: {
      nod: "点头",
      sway: "摇摆",
      hop: "跳跃",
      swing: "晃动",
      turn: "转身",
      wander: "徘徊",
    },
    colourways: {
      matcha: "抹茶",
      sakura: "樱花",
      kinako: "黄豆粉",
      yuzu: "柚子",
      ramune: "波子汽水",
      budo: "葡萄",
    },
  },
  en: {
    hint: "Move your pointer to look · click to poke · use the controls below",
    loading: "Loading…",
    emotion: "Emotion",
    motion: "Motion",
    colourway: "Colourway",
    stop: "stop",
    poke: "poke",
    poweredBy: "Powered by",
    ariaAvatar: "Interactive Mochi avatar",
    emotions: {
      neutral: "neutral",
      happy: "happy",
      shy: "shy",
      sad: "sad",
      angry: "angry",
      surprised: "surprised",
      thinking: "thinking",
      sleepy: "sleepy",
    },
    motions: {
      nod: "nod",
      sway: "sway",
      hop: "hop",
      swing: "swing",
      turn: "turn",
      wander: "wander",
    },
    colourways: {
      matcha: "matcha",
      sakura: "sakura",
      kinako: "kinako",
      yuzu: "yuzu",
      ramune: "ramune",
      budo: "budo",
    },
  },
  yue: {
    hint: "郁吓滑鼠等佢望你 · 撳一下戳佢 · 用下面按钮同佢玩",
    loading: "載入緊…",
    emotion: "表情",
    motion: "動作",
    colourway: "配色",
    stop: "停低",
    poke: "戳一下",
    poweredBy: "技術支援",
    ariaAvatar: "可以互動嘅 Mochi 形象",
    emotions: {
      neutral: "平靜",
      happy: "開心",
      shy: "害羞",
      sad: "唔開心",
      angry: "嬲",
      surprised: "驚訝",
      thinking: "諗嘢",
      sleepy: "眼瞓",
    },
    motions: {
      nod: "點頭",
      sway: "擺動",
      hop: "跳吓",
      swing: "搖晃",
      turn: "轉身",
      wander: "行來行去",
    },
    colourways: {
      matcha: "抹茶",
      sakura: "櫻花",
      kinako: "黃豆粉",
      yuzu: "柚子",
      ramune: "波子汽水",
      budo: "提子",
    },
  },
};

export function MochiClient({ homepageName }: MochiClientProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const avatarRef = useRef<DoughAvatar | null>(null);
  const rafRef = useRef<number>(0);

  const [lang, setLang] = useState<Lang>("zh");
  const [emotion, setEmotion] = useState<Emotion>("happy");
  const [colourway, setColourway] = useState<ColourwayName>("matcha");
  const [ready, setReady] = useState(false);

  const t = COPY[lang];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const avatar = new DoughAvatar(ctx, {
      face: mochiIn(colourway, MOCHI),
      size: "fit-canvas",
    });
    avatarRef.current = avatar;
    avatar.setEmotion({ emotion, intensity: 1 });

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      avatar.resize(rect.width, rect.height, dpr);
    };

    resize();
    setReady(true);

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    const tick = (now: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      avatar.render(now);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      avatar.dispose();
      avatarRef.current = null;
      setReady(false);
    };
    // Intentionally mount once; emotion/colourway updates go through setters below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    avatarRef.current?.setEmotion({ emotion, intensity: 1 });
  }, [emotion]);

  useEffect(() => {
    avatarRef.current?.setFace(mochiIn(colourway, MOCHI));
  }, [colourway]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const avatar = avatarRef.current;
    const canvas = canvasRef.current;
    if (!avatar || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    avatar.lookAt(nx, ny);
  }, []);

  const onPointerLeave = useCallback(() => {
    avatarRef.current?.lookAt(0, 0);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const avatar = avatarRef.current;
    const canvas = canvasRef.current;
    if (!avatar || !canvas) return;
    // hitTest expects CSS pixels relative to the canvas, matching the silhouette.
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (avatar.hitTest(x, y)) {
      // Default impulse is negative (squash). Positive values expand instead.
      avatar.poke(-0.55);
    }
  }, []);

  const playMotion = useCallback((name: MotionName) => {
    const avatar = avatarRef.current;
    if (!avatar) return;
    if (name === "sway") {
      avatar.stopMotion();
    }
    avatar.playMotion(name);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header homepageName={homepageName} />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="flex justify-end">
            <div className="inline-flex flex-wrap gap-1 rounded-lg border border-border p-1 bg-card">
              {LANG_OPTIONS.map((opt) => (
                <Button
                  key={opt.id}
                  type="button"
                  size="sm"
                  variant={lang === opt.id ? "default" : "ghost"}
                  onClick={() => setLang(opt.id)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Mochi</h1>
            <p className="text-muted-foreground">{t.hint}</p>
          </div>

          <div className="rounded-2xl border border-border bg-gradient-to-b from-emerald-50/80 to-background dark:from-emerald-950/30 dark:to-background p-4 sm:p-6">
            <canvas
              ref={canvasRef}
              className="mx-auto block w-full max-w-md aspect-square touch-none cursor-pointer"
              onPointerMove={onPointerMove}
              onPointerLeave={onPointerLeave}
              onPointerDown={onPointerDown}
              aria-label={t.ariaAvatar}
            />
            {!ready ? (
              <p className="text-center text-sm text-muted-foreground mt-2">{t.loading}</p>
            ) : null}
          </div>

          <div className="space-y-4">
            <section className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">{t.emotion}</h2>
              <div className="flex flex-wrap gap-2">
                {EMOTIONS.map((name) => (
                  <Button
                    key={name}
                    type="button"
                    size="sm"
                    variant={emotion === name ? "default" : "outline"}
                    onClick={() => setEmotion(name)}
                  >
                    {t.emotions[name]}
                  </Button>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">{t.motion}</h2>
              <div className="flex flex-wrap gap-2">
                {MOTIONS.map((name) => (
                  <Button
                    key={name}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => playMotion(name)}
                  >
                    {t.motions[name]}
                  </Button>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => avatarRef.current?.stopMotion()}
                >
                  {t.stop}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => avatarRef.current?.poke(-0.7)}
                >
                  {t.poke}
                </Button>
              </div>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">{t.colourway}</h2>
              <div className="flex flex-wrap gap-2">
                {COLOURWAYS.map((name) => (
                  <Button
                    key={name}
                    type="button"
                    size="sm"
                    variant={colourway === name ? "default" : "outline"}
                    onClick={() => setColourway(name)}
                  >
                    {t.colourways[name]}
                  </Button>
                ))}
              </div>
            </section>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            {t.poweredBy}{" "}
            <a
              href="https://github.com/NonceGeek/mochi"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              mochi-avatar
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
