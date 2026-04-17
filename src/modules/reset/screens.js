import { createAdminMenuKeyboard } from "../admin-home/keyboards.js";
import { createResetConfirmKeyboard } from "./keyboards.js";

export async function sendResetConfirmScreen(vk, peerId) {
  await vk.sendText(peerId, "Вы хотите удалить все данные о текущем мероприятии?", {
    keyboard: createResetConfirmKeyboard(),
  });
}

export async function sendResetCompletedScreen(vk, peerId) {
  await vk.sendText(peerId, "Данные текущего мероприятия удалены.", {
    keyboard: createAdminMenuKeyboard(),
  });
}
