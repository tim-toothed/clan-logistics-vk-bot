import { clearUserState } from "../../db/user-state-repository.js";
import { resetUserRole } from "../../db/users-repository.js";
import { openMyStationMenu } from "../my-station/router.js";
import { toDisplayCase } from "../../utils/text.js";
import { openBotMessagesMenu } from "../message-templates/router.js";
import { openStationsTeamsMenu } from "../setup-lists/router.js";
import { sendParticipantIdleScreen, sendWhoAreYouScreen } from "../welcome/screens.js";
import { openResetConfirm } from "../reset/router.js";
import { openStatusScreen } from "../status/router.js";
import { sendAdminMenuPlaceholderScreen, sendSectionInDevelopmentScreen } from "./screens.js";

const ADMIN_MENU_BUTTONS = new Set(["моя станция", "положение дел", "станции и команды", "сообщения бота", "сброс"]);

export async function handleAdminMenuState(context) {
  if (context.input === "моя станция") {
    return openMyStationMenu(context);
  }

  if (context.input === "положение дел") {
    return openStatusScreen(context);
  }

  if (context.input === "станции и команды") {
    return openStationsTeamsMenu(context);
  }

  if (context.input === "сообщения бота") {
    return openBotMessagesMenu(context);
  }

  if (context.input === "сброс") {
    return openResetConfirm(context);
  }

  if (!ADMIN_MENU_BUTTONS.has(context.input)) {
    await sendAdminMenuPlaceholderScreen(context.vk, context.peerId);
    return true;
  }

  await sendSectionInDevelopmentScreen(context.vk, context.peerId, toDisplayCase(context.input));
  return true;
}

export async function handleParticipantHomeState(context) {
  if (context.input === "перепутал, я организатор") {
    await resetUserRole(context.env, context.user.id);
    await clearUserState(context.env, context.user.id);
    await sendWhoAreYouScreen(context.vk, context.peerId);
    return true;
  }

  await sendParticipantIdleScreen(context.vk, context.peerId);
  return true;
}
