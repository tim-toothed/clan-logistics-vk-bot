import { createAdminMenuKeyboard } from "./keyboards.js";

export async function sendAdminMenuScreen(vk, peerId, message = "Выберите раздел.") {
  await vk.sendText(peerId, message, {
    keyboard: createAdminMenuKeyboard(),
  });
}

export async function sendAdminMenuPlaceholderScreen(vk, peerId) {
  await vk.sendText(peerId, "Этот раздел ещё в разработке. Остальные основные разделы уже можно проверять.", {
    keyboard: createAdminMenuKeyboard(),
  });
}

export async function sendSectionInDevelopmentScreen(vk, peerId, label) {
  await vk.sendText(peerId, `Раздел "${label}" пока в разработке.`, {
    keyboard: createAdminMenuKeyboard(),
  });
}
