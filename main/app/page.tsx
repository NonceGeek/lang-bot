import { Header } from "@/components/header";
import { AgentProfileCard } from "@/components/agent-profile-card";
import { FreeTierCard } from "@/components/free-tier-card";
import { PremiumTierCard } from "@/components/premium-tier-card";
import { getReadmeConfig } from "@/lib/readme-config";

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

export default function Home() {
  const config = getReadmeConfig();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header homepageName={config.homepageName} />

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              {config.homepageName}
            </h1>
            <p
              className="text-xl text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(config.descriptionMarkdown) }}
            />
            <p
              className="text-xl text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: markdownToHtml("-- Open the [👉 AI Agent Market 👈](https://agent-market.leeduckgo.com/agents) to see other AGENTS 🤖.") }}
            />
          </div>
        </div>
        <br></br>
        <hr></hr>
        <br></br>
        {/* Agent Profile Card */}
        <AgentProfileCard
          name={config.fullName}
          description={config.descriptionMarkdown}
          address={config.agentAddress}
          tags={config.agentTags}
        />
        <br></br>
        {/* Free Tier: ChatBot Access */}
        <FreeTierCard
          description={config.freeTierDescription}
          link={config.freeTierLink}
          chatbotName={config.homepageName}
        />
        <br></br>
        {/* Premium Tier */}
        <PremiumTierCard description={config.premiumTierDescription} />
      </main>

      <footer className="border-t border-border mt-auto">
        <div className="container mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
          <p>
            {config.homepageName} by{" "}
            <a
              href={config.twitterUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground transition-colors"
            >
              {config.twitterNicename}
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
