# clan-logistics-vk-bot

VK bot for quest logistics on Cloudflare Workers.

The project is currently being migrated from a command-first template to a UI-first architecture. The bot already works through buttons and user state, so the codebase is being reorganized around screens, feature modules, and routing by `payload.action` / `state_type`.

## Current structure

- `src/main.js`
  Worker entrypoint. Delegates VK updates into the application layer.
- `src/app/*`
  Application orchestration:
  - `handle-update.js` handles VK callback requests
  - `create-context.js` builds the shared flow context
  - `ui-router.js` routes commands, UI actions, and user states
  - `action-types.js` / `state-types.js` store shared constants
- `src/modules/*`
  Feature-oriented UI modules. The first extracted modules are:
  - `welcome`
  - `admin-home`
  - `my-station`
  - `setup-lists`
  - `message-templates`
  - `status`
  - `reset`
- `src/flows/*`
  Legacy compatibility layer. Flow files now mostly re-export logic from `src/modules/*` for backward compatibility.
- `src/ui/*`
  Shared VK UI helpers plus thin compatibility exports for legacy imports.
- `src/db/*`
  D1 repositories and database access.
- `src/utils/*`
  VK-specific helpers and text utilities.

## Migration direction

The target architecture is feature-first rather than command-first:

- welcome
- admin-home
- setup-lists
- message-templates
- my-station
- status
- reset

`welcome-flow.js`, `stations-teams-flow.js`, `bot-messages-flow.js`, and `my-station-flow.js` are now compatibility wrappers around extracted feature modules.

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

4. Run syntax checks:

```bash
npm run check
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
