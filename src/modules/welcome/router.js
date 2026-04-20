import { ACTIONS } from "../../app/action-types.js";
import { ensureVkUser } from "../../app/ensure-user.js";
import { STATE_TYPES } from "../../app/state-types.js";
import { MESSAGE_TRIGGER_TYPES, getMessageByTrigger } from "../../db/messages-repository.js";
import { clearUserState, setUserState } from "../../db/user-state-repository.js";
import { resetUserRole, setUserAdminMode, setUserParticipantMode, setUserParticipantTeam } from "../../db/users-repository.js";
import { findStationByName, findTeamByName, getStations, getTeams } from "../../db/setup-repository.js";
import { sendAdminMenuScreen } from "../admin-home/screens.js";
import {
  ADMIN_MENU_WELCOME_MESSAGE,
  BOT_START_MESSAGE,
  BOT_START_MENU_HINT,
  sendAdminStationChoiceScreen,
  sendAskAdminPasswordScreen,
  sendInvalidAdminStationScreen,
  sendInvalidParticipantTeamScreen,
  sendInvalidPasswordScreen,
  sendParticipantHomeScreen,
  sendParticipantTeamChoiceScreen,
  sendWhoAreYouScreen,
} from "./screens.js";
import { createParticipantKeyboard } from "./keyboards.js";
import { sendTemplateSequence } from "../../utils/vk-message.js";
import { deliverParticipantContentWithAdminLog } from "../../utils/participant-delivery.js";

export async function handleStartCommand(env, payload, state, vk) {
  void state;
  const peerId = getPeerId(payload);
  const user = await ensureCurrentUser(env, payload, vk);

  await resetUserRole(env, user.id);
  await clearUserState(env, user.id);
  await sendStartTemplateOrFallback(env, vk, peerId);
  await sendWhoAreYouScreen(vk, peerId);
}

export async function handleParticipantSelection(context) {
  await setUserParticipantMode(context.env, context.user.id);
  const teams = await getTeams(context.env);

  await setUserState(context.env, context.user.id, STATE_TYPES.AWAIT_PARTICIPANT_TEAM, "wait_team_choice");
  await sendParticipantTeamChoiceScreen(context.vk, context.peerId, teams);
}

export async function handleOrganizerSelection(context) {
  await setUserState(context.env, context.user.id, STATE_TYPES.AWAIT_ADMIN_PASSWORD, "wait_password");
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
    await setUserState(context.env, context.user.id, STATE_TYPES.AWAIT_ADMIN_PASSWORD, "wait_password");
    await sendInvalidPasswordScreen(context.vk, context.peerId);
    return true;
  }

  const stations = await getStations(context.env);

  await setUserState(context.env, context.user.id, STATE_TYPES.AWAIT_ADMIN_STATION, "wait_station_choice");
  await sendAdminStationChoiceScreen(
    context.vk,
    context.peerId,
    stations.map((station) => station.station_name),
  );
  return true;
}

export async function handleParticipantTeamState(context) {
  if (context.action === ACTIONS.BACK_TO_WHO_ARE_YOU || context.input === "назад") {
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
  await setUserState(context.env, context.user.id, STATE_TYPES.PARTICIPANT_HOME, "idle");
  await sendParticipantTemplateOrFallback(context, selectedTeam);
  return true;
}

export async function handleAdminStationState(context) {
  if (context.input === "назад") {
    await resetToWhoAreYou(context);
    return true;
  }

  if (context.input === "войти как админ") {
    await setUserAdminMode(context.env, context.user.id, null);
    await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
    await sendAdminMenuScreen(context.vk, context.peerId, {
      env: context.env,
      message: ADMIN_MENU_WELCOME_MESSAGE,
      user: { ...context.user, is_admin: 1, station_id: null },
    });
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
  await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
  await sendAdminMenuScreen(context.vk, context.peerId, {
    env: context.env,
    message: `Вы вошли как организатор станции "${selectedStation.station_name}".`,
    user: { ...context.user, is_admin: 1, station_id: selectedStation.id },
  });
  return true;
}

async function resetToWhoAreYou(context) {
  await resetUserRole(context.env, context.user.id);
  await clearUserState(context.env, context.user.id);
  await sendWhoAreYouScreen(context.vk, context.peerId);
}

async function ensureCurrentUser(env, payload, vk) {
  const vkUserId = payload?.object?.message?.from_id;

  if (!vkUserId) {
    throw new Error("VK payload did not contain from_id");
  }

  return ensureVkUser(env, vk, vkUserId);
}

function getPeerId(payload) {
  return payload?.object?.message?.peer_id;
}

async function sendStartTemplateOrFallback(env, vk, peerId) {
  const template = await getMessageByTrigger(env, MESSAGE_TRIGGER_TYPES.BOT_START, null);

  if (template?.content_items?.length) {
    await sendTemplateSequence(vk, peerId, appendStartMenuHint(template.content_items));
    return;
  }

  await vk.sendText(peerId, `${BOT_START_MESSAGE}\n\n${BOT_START_MENU_HINT}`);
}

async function sendParticipantTemplateOrFallback(context, team) {
  const template = await getMessageByTrigger(context.env, MESSAGE_TRIGGER_TYPES.PARTICIPANT_WELCOME, null);
  const contentItems = template?.content_items?.length
    ? template.content_items
    : [{ text: PARTICIPANT_WELCOME_MESSAGE, attachments: [] }];
  const deliveryReport = await deliverParticipantContentWithAdminLog(context, {
    label: "\u041f\u0440\u0438\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043d\u043d\u043e\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u0443\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u0443",
    stepLabel: "\u0412\u0445\u043e\u0434 \u0443\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u0430",
    teamId: team.id,
    teamName: team.team_name,
    stationName: null,
    initiatedByName: context.user?.display_name ?? `VK ${context.peerId}`,
    recipients: [
      {
        peerId: context.peerId,
        displayName: context.user?.display_name ?? `VK ${context.peerId}`,
      },
    ],
    contentItems,
    keyboard: createParticipantKeyboard(),
  });

  if (!deliveryReport.ok) {
    throw new Error(deliveryReport.failedRecipients.map((item) => item.errorMessage).filter(Boolean).join("; ") || "Participant welcome delivery failed");
  }
}

async function findTeamByIdFromList(env, teamId) {
  const teams = await getTeams(env);
  return teams.find((team) => Number(team.id) === Number(teamId)) ?? null;
}

function appendStartMenuHint(contentItems) {
  const items = Array.isArray(contentItems) ? contentItems.map((item) => ({ ...item })) : [];

  if (!items.length) {
    return [{ text: BOT_START_MENU_HINT, attachments: [] }];
  }

  const lastItem = items.at(-1);
  const lastText = typeof lastItem?.text === "string" ? lastItem.text.trimEnd() : "";
  lastItem.text = lastText ? `${lastText}\n\n${BOT_START_MENU_HINT}` : BOT_START_MENU_HINT;

  return items;
}
