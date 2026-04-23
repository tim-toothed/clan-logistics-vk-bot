import { createAdminMenuKeyboard } from "../admin-home/keyboards.js";
import {
  createActiveStationKeyboard,
  createFinishConfirmationKeyboard,
  createIdleStationKeyboard,
  createMyStationBackKeyboard,
  createPreparingStationKeyboard,
  createStationDeliveryFailedKeyboard,
} from "./keyboards.js";

const TEXT_UNAVAILABLE =
  'Этот раздел доступен только организатору, привязанному к станции. Если станции ещё не назначены, используйте "Станции и команды" или войдите заново.';
const TEXT_IDLE_STATION = "Сейчас на вашу станцию никто не назначен.";

export async function sendMyStationUnavailableScreen(vk, peerId) {
  await vk.sendText(peerId, TEXT_UNAVAILABLE, {
    keyboard: createAdminMenuKeyboard(),
  });
}

export async function sendIdleStationScreen(vk, peerId) {
  await vk.sendText(peerId, TEXT_IDLE_STATION, {
    keyboard: createIdleStationKeyboard(),
  });
}

export async function sendPreparingStationScreen(vk, peerId, teamName, teamId) {
  await vk.sendText(
    peerId,
    `На вашу станцию назначена команда "${teamName}". Подготовьтесь и нажмите "Готов принимать", когда будете готовы принять команду.`,
    {
      keyboard: createPreparingStationKeyboard(teamId),
    },
  );
}

export async function sendActiveStationScreen(vk, peerId, teamName, teamId) {
  await vk.sendText(
    peerId,
    `Команда "${teamName}" уже на станции. Когда команда действительно пройдет станцию, нажмите "Завершить станцию".`,
    {
      keyboard: createActiveStationKeyboard(teamId),
    },
  );
}

export async function sendFinishConfirmationScreen(vk, peerId, teamName, teamId) {
  await vk.sendText(
    peerId,
    `Подтвердите, что команда "${teamName}" действительно прошла станцию.`,
    {
      keyboard: createFinishConfirmationKeyboard(teamId),
    },
  );
}

export async function sendStationDeliveryFailedScreen(vk, peerId, options) {
  const teamName = options?.teamName ?? "неизвестная команда";
  const stepLabel = options?.stepLabel ?? "следующий шаг";
  const failedRecipients = Array.isArray(options?.failedRecipients) ? options.failedRecipients : [];
  const failureLines = failedRecipients.length
    ? failedRecipients.map((item) => `- ${item.displayName}: ${item.errorMessage ?? "неизвестная ошибка"}`).join("\n")
    : "- Причина ошибки не определена";

  await vk.sendText(
    peerId,
    `Не удалось отправить инструкции команде "${teamName}".\n\nШаг: ${stepLabel}\nСтанция пока не завершена.\nМожно попробовать ещё раз или принудительно завершить станцию.\n\nНе доставлено:\n${failureLines}`,
    {
      keyboard: createStationDeliveryFailedKeyboard(options?.teamId),
    },
  );
}

export async function sendForceFinishManualRelayScreen(vk, peerId, options) {
  const teamName = options?.teamName ?? "неизвестная команда";
  const stepLabel = options?.stepLabel ?? "следующий шаг";
  const relayText = options?.relayText ?? "Текст для ручной передачи отсутствует.";

  await vk.sendText(
    peerId,
    `Станция принудительно завершена для команды "${teamName}".\n\nШаг: ${stepLabel}\nПередайте команде следующие инструкции вручную:\n\n${relayText}`,
    {
      keyboard: createMyStationBackKeyboard(),
    },
  );
}
