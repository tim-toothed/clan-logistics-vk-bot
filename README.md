# clan-logistics-vk-bot

VK bot for quest logistics on Cloudflare Workers.

The project has been reorganized from a command-first template into a UI-first architecture. The bot works through buttons and user state, so the codebase is now structured around screens, feature modules, and routing by `payload.action` / `state_type`.

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
- `src/ui/core-keyboards.js`
  Shared VK keyboard primitives used by feature modules.
- `src/db/*`
  D1 repositories and database access.
- `src/utils/*`
  VK-specific helpers and text utilities.

## Migration direction

The architecture is feature-first rather than command-first:

- welcome
- admin-home
- setup-lists
- message-templates
- my-station
- status
- reset

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
npx wrangler secret put ADMIN_PASSWORD
```

`VK_API_VERSION` is stored in `wrangler.jsonc` as a regular variable.

To validate the Worker bundle before deploy, run:

```bash
npx wrangler deploy --dry-run --outdir dist
```

## VK callback setup

1. Create a community token with message access.
2. Enable Community Messages and Callback API in VK.
3. Set the Worker URL as the callback endpoint.
4. Copy the confirmation code and callback secret into Worker secrets.
5. Subscribe to at least `message_new`.
