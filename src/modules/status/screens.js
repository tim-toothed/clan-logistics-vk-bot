import { createBackKeyboard } from "../../ui/core-keyboards.js";

export async function sendStatusScreen(vk, peerId, text) {
  await vk.sendText(peerId, text, {
    keyboard: createBackKeyboard(),
  });
}
