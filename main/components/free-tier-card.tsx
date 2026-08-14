"use client";

import { MessageCircle, ExternalLink } from "lucide-react";

type FreeTierCardProps = {
  description: string;
  link: string;
  chatbotName: string;
};

export function FreeTierCard({ description, link, chatbotName }: FreeTierCardProps) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400">
            🆓 Free Tier 免费！
          </span>
          <span className="text-sm text-muted-foreground">Anyone can access 任何人都可以访问 👀 </span>
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2 flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          AI ChatBot 人工智能聊天机器人
        </h3>
        <p className="text-muted-foreground mb-4 whitespace-pre-line">{description}</p>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
        >
          {chatbotName} based on Laos（老挝语）
          <ExternalLink className="h-4 w-4" />
        </a>
        <br></br>
        <br></br>
        <a
          href="/chat/cant"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
        >
          {chatbotName} based on Cantonese（粤语）
          <ExternalLink className="h-4 w-4" />
        </a>
        <br></br>
        <br></br>
        <a
          href="/chat/fo"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
        >
          {chatbotName} based on DimSum 佛山语料（粤语）
          <ExternalLink className="h-4 w-4" />
        </a>

      </div>
    </div>
  );
}
