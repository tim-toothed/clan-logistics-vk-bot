import { ACTIONS } from "../../app/action-types.js";
import { STATE_TYPES } from "../../app/state-types.js";
import {
  claimActiveEventForCompletion,
  claimNextStationForTeam,
  claimWaitingTeamAssignment,
  completeStationForTeam,
  finalizeWaitingTeamAssignment,
  getActiveEventForStation,
  getCandidateStationsForTeam,
  getPendingTeamsForStation,
  getRemainingStationsForTeam,
  getStationById,
  getTeamById,
  getWaitingTeams,
  releaseActiveEventCompletionClaim,
  releaseClaimedNextStation,
  releaseWaitingTeamAssignment,
  setTeamStatus,
  transitionTeamToNextStation,
} from "../../db/events-repository.js";
import { MESSAGE_TRIGGER_TYPES, getMessageByTrigger } from "../../db/messages-repository.js";
import { setUserState } from "../../db/user-state-repository.js";
import {
  listAdminPeerIdsByStation,
  listAdminUsersByStation,
  listMainAdminUsers,
  listParticipantUsersByTeam,
} from "../../db/users-repository.js";
import {
  deliverParticipantContentWithAdminLog,
  formatDeliveryContentForManualRelay,
} from "../../utils/participant-delivery.js";
import { formatVkMention } from "../../utils/text.js";
import { sendAdminMenuScreen } from "../admin-home/screens.js";
import {
  sendActiveStationScreen,
  sendFinishConfirmationScreen,
  sendForceFinishManualRelayScreen,
  sendIdleStationScreen,
  sendMyStationUnavailableScreen,
  sendStationDeliveryFailedScreen,
} from "./screens.js";

const WAITING_FALLBACK_MESSAGE = [
  {
    text: "Свободных станций пока нет. Пожалуйста, ожидайте дальнейших указаний.",
    attachments: [],
  },
];

const FINISHED_FALLBACK_MESSAGE = [
  {
    text: "Вы прошли все станции. Ожидайте дальнейших указаний от организаторов.",
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

  if (!activeEvent) {
    await setUserState(context.env, context.user.id, STATE_TYPES.MY_STATION_MENU, "idle");
    await sendIdleStationScreen(context.vk, context.peerId);
    return true;
  }

  const activeTeam = await getTeamById(context.env, activeEvent.team_id);

  await setUserState(context.env, context.user.id, STATE_TYPES.MY_STATION_ACTIVE, "active", {
    teamId: activeEvent.team_id,
  });
  await sendActiveStationScreen(context.vk, context.peerId, activeTeam?.team_name ?? "Неизвестная команда", activeEvent.team_id);
  return true;
}

export async function handleMyStationMenuState(context) {
  if (context.action === ACTIONS.BACK_TO_ADMIN_MENU || context.input === "назад") {
    await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
    await sendAdminMenuScreen(context.vk, context.peerId, { env: context.env, user: context.user });
    return true;
  }

  return openMyStationMenu(context);
}

export async function handleMyStationActiveState(context) {
  if (context.action === ACTIONS.BACK_TO_ADMIN_MENU || context.input === "назад") {
    await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
    await sendAdminMenuScreen(context.vk, context.peerId, { env: context.env, user: context.user });
    return true;
  }

  if (context.action === ACTIONS.STATION_FINISH_CANCEL) {
    return openMyStationMenu(context);
  }

  if (context.action === ACTIONS.STATION_FINISH) {
    return askFinishConfirmation(context);
  }

  if (context.action === ACTIONS.STATION_FORCE_FINISH) {
    return finishCurrentStation(context, { force: true });
  }

  if (context.action === ACTIONS.STATION_FINISH_CONFIRM) {
    return finishCurrentStation(context, { force: false });
  }

  if (context.userState?.step_key === "confirm_finish") {
    const activeEvent = await getActiveEventForStation(context.env, context.user.station_id);
    const activeTeam = activeEvent ? await getTeamById(context.env, activeEvent.team_id) : null;

    if (!activeEvent || !activeTeam) {
      return openMyStationMenu(context);
    }

    await sendFinishConfirmationScreen(context.vk, context.peerId, activeTeam.team_name, activeTeam.id);
    return true;
  }

  if (context.userState?.step_key === "delivery_failed" && context.userState?.payload?.delivery) {
    await sendStationDeliveryFailedScreen(context.vk, context.peerId, buildFailureScreenOptions(context.userState.payload.delivery));
    return true;
  }

  return openMyStationMenu(context);
}

async function askFinishConfirmation(context) {
  const stationId = context.user.station_id;

  if (!stationId) {
    await sendMyStationUnavailableScreen(context.vk, context.peerId);
    return true;
  }

  const activeEvent = await getActiveEventForStation(context.env, stationId);

  if (!activeEvent) {
    return openMyStationMenu(context);
  }

  const team = await getTeamById(context.env, activeEvent.team_id);

  if (!team) {
    return openMyStationMenu(context);
  }

  await setUserState(context.env, context.user.id, STATE_TYPES.MY_STATION_ACTIVE, "confirm_finish", {
    teamId: team.id,
  });
  await sendFinishConfirmationScreen(context.vk, context.peerId, team.team_name, team.id);
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
  const completionClaimed = await claimActiveEventForCompletion(context.env, {
    eventId: activeEvent.id,
    stationId: station.id,
    claimingUserId: context.user.id,
  });

  if (!completionClaimed) {
    await context.vk.sendText(context.peerId, "Завершение станции уже обрабатывается. Подождите пару секунд.");
    return true;
  }

  let delivery = await prepareTeamDelivery(context, {
    team,
    currentStation: station,
    teamFinished,
  });
  let claimedNextStationId = null;

  while (!force && delivery.resultType === "go_to_station" && delivery.targetStationId) {
    const stationClaimed = await claimNextStationForTeam(context.env, {
      stationId: delivery.targetStationId,
      teamId: team.id,
    });

    if (stationClaimed) {
      claimedNextStationId = delivery.targetStationId;
      break;
    }

    delivery = await prepareTeamDelivery(context, {
      team,
      currentStation: station,
      teamFinished,
    });
  }

  if (!force) {
    const deliveryReport = await deliverParticipantContentWithAdminLog(context, delivery);

    if (!deliveryReport.ok) {
      if (claimedNextStationId) {
        await releaseClaimedNextStation(context.env, {
          stationId: claimedNextStationId,
          teamId: team.id,
        });
      }
      await releaseActiveEventCompletionClaim(context.env, {
        eventId: activeEvent.id,
        stationId: station.id,
        claimingUserId: context.user.id,
      });
      await setUserState(context.env, context.user.id, STATE_TYPES.MY_STATION_ACTIVE, "delivery_failed", {
        delivery: serializeDeliveryForState(deliveryReport),
      });
      await notifyMainAdmins(
        context,
        await buildStationFailureAdminMessage(context, team, station, delivery.stepLabel),
      );
      await sendStationDeliveryFailedScreen(context.vk, context.peerId, buildFailureScreenOptions(serializeDeliveryForState(deliveryReport)));
      return true;
    }
  }

  if (delivery.resultType === "go_to_station" && delivery.targetStationId) {
    await transitionTeamToNextStation(context.env, {
      eventId: activeEvent.id,
      stationId: station.id,
      teamId: team.id,
      nextStationId: delivery.targetStationId,
      endedByUserId: context.user.id,
      endTime: new Date().toISOString(),
      stationDone,
      startTime: new Date().toISOString(),
    });
  } else {
    await completeStationForTeam(context.env, {
      eventId: activeEvent.id,
      stationId: station.id,
      teamId: team.id,
      endedByUserId: context.user.id,
      endTime: new Date().toISOString(),
      stationDone,
      teamStatus: delivery.teamStatus,
    });
  }

  if (force) {
    await notifyMainAdmins(
      context,
      await buildStationForceAdminMessage(context, team, station, delivery.stepLabel),
    );
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
    await notifyStationAdmins(context, station.id, "Вашу станцию прошли все команды!");
    await context.vk.sendText(context.peerId, "Вашу станцию прошли все команды!");
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
    let nextStation = null;

    while (true) {
      const candidateStation = await pickNextFreeStation(context, team.id, reservedStationIds);

      if (!candidateStation) {
        break;
      }

      const claimResult = await claimWaitingTeamAssignment(context.env, {
        stationId: candidateStation.id,
        teamId: team.id,
      });

      if (claimResult.ok) {
        nextStation = candidateStation;
        reservedStationIds.add(candidateStation.id);
        break;
      }

      if (claimResult.reason === "team_unavailable") {
        break;
      }

      reservedStationIds.add(candidateStation.id);
    }

    if (!nextStation) {
      continue;
    }

    const delivery = await prepareTeamDelivery(context, {
      team,
      currentStation: nextStation,
      teamFinished: false,
      forcedResultType: "go_to_station",
      targetStation: nextStation,
      teamStatus: "on_station",
    });
    const deliveryReport = await deliverParticipantContentWithAdminLog(context, delivery);

    if (!deliveryReport.ok) {
      await releaseWaitingTeamAssignment(context.env, {
        stationId: nextStation.id,
        teamId: team.id,
      });
      await notifyMainAdmins(
        context,
        await buildWaitingTeamFailureAdminMessage(context, team, nextStation),
      );
      continue;
    }

    await finalizeWaitingTeamAssignment(context.env, {
      stationId: nextStation.id,
      teamId: team.id,
      startTime: new Date().toISOString(),
    });
    await notifyMainAdmins(
      context,
      formatWaitingTeamTransitionMessage("OK", team.team_name, nextStation.station_name),
    );
  }
}

async function prepareTeamDelivery(context, options) {
  const team = options.team;
  const currentStation = options.currentStation;
  const forcedResultType = options.forcedResultType ?? null;
  const recipients = await listParticipantUsersByTeam(context.env, team.id);

  if (forcedResultType === "go_to_station") {
    return buildDeliveryPayload(context, {
      team,
      currentStation,
      recipients,
      resultType: "go_to_station",
      triggerType: MESSAGE_TRIGGER_TYPES.GO_TO_STATION,
      targetStation: options.targetStation,
      teamStatus: options.teamStatus ?? "on_station",
      fallbackContent: [
        {
          text: `Ваша следующая станция: ${options.targetStation.station_name}`,
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
      teamStatus: "on_station",
      fallbackContent: [
        {
          text: `Ваша следующая станция: ${nextStation.station_name}`,
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
    initiatedByPeerId: context.peerId,
    teamStatus: options.teamStatus,
    resultType: options.resultType,
    targetStationId: options.targetStation?.id ?? null,
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
    return "Финальное сообщение команде";
  }

  if (resultType === "waiting_station") {
    return "Сообщение ожидания станции";
  }

  return "Переход на следующую станцию";
}

function getStepLabel(resultType, stationName) {
  if (resultType === "finished") {
    return "Завершение маршрута";
  }

  if (resultType === "waiting_station") {
    return "Ожидание свободной станции";
  }

  return stationName
    ? `Переход на станцию "${stationName}"`
    : "Переход на следующую станцию";
}

function formatStationLifecycleMessage(statusCode, teamName, stationName, stepLabel) {
  if (statusCode === "FORCE") {
    return [
      `[FORCE] Станция завершена принудительно`,
      `Команда: ${teamName}`,
      `Станция: ${stationName}`,
      `Шаг: ${stepLabel}`,
    ].join("\n");
  }

  const prefix = statusCode === "FAIL" ? "🔴" : "🟢";
  const title = statusCode === "FAIL" ? "Станция не завершена" : "Станция завершена";

  return [
    `${prefix} ${title}`,
    `Команда: ${teamName}`,
    `Станция: ${stationName}`,
    `Шаг: ${stepLabel}`,
  ].join("\n");
}

function formatWaitingTeamTransitionMessage(statusCode, teamName, stationName) {
  const prefix = statusCode === "FAIL" ? "🔴" : "🟢";
  const title = statusCode === "FAIL" ? "Команда осталась в ожидании" : "Команда выведена из ожидания";

  return [
    `${prefix} ${title}`,
    `Команда: ${teamName}`,
    `Станция: ${stationName}`,
  ].join("\n");
}

async function buildStationFailureAdminMessage(context, team, station, stepLabel) {
  const [stationAdmins, participants] = await Promise.all([
    listAdminUsersByStation(context.env, station.id),
    listParticipantUsersByTeam(context.env, team.id),
  ]);

  return [
    "🔴 Станция не завершена",
    `Команда: ${team.team_name}`,
    `Станция: ${station.station_name}`,
    `Шаг: ${stepLabel}`,
    `Организаторы станции: ${formatUserLinks(stationAdmins)}`,
    `Участники команды: ${formatUserLinks(participants)}`,
  ].join("\n");
}

async function buildWaitingTeamFailureAdminMessage(context, team, station) {
  const [stationAdmins, participants] = await Promise.all([
    listAdminUsersByStation(context.env, station.id),
    listParticipantUsersByTeam(context.env, team.id),
  ]);

  return [
    "🔴 Команда осталась в ожидании",
    `Команда: ${team.team_name}`,
    `Станция: ${station.station_name}`,
    `Организаторы станции: ${formatUserLinks(stationAdmins)}`,
    `Участники команды: ${formatUserLinks(participants)}`,
  ].join("\n");
}

async function buildStationForceAdminMessage(context, team, station, stepLabel) {
  const [stationAdmins, participants] = await Promise.all([
    listAdminUsersByStation(context.env, station.id),
    listParticipantUsersByTeam(context.env, team.id),
  ]);

  return [
    "[FORCE] Станция завершена принудительно",
    `Команда: ${team.team_name}`,
    `Станция: ${station.station_name}`,
    `Шаг: ${stepLabel}`,
    `Организаторы станции: ${formatUserLinks(stationAdmins)}`,
    `Участники команды: ${formatUserLinks(participants)}`,
  ].join("\n");
}

function formatUserLinks(users) {
  if (!Array.isArray(users) || !users.length) {
    return "не найдены";
  }

  return users.map((user) => formatVkMention(user.displayName, user.vkUserId)).join(" | ");
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
