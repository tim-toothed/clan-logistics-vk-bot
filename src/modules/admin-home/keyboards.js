import { ACTIONS } from "../../app/action-types.js";
import { createButtonsKeyboard } from "../../ui/core-keyboards.js";

export function buildMainAdminMenuModel(options = {}) {
  const { canStartQuest = true } = options;
  const buttons = [
    { label: "Статистика", color: "primary", payload: { action: ACTIONS.OPEN_STATUS } },
    { label: "Станции и команды", color: "primary", payload: { action: ACTIONS.OPEN_STATIONS_TEAMS } },
    { label: "Сообщения Бота", color: "primary", payload: { action: ACTIONS.OPEN_BOT_MESSAGES } },
    { label: "Сброс", color: "negative", payload: { action: ACTIONS.OPEN_RESET } },
    { label: "Выйти", color: "secondary", payload: { action: ACTIONS.EXIT } },
  ];

  if (canStartQuest) {
    buttons.unshift({ label: "Начать квест", color: "primary", payload: { action: ACTIONS.OPEN_ASSIGN_TEAMS } });
  }

  return buttons;
}

export function buildStationAdminMenuModel() {
  return [
    { label: "Моя станция", color: "primary", payload: { action: ACTIONS.OPEN_MY_STATION } },
    { label: "Статистика", color: "primary", payload: { action: ACTIONS.OPEN_STATUS } },
    { label: "Станции и команды", color: "primary", payload: { action: ACTIONS.OPEN_STATIONS_TEAMS } },
    { label: "Сообщения Бота", color: "primary", payload: { action: ACTIONS.OPEN_BOT_MESSAGES } },
    { label: "Сброс", color: "negative", payload: { action: ACTIONS.OPEN_RESET } },
    { label: "Выйти", color: "secondary", payload: { action: ACTIONS.EXIT } },
  ];
}

export function createAdminMenuKeyboard(user = null, options = {}) {
  const buttons = user?.station_id ? buildStationAdminMenuModel() : buildMainAdminMenuModel(options);
  return createButtonsKeyboard(buttons);
}
