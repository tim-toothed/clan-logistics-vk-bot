import { getUserState } from "../db/user-state-repository.js";
import { ensureUser } from "../db/users-repository.js";
import { normalizeText } from "../utils/text.js";
import { parseVkButtonPayload } from "../utils/vk-message.js";

export async function createFlowContext(env, payload, vk) {
  const peerId = payload?.object?.message?.peer_id;
  const vkUserId = payload?.object?.message?.from_id;

  if (!peerId || !vkUserId) {
    throw new Error("VK payload did not contain peer_id or from_id");
  }

  const rawText = getMessageText(payload);
  const buttonPayload = parseVkButtonPayload(payload);
  const user = await ensureUser(env, vkUserId);
  const userState = await getUserState(env, user.id);

  return {
    env,
    payload,
    vk,
    peerId,
    vkUserId,
    rawText,
    input: normalizeText(rawText),
    buttonPayload,
    action: buttonPayload?.action ?? null,
    user,
    userState,
  };
}

function getMessageText(payload) {
  return payload?.object?.message?.text ?? "";
}
