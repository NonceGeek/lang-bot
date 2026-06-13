# Scaffold Chatbot / Psy Assistant Agent

> [https://psy.agent.leeduckgo.com/](https://psy.agent.leeduckgo.com/)
>
>
> A configurable scaffold for building AI Agent homepages with a built-in chat interface.

## 🎯 Overview

This project provides a ready-to-use template for deploying your own **AI Agent Homepage**. It includes an agent profile page, a free-tier chatbot powered by [Deep Chat](https://github.com/OvidijusParsiunas/deep-chat), a premium-tier section, and a Deno backend server.

### Key Features

- ⚙️ **README-driven Configuration** — All app parameters live in a single Markdown file
- 🤖 **AI Agent Profile** — Display agent information, avatar, and description
- 🆓 **Free Tier** — Built-in chatbot access for all users
- 💰 **Premium Tier** — Paid / advanced content section
- 🎨 **Modern UI** — Built with Next.js, Tailwind CSS, and shadcn/ui

## ⚙️ Configuration

All runtime parameters for the frontend app are defined in the **Configuration** section of [`main/README.md`](./main/README.md#configuration).

> **To customise your Agent Homepage, simply edit the values in `main/README.md` — the app reads them automatically at build / runtime. No code changes required.**
>
> 如需自定义你的 Agent 主页，只需编辑 `main/README.md` 中 Configuration 部分的 value 值，程序会自动读取，无需修改任何代码。

See [main/README.md → Configuration](./main/README.md#configuration) for the full parameter list.

## 📁 Project Structure

```
scaffold-agent-homepage/
├── main/                  # Next.js frontend application
│   ├── app/              # Next.js app router pages
│   ├── components/       # React components
│   ├── lib/              # Utilities (README config loader, etc.)
│   ├── hooks/            # Custom React hooks
│   ├── public/           # Static assets (avatar, icons)
│   └── README.md         # ⭐ Frontend configuration file
│
├── deno-server/          # Deno backend server
│   ├── main.tsx          # Server entry point
│   ├── apidoc.md         # API documentation
│   └── README.md         # Server documentation
│
└── LICENSE               # Apache 2.0 License
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **Deno** 1.37+ (for backend server)

### 1. Start the Backend Server

```bash
cd deno-server

# Set environment variables
export DASHSCOPE_API_KEY="sk-your-key"
export PORT=4003  # Optional, defaults to 4003

# Run the server
deno run --allow-net --allow-read --allow-env main.tsx
```

See [deno-server/README.md](./deno-server/README.md) for detailed server documentation.

### 2. Start the Frontend

```bash
cd main

# Install dependencies
npm install

# Start development server
npm run dev
```

The frontend will start on [http://localhost:3000](http://localhost:3000).

## 🏗️ Architecture

### Frontend (`main/`)

- **Framework**: Next.js 15 with App Router
- **UI**: Tailwind CSS + shadcn/ui components
- **Chat**: Deep Chat (web component)
- **Config**: Parsed at runtime from `main/README.md`

### Backend (`deno-server/`)

- **Runtime**: Deno
- **Framework**: Oak
- **CORS**: oakCors with full cross-origin support

## 🚀 Deployment

### Frontend (Vercel)

1. Push code to GitHub
2. Import project in Vercel
3. Deploy automatically

### Backend (Deno Deploy)

1. Push code to GitHub
2. Create project on [Deno Deploy](https://dash.deno.com)
3. Set environment variables
4. Deploy from `deno-server/main.tsx`

## 📚 Documentation

- **Frontend Config**: [main/README.md](./main/README.md#configuration)
- **API Documentation**: [deno-server/apidoc.md](./deno-server/apidoc.md)
- **Server README**: [deno-server/README.md](./deno-server/README.md)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

This project is licensed under the Apache License 2.0 — see the [LICENSE](./LICENSE) file for details.

## 📧 Contact

Created by [leeduckgo@NonceGeek](https://x.com/0xleeduckgo)

---

**Built with ❤️ using Next.js, Deno, and Deep Chat**
