import { createAdminMenuKeyboard } from "../admin-home/keyboards.js";
import { createBackKeyboard } from "../../ui/core-keyboards.js";
import { ACTIONS } from "../../app/action-types.js";
import { createResetConfirmKeyboard, createResetMenuKeyboard } from "./keyboards.js";

export async function sendResetMenuScreen(vk, peerId) {
  await vk.sendText(peerId, "Что вы хотите удалить?", {
    keyboard: createResetMenuKeyboard(),
  });
}

export async function sendResetConfirmScreen(vk, peerId, resetKind) {
  const message =
    resetKind === "activity_history"
      ? "Вы хотите удалить всю историю активности текущего мероприятия? Будут очищены только events, а команды, станции, сообщения и привязки пользователей сохранятся."
      : resetKind === "users_assignments"
        ? "Вы хотите сбросить всех участников из команд и всех организаторов со станций? Главные админы без станции не будут сброшены."
      : "Вы хотите удалить все данные о текущем мероприятии?";
  const confirmAction =
    resetKind === "activity_history"
      ? ACTIONS.RESET_CONFIRM_ACTIVITY_HISTORY
      : resetKind === "users_assignments"
        ? ACTIONS.RESET_CONFIRM_USERS_ASSIGNMENTS
        : ACTIONS.RESET_CONFIRM_ALL_DATA;

  await vk.sendText(peerId, message, {
    keyboard: createResetConfirmKeyboard(confirmAction),
  });
}

export async function sendResetCompletedScreen(vk, peerId, message) {
  await vk.sendText(peerId, message, {
    keyboard: createAdminMenuKeyboard(),
  });
}

export async function sendResetUsersAssignmentsLogScreen(vk, peerId, counts, withAdminKeyboard = true) {
  await vk.sendText(
    peerId,
    `Сброшены привязки пользователей.\n\nОрганизаторов со станций: ${counts.stationAdmins}\nУчастников из команд: ${counts.participants}`,
    {
      keyboard: withAdminKeyboard ? createAdminMenuKeyboard() : undefined,
    },
  );
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
