import { ACTIONS } from "../../app/action-types.js";
import { STATE_TYPES } from "../../app/state-types.js";
import { deleteAllMessages } from "../../db/messages-repository.js";
import { deleteTeamsAndStations, resetEventData } from "../../db/events-repository.js";
import { setUserState } from "../../db/user-state-repository.js";
import { resetUsersEventData } from "../../db/users-repository.js";
import { sendAdminMenuScreen } from "../admin-home/screens.js";
import { sendResetCompletedScreen, sendResetConfirmScreen } from "./screens.js";

export async function openResetConfirm(context) {
  await setUserState(context.env, context.user.id, STATE_TYPES.RESET_CONFIRM, "confirm");
  await sendResetConfirmScreen(context.vk, context.peerId);
  return true;
}

export async function handleResetConfirmState(context) {
  if (context.action === ACTIONS.BACK_TO_ADMIN_MENU || context.input === "назад") {
    await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
    await sendAdminMenuScreen(context.vk, context.peerId);
    return true;
  }

  if (context.action !== ACTIONS.RESET_CONFIRM && context.input !== "да") {
    await sendResetConfirmScreen(context.vk, context.peerId);
    return true;
  }

  await resetEventData(context.env);
  await deleteAllMessages(context.env);
  await deleteTeamsAndStations(context.env);
  await resetUsersEventData(context.env);

  await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
  await sendResetCompletedScreen(context.vk, context.peerId);
  return true;
}
