import { ACTIONS } from "../../app/action-types.js";
import { clearUserState } from "../../db/user-state-repository.js";
import { resetUserRole } from "../../db/users-repository.js";
import { openMyStationMenu } from "../my-station/router.js";
import { toDisplayCase } from "../../utils/text.js";
import { openBotMessagesMenu } from "../message-templates/router.js";
import { openStationsTeamsMenu } from "../setup-lists/router.js";
import { sendParticipantIdleScreen, sendWhoAreYouScreen } from "../welcome/screens.js";
import { openAssignTeamsConfirm } from "../assign-teams/router.js";
import { openResetConfirm } from "../reset/router.js";
import { openStatusScreen } from "../status/router.js";
import { sendAdminMenuPlaceholderScreen, sendSectionInDevelopmentScreen } from "./screens.js";

const COMMON_ADMIN_MENU_BUTTONS = new Set([
  "статистика",
  "станции и команды",
  "сообщения бота",
  "сброс",
]);

const MAIN_ADMIN_MENU_BUTTONS = new Set([...COMMON_ADMIN_MENU_BUTTONS, "начать квест"]);
const STATION_ADMIN_MENU_BUTTONS = new Set([...COMMON_ADMIN_MENU_BUTTONS, "моя станция"]);

export async function handleAdminMenuState(context) {
  if (context.action === ACTIONS.OPEN_MY_STATION && context.user?.station_id) {
    return openMyStationMenu(context);
  }

  if (context.action === ACTIONS.OPEN_STATUS) {
    return openStatusScreen(context);
  }

  if (context.action === ACTIONS.OPEN_STATIONS_TEAMS) {
    return openStationsTeamsMenu(context);
  }

  if (context.action === ACTIONS.OPEN_BOT_MESSAGES) {
    return openBotMessagesMenu(context);
  }

  if (context.action === ACTIONS.OPEN_RESET) {
    return openResetConfirm(context);
  }

  if (context.action === ACTIONS.OPEN_ASSIGN_TEAMS && !context.user?.station_id) {
    return openAssignTeamsConfirm(context);
  }

  if (context.input === "моя станция" && context.user?.station_id) {
    return openMyStationMenu(context);
  }

  if (context.input === "статистика") {
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

  if (context.input === "начать квест" && !context.user?.station_id) {
    return openAssignTeamsConfirm(context);
  }

  const availableButtons = context.user?.station_id ? STATION_ADMIN_MENU_BUTTONS : MAIN_ADMIN_MENU_BUTTONS;

  if (!availableButtons.has(context.input)) {
    await sendAdminMenuPlaceholderScreen(context.vk, context.peerId, { env: context.env, user: context.user });
    return true;
  }

  await sendSectionInDevelopmentScreen(context.vk, context.peerId, toDisplayCase(context.input), {
    env: context.env,
    user: context.user,
  });
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
