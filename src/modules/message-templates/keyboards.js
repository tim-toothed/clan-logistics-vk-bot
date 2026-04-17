import { ACTIONS } from "../../app/action-types.js";
import { createBackKeyboard, createKeyboard } from "../../ui/core-keyboards.js";

export function createBotMessagesKeyboard(messageButtons = []) {
  return createKeyboard([
    [{ label: "Создать новое сообщение", color: "positive", payload: { action: ACTIONS.MESSAGE_CREATE } }],
    ...messageButtons.map((messageButton) => [
      {
        label: messageButton.label,
        color: "primary",
        payload: {
          action: ACTIONS.MESSAGE_OPEN,
          messageId: messageButton.id,
        },
      },
    ]),
    [{ label: "Назад", color: "secondary", payload: { action: ACTIONS.BACK_TO_ADMIN_MENU } }],
  ]);
}

export function createMessageTriggerKeyboard(triggerButtons = []) {
  return createKeyboard([
    ...triggerButtons.map((button) => [
      {
        label: button.label,
        color: "primary",
        payload: {
          action: ACTIONS.MESSAGE_TRIGGER_SELECT,
          triggerType: button.triggerType,
          stationId: button.stationId ?? null,
          title: button.title,
        },
      },
    ]),
    [{ label: "Назад", color: "secondary", payload: { action: ACTIONS.MESSAGES_MENU_BACK } }],
  ]);
}

export function createMessageRecordingKeyboard() {
  return createKeyboard([
    [{ label: "Подтвердить", color: "positive", payload: { action: ACTIONS.MESSAGE_RECORD_CONFIRM } }],
    [{ label: "Отмена", color: "negative", payload: { action: ACTIONS.MESSAGE_RECORD_CANCEL } }],
  ]);
}

export function createExistingMessageActionsKeyboard(messageId) {
  return createKeyboard([
    [{ label: "Заменить сообщение", color: "primary", payload: { action: ACTIONS.MESSAGE_REPLACE, messageId } }],
    [{ label: "Удалить сообщение", color: "negative", payload: { action: ACTIONS.MESSAGE_DELETE, messageId } }],
    [{ label: "Назад", color: "secondary", payload: { action: ACTIONS.MESSAGES_MENU_BACK } }],
  ]);
}
