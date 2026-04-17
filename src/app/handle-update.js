import { handleMessageNew } from "./ui-router.js";
import { createVkClient } from "../utils/vk-api.js";

const eventHandlers = {
  message_new: handleMessageNew,
};

export async function handleVkFetch(request, env, ctx, state) {
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

  if (payload?.type === "confirmation") {
    if (!env.VK_CONFIRMATION_TOKEN) {
      console.error("VK_CONFIRMATION_TOKEN is missing");
      return new Response("Missing confirmation token", { status: 500 });
    }

    return new Response(env.VK_CONFIRMATION_TOKEN, { status: 200 });
  }

  if (!isVkSecretValid(payload, env)) {
    return new Response("Forbidden", { status: 403 });
  }

  const vk = createVkClient(env);
  const eventType = payload?.type ?? "";
  const eventHandler = eventHandlers[eventType];

  if (eventType === "message_new") {
    console.log("VK message", getIncomingMessageSummary(payload));
  }

  if (eventHandler) {
    ctx.waitUntil(
      Promise.resolve(eventHandler(env, payload, state, vk, ctx)).catch((error) => {
        console.error(`Failed to process VK ${eventType} event`, error, payload);
      }),
    );
  }

  return new Response("ok", { status: 200 });
}

export async function handleScheduledEvent(event, env, ctx, state) {
  void event;
  void env;
  void ctx;
  void state;
}

function isVkSecretValid(update, env) {
  if (!env.VK_SECRET) {
    return true;
  }

  return update?.secret === env.VK_SECRET;
}

function getIncomingMessageSummary(payload) {
  const message = payload?.object?.message;

  return {
    fromId: message?.from_id ?? null,
    peerId: message?.peer_id ?? null,
    text: typeof message?.text === "string" ? message.text : "",
    attachments: Array.isArray(message?.attachments) ? message.attachments.map((item) => item?.type).filter(Boolean) : [],
  };
}
