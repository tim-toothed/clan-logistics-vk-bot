import { hasAnyEvents } from "../../db/events-repository.js";
import { createAdminMenuKeyboard } from "./keyboards.js";

export async function sendAdminMenuScreen(vk, peerId, options = {}) {
  const { env, message = "Выберите раздел.", user = null } = options;
  const canStartQuest = user?.station_id ? false : !(await hasAnyEvents(env));

  await vk.sendText(peerId, message, {
    keyboard: createAdminMenuKeyboard(user, { canStartQuest }),
  });
}

export async function sendAdminMenuPlaceholderScreen(vk, peerId, options = {}) {
  const { env, user = null } = options;
  const canStartQuest = user?.station_id ? false : !(await hasAnyEvents(env));

  await vk.sendText(peerId, "Этот раздел ещё в разработке. Остальные основные разделы уже можно проверять.", {
    keyboard: createAdminMenuKeyboard(user, { canStartQuest }),
  });
}

export async function sendSectionInDevelopmentScreen(vk, peerId, label, options = {}) {
  const { env, user = null } = options;
  const canStartQuest = user?.station_id ? false : !(await hasAnyEvents(env));

  await vk.sendText(peerId, `Раздел "${label}" пока в разработке.`, {
    keyboard: createAdminMenuKeyboard(user, { canStartQuest }),
  });
}
