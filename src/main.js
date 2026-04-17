import { handleScheduledEvent, handleVkFetch } from "./app/handle-update.js";

const state = {
};

export default {
  async fetch(request, env, ctx) {
    return handleVkFetch(request, env, ctx, state);
  },

  async scheduled(event, env, ctx) {
    await handleScheduledEvent(event, env, ctx, state);
  },
};
