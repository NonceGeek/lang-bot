"use client";

import { useState } from "react";
import Image from "next/image";
import { Copy, Check } from "lucide-react";

type AgentProfileCardProps = {
  name: string;
  description: string;
  address: string;
  tags: string[];
};

const markdownToHtml = (markdown: string) => {
  const escaped = markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const withLinks = escaped.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline hover:text-foreground transition-colors">$1</a>',
  );
  const withBold = withLinks.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  return withBold.replace(/\n/g, "<br />");
};

const formatAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

export function AgentProfileCard({ name, description, address, tags }: AgentProfileCardProps) {
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <Image
              src="/avatar.png"
              alt={name}
              width={96}
              height={96}
              className="rounded-full border-2 border-primary/20 shadow-md object-cover"
            />
          </div>
          {/* Info */}
          <div className="flex-1 text-center sm:text-left space-y-2">
            <h2 className="text-2xl font-bold text-foreground">{name}</h2>
            <div className="flex items-center justify-center sm:justify-start gap-2 text-sm text-muted-foreground">
              <span>Address:</span>
              <button
                onClick={copyAddress}
                className="inline-flex items-center gap-1.5 font-mono bg-muted px-2 py-1 rounded hover:bg-muted/80 transition-colors cursor-pointer"
                title={address}
              >
                {formatAddress(address)}
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <p
              className="text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(description) }}
            />
            <div className="flex flex-wrap justify-center sm:justify-start gap-2 pt-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
