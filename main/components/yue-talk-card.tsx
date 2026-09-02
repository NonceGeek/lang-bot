"use client";

import { Volume2 } from "lucide-react";
import Link from "next/link";

export function YueTalkCard() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <h3 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
          <Volume2 className="h-5 w-5" />
          粤 Talk：多语种智能翻译粤语与粤语发音
        </h3>
        <Link
          href="/yue-talk"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
        >
          粤 Talk
        </Link>
      </div>
    </div>
  );
}
