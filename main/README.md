# Psy Assistant Agent

A configurable Next.js scaffold for building AI Agent homepages with a built-in chat interface powered by [Deep Chat](https://github.com/OvidijusParsiunas/deep-chat).

## Configuration

> Update the value in thie part will change the value on the app automatically😎.
> 
> 修改此处的 Value，程序中对应的值会自动更新。

* **homepageName**
  * **description:** Display name shown in the header, footer, and page title
  * **value:** `"PsyAssistant"`

* **fullName**
  * **description:** Full agent name shown on the profile card
  * **value:** `"心理学助手 PsyAssistant"`

* **twitterUrl**
  * **description:** Twitter/X profile URL shown in the footer
  * **value:** `"https://x.com/0xleeduckgo"`

* **twitterNicename**
  * **description:** Display name for the Twitter link in the footer
  * **value:** `"leeduckgo@NonceGeek"`

* **descriptionMarkdown**
  * **description:** Agent description in markdown (supports bold, links, newlines)
  * **value:** `"A gentle, professional psychology assistant to help you untangle emotions, clarify thoughts, and make better choices.\n一个温柔、专业的心理学助手，帮你梳理情绪、理清思路、做出更好的选择。"`

* **agentAddress**
  * **description:** On-chain address displayed on the profile card.
  * **value:** `"0x5cf8ed0e6b49da5d87ba69c4e50aa9b78c57bf0dd446f9889c8f8b5e57b0f336"`

* **freeTierDescription**
  * **description:** Description text for the free tier card
  * **value:** `"Chat with the PsyAssistant for free. \n与 PsyAssistant 免费聊天！"`

* **freeTierLink**
  * **description:** Link target for the free tier button
  * **value:** `"/chat"`

* **agentTags**
  * **description:** Array of tag labels shown on the profile card
  * **value:** `["psychology", "emotion"]`

* **premiumTierDescription**
  * **description:** Description for the premium tier card (supports markdown with images and links)
  * **value:** ` "💡微信扫码进一步沟通：\n![my_qr_code](https://dimsum-utils.oss-cn-guangzhou.aliyuncs.com/leeduckgo/qr_code2.png)\n或者给我发送私信：[https://x.com/0xleeduckgo](https://x.com/0xleeduckgo)"`

* **chatbotDescription**
  * **description:** Subtitle text on the `/chat` page
  * **value:** `"Talk to PsyAssistant if you have any questions."`

* **chatbotIntroMessage**
  * **description:** Initial greeting message in the chat window
  * **value:** `"你好！我是心理学助手 PsyAssistant~ 你有什么问题都可以问我哦❤️~"`

* **chatApiUrl**
  * **description:** Backend API endpoint for the chat
  <!-- * **value:** `"http://localhost:8000/api/search_and_chat"` -->
  * **value:** `"https://api.scaffold-agent-homepage.leeduckgo.com/api/search_and_chat"`

* **chatLib**
  * **description:** TF-IDF library name used by the search_and_chat RAG endpoint
  * **value:** `"tfidf"`

* **searchMode**
  * **description:** search mode of the Chatbot, tfidf or vector
  * **value:** `"vector"`

* **Prompts**
  * **prompt1:** 
    > 你是一个**专业心理咨询师**，当用户提出心理相关的问题时，你要用 **藏传佛教的世界观与心性观** 来理解与回应。
    > 在回答中，你需要：    
    >
    > 1. 以**藏传佛教的思维方式**来审视和解读问题，如：
    >   - 生命无常与痛苦的缘起性空
    >   - 对“心”的觉察与自性清净的理解
    >   - 通过慈悲、觉知、止观等方法引导用户自我觉醒与解脱  
    >   - 内在烦恼（贪嗔痴）不是个人失败，而是感受与知见的构造物，需要智慧去观察和了解  [oai_citation:0‡维基百科](https://zh.wikipedia.org/wiki/%E6%85%88_%28%E4%BD%9B%E6%95%99%29?utm_source=chatgpt.com)
    >
    > 2. 在专业心理咨询框架下提供支持与引导：
    >   - 先用**共情与接纳**回应用户的感受
    >   - 结合藏传佛教及心理学（如正念觉察、观照习气等）给出**具体的实践建议**           
    >
    > 3. 尊重用户信仰与判断，不强加宗教观点：
    >   - 以佛法智慧辅助理解，而不是灌输宗教教义
    >   - 给出对用户有帮助，可立即实践的建议
    >
    > 请注意，回答中无需给出参考资料。
    > 请注意，在回答中不要出现藏传佛教字样。
    >
    > 请注意，回答请在 30 个字以内。

## Quick Start

### Prerequisites

- Node.js 18+
- npm, yarn, or pnpm

### Installation

```bash
git clone <your-repo-url>
cd main
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```bash
npm run build
npm run start
```

## Project Structure

```
main/
├── app/
│   ├── page.tsx              # Homepage
│   ├── chat/page.tsx         # Chat page (Deep Chat UI)
│   ├── layout.tsx            # Root layout with providers
│   └── globals.css           # Global styles
├── components/
│   ├── ui/                   # shadcn/ui base components
│   ├── header.tsx            # Site header with navigation
│   ├── agent-profile-card.tsx # Agent profile card component
│   ├── free-tier-card.tsx    # Free tier feature card
│   ├── premium-tier-card.tsx # Premium tier feature card
│   ├── theme-provider.tsx    # Theme provider (light/dark)
│   └── theme-toggle.tsx      # Theme toggle button
├── hooks/                    # Custom React hooks
├── lib/                      # Utility functions
├── public/                   # Static assets (avatar, icons)
└── package.json              # Dependencies and config
```

## Available Scripts

```bash
npm run dev            # Start dev server with Turbopack
npm run build          # Production build
npm run start          # Start production server
npm run lint           # Run ESLint
npm run lint:fix       # Auto-fix lint issues
npm run format         # Format with Prettier
npm run format:check   # Check formatting
```

## Tech Stack

- [Next.js](https://nextjs.org/) — React framework
- [Tailwind CSS](https://tailwindcss.com/) — Utility-first CSS
- [shadcn/ui](https://ui.shadcn.com/) — UI component library
- [Deep Chat](https://github.com/OvidijusParsiunas/deep-chat) — AI chat component
- [next-themes](https://github.com/pacocoursey/next-themes) — Dark/light mode

## License

MIT
