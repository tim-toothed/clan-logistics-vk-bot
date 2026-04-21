import { ACTIONS } from "../../app/action-types.js";
import { STATE_TYPES } from "../../app/state-types.js";
import { getCompletedEventDurationsForStation, getStationProgressSummary, getTeamById } from "../../db/events-repository.js";
import { getTeams } from "../../db/setup-repository.js";
import { setUserState } from "../../db/user-state-repository.js";
import { listAdminUsersByStation, listParticipantUsersByTeam } from "../../db/users-repository.js";
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
    await sendAdminMenuScreen(context.vk, context.peerId, { env: context.env, user: context.user });
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
    const currentParticipants = currentTeam ? await listParticipantUsersByTeam(env, currentTeam.id) : [];
    const admins = await listAdminUsersByStation(env, station.id);
    const completedCount = Number(station.completed_teams_count ?? 0);
    const remainingCount = Math.max(0, totalTeams - completedCount);
    const durationSummary = formatDurationSummary(station.avg_duration_seconds, durations);

    sections.push(
      buildStationSection({
        stationName: station.station_name,
        status: station.status,
        currentTeamName: currentTeam?.team_name ?? null,
        currentParticipants,
        admins,
        remainingCount,
        totalTeams,
        durationSummary,
      }),
    );
  }

  return ["Статистика", sections.join("\n\n--------------------\n\n")].join("\n");
}

function buildStationSection({
  stationName,
  status,
  currentTeamName,
  currentParticipants,
  admins,
  remainingCount,
  totalTeams,
  durationSummary,
}) {
  const lines = [`${formatStationStatusEmoji(status)}${stationName}`];

  if (status === "occupied" && currentTeamName) {
    const participantLinks = formatParticipantLinks(currentParticipants);
    const participantSuffix = participantLinks ? ` (${participantLinks})` : "";
    lines.push(`Текущая команда: ${currentTeamName}${participantSuffix}`);
  }

  lines.push(`Организаторы: ${formatParticipantLinks(admins) || "не назначены"}`);
  lines.push(`Осталось команд: ${remainingCount}/${totalTeams}`);
  lines.push(`Среднее время: ${durationSummary}`);

  return lines.join("\n");
}

function formatParticipantLinks(participants) {
  return participants
    .map((participant) => `[${participant.displayName}](https://vk.com/im/convo/${participant.vkUserId})`)
    .join(" | ");
}

function formatStationStatusEmoji(status) {
  switch (status) {
    case "occupied":
      return "🎯";
    case "done":
      return "✅";
    default:
      return "🆓";
  }
}

function formatDurationSummary(avgDurationSeconds, durations) {
  const roundedValues = durations
    .map((item) => roundDurationMinutes(item.duration_seconds))
    .filter((value) => value !== null);
  const roundedAverage = roundDurationMinutes(avgDurationSeconds);

  if (roundedAverage === null) {
    return "нет данных";
  }

  if (!roundedValues.length) {
    return `${roundedAverage} мин`;
  }

  return `${roundedAverage} мин (${roundedValues.join(" | ")} мин)`;
}

function roundDurationMinutes(value) {
  if (!value && value !== 0) {
    return null;
  }

  const totalSeconds = Math.max(0, Number(value));
  return Math.round(totalSeconds / 60);
}
