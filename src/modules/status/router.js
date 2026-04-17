import { ACTIONS } from "../../app/action-types.js";
import { STATE_TYPES } from "../../app/state-types.js";
import { getCompletedEventDurationsForStation, getStationProgressSummary, getTeamById } from "../../db/events-repository.js";
import { getTeams } from "../../db/setup-repository.js";
import { setUserState } from "../../db/user-state-repository.js";
import { listAdminLabelsByStation } from "../../db/users-repository.js";
import { sendAdminMenuScreen } from "../admin-home/screens.js";
import { sendStatusScreen } from "./screens.js";

export async function openStatusScreen(context) {
  const summaryText = await buildStatusSummary(context.env);

  await setUserState(context.env, context.user.id, STATE_TYPES.STATUS_VIEW, "idle");
  await sendStatusScreen(context.vk, context.peerId, summaryText);
  return true;
}

export async function handleStatusViewState(context) {
  if (context.input === "назад" || context.action === ACTIONS.BACK_TO_ADMIN_MENU) {
    await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
    await sendAdminMenuScreen(context.vk, context.peerId);
    return true;
  }

  return openStatusScreen(context);
}

async function buildStatusSummary(env) {
  const stations = await getStationProgressSummary(env);
  const teams = await getTeams(env);
  const totalTeams = teams.length;
  const sections = [];

  if (!stations.length) {
    return "Станции пока не добавлены.";
  }

  for (const station of stations) {
    const durations = await getCompletedEventDurationsForStation(env, station.id);
    const currentTeam = station.current_team_id ? await getTeamById(env, station.current_team_id) : null;
    const admins = await listAdminLabelsByStation(env, station.id);
    const completedCount = Number(station.completed_teams_count ?? 0);
    const avgDuration = formatDuration(station.avg_duration_seconds);
    const timesList = durations.length ? durations.map((item) => formatDuration(item.duration_seconds)).join(", ") : "нет данных";
    const remainingCount = Math.max(0, totalTeams - completedCount);
    const currentTeamLine = currentTeam ? currentTeam.team_name : "нет";

    sections.push(
      [
        station.station_name,
        `Статус: ${formatStationStatus(station.status)}`,
        `Текущая команда: ${currentTeamLine}`,
        `Организаторы: ${admins.length ? admins.join(", ") : "не назначены"}`,
        `Осталось команд: ${remainingCount}`,
        `Среднее время: ${avgDuration}`,
        `Все времена: ${timesList}`,
      ].join("\n"),
    );
  }

  return [
    "Положение дел",
    `Обновлено: ${new Date().toLocaleString("ru-RU")}`,
    `Станций: ${stations.length}`,
    `Команд: ${totalTeams}`,
    "",
    sections.join("\n\n--------------------\n\n"),
  ].join("\n");
}

function formatStationStatus(status) {
  switch (status) {
    case "occupied":
      return "занята";
    case "done":
      return "завершена";
    default:
      return "свободна";
  }
}

function formatDuration(value) {
  if (!value && value !== 0) {
    return "нет данных";
  }

  const totalSeconds = Math.max(0, Math.round(Number(value)));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}м ${seconds}с`;
}
