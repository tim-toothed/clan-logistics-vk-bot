import { ACTIONS } from "../../app/action-types.js";
import { STATE_TYPES } from "../../app/state-types.js";
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
  setTeamStatus,
  startStationForTeam,
} from "../../db/events-repository.js";
import { MESSAGE_TRIGGER_TYPES, getMessageByTrigger } from "../../db/messages-repository.js";
import { setUserState } from "../../db/user-state-repository.js";
import { listAdminPeerIdsByStation, listParticipantPeerIdsByTeam } from "../../db/users-repository.js";
import { sendTemplateSequence } from "../../utils/vk-message.js";
import { sendAdminMenuScreen } from "../admin-home/screens.js";
import { sendActiveStationScreen, sendMyStationMenuScreen, sendMyStationUnavailableScreen } from "./screens.js";

const WAITING_FALLBACK_MESSAGE = [{ text: "Свободных станций пока нет. Пожалуйста, ожидайте дальнейших указаний.", attachments: [] }];
const FINISHED_FALLBACK_MESSAGE = [{ text: "Вы прошли все станции. Ожидайте дальнейших указаний от организаторов.", attachments: [] }];

export async function openMyStationMenu(context) {
  const stationId = context.user.station_id;

  if (!stationId) {
    await sendMyStationUnavailableScreen(context.vk, context.peerId);
    return true;
  }

  const activeEvent = await getActiveEventForStation(context.env, stationId);

  if (activeEvent) {
    const activeTeam = await getTeamById(context.env, activeEvent.team_id);

    await setUserState(context.env, context.user.id, STATE_TYPES.MY_STATION_ACTIVE, "active", {
      teamId: activeEvent.team_id,
    });
    await sendActiveStationScreen(context.vk, context.peerId, activeTeam?.team_name ?? "Неизвестная команда", activeEvent.team_id);
    return true;
  }

  const availableTeams = await getAvailableTeamsForStation(context.env, stationId);

  await setUserState(context.env, context.user.id, STATE_TYPES.MY_STATION_MENU, "idle");
  await sendMyStationMenuScreen(context.vk, context.peerId, availableTeams);
  return true;
}

export async function handleMyStationMenuState(context) {
  if (context.action === ACTIONS.BACK_TO_ADMIN_MENU || context.input === "назад") {
    await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
    await sendAdminMenuScreen(context.vk, context.peerId);
    return true;
  }

  if (context.action !== ACTIONS.STATION_TEAM_SELECT || !context.buttonPayload?.teamId) {
    return openMyStationMenu(context);
  }

  return startSelectedTeam(context, context.buttonPayload.teamId);
}

export async function handleMyStationActiveState(context) {
  if (context.action !== ACTIONS.STATION_FINISH) {
    return true;
  }

  return finishCurrentStation(context);
}

async function startSelectedTeam(context, teamId) {
  const stationId = context.user.station_id;

  if (!stationId) {
    await sendMyStationUnavailableScreen(context.vk, context.peerId);
    return true;
  }

  const team = await getTeamById(context.env, teamId);

  if (!team) {
    return openMyStationMenu(context);
  }

  await startStationForTeam(context.env, {
    stationId,
    teamId: team.id,
    startedByUserId: context.user.id,
    startTime: new Date().toISOString(),
  });

  await setUserState(context.env, context.user.id, STATE_TYPES.MY_STATION_ACTIVE, "active", {
    teamId: team.id,
  });
  await sendActiveStationScreen(context.vk, context.peerId, team.team_name, team.id);
  return true;
}

async function finishCurrentStation(context) {
  const stationId = context.user.station_id;

  if (!stationId) {
    await sendMyStationUnavailableScreen(context.vk, context.peerId);
    return true;
  }

  const activeEvent = await getActiveEventForStation(context.env, stationId);

  if (!activeEvent) {
    return openMyStationMenu(context);
  }

  const [team, station, pendingTeams, remainingStations] = await Promise.all([
    getTeamById(context.env, activeEvent.team_id),
    getStationById(context.env, stationId),
    getPendingTeamsForStation(context.env, stationId),
    getRemainingStationsForTeam(context.env, activeEvent.team_id),
  ]);

  if (!team || !station) {
    return openMyStationMenu(context);
  }

  const stationDone = pendingTeams.filter((item) => item.id !== team.id).length === 0;
  const teamFinished = remainingStations.length <= 1;

  await completeStationForTeam(context.env, {
    eventId: activeEvent.id,
    stationId: station.id,
    teamId: team.id,
    endedByUserId: context.user.id,
    endTime: new Date().toISOString(),
    stationDone,
    teamStatus: teamFinished ? "finished" : "waiting_start",
  });

  await sendTeamAfterStationUpdate(context, team.id, teamFinished);

  if (stationDone) {
    await notifyStationAdmins(context, station.id, "Вашу станцию прошли все команды!");
    await context.vk.sendText(context.peerId, "Вашу станцию прошли все команды!");
  }

  await notifyWaitingTeamsAboutFreeStations(context);

  return openMyStationMenu(context);
}

async function sendTeamAfterStationUpdate(context, teamId, teamFinished) {
  if (teamFinished) {
    await sendTemplateToTeam(context, teamId, MESSAGE_TRIGGER_TYPES.TEAM_FINISHED_ALL, null, FINISHED_FALLBACK_MESSAGE);
    return;
  }

  const nextStation = await pickNextFreeStation(context, teamId);

  if (nextStation) {
    await sendTemplateToTeam(context, teamId, MESSAGE_TRIGGER_TYPES.GO_TO_STATION, nextStation.id, [
      { text: `Ваша следующая станция: ${nextStation.station_name}`, attachments: [] },
    ]);
    return;
  }

  await setTeamStatus(context.env, teamId, "waiting_station");
  await sendTemplateToTeam(context, teamId, MESSAGE_TRIGGER_TYPES.WAIT_FOR_STATION, null, WAITING_FALLBACK_MESSAGE);
}

async function notifyWaitingTeamsAboutFreeStations(context) {
  const waitingTeams = await getWaitingTeams(context.env);
  const reservedStationIds = new Set();

  for (const team of waitingTeams) {
    const nextStation = await pickNextFreeStation(context, team.id, reservedStationIds);

    if (!nextStation) {
      continue;
    }

    reservedStationIds.add(nextStation.id);
    await setTeamStatus(context.env, team.id, "waiting_start");
    await sendTemplateToTeam(context, team.id, MESSAGE_TRIGGER_TYPES.GO_TO_STATION, nextStation.id, [
      { text: `Ваша следующая станция: ${nextStation.station_name}`, attachments: [] },
    ]);
  }
}

async function pickNextFreeStation(context, teamId, reservedStationIds = new Set()) {
  const candidates = await getCandidateStationsForTeam(context.env, teamId);
  return candidates.find((candidate) => !reservedStationIds.has(candidate.id)) ?? null;
}

async function sendTemplateToTeam(context, teamId, triggerType, stationId, fallbackContent) {
  const [template, peerIds] = await Promise.all([
    getMessageByTrigger(context.env, triggerType, stationId),
    listParticipantPeerIdsByTeam(context.env, teamId),
  ]);
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
