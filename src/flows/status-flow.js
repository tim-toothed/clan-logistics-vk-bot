import { getCompletedEventDurationsForStation, getStationProgressSummary, getTeamById } from "../db/events-repository.js";
import { getTeams } from "../db/setup-repository.js";
import { setUserState } from "../db/user-state-repository.js";
import { listAdminLabelsByStation } from "../db/users-repository.js";
import { sendAdminMenuScreen, sendStatusScreen } from "../ui/screens.js";

export async function openStatusScreen(context) {
  const summaryText = await buildStatusSummary(context.env);

  await setUserState(context.env, context.user.id, "status_view", "idle");
  await sendStatusScreen(context.vk, context.peerId, summaryText);
  return true;
}

export async function handleStatusViewState(context) {
  if (context.input === "назад" || context.action === "back_to_admin_menu") {
    await setUserState(context.env, context.user.id, "admin_menu", "idle");
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
    const timesList = durations.length ? durations.map((item) => formatDuration(item.duration_seconds)).join(" | ") : "нет данных";
    const remainingCount = Math.max(0, totalTeams - completedCount);

    sections.push(
      [
        station.station_name,
        `Организаторы: ${admins.length ? admins.join(", ") : "не назначены"}`,
        `Статус: ${formatStationStatus(station.status)}${currentTeam ? `, сейчас команда ${currentTeam.team_name}` : ""}`,
        `avg_time прохождения: ${avgDuration} (${timesList})`,
        `Команд прошло: ${completedCount}`,
        `Осталось команд: ${remainingCount}`,
      ].join("\n"),
    );
  }

  return `Статистика на ${new Date().toLocaleString("ru-RU")}\n\n${sections.join("\n\n")}`;
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
