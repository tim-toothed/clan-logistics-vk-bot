import { ACTIONS } from "../../app/action-types.js";
import { createButtonsKeyboard, createKeyboard, layoutMenuButtons } from "../../ui/core-keyboards.js";

export function createBotMessagesKeyboard(messageButtons = []) {
  return createButtonsKeyboard([
    { label: "Создать новое сообщение", color: "positive", payload: { action: ACTIONS.MESSAGE_CREATE } },
    ...messageButtons.map((messageButton) => ({
      label: messageButton.label,
      color: "primary",
      payload: {
        action: ACTIONS.MESSAGE_OPEN,
        messageId: messageButton.id,
      },
    })),
    { label: "Назад", color: "secondary", payload: { action: ACTIONS.BACK_TO_ADMIN_MENU } },
  ]);
}

export function createMessageTriggerKeyboard(model = {}) {
  const triggerButtons = Array.isArray(model.buttons) ? model.buttons : [];
  const rows = layoutMenuButtons(
    triggerButtons.map((button) => ({
      label: button.label,
      color: button.color ?? "primary",
      payload: button.payload ?? {
        action: ACTIONS.MESSAGE_TRIGGER_SELECT,
        triggerType: button.triggerType,
        stationId: button.stationId ?? null,
        title: button.title,
      },
    })),
    {
      layoutCount: triggerButtons.length + (Number.isInteger(model.previousPage) ? 1 : 0) + (Number.isInteger(model.nextPage) ? 1 : 0) + 1,
    },
  );

  const navigationButtons = [];

  if (Number.isInteger(model.previousPage)) {
    navigationButtons.push({
      label: "← Назад",
      color: "secondary",
      payload: { action: ACTIONS.MESSAGE_TRIGGER_PAGE, page: model.previousPage },
    });
  }

  if (Number.isInteger(model.nextPage)) {
    navigationButtons.push({
      label: "Дальше →",
      color: "secondary",
      payload: { action: ACTIONS.MESSAGE_TRIGGER_PAGE, page: model.nextPage },
    });
  }

  if (navigationButtons.length) {
    rows.push(navigationButtons);
  }

  rows.push([{ label: "Назад", color: "secondary", payload: { action: ACTIONS.MESSAGES_MENU_BACK } }]);
  return createKeyboard(rows);
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
