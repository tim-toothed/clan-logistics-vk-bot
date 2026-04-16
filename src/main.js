import commandMap from "./CommandMap.js";
import { createVkClient } from "./utils/vk-api.js";

const state = {
  pendingMessages: {},
};

const eventTypeHandlers = {
  message_new: "handleTextMessage",
  message_event: "handleMessageEvent",
  message_reply: "handleMessageReply",
  message_allow: "handleMessageAllow",
  message_deny: "handleMessageDeny",
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === "GET") {
      return new Response("VK bot worker is alive", { status: 200 });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    let payload;

    try {
      payload = await request.json();
    } catch (error) {
      console.error("Failed to parse VK callback payload", error);
      return new Response("Bad request", { status: 400 });
    }

    console.log("Received VK callback", {
      type: payload?.type ?? null,
      groupId: payload?.group_id ?? null,
      hasSecret: typeof payload?.secret === "string" && payload.secret.length > 0,
    });

    if (payload?.type === "confirmation") {
      if (!env.VK_CONFIRMATION_TOKEN) {
        console.error("VK_CONFIRMATION_TOKEN is missing");
        return new Response("Missing confirmation token", { status: 500 });
      }

      console.log("Returning VK confirmation token");
      return new Response(env.VK_CONFIRMATION_TOKEN, { status: 200 });
    }

    if (!isVkSecretValid(payload, env)) {
      console.warn("Rejected VK callback because secret did not match", {
        type: payload?.type ?? null,
        hasConfiguredSecret: Boolean(env.VK_SECRET),
        hasIncomingSecret: typeof payload?.secret === "string" && payload.secret.length > 0,
      });
      return new Response("Forbidden", { status: 403 });
    }

    const vk = createVkClient(env);
    const eventType = payload?.type ?? "";
    const handlerMethod = eventTypeHandlers[eventType];

    if (handlerMethod) {
      const handler = commandMap[eventType];

      if (handler && typeof handler[handlerMethod] === "function") {
        ctx.waitUntil(
          Promise.resolve(handler[handlerMethod](env, payload, state, vk, ctx)).catch((error) => {
            console.error(`Failed to process VK ${eventType} event`, error, payload);
          }),
        );
      }
    } else {
      console.log("Ignoring unsupported VK event type", {
        type: eventType || null,
      });
    }

    if (eventType === "message_new") {
      ctx.waitUntil(
        handleTextCommands(env, payload, state, vk, ctx).catch((error) => {
          console.error("Failed to process VK text command", error, payload);
        }),
      );
    }

    return new Response("ok", { status: 200 });
  },

  async scheduled(event, env, ctx) {
    const handler = commandMap.cron;

    if (!handler || typeof handler.handleCron !== "function") {
      return;
    }

    const vk = createVkClient(env);
    await handler.handleCron(env, event, state, vk, ctx);
  },
};

async function handleTextCommands(env, payload, state, vk, ctx) {
  const text = getMessageText(payload);
  const peerId = payload?.object?.message?.peer_id;
  const fromId = payload?.object?.message?.from_id;

  if (!peerId || !fromId) {
    console.warn("VK message_new callback did not contain peer_id or from_id");
    return;
  }

  const input = text.toLowerCase();
  const pendingCommand = state.pendingMessages[`${fromId}-${peerId}`];

  if (pendingCommand) {
    const pendingHandler = commandMap[pendingCommand.command];

    if (pendingHandler && typeof pendingHandler.handlePendingMessage === "function") {
      await pendingHandler.handlePendingMessage(env, payload, state, vk, ctx);
      return;
    }
  }

  const command = findCommand(input);

  if (command) {
    const commandHandler = commandMap[command];

    if (commandHandler && typeof commandHandler.handleCommand === "function") {
      console.log("Dispatching VK command", { command });
      await commandHandler.handleCommand(env, payload, state, vk, ctx);
      return;
    }

    if (typeof commandHandler === "function") {
      console.log("Dispatching VK command", { command });
      await commandHandler(env, payload, state, vk, ctx);
      return;
    }
  }

  const defaultHandler = commandMap.default;

  if (defaultHandler && typeof defaultHandler.handleTextMessage === "function") {
    await defaultHandler.handleTextMessage(env, payload, state, vk, ctx);
  }
}

function isVkSecretValid(update, env) {
  if (!env.VK_SECRET) {
    return true;
  }

  return update?.secret === env.VK_SECRET;
}

function getMessageText(payload) {
  const text = payload?.object?.message?.text;
  return typeof text === "string" ? text.trim() : "";
}

function findCommand(input) {
  if (!input) {
    return "";
  }

  const commandKeys = Object.keys(commandMap).filter((key) => {
    return !eventTypeHandlers[key] && key !== "default" && key !== "cron";
  });

  const normalizedInput = normalizeCommandInput(input);

  return (
    commandKeys.find((command) => {
      return normalizedInput.startsWith(normalizeCommandInput(command));
    }) ?? ""
  );
}

function normalizeCommandInput(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.startsWith("/") ? normalized.slice(1) : normalized;
}
