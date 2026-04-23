import { ACTIONS } from "../../app/action-types.js";
import { createKeyboard } from "../../ui/core-keyboards.js";

export function createResetMenuKeyboard() {
  return createKeyboard([
    [{ label: "История активности", color: "primary", payload: { action: ACTIONS.OPEN_RESET_ACTIVITY_HISTORY } }],
    [{ label: "Участники и орги", color: "primary", payload: { action: ACTIONS.OPEN_RESET_USERS_ASSIGNMENTS } }],
    [{ label: "Все данные", color: "negative", payload: { action: ACTIONS.OPEN_RESET_ALL_DATA } }],
    [{ label: "Назад", color: "secondary", payload: { action: ACTIONS.BACK_TO_ADMIN_MENU } }],
  ]);
}

export function createResetConfirmKeyboard(confirmAction) {
  return createKeyboard([
    [{ label: "Да", color: "negative", payload: { action: confirmAction } }],
    [{ label: "Назад", color: "secondary", payload: { action: ACTIONS.OPEN_RESET } }],
  ]);
}
