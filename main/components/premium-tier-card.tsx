"use client";

import { Ticket } from "lucide-react";

type PremiumTierCardProps = {
  description: string;
};

const markdownToHtml = (markdown: string) => {
  const escaped = markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const withImages = escaped.replace(
    /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g,
    '<img src="$2" alt="$1" class="mt-3 max-w-full rounded-lg border border-border" />',
  );
  const withLinks = withImages.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline hover:text-foreground transition-colors">$1</a>',
  );
  const withBold = withLinks.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  return withBold.replace(/\n/g, "<br />");
};

export function PremiumTierCard({ description }: PremiumTierCardProps) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
            💰 Premium Tier
          </span>
          <span className="text-sm text-muted-foreground">付费服务</span>
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2 flex items-center gap-2">
          <Ticket className="h-5 w-5" />
          Pay for the challenging tasks! 付费解决难度更高的任务！
        </h3>
        <div
          className="text-muted-foreground mb-4"
          dangerouslySetInnerHTML={{ __html: markdownToHtml(description) }}
        />
      </div>
    </div>
  );
}
