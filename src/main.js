import { dispatchVkCommand } from "./CommandMap.js";
import { createVkClient } from "./vk-api.js";

export async function handleVkRequest({ request, env, ctx }) {
  if (request.method === "GET") {
    return new Response("VK bot worker is alive", { status: 200 });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let update;

  try {
    update = await request.json();
  } catch (error) {
    console.error("Failed to parse VK callback payload", error);
    return new Response("Bad request", { status: 400 });
  }

  console.log("Received VK callback", {
    type: update?.type ?? null,
    groupId: update?.group_id ?? null,
    hasSecret: typeof update?.secret === "string" && update.secret.length > 0,
  });

  return handleVkCallback({ update, env, ctx });
}

export async function handleVkCallback({ update, env, ctx }) {
  if (update?.type === "confirmation") {
    if (!env.VK_CONFIRMATION_TOKEN) {
      console.error("VK_CONFIRMATION_TOKEN is missing");
      return new Response("Missing confirmation token", { status: 500 });
    }

    console.log("Returning VK confirmation token");
    return new Response(env.VK_CONFIRMATION_TOKEN, { status: 200 });
  }

  if (!isVkSecretValid(update, env)) {
    console.warn("Rejected VK callback because secret did not match", {
      type: update?.type ?? null,
      hasConfiguredSecret: Boolean(env.VK_SECRET),
      hasIncomingSecret: typeof update?.secret === "string" && update.secret.length > 0,
    });
    return new Response("Forbidden", { status: 403 });
  }

  if (update?.type !== "message_new") {
    console.log("Ignoring unsupported VK event type", {
      type: update?.type ?? null,
    });
    return new Response("ok", { status: 200 });
  }

  const event = normalizeMessageNew(update);

  if (!event) {
    console.warn("VK message_new callback did not contain object.message");
    return new Response("ok", { status: 200 });
  }

  console.log("Dispatching VK message", {
    peerId: event.peerId ?? null,
    fromId: event.fromId ?? null,
    rawCommand: event.rawCommand ?? "",
    hasText: Boolean(event.text),
  });

  const vk = createVkClient(env);

  ctx.waitUntil(
    dispatchVkCommand({ event, vk, env }).catch((error) => {
      console.error("Failed to process VK message_new event", error, update);
    }),
  );

  return new Response("ok", { status: 200 });
}

function isVkSecretValid(update, env) {
  if (!env.VK_SECRET) {
    return true;
  }

  return update?.secret === env.VK_SECRET;
}

function normalizeMessageNew(update) {
  const message = update?.object?.message;

  if (!message) {
    return null;
  }

  const text = typeof message.text === "string" ? message.text.trim() : "";

  return {
    type: update.type,
    text,
    rawCommand: extractCommand(text),
    payload: safeJsonParse(message.payload),
    peerId: message.peer_id,
    fromId: message.from_id,
    conversationMessageId: message.conversation_message_id,
    message,
    update,
  };
}

function extractCommand(text) {
  if (!text) {
    return "";
  }

  const normalized = text.toLowerCase().trim();
  const value = normalized.startsWith("/") ? normalized.slice(1) : normalized;

  return value.split(/\s+/u)[0] ?? "";
}

function safeJsonParse(value) {
  if (typeof value !== "string" || value === "") {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
