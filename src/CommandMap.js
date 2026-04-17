import { handleHelpCommand } from "./commands/help.js";
import { getUserState } from "./db/user-state-repository.js";
import { ensureUser } from "./db/users-repository.js";
import { handleAdminMenuState, handleParticipantHomeState } from "./flows/admin-menu-flow.js";
import {
  handleAdminPasswordState,
  handleAdminStationState,
  handleGlobalBack,
  handleGlobalExit,
  handleOrganizerSelection,
  handleParticipantSelection,
  handleStartCommand,
  handleWrongRoleSelection,
} from "./flows/welcome-flow.js";
import { handleStationsListState, handleStationsTeamsMenuState, handleTeamsListState } from "./flows/stations-teams-flow.js";
import { normalizeText } from "./utils/text.js";
import { sendWhoAreYouScreen } from "./ui/screens.js";

const stateHandlers = {
  await_admin_password: handleAdminPasswordState,
  await_admin_station: handleAdminStationState,
  admin_menu: handleAdminMenuState,
  manage_lists_menu: handleStationsTeamsMenuState,
  edit_teams_list: handleTeamsListState,
  edit_stations_list: handleStationsListState,
  participant_home: handleParticipantHomeState,
};

const directInputHandlers = {
  участник: handleParticipantSelection,
  организатор: handleOrganizerSelection,
  админ: handleOrganizerSelection,
  "перепутал, я организатор": handleWrongRoleSelection,
  выйти: handleGlobalExit,
};

const commandMap = {
  message_new: {
    handleTextMessage: handleMessageNew,
  },
  start: {
    handleCommand: handleStartCommand,
  },
  help: {
    handleCommand: handleHelpCommand,
  },
  default: {
    handleTextMessage: handleDefaultUiMessage,
  },
};

export default commandMap;

async function handleMessageNew(env, payload, state, vk, ctx) {
  const context = await createFlowContext(env, payload, vk);
  const pendingCommand = state.pendingMessages[`${context.vkUserId}-${context.peerId}`];

  if (pendingCommand) {
    const pendingHandler = commandMap[pendingCommand.command];

    if (pendingHandler && typeof pendingHandler.handlePendingMessage === "function") {
      await pendingHandler.handlePendingMessage(env, payload, state, vk, ctx);
      return;
    }
  }

  const command = findCommand(context.input);

  if (command) {
    const commandHandler = commandMap[command];

    if (commandHandler && typeof commandHandler.handleCommand === "function") {
      await commandHandler.handleCommand(env, payload, state, vk, ctx);
      return;
    }

    if (typeof commandHandler === "function") {
      await commandHandler(env, payload, state, vk, ctx);
      return;
    }
  }

  await commandMap.default.handleTextMessage(env, payload, state, vk, ctx, context);
}

async function handleDefaultUiMessage(env, payload, state, vk, ctx, providedContext = null) {
  const context = providedContext ?? (await createFlowContext(env, payload, vk));
  const directInputHandler = directInputHandlers[context.input];

  if (directInputHandler) {
    await directInputHandler(context);
    return;
  }

  const stateHandler = stateHandlers[context.userState?.state_type];

  if (stateHandler) {
    const handled = await stateHandler(context);

    if (handled) {
      return;
    }
  }

  if (context.input === "назад") {
    await handleGlobalBack(context);
    return;
  }

  await sendWhoAreYouScreen(vk, context.peerId);
}

async function createFlowContext(env, payload, vk) {
  const peerId = payload?.object?.message?.peer_id;
  const vkUserId = payload?.object?.message?.from_id;

  if (!peerId || !vkUserId) {
    throw new Error("VK payload did not contain peer_id or from_id");
  }

  const rawText = getMessageText(payload);
  const user = await ensureUser(env, vkUserId);
  const userState = await getUserState(env, user.id);

  return {
    env,
    payload,
    vk,
    peerId,
    vkUserId,
    rawText,
    input: normalizeText(rawText),
    user,
    userState,
  };
}

function getMessageText(payload) {
  return payload?.object?.message?.text ?? "";
}

function findCommand(input) {
  if (!input) {
    return "";
  }

  const commandKeys = Object.keys(commandMap).filter((key) => {
    return !isSystemCommandKey(key);
  });

  const normalizedInput = normalizeCommandInput(input);

  return (
    commandKeys.find((command) => {
      return normalizedInput.startsWith(normalizeCommandInput(command));
    }) ?? ""
  );
}

function isSystemCommandKey(key) {
  return key === "message_new" || key === "default" || key === "cron";
}

function normalizeCommandInput(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.startsWith("/") ? normalized.slice(1) : normalized;
}
