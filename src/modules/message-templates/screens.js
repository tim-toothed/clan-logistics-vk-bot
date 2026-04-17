import {
  createBotMessagesKeyboard,
  createExistingMessageActionsKeyboard,
  createMessageRecordingKeyboard,
  createMessageTriggerKeyboard,
} from "./keyboards.js";
import { createBackKeyboard } from "../../ui/core-keyboards.js";

export async function sendBotMessagesMenuScreen(vk, peerId, messageButtons) {
  await vk.sendText(peerId, "Вот, какие сообщения сейчас есть для участников", {
    keyboard: createBotMessagesKeyboard(messageButtons),
  });
}

export async function sendMessageTriggerSelectScreen(vk, peerId, triggerButtons) {
  await vk.sendText(peerId, "Когда сообщение должно отправляться?", {
    keyboard: createMessageTriggerKeyboard(triggerButtons),
  });
}

export async function sendMessageRecordingStartScreen(vk, peerId, triggerTitle) {
  await vk.sendText(
    peerId,
    `Какое сообщение стоит отправлять участникам как ${triggerTitle}? Вы можете отправить любого рода сообщение или цепочку сообщений`,
    {
      keyboard: createBackKeyboard(),
    },
  );
}

export async function sendMessageRecordingContinueScreen(vk, peerId) {
  await vk.sendText(
    peerId,
    'Получил! Если это всё, тогда нажмите кнопку "Подтвердить". Если вы хотите отправить цепочку сообщений, то продолжайте, я слушаю.',
    {
      keyboard: createMessageRecordingKeyboard(),
    },
  );
}

export async function sendMessageTemplateActionsScreen(vk, peerId, messageId) {
  await vk.sendText(peerId, "Хотите переделать?", {
    keyboard: createExistingMessageActionsKeyboard(messageId),
  });
}

export async function sendMessageDeletedScreen(vk, peerId) {
  await vk.sendText(peerId, "Сообщение удалено.", {
    keyboard: createBackKeyboard(),
  });
}
