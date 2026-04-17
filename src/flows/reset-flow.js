import { deleteAllMessages } from "../db/messages-repository.js";
import { deleteTeamsAndStations, resetEventData } from "../db/events-repository.js";
import { setUserState } from "../db/user-state-repository.js";
import { resetUsersEventData } from "../db/users-repository.js";
import { sendAdminMenuScreen, sendResetCompletedScreen, sendResetConfirmScreen } from "../ui/screens.js";

export async function openResetConfirm(context) {
  await setUserState(context.env, context.user.id, "reset_confirm", "confirm");
  await sendResetConfirmScreen(context.vk, context.peerId);
  return true;
}

export async function handleResetConfirmState(context) {
  if (context.action === "back_to_admin_menu" || context.input === "назад") {
    await setUserState(context.env, context.user.id, "admin_menu", "idle");
    await sendAdminMenuScreen(context.vk, context.peerId);
    return true;
  }

  if (context.action !== "reset_confirm" && context.input !== "да") {
    await sendResetConfirmScreen(context.vk, context.peerId);
    return true;
  }

  await resetEventData(context.env);
  await deleteAllMessages(context.env);
  await deleteTeamsAndStations(context.env);
  await resetUsersEventData(context.env);

  await setUserState(context.env, context.user.id, "admin_menu", "idle");
  await sendResetCompletedScreen(context.vk, context.peerId);
  return true;
}
