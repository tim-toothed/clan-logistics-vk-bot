import { ACTIONS } from "../../app/action-types.js";
import { createButtonsKeyboard } from "../../ui/core-keyboards.js";

export function createAdminMenuKeyboard() {
  return createButtonsKeyboard([
    { label: "Моя станция", color: "primary", payload: { action: ACTIONS.OPEN_MY_STATION } },
    { label: "Статистика", color: "primary", payload: { action: ACTIONS.OPEN_STATUS } },
    { label: "Станции и команды", color: "primary", payload: { action: ACTIONS.OPEN_STATIONS_TEAMS } },
    { label: "Сообщения Бота", color: "primary", payload: { action: ACTIONS.OPEN_BOT_MESSAGES } },
    { label: "Сброс", color: "negative", payload: { action: ACTIONS.OPEN_RESET } },
    { label: "Выйти", color: "secondary", payload: { action: ACTIONS.EXIT } },
  ]);
}
