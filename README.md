# clan-logistics-vk-bot

Minimal Cloudflare Worker template for a VK community bot with a Telegram-like structure:

- `src/main.js` is the Worker entrypoint and universal event dispatcher
- `src/CommandMap.js` stores command and event bindings
- `src/commands/*` contains business logic handlers
- `src/utils/*` stores internal helpers such as VK API and future DB helpers

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.dev.vars.example` to `.dev.vars` and fill in your VK values.

3. Start local dev mode:

```bash
npm run dev
```

## Cloudflare setup

Set secrets in the Worker:

```bash
npx wrangler secret put VK_GROUP_TOKEN
npx wrangler secret put VK_CONFIRMATION_TOKEN
npx wrangler secret put VK_SECRET
```

`VK_API_VERSION` is stored in `wrangler.jsonc` as a regular variable.

## VK callback setup

1. Create a community token with message access.
2. Enable Community Messages and Callback API in VK.
3. Set the Worker URL as the callback endpoint.
4. Copy the confirmation code and callback secret into Worker secrets.
5. Subscribe to at least `message_new`.

## Test flow

- `GET /` returns a health check string.
- `POST /` handles VK callbacks.
- `confirmation` returns the confirmation token.
- `message_new` routes to `start`, `help`, or a default reply.
