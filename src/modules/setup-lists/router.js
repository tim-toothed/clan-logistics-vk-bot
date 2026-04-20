import { STATE_TYPES } from "../../app/state-types.js";
import {
  formatStationDefinitions,
  getStations,
  getTeams,
  parseStationDefinitions,
  replaceStations,
  replaceTeams,
} from "../../db/setup-repository.js";
import { setUserState } from "../../db/user-state-repository.js";
import { formatNamedRows, formatStringList, parseNumberedList } from "../../utils/text.js";
import { sendAdminMenuScreen } from "../admin-home/screens.js";
import {
  sendInvalidListFormatScreen,
  sendStationsEditPromptScreen,
  sendStationsTeamsMenuScreen,
  sendStationsUpdatedScreen,
  sendTeamsEditPromptScreen,
  sendTeamsUpdatedScreen,
} from "./screens.js";

export async function openStationsTeamsMenu(context) {
  await setUserState(context.env, context.user.id, STATE_TYPES.MANAGE_LISTS_MENU, "idle");
  await sendStationsTeamsMenuScreen(context.vk, context.peerId);
  return true;
}

export async function handleStationsTeamsMenuState(context) {
  if (context.input === "назад") {
    await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
    await sendAdminMenuScreen(context.vk, context.peerId, { env: context.env, user: context.user });
    return true;
  }

  if (context.input === "команды") {
    const teams = await getTeams(context.env);

    await setUserState(context.env, context.user.id, STATE_TYPES.EDIT_TEAMS_LIST, "wait_list");
    await sendTeamsEditPromptScreen(context.vk, context.peerId, formatNamedRows(teams, "team_name"));
    return true;
  }

  if (context.input === "станции") {
    const stations = await getStations(context.env);

    await setUserState(context.env, context.user.id, STATE_TYPES.EDIT_STATIONS_LIST, "wait_list");
    await sendStationsEditPromptScreen(context.vk, context.peerId, formatStationDefinitions(stations));
    return true;
  }

  await sendStationsTeamsMenuScreen(context.vk, context.peerId);
  return true;
}

export async function handleTeamsListState(context) {
  if (context.input === "назад") {
    await setUserState(context.env, context.user.id, STATE_TYPES.MANAGE_LISTS_MENU, "idle");
    await sendStationsTeamsMenuScreen(context.vk, context.peerId);
    return true;
  }

  const teamNames = parseNumberedList(context.rawText);

  if (!teamNames) {
    await sendInvalidListFormatScreen(context.vk, context.peerId);
    return true;
  }

  await replaceTeams(context.env, teamNames);
  await setUserState(context.env, context.user.id, STATE_TYPES.MANAGE_LISTS_MENU, "idle");
  await sendTeamsUpdatedScreen(context.vk, context.peerId, formatStringList(teamNames));
  return true;
}

export async function handleStationsListState(context) {
  if (context.input === "назад") {
    await setUserState(context.env, context.user.id, STATE_TYPES.MANAGE_LISTS_MENU, "idle");
    await sendStationsTeamsMenuScreen(context.vk, context.peerId);
    return true;
  }

  const stationNames = parseNumberedList(context.rawText);
  const stationDefinitions = parseStationDefinitions(stationNames);

  if (!stationNames || !stationDefinitions) {
    await sendInvalidListFormatScreen(context.vk, context.peerId);
    return true;
  }

  await replaceStations(context.env, stationDefinitions);
  await setUserState(context.env, context.user.id, STATE_TYPES.MANAGE_LISTS_MENU, "idle");
  await sendStationsUpdatedScreen(
    context.vk,
    context.peerId,
    formatStationDefinitions(stationDefinitions),
  );
  return true;
}
