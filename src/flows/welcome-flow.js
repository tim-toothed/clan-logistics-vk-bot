import { findStationByName, findTeamByName, getStations, getTeams } from "../db/setup-repository.js";
import { MESSAGE_TRIGGER_TYPES, getMessageByTrigger } from "../db/messages-repository.js";
import { clearUserState, setUserState } from "../db/user-state-repository.js";
import { ensureUser, resetUserRole, setUserAdminMode, setUserParticipantMode, setUserParticipantTeam } from "../db/users-repository.js";
import {
  ADMIN_MENU_WELCOME_MESSAGE,
  BOT_START_MESSAGE,
  sendAdminMenuScreen,
  sendAdminStationChoiceScreen,
  sendAskAdminPasswordScreen,
  sendInvalidAdminStationScreen,
  sendInvalidPasswordScreen,
  sendParticipantHomeScreen,
  sendParticipantTeamChoiceScreen,
  sendInvalidParticipantTeamScreen,
  sendWhoAreYouScreen,
} from "../ui/screens.js";
import { createParticipantKeyboard } from "../ui/keyboards.js";
import { sendTemplateSequence } from "../utils/vk-message.js";

export async function handleStartCommand(env, payload, state, vk) {
  const peerId = getPeerId(payload);
  const user = await ensureCurrentUser(env, payload);

  await resetUserRole(env, user.id);
  await clearUserState(env, user.id);
  await sendStartTemplateOrFallback(env, vk, peerId);
  await sendWhoAreYouScreen(vk, peerId);
}

export async function handleParticipantSelection(context) {
  await setUserParticipantMode(context.env, context.user.id);
  const teams = await getTeams(context.env);

  await setUserState(context.env, context.user.id, "await_participant_team", "wait_team_choice");
  await sendParticipantTeamChoiceScreen(context.vk, context.peerId, teams);
}

export async function handleOrganizerSelection(context) {
  await setUserState(context.env, context.user.id, "await_admin_password", "wait_password");
  await sendAskAdminPasswordScreen(context.vk, context.peerId);
}

export async function handleWrongRoleSelection(context) {
  await resetToWhoAreYou(context);
}

export async function handleGlobalBack(context) {
  await resetToWhoAreYou(context);
}

export async function handleGlobalExit(context) {
  await resetToWhoAreYou(context);
}

export async function handleAdminPasswordState(context) {
  if (context.input === "назад") {
    await resetToWhoAreYou(context);
    return true;
  }

  const adminPassword = context.env.ADMIN_PASSWORD ?? "admin";

  if (context.input !== adminPassword.toLowerCase()) {
    await setUserState(context.env, context.user.id, "await_admin_password", "wait_password");
    await sendInvalidPasswordScreen(context.vk, context.peerId);
    return true;
  }

  const stations = await getStations(context.env);

  await setUserState(context.env, context.user.id, "await_admin_station", "wait_station_choice");
  await sendAdminStationChoiceScreen(
    context.vk,
    context.peerId,
    stations.map((station) => station.station_name),
  );
  return true;
}

export async function handleParticipantTeamState(context) {
  if (context.action === "back_to_who_are_you" || context.input === "назад") {
    await resetToWhoAreYou(context);
    return true;
  }

  const selectedTeam = context.buttonPayload?.teamId
    ? await findTeamByIdFromList(context.env, context.buttonPayload.teamId)
    : await findTeamByName(context.env, context.rawText);

  if (!selectedTeam) {
    const teams = await getTeams(context.env);
    await sendInvalidParticipantTeamScreen(context.vk, context.peerId, teams);
    return true;
  }

  await setUserParticipantTeam(context.env, context.user.id, selectedTeam.id);
  await setUserState(context.env, context.user.id, "participant_home", "idle");
  await sendParticipantTemplateOrFallback(context.env, context.vk, context.peerId);
  return true;
}

export async function handleAdminStationState(context) {
  if (context.input === "назад") {
    await resetToWhoAreYou(context);
    return true;
  }

  if (context.input === "войти как админ") {
    await setUserAdminMode(context.env, context.user.id, null);
    await setUserState(context.env, context.user.id, "admin_menu", "idle");
    await sendAdminMenuScreen(context.vk, context.peerId, ADMIN_MENU_WELCOME_MESSAGE);
    return true;
  }

  const selectedStation = await findStationByName(context.env, context.rawText);

  if (!selectedStation) {
    const stations = await getStations(context.env);

    await sendInvalidAdminStationScreen(
      context.vk,
      context.peerId,
      stations.map((station) => station.station_name),
    );
    return true;
  }

  await setUserAdminMode(context.env, context.user.id, selectedStation.id);
  await setUserState(context.env, context.user.id, "admin_menu", "idle");
  await sendAdminMenuScreen(context.vk, context.peerId, `Вы вошли как организатор станции "${selectedStation.station_name}".`);
  return true;
}

async function resetToWhoAreYou(context) {
  await resetUserRole(context.env, context.user.id);
  await clearUserState(context.env, context.user.id);
  await sendWhoAreYouScreen(context.vk, context.peerId);
}

async function ensureCurrentUser(env, payload) {
  const vkUserId = payload?.object?.message?.from_id;

  if (!vkUserId) {
    throw new Error("VK payload did not contain from_id");
  }

  return ensureUser(env, vkUserId);
}

function getPeerId(payload) {
  return payload?.object?.message?.peer_id;
}

async function sendStartTemplateOrFallback(env, vk, peerId) {
  const template = await getMessageByTrigger(env, MESSAGE_TRIGGER_TYPES.BOT_START, null);

  if (template?.content_items?.length) {
    await sendTemplateSequence(vk, peerId, template.content_items);
    return;
  }

  await vk.sendText(peerId, BOT_START_MESSAGE);
}

async function sendParticipantTemplateOrFallback(env, vk, peerId) {
  const template = await getMessageByTrigger(env, MESSAGE_TRIGGER_TYPES.PARTICIPANT_WELCOME, null);

  if (template?.content_items?.length) {
    await sendTemplateSequence(vk, peerId, template.content_items, {
      keyboard: createParticipantKeyboard(),
    });
    return;
  }

  await sendParticipantHomeScreen(vk, peerId);
}

async function findTeamByIdFromList(env, teamId) {
  const teams = await getTeams(env);
  return teams.find((team) => Number(team.id) === Number(teamId)) ?? null;
}
