import {
  completeStationForTeam,
  getActiveEventForStation,
  getAvailableTeamsForStation,
  getCandidateStationsForTeam,
  getPendingTeamsForStation,
  getRemainingStationsForTeam,
  getStationById,
  getTeamById,
  getWaitingTeams,
  hasStationCompletedAllTeams,
  hasTeamCompletedAllStations,
  setTeamStatus,
  startStationForTeam,
} from "../db/events-repository.js";
import { MESSAGE_TRIGGER_TYPES, getMessageByTrigger } from "../db/messages-repository.js";
import { setUserState } from "../db/user-state-repository.js";
import { listAdminPeerIdsByStation, listParticipantPeerIdsByTeam } from "../db/users-repository.js";
import { sendActiveStationScreen, sendAdminMenuScreen, sendMyStationMenuScreen, sendMyStationUnavailableScreen } from "../ui/screens.js";
import { sendTemplateSequence } from "../utils/vk-message.js";

const WAITING_FALLBACK_MESSAGE = [{ text: "Свободных станций пока нет. Пожалуйста, ожидайте дальнейших указаний.", attachments: [] }];
const FINISHED_FALLBACK_MESSAGE = [{ text: "Вы прошли все станции. Ожидайте дальнейших указаний от организаторов.", attachments: [] }];

export async function openMyStationMenu(context) {
  if (!context.user.station_id) {
    await sendMyStationUnavailableScreen(context.vk, context.peerId);
    return true;
  }

  const activeEvent = await getActiveEventForStation(context.env, context.user.station_id);

  if (activeEvent) {
    const activeTeam = await getTeamById(context.env, activeEvent.team_id);
    await setUserState(context.env, context.user.id, "my_station_active", "active", {
      teamId: activeEvent.team_id,
    });
    await sendActiveStationScreen(context.vk, context.peerId, activeTeam?.team_name ?? "Неизвестная команда", activeEvent.team_id);
    return true;
  }

  const availableTeams = await getAvailableTeamsForStation(context.env, context.user.station_id);

  await setUserState(context.env, context.user.id, "my_station_menu", "idle");
  await sendMyStationMenuScreen(context.vk, context.peerId, availableTeams);
  return true;
}

export async function handleMyStationMenuState(context) {
  if (context.action === "back_to_admin_menu" || context.input === "назад") {
    await setUserState(context.env, context.user.id, "admin_menu", "idle");
    await sendAdminMenuScreen(context.vk, context.peerId);
    return true;
  }

  if (context.action !== "station_team_select" || !context.buttonPayload?.teamId) {
    return openMyStationMenu(context);
  }

  if (!context.user.station_id) {
    await sendMyStationUnavailableScreen(context.vk, context.peerId);
    return true;
  }

  const team = await getTeamById(context.env, context.buttonPayload.teamId);

  if (!team) {
    return openMyStationMenu(context);
  }

  const startedAt = new Date().toISOString();

  await startStationForTeam(context.env, {
    stationId: context.user.station_id,
    teamId: team.id,
    startedByUserId: context.user.id,
    startTime: startedAt,
  });

  await setUserState(context.env, context.user.id, "my_station_active", "active", {
    teamId: team.id,
  });
  await sendActiveStationScreen(context.vk, context.peerId, team.team_name, team.id);
  return true;
}

export async function handleMyStationActiveState(context) {
  if (context.action !== "station_finish") {
    return true;
  }

  if (!context.user.station_id) {
    await sendMyStationUnavailableScreen(context.vk, context.peerId);
    return true;
  }

  const activeEvent = await getActiveEventForStation(context.env, context.user.station_id);

  if (!activeEvent) {
    return openMyStationMenu(context);
  }

  const team = await getTeamById(context.env, activeEvent.team_id);
  const station = await getStationById(context.env, context.user.station_id);
  const finishedAt = new Date().toISOString();

  const stationWillBeDone = await willStationBeDoneAfterCurrentFinish(context, station.id, team.id);
  const teamWillBeFinished = await willTeamBeFinishedAfterCurrentFinish(context, team.id);

  await completeStationForTeam(context.env, {
    eventId: activeEvent.id,
    stationId: station.id,
    teamId: team.id,
    endedByUserId: context.user.id,
    endTime: finishedAt,
    stationDone: stationWillBeDone,
    teamStatus: teamWillBeFinished ? "finished" : "waiting_start",
  });

  if (teamWillBeFinished) {
    await deliverTemplateToTeam(context, team.id, MESSAGE_TRIGGER_TYPES.TEAM_FINISHED_ALL, null, FINISHED_FALLBACK_MESSAGE);
  } else {
    const nextStation = await chooseNextFreeStation(context, team.id);

    if (nextStation) {
      await deliverTemplateToTeam(
        context,
        team.id,
        MESSAGE_TRIGGER_TYPES.GO_TO_STATION,
        nextStation.id,
        [{ text: `Ваша следующая станция: ${nextStation.station_name}`, attachments: [] }],
      );
    } else {
      await setTeamStatus(context.env, team.id, "waiting_station");
      await deliverTemplateToTeam(context, team.id, MESSAGE_TRIGGER_TYPES.WAIT_FOR_STATION, null, WAITING_FALLBACK_MESSAGE);
    }
  }

  if (stationWillBeDone) {
    await notifyStationAdmins(context, station.id, "Вашу станцию прошли все команды!");
    await context.vk.sendText(context.peerId, "Вашу станцию прошли все команды!");
  }

  await dispatchWaitingTeams(context);

  return openMyStationMenu(context);
}

async function willStationBeDoneAfterCurrentFinish(context, stationId, currentTeamId) {
  const alreadyDone = await hasStationCompletedAllTeams(context.env, stationId);

  if (alreadyDone) {
    return true;
  }

  const remainingTeams = await getPendingTeamsForStation(context.env, stationId);
  return remainingTeams.filter((team) => team.id !== currentTeamId).length === 0;
}

async function willTeamBeFinishedAfterCurrentFinish(context, teamId) {
  const alreadyDone = await hasTeamCompletedAllStations(context.env, teamId);

  if (alreadyDone) {
    return true;
  }

  const remainingStations = await getRemainingStationsForTeam(context.env, teamId);
  return remainingStations.length === 1;
}

async function deliverTemplateToTeam(context, teamId, triggerType, stationId, fallbackContent) {
  const template = await getMessageByTrigger(context.env, triggerType, stationId);
  const peerIds = await listParticipantPeerIdsByTeam(context.env, teamId);
  const contentItems = template?.content_items?.length ? template.content_items : fallbackContent;

  for (const peerId of peerIds) {
    await sendTemplateSequence(context.vk, peerId, contentItems);
  }
}

async function notifyStationAdmins(context, stationId, message) {
  const peerIds = await listAdminPeerIdsByStation(context.env, stationId);

  for (const peerId of peerIds) {
    if (peerId === context.peerId) {
      continue;
    }

    await context.vk.sendText(peerId, message);
  }
}

async function dispatchWaitingTeams(context) {
  const waitingTeams = await getWaitingTeams(context.env);
  const reservedStationIds = new Set();

  for (const team of waitingTeams) {
    const nextStation = await chooseNextFreeStation(context, team.id, reservedStationIds);

    if (!nextStation) {
      continue;
    }

    reservedStationIds.add(nextStation.id);
    await setTeamStatus(context.env, team.id, "waiting_start");
    await deliverTemplateToTeam(
      context,
      team.id,
      MESSAGE_TRIGGER_TYPES.GO_TO_STATION,
      nextStation.id,
      [{ text: `Ваша следующая станция: ${nextStation.station_name}`, attachments: [] }],
    );
  }
}

async function chooseNextFreeStation(context, teamId, reservedStationIds = new Set()) {
  const candidates = await getCandidateStationsForTeam(context.env, teamId);
  return candidates.find((candidate) => !reservedStationIds.has(candidate.id)) ?? null;
}
