import { ACTIONS } from "./action-types.js";
import { createFlowContext } from "./create-context.js";
import { STATE_TYPES } from "./state-types.js";
import { clearUserState, setUserState } from "../db/user-state-repository.js";
import { handleHelpCommand } from "../commands/help.js";
import {
  handleBotMessagesMenuState,
  handleMessageRecordingState,
  handleMessageTemplateActionsState,
  handleMessageTriggerMenuState,
  openBotMessagesMenu,
} from "../modules/message-templates/router.js";
import { handleAssignTeamsState, openAssignTeamsConfirm } from "../modules/assign-teams/router.js";
import { handleMyStationActiveState, handleMyStationMenuState, openMyStationMenu } from "../modules/my-station/router.js";
import { handleAdminMenuState, handleParticipantHomeState } from "../modules/admin-home/router.js";
import {
  handleAdminPasswordState,
  handleAdminStationState,
  handleGlobalBack,
  handleGlobalExit,
  handleOrganizerSelection,
  handleParticipantSelection,
  handleParticipantTeamState,
  handleStartCommand,
  handleWrongRoleSelection,
} from "../modules/welcome/router.js";
import { handleImportCommand, handleImportWaitFileState, handleResetConfirmState, openResetConfirm } from "../modules/reset/router.js";
import { handleStationsListState, handleStationsTeamsMenuState, handleTeamsListState, openStationsTeamsMenu } from "../modules/setup-lists/router.js";
import { handleStatusViewState, openStatusScreen } from "../modules/status/router.js";
import { sendWhoAreYouScreen } from "../modules/welcome/screens.js";

const INPUT_PARTICIPANT = "участник";
const INPUT_ORGANIZER = "организатор";
const INPUT_ADMIN = "админ";
const INPUT_WRONG_ROLE = "перепутал, я организатор";
const INPUT_BACK = "назад";
const INPUT_EXIT = "выйти";
const INPUT_START_VK = "начать";
const ADMIN_ONLY_ACTIONS = new Set([
  ACTIONS.OPEN_ASSIGN_TEAMS,
  ACTIONS.OPEN_MY_STATION,
  ACTIONS.OPEN_STATUS,
  ACTIONS.OPEN_BOT_MESSAGES,
  ACTIONS.OPEN_STATIONS_TEAMS,
  ACTIONS.OPEN_RESET,
  ACTIONS.ASSIGN_TEAMS_CONFIRM,
  ACTIONS.ASSIGN_TEAMS_RETRY_FAILED,
]);
const ADMIN_ONLY_STATES = new Set([
  STATE_TYPES.ADMIN_MENU,
  STATE_TYPES.ASSIGN_TEAMS_CONFIRM,
  STATE_TYPES.ASSIGN_TEAMS_RETRY,
  STATE_TYPES.MY_STATION_MENU,
  STATE_TYPES.MY_STATION_ACTIVE,
  STATE_TYPES.STATUS_VIEW,
  STATE_TYPES.MANAGE_LISTS_MENU,
  STATE_TYPES.EDIT_TEAMS_LIST,
  STATE_TYPES.EDIT_STATIONS_LIST,
  STATE_TYPES.BOT_MESSAGES_MENU,
  STATE_TYPES.MESSAGE_TRIGGER_MENU,
  STATE_TYPES.MESSAGE_RECORDING,
  STATE_TYPES.MESSAGE_TEMPLATE_ACTIONS,
  STATE_TYPES.RESET_MENU,
  STATE_TYPES.RESET_CONFIRM,
  STATE_TYPES.IMPORT_WAIT_FILE,
]);

const stateHandlers = {
  [STATE_TYPES.AWAIT_PARTICIPANT_TEAM]: handleParticipantTeamState,
  [STATE_TYPES.AWAIT_ADMIN_PASSWORD]: handleAdminPasswordState,
  [STATE_TYPES.AWAIT_ADMIN_STATION]: handleAdminStationState,
  [STATE_TYPES.ADMIN_MENU]: handleAdminMenuState,
  [STATE_TYPES.ASSIGN_TEAMS_CONFIRM]: handleAssignTeamsState,
  [STATE_TYPES.ASSIGN_TEAMS_RETRY]: handleAssignTeamsState,
  [STATE_TYPES.MY_STATION_MENU]: handleMyStationMenuState,
  [STATE_TYPES.MY_STATION_ACTIVE]: handleMyStationActiveState,
  [STATE_TYPES.STATUS_VIEW]: handleStatusViewState,
  [STATE_TYPES.MANAGE_LISTS_MENU]: handleStationsTeamsMenuState,
  [STATE_TYPES.EDIT_TEAMS_LIST]: handleTeamsListState,
  [STATE_TYPES.EDIT_STATIONS_LIST]: handleStationsListState,
  [STATE_TYPES.BOT_MESSAGES_MENU]: handleBotMessagesMenuState,
  [STATE_TYPES.MESSAGE_TRIGGER_MENU]: handleMessageTriggerMenuState,
  [STATE_TYPES.MESSAGE_RECORDING]: handleMessageRecordingState,
  [STATE_TYPES.MESSAGE_TEMPLATE_ACTIONS]: handleMessageTemplateActionsState,
  [STATE_TYPES.RESET_MENU]: handleResetConfirmState,
  [STATE_TYPES.RESET_CONFIRM]: handleResetConfirmState,
  [STATE_TYPES.IMPORT_WAIT_FILE]: handleImportWaitFileState,
  [STATE_TYPES.PARTICIPANT_HOME]: handleParticipantHomeState,
};

const directInputHandlers = {
  [INPUT_PARTICIPANT]: handleParticipantSelection,
  [INPUT_ORGANIZER]: handleOrganizerSelection,
  [INPUT_ADMIN]: handleOrganizerSelection,
  [INPUT_WRONG_ROLE]: handleWrongRoleSelection,
};

const textCommandHandlers = {
  start: handleStartCommand,
  help: handleHelpCommand,
  import: handleImportCommand,
};
const textCommandAliases = {
  [INPUT_START_VK]: "start",
};

export async function handleMessageNew(env, payload, state, vk, ctx) {
  const context = await createFlowContext(env, payload, vk);
  const commandHandler = findTextCommandHandler(context.input);

  if (commandHandler) {
    await commandHandler(env, payload, state, vk, ctx);
    return;
  }

  await handleDefaultUiMessage(env, payload, state, vk, ctx, context);
}

export async function handleDefaultUiMessage(env, payload, state, vk, ctx, providedContext = null) {
  const context = providedContext ?? (await createFlowContext(env, payload, vk));
  await normalizeNonAdminAdminState(context);

  if (context.input === INPUT_EXIT || context.action === ACTIONS.EXIT) {
    await handleGlobalExit(context);
    return;
  }

  if (context.action === ACTIONS.OPEN_ASSIGN_TEAMS && context.user?.is_admin) {
    await openAssignTeamsConfirm(context);
    return;
  }

  if (context.action === ACTIONS.OPEN_MY_STATION && context.user?.is_admin) {
    await openMyStationMenu(context);
    return;
  }

  if (context.action === ACTIONS.OPEN_STATUS && context.user?.is_admin) {
    await openStatusScreen(context);
    return;
  }

  if (context.action === ACTIONS.OPEN_BOT_MESSAGES && context.user?.is_admin) {
    await openBotMessagesMenu(context);
    return;
  }

  if (context.action === ACTIONS.OPEN_STATIONS_TEAMS && context.user?.is_admin) {
    await openStationsTeamsMenu(context);
    return;
  }

  if (context.action === ACTIONS.OPEN_RESET && context.user?.is_admin) {
    await openResetConfirm(context);
    return;
  }

  const stateHandler = stateHandlers[context.userState?.state_type];

  if (stateHandler) {
    const handled = await stateHandler(context);

    if (handled) {
      return;
    }
  }

  const directInputHandler = directInputHandlers[context.input];

  if (directInputHandler) {
    await directInputHandler(context);
    return;
  }

  if (context.input === INPUT_BACK) {
    await handleGlobalBack(context);
    return;
  }

  if (ADMIN_ONLY_ACTIONS.has(context.action) && !context.user?.is_admin) {
    await sendFallbackNonAdminScreen(context);
    return;
  }

  await sendWhoAreYouScreen(vk, context.peerId);
}

function findTextCommandHandler(input) {
  if (!input) {
    return null;
  }

  const normalizedInput = normalizeCommandInput(input);
  const resolvedCommand = textCommandAliases[normalizedInput] ?? normalizedInput;
  const commandName = Object.keys(textCommandHandlers).find((command) => resolvedCommand.startsWith(command));

  return commandName ? textCommandHandlers[commandName] : null;
}

function normalizeCommandInput(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.startsWith("/") ? normalized.slice(1) : normalized;
}

async function normalizeNonAdminAdminState(context) {
  const stateType = context.userState?.state_type;

  if (context.user?.is_admin || !ADMIN_ONLY_STATES.has(stateType)) {
    return;
  }

  if (context.user?.team_id) {
    await setUserState(context.env, context.user.id, STATE_TYPES.PARTICIPANT_HOME, "idle");
    context.userState = {
      state_type: STATE_TYPES.PARTICIPANT_HOME,
      step_key: "idle",
      payload: null,
    };
    return;
  }

  await clearUserState(context.env, context.user.id);
  context.userState = null;
}

async function sendFallbackNonAdminScreen(context) {
  if (context.user?.team_id) {
    await handleParticipantHomeState(context);
    return;
  }

  await sendWhoAreYouScreen(context.vk, context.peerId);
}
