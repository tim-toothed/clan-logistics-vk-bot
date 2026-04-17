import { openBotMessagesMenu } from "./bot-messages-flow.js";
import { openMyStationMenu } from "./my-station-flow.js";
import { openResetConfirm } from "./reset-flow.js";
import { openStatusScreen } from "./status-flow.js";
import { openStationsTeamsMenu } from "./stations-teams-flow.js";
import { clearUserState } from "../db/user-state-repository.js";
import { resetUserRole } from "../db/users-repository.js";
import { toDisplayCase } from "../utils/text.js";
import { sendAdminMenuPlaceholderScreen, sendParticipantIdleScreen, sendSectionInDevelopmentScreen, sendWhoAreYouScreen } from "../ui/screens.js";

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
