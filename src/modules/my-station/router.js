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
import { listAdminPeerIdsByStation, listMainAdminUsers, listParticipantUsersByTeam } from "../../db/users-repository.js";
import {
  deliverParticipantContentWithAdminLog,
  formatDeliveryContentForManualRelay,
} from "../../utils/participant-delivery.js";
import { sendAdminMenuScreen } from "../admin-home/screens.js";
import {
  sendActiveStationScreen,
  sendForceFinishManualRelayScreen,
  sendMyStationMenuScreen,
  sendMyStationUnavailableScreen,
  sendStationDeliveryFailedScreen,
} from "./screens.js";

const WAITING_FALLBACK_MESSAGE = [
  {
    text: "\u0421\u0432\u043e\u0431\u043e\u0434\u043d\u044b\u0445 \u0441\u0442\u0430\u043d\u0446\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442. \u041f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, \u043e\u0436\u0438\u0434\u0430\u0439\u0442\u0435 \u0434\u0430\u043b\u044c\u043d\u0435\u0439\u0448\u0438\u0445 \u0443\u043a\u0430\u0437\u0430\u043d\u0438\u0439.",
    attachments: [],
  },
];
const FINISHED_FALLBACK_MESSAGE = [
  {
    text: "\u0412\u044b \u043f\u0440\u043e\u0448\u043b\u0438 \u0432\u0441\u0435 \u0441\u0442\u0430\u043d\u0446\u0438\u0438. \u041e\u0436\u0438\u0434\u0430\u0439\u0442\u0435 \u0434\u0430\u043b\u044c\u043d\u0435\u0439\u0448\u0438\u0445 \u0443\u043a\u0430\u0437\u0430\u043d\u0438\u0439 \u043e\u0442 \u043e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0442\u043e\u0440\u043e\u0432.",
    attachments: [],
  },
];

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
    await sendActiveStationScreen(context.vk, context.peerId, activeTeam?.team_name ?? "\u041d\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043d\u0430\u044f \u043a\u043e\u043c\u0430\u043d\u0434\u0430", activeEvent.team_id);
    return true;
  }

  const availableTeams = await getAvailableTeamsForStation(context.env, stationId);

  await setUserState(context.env, context.user.id, STATE_TYPES.MY_STATION_MENU, "idle");
  await sendMyStationMenuScreen(context.vk, context.peerId, availableTeams);
  return true;
}

export async function handleMyStationMenuState(context) {
  if (context.action === ACTIONS.BACK_TO_ADMIN_MENU || context.input === "\u043d\u0430\u0437\u0430\u0434") {
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
  if (context.action === ACTIONS.BACK_TO_ADMIN_MENU || context.input === "\u043d\u0430\u0437\u0430\u0434") {
    await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
    await sendAdminMenuScreen(context.vk, context.peerId);
    return true;
  }

  if (context.action === ACTIONS.STATION_FORCE_FINISH) {
    return finishCurrentStation(context, { force: true });
  }

  if (context.action !== ACTIONS.STATION_FINISH) {
    if (context.userState?.step_key === "delivery_failed" && context.userState?.payload?.delivery) {
      await sendStationDeliveryFailedScreen(context.vk, context.peerId, buildFailureScreenOptions(context.userState.payload.delivery));
      return true;
    }

    return true;
  }

  return finishCurrentStation(context, { force: false });
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

async function finishCurrentStation(context, options = {}) {
  const stationId = context.user.station_id;
  const force = options.force === true;

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
  const delivery = await prepareTeamDelivery(context, {
    team,
    station,
    teamFinished,
  });

  if (!force) {
    const deliveryReport = await deliverParticipantContentWithAdminLog(context, delivery);

    if (!deliveryReport.ok) {
      await setUserState(context.env, context.user.id, STATE_TYPES.MY_STATION_ACTIVE, "delivery_failed", {
        delivery: serializeDeliveryForState(deliveryReport),
      });
      await notifyMainAdmins(context, formatStationLifecycleMessage("FAIL", team.team_name, station.station_name, delivery.stepLabel));
      await sendStationDeliveryFailedScreen(context.vk, context.peerId, buildFailureScreenOptions(serializeDeliveryForState(deliveryReport)));
      return true;
    }
  }

  await completeStationForTeam(context.env, {
    eventId: activeEvent.id,
    stationId: station.id,
    teamId: team.id,
    endedByUserId: context.user.id,
    endTime: new Date().toISOString(),
    stationDone,
    teamStatus: delivery.teamStatus,
  });

  if (force) {
    await notifyMainAdmins(context, formatStationLifecycleMessage("FORCE", team.team_name, station.station_name, delivery.stepLabel));
    await setUserState(context.env, context.user.id, STATE_TYPES.MY_STATION_MENU, "idle");
    await sendForceFinishManualRelayScreen(context.vk, context.peerId, {
      teamName: team.team_name,
      stepLabel: delivery.stepLabel,
      relayText: formatDeliveryContentForManualRelay(delivery.contentItems),
    });
  } else {
    await notifyMainAdmins(context, formatStationLifecycleMessage("OK", team.team_name, station.station_name, delivery.stepLabel));
  }

  if (stationDone) {
    await notifyStationAdmins(context, station.id, "\u0412\u0430\u0448\u0443 \u0441\u0442\u0430\u043d\u0446\u0438\u044e \u043f\u0440\u043e\u0448\u043b\u0438 \u0432\u0441\u0435 \u043a\u043e\u043c\u0430\u043d\u0434\u044b!");
    await context.vk.sendText(context.peerId, "\u0412\u0430\u0448\u0443 \u0441\u0442\u0430\u043d\u0446\u0438\u044e \u043f\u0440\u043e\u0448\u043b\u0438 \u0432\u0441\u0435 \u043a\u043e\u043c\u0430\u043d\u0434\u044b!");
  }

  await notifyWaitingTeamsAboutFreeStations(context);

  if (force) {
    return true;
  }

  return openMyStationMenu(context);
}

async function notifyWaitingTeamsAboutFreeStations(context) {
  const waitingTeams = await getWaitingTeams(context.env);
  const reservedStationIds = new Set();

  for (const team of waitingTeams) {
    const nextStation = await pickNextFreeStation(context, team.id, reservedStationIds);

    if (!nextStation) {
      continue;
    }

    const delivery = await prepareTeamDelivery(context, {
      team,
      station: nextStation,
      teamFinished: false,
      forcedResultType: "go_to_station",
      targetStation: nextStation,
      teamStatus: "waiting_start",
    });
    const deliveryReport = await deliverParticipantContentWithAdminLog(context, delivery);

    if (!deliveryReport.ok) {
      await notifyMainAdmins(
        context,
        `[FAIL] \u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0432\u044b\u0432\u0435\u0441\u0442\u0438 \u0438\u0437 \u043e\u0436\u0438\u0434\u0430\u043d\u0438\u044f \u043a\u043e\u043c\u0430\u043d\u0434\u0443 "${team.team_name}" \u043d\u0430 \u0441\u0442\u0430\u043d\u0446\u0438\u044e "${nextStation.station_name}".`,
      );
      continue;
    }

    reservedStationIds.add(nextStation.id);
    await setTeamStatus(context.env, team.id, "waiting_start");
    await notifyMainAdmins(
      context,
      `[OK] \u041a\u043e\u043c\u0430\u043d\u0434\u0430 "${team.team_name}" \u0432\u044b\u0432\u0435\u0434\u0435\u043d\u0430 \u0438\u0437 \u043e\u0436\u0438\u0434\u0430\u043d\u0438\u044f \u043d\u0430 \u0441\u0442\u0430\u043d\u0446\u0438\u044e "${nextStation.station_name}".`,
    );
  }
}

async function prepareTeamDelivery(context, options) {
  const team = options.team;
  const currentStation = options.station;
  const forcedResultType = options.forcedResultType ?? null;
  const recipients = await listParticipantUsersByTeam(context.env, team.id);

  if (forcedResultType === "go_to_station") {
    const targetStation = options.targetStation;

    return buildDeliveryPayload(context, {
      team,
      currentStation,
      recipients,
      resultType: "go_to_station",
      triggerType: MESSAGE_TRIGGER_TYPES.GO_TO_STATION,
      targetStation,
      teamStatus: options.teamStatus ?? "waiting_start",
      fallbackContent: [
        {
          text: `\u0412\u0430\u0448\u0430 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0430\u044f \u0441\u0442\u0430\u043d\u0446\u0438\u044f: ${targetStation.station_name}`,
          attachments: [],
        },
      ],
    });
  }

  if (options.teamFinished) {
    return buildDeliveryPayload(context, {
      team,
      currentStation,
      recipients,
      resultType: "finished",
      triggerType: MESSAGE_TRIGGER_TYPES.TEAM_FINISHED_ALL,
      targetStation: null,
      teamStatus: "finished",
      fallbackContent: FINISHED_FALLBACK_MESSAGE,
    });
  }

  const nextStation = await pickNextFreeStation(context, team.id);

  if (nextStation) {
    return buildDeliveryPayload(context, {
      team,
      currentStation,
      recipients,
      resultType: "go_to_station",
      triggerType: MESSAGE_TRIGGER_TYPES.GO_TO_STATION,
      targetStation: nextStation,
      teamStatus: "waiting_start",
      fallbackContent: [
        {
          text: `\u0412\u0430\u0448\u0430 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0430\u044f \u0441\u0442\u0430\u043d\u0446\u0438\u044f: ${nextStation.station_name}`,
          attachments: [],
        },
      ],
    });
  }

  return buildDeliveryPayload(context, {
    team,
    currentStation,
    recipients,
    resultType: "waiting_station",
    triggerType: MESSAGE_TRIGGER_TYPES.WAIT_FOR_STATION,
    targetStation: null,
    teamStatus: "waiting_station",
    fallbackContent: WAITING_FALLBACK_MESSAGE,
  });
}

async function buildDeliveryPayload(context, options) {
  const template = await getMessageByTrigger(
    context.env,
    options.triggerType,
    options.targetStation ? options.targetStation.id : null,
  );
  const contentItems = template?.content_items?.length ? template.content_items : options.fallbackContent;

  return {
    label: getDeliveryLabel(options.resultType),
    stepLabel: getStepLabel(options.resultType, options.targetStation?.station_name ?? null),
    teamId: options.team.id,
    teamName: options.team.team_name,
    stationName: options.currentStation?.station_name ?? null,
    initiatedByName: context.user?.display_name ?? `VK ${context.peerId}`,
    teamStatus: options.teamStatus,
    resultType: options.resultType,
    targetStationName: options.targetStation?.station_name ?? null,
    recipients: options.recipients,
    contentItems,
  };
}

async function pickNextFreeStation(context, teamId, reservedStationIds = new Set()) {
  const candidates = await getCandidateStationsForTeam(context.env, teamId);
  return candidates.find((candidate) => !reservedStationIds.has(candidate.id)) ?? null;
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

async function notifyMainAdmins(context, message) {
  const admins = await listMainAdminUsers(context.env);

  for (const admin of admins) {
    try {
      await context.vk.sendText(admin.peerId, message);
    } catch (error) {
      console.error("Failed to notify main admin", error, {
        adminPeerId: admin.peerId,
        message,
      });
    }
  }
}

function getDeliveryLabel(resultType) {
  if (resultType === "finished") {
    return "\u0424\u0438\u043d\u0430\u043b\u044c\u043d\u043e\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u043a\u043e\u043c\u0430\u043d\u0434\u0435";
  }

  if (resultType === "waiting_station") {
    return "\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u043e\u0436\u0438\u0434\u0430\u043d\u0438\u044f \u0441\u0442\u0430\u043d\u0446\u0438\u0438";
  }

  return "\u041f\u0435\u0440\u0435\u0445\u043e\u0434 \u043d\u0430 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0443\u044e \u0441\u0442\u0430\u043d\u0446\u0438\u044e";
}

function getStepLabel(resultType, stationName) {
  if (resultType === "finished") {
    return "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u0435 \u043c\u0430\u0440\u0448\u0440\u0443\u0442\u0430";
  }

  if (resultType === "waiting_station") {
    return "\u041e\u0436\u0438\u0434\u0430\u043d\u0438\u0435 \u0441\u0432\u043e\u0431\u043e\u0434\u043d\u043e\u0439 \u0441\u0442\u0430\u043d\u0446\u0438\u0438";
  }

  return stationName
    ? `\u041f\u0435\u0440\u0435\u0445\u043e\u0434 \u043d\u0430 \u0441\u0442\u0430\u043d\u0446\u0438\u044e "${stationName}"`
    : "\u041f\u0435\u0440\u0435\u0445\u043e\u0434 \u043d\u0430 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0443\u044e \u0441\u0442\u0430\u043d\u0446\u0438\u044e";
}

function formatStationLifecycleMessage(statusCode, teamName, stationName, stepLabel) {
  return `[${statusCode}] \u0421\u0442\u0430\u043d\u0446\u0438\u044f "${stationName}" / \u043a\u043e\u043c\u0430\u043d\u0434\u0430 "${teamName}" / \u0448\u0430\u0433: ${stepLabel}`;
}

function serializeDeliveryForState(report) {
  return {
    teamId: report.delivery?.teamId ?? null,
    teamName: report.delivery?.teamName ?? null,
    stepLabel: report.delivery?.stepLabel ?? null,
    contentItems: report.delivery?.contentItems ?? [],
    failedRecipients: report.failedRecipients.map((item) => ({
      displayName: item.displayName,
      peerId: item.peerId,
      errorMessage: item.errorMessage,
    })),
  };
}

function buildFailureScreenOptions(delivery) {
  return {
    teamId: delivery?.teamId ?? null,
    teamName: delivery?.teamName ?? null,
    stepLabel: delivery?.stepLabel ?? null,
    failedRecipients: delivery?.failedRecipients ?? [],
  };
}
