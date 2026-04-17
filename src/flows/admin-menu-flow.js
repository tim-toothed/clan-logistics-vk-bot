import { setUserState } from "../db/user-state-repository.js";
import { toDisplayCase } from "../utils/text.js";
import {
  sendAdminMenuPlaceholderScreen,
  sendParticipantIdleScreen,
  sendSectionInDevelopmentScreen,
  sendStationsTeamsMenuScreen,
} from "../ui/screens.js";

const ADMIN_MENU_BUTTONS = new Set(["моя станция", "положение дел", "станции и команды", "сообщения бота", "сброс"]);

export async function handleAdminMenuState(context) {
  if (context.input === "станции и команды") {
    await setUserState(context.env, context.user.id, "manage_lists_menu", "idle");
    await sendStationsTeamsMenuScreen(context.vk, context.peerId);
    return true;
  }

  if (!ADMIN_MENU_BUTTONS.has(context.input)) {
    await sendAdminMenuPlaceholderScreen(context.vk, context.peerId);
    return true;
  }

  await sendSectionInDevelopmentScreen(context.vk, context.peerId, toDisplayCase(context.input));
  return true;
}

export async function handleParticipantHomeState(context) {
  await sendParticipantIdleScreen(context.vk, context.peerId);
  return true;
}
