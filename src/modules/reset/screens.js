import { createAdminMenuKeyboard } from "../admin-home/keyboards.js";
import { createResetConfirmKeyboard } from "./keyboards.js";
import { createBackKeyboard } from "../../ui/core-keyboards.js";

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

export async function sendResetBackupFailedScreen(vk, peerId) {
  await vk.sendText(peerId, "Не удалось создать файл резервной копии. Сброс не выполнен.", {
    keyboard: createAdminMenuKeyboard(),
  });
}

export async function sendResetBackupNotificationScreen(vk, peerId, attachment, withAdminKeyboard = true) {
  await vk.sendText(
    peerId,
    "Данные о мероприятии были успешно удалены. Если это произошло по ошибке, вы можете восстановить данные с помощью прикрепленного файла и команды /import",
    {
      attachment,
      keyboard: withAdminKeyboard ? createAdminMenuKeyboard() : undefined,
    },
  );
}

export async function sendImportAwaitFileScreen(vk, peerId) {
  await vk.sendText(
    peerId,
    "Пришлите файл экспорта мероприятия, который бот отправляет при сбросе данных. Импорт сработает только если в таблицах teams/stations/events/messages сейчас нет строк.",
    {
      keyboard: createBackKeyboard(),
    },
  );
}

export async function sendImportBlockedScreen(vk, peerId) {
  await vk.sendText(peerId, "Импорт доступен только в пустое мероприятие. Сначала очистите текущие teams/stations/events/messages.", {
    keyboard: createAdminMenuKeyboard(),
  });
}

export async function sendImportAdminOnlyScreen(vk, peerId) {
  await vk.sendText(peerId, "Команда /import доступна только администраторам.");
}

export async function sendImportFailedScreen(vk, peerId, reason) {
  await vk.sendText(peerId, `Не удалось импортировать файл.\n\n${reason}`, {
    keyboard: createBackKeyboard(),
  });
}

export async function sendImportCompletedScreen(vk, peerId) {
  await vk.sendText(peerId, "Данные мероприятия успешно восстановлены из файла.", {
    keyboard: createAdminMenuKeyboard(),
  });
}
