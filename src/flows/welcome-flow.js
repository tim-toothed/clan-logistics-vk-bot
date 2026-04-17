import { getStations, findStationByName } from "../db/setup-repository.js";
import { clearUserState, setUserState } from "../db/user-state-repository.js";
import { ensureUser, resetUserRole, setUserAdminMode, setUserParticipantMode } from "../db/users-repository.js";
import {
  ADMIN_MENU_WELCOME_MESSAGE,
  BOT_START_MESSAGE,
  sendAdminMenuScreen,
  sendAdminStationChoiceScreen,
  sendAskAdminPasswordScreen,
  sendInvalidAdminStationScreen,
  sendInvalidPasswordScreen,
  sendParticipantHomeScreen,
  sendWhoAreYouScreen,
} from "../ui/screens.js";

export async function handleStartCommand(env, payload, state, vk) {
  const peerId = getPeerId(payload);
  const user = await ensureCurrentUser(env, payload);

  await resetUserRole(env, user.id);
  await clearUserState(env, user.id);
  await vk.sendText(peerId, BOT_START_MESSAGE);
  await sendWhoAreYouScreen(vk, peerId);
}

export async function handleParticipantSelection(context) {
  await setUserParticipantMode(context.env, context.user.id);
  await setUserState(context.env, context.user.id, "participant_home", "idle");
  await sendParticipantHomeScreen(context.vk, context.peerId);
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
