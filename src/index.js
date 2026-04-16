import { handleVkRequest } from "./main.js";

export default {
  async fetch(request, env, ctx) {
    return handleVkRequest({ request, env, ctx });
  },
};
