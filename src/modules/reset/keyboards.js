import { ACTIONS } from "../../app/action-types.js";
import { createKeyboard } from "../../ui/core-keyboards.js";

export function createResetConfirmKeyboard() {
  return createKeyboard([
    [{ label: "Да", color: "negative", payload: { action: ACTIONS.RESET_CONFIRM } }],
    [{ label: "Назад", color: "secondary", payload: { action: ACTIONS.BACK_TO_ADMIN_MENU } }],
  ]);
}
