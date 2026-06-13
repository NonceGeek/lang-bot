# Scaffold Agent Deno Server

Backend service for the Scaffold Agent homepage project.

This server provides:
- x402-protected premium endpoint(s)
- chat proxy endpoint (`/api/chat`) for DeepChat
- markdown and HTML API docs endpoints

## Important: Where To Edit App Configuration

UI/app configuration fields (like `homepageName`, `descriptionMarkdown`, `chatApiUrl`, etc.) are managed in:

- `../main/README.md` under the `## Configuration` section

If you want to change what the homepage/chat app displays, edit values there (not in this `deno-server/README.md`).

## Quick Start

### Prerequisites

- [Deno](https://deno.land/) v1.37+

### Environment Variables

Set environment variables before starting:

```bash
# x402 pay-to address (used by premium-content paywall)
export MOVEMENT_PAY_TO="0xYourMovementWalletAddress"

# Required for /api/chat (DashScope API key)
export DASHSCOPE_API_KEY="sk-your-key"

# Optional server port (default: 4403)
export SERVER_PORT=4403

# Optional (reserved for admin auth logic)
export ADMIN_PWD="your_admin_password"
```

### Run

```bash
cd deno-server
deno run --allow-net --allow-read --allow-env main.tsx
```

Development watch mode:

```bash
deno run --allow-net --allow-read --allow-env --watch main.tsx
```

Server default URL: `http://localhost:4403`

## API Endpoints

### Public

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/` | Basic server text + pay-to address |
| GET | `/health` | Health check JSON |
| GET | `/docs` | Raw markdown API docs (`apidoc.md`) |
| GET | `/docs/html` | Rendered HTML docs |

### Chat

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/chat` | Proxies chat requests to DashScope (`qwen-plus`) |

Request body:

```json
{
  "messages": [
    { "role": "user", "content": "Hello" }
  ]
}
```

Success response:

```json
{
  "text": "Hello! How can I help you today?"
}
```

### x402-Protected

| Method | Endpoint | Cost | Description |
| --- | --- | --- | --- |
| GET | `/api/premium-content` | 1 $MOVE (configured max amount) | Premium content endpoint behind x402 middleware |

## x402 Flow (Current Implementation)

1. Client requests protected endpoint without `X-PAYMENT`.
2. Server returns `402` and `X-PAYMENT-RESPONSE` payment requirement payload.
3. Client retries with `X-PAYMENT`.
4. Server currently allows pass-through in test mode.

Note: verification call to facilitator is present but commented in `main.tsx`. Re-enable it before production.

## cURL Examples

```bash
# Health
curl http://localhost:4403/health

# Docs markdown
curl http://localhost:4403/docs

# Chat
curl -X POST http://localhost:4403/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Write a hello-world HTML page"}]}'

# Premium endpoint (expect 402 without payment)
curl -i http://localhost:4403/api/premium-content
```

## Project Structure

```text
deno-server/
├── main.tsx
├── apidoc.md
├── README.md
├── deno.json
└── deno.lock
```

## Production Notes

- Restrict CORS origin (do not use `*` in production).
- Re-enable and enforce facilitator verification for `X-PAYMENT`.
- Use HTTPS for all deployments.
- Ensure `DASHSCOPE_API_KEY` is configured securely.

## License

See `../LICENSE`.
