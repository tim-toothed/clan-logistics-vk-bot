import { ACTIONS } from "../../app/action-types.js";
import { createKeyboard } from "../../ui/core-keyboards.js";

export function createAssignTeamsConfirmKeyboard() {
  return createKeyboard([
    [{ label: "Да", color: "primary", payload: { action: ACTIONS.ASSIGN_TEAMS_CONFIRM } }],
    [{ label: "Назад", color: "secondary", payload: { action: ACTIONS.BACK_TO_ADMIN_MENU } }],
  ]);
}

export function createAssignTeamsRetryKeyboard() {
  return createKeyboard([
    [{ label: "Повторить отправку", color: "primary", payload: { action: ACTIONS.ASSIGN_TEAMS_RETRY_FAILED } }],
    [{ label: "Назад", color: "secondary", payload: { action: ACTIONS.BACK_TO_ADMIN_MENU } }],
  ]);
}
