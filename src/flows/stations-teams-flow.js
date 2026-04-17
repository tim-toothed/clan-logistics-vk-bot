import { getStations, getTeams, replaceStations, replaceTeams } from "../db/setup-repository.js";
import { setUserState } from "../db/user-state-repository.js";
import { formatNamedRows, formatStringList, parseNumberedList } from "../utils/text.js";
import {
  sendAdminMenuScreen,
  sendInvalidListFormatScreen,
  sendStationsEditPromptScreen,
  sendStationsTeamsMenuScreen,
  sendStationsUpdatedScreen,
  sendTeamsEditPromptScreen,
  sendTeamsUpdatedScreen,
} from "../ui/screens.js";

export async function handleStationsTeamsMenuState(context) {
  if (context.input === "назад") {
    await setUserState(context.env, context.user.id, "admin_menu", "idle");
    await sendAdminMenuScreen(context.vk, context.peerId);
    return true;
  }

  if (context.input === "команды") {
    const teams = await getTeams(context.env);

    await setUserState(context.env, context.user.id, "edit_teams_list", "wait_list");
    await sendTeamsEditPromptScreen(context.vk, context.peerId, formatNamedRows(teams, "team_name"));
    return true;
  }

  if (context.input === "станции") {
    const stations = await getStations(context.env);

    await setUserState(context.env, context.user.id, "edit_stations_list", "wait_list");
    await sendStationsEditPromptScreen(context.vk, context.peerId, formatNamedRows(stations, "station_name"));
    return true;
  }

  await sendStationsTeamsMenuScreen(context.vk, context.peerId);
  return true;
}

export async function handleTeamsListState(context) {
  if (context.input === "назад") {
    await setUserState(context.env, context.user.id, "manage_lists_menu", "idle");
    await sendStationsTeamsMenuScreen(context.vk, context.peerId);
    return true;
  }

  const teamNames = parseNumberedList(context.rawText);

  if (!teamNames) {
    await sendInvalidListFormatScreen(context.vk, context.peerId);
    return true;
  }

  await replaceTeams(context.env, teamNames);
  await setUserState(context.env, context.user.id, "manage_lists_menu", "idle");
  await sendTeamsUpdatedScreen(context.vk, context.peerId, formatStringList(teamNames));
  return true;
}

export async function handleStationsListState(context) {
  if (context.input === "назад") {
    await setUserState(context.env, context.user.id, "manage_lists_menu", "idle");
    await sendStationsTeamsMenuScreen(context.vk, context.peerId);
    return true;
  }

  const stationNames = parseNumberedList(context.rawText);

  if (!stationNames) {
    await sendInvalidListFormatScreen(context.vk, context.peerId);
    return true;
  }

  await replaceStations(context.env, stationNames);
  await setUserState(context.env, context.user.id, "manage_lists_menu", "idle");
  await sendStationsUpdatedScreen(context.vk, context.peerId, formatStringList(stationNames));
  return true;
}
