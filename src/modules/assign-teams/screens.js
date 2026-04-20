import { createAssignTeamsConfirmKeyboard, createAssignTeamsRetryKeyboard } from "./keyboards.js";

export async function sendAssignTeamsConfirmScreen(vk, peerId, text) {
  await vk.sendText(peerId, text, {
    keyboard: createAssignTeamsConfirmKeyboard(),
  });
}

export async function sendAssignTeamsRetryScreen(vk, peerId, text) {
  await vk.sendText(peerId, text, {
    keyboard: createAssignTeamsRetryKeyboard(),
  });
}
