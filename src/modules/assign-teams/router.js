import { ACTIONS } from "../../app/action-types.js";
import { STATE_TYPES } from "../../app/state-types.js";
import {
  getStationById,
  getTeamById,
  hasAnyEvents,
  listFreeStations,
  listFreeStationsForInitialAssignment,
  listTeamsWaitingForInitialAssignment,
  setTeamStatus,
  startStationForTeam,
} from "../../db/events-repository.js";
import { MESSAGE_TRIGGER_TYPES, getMessageByTrigger } from "../../db/messages-repository.js";
import { getTeams } from "../../db/setup-repository.js";
import { setUserState } from "../../db/user-state-repository.js";
import { listMainAdminUsers, listParticipantUsersByTeam } from "../../db/users-repository.js";
import { deliverParticipantContentWithAdminLog } from "../../utils/participant-delivery.js";
import { sendAdminMenuScreen } from "../admin-home/screens.js";
import { sendAssignTeamsConfirmScreen, sendAssignTeamsRetryScreen } from "./screens.js";

const WAITING_START_FALLBACK_MESSAGE = [
  {
    text: "Пока свободных стартовых станций нет. Пожалуйста, ожидайте дальнейших указаний в стартовой точке.",
    attachments: [],
  },
];

export async function openAssignTeamsConfirm(context) {
  if (context.user?.station_id) {
    await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
    await sendAdminMenuScreen(context.vk, context.peerId, {
      env: context.env,
      user: context.user,
      message: "Раздел «Начать квест» доступен только главным администраторам без станции.",
    });
    return true;
  }

  const preconditions = await getQuestStartPreconditions(context.env);

  if (!preconditions.canOpen) {
    await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
    await sendAdminMenuScreen(context.vk, context.peerId, {
      env: context.env,
      user: context.user,
      message: preconditions.message,
    });
    return true;
  }

  await setUserState(context.env, context.user.id, STATE_TYPES.ASSIGN_TEAMS_CONFIRM, "confirm", {
    teamCount: preconditions.teamCount,
    stationCount: preconditions.stationCount,
  });
  await sendAssignTeamsConfirmScreen(context.vk, context.peerId, buildAssignTeamsConfirmText(preconditions));
  return true;
}

export async function handleAssignTeamsState(context) {
  if (context.action === ACTIONS.BACK_TO_ADMIN_MENU || context.input === "назад") {
    await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
    await sendAdminMenuScreen(context.vk, context.peerId, { env: context.env, user: context.user });
    return true;
  }

  if (context.userState?.state_type === STATE_TYPES.ASSIGN_TEAMS_CONFIRM) {
    if (context.action === ACTIONS.ASSIGN_TEAMS_CONFIRM || context.input === "да") {
      await startQuest(context);
      return true;
    }

    return openAssignTeamsConfirm(context);
  }

  if (context.userState?.state_type === STATE_TYPES.ASSIGN_TEAMS_RETRY) {
    if (context.action === ACTIONS.ASSIGN_TEAMS_RETRY_FAILED) {
      await retryFailedQuestAssignments(context);
      return true;
    }

    await sendAssignTeamsRetryScreen(
      context.vk,
      context.peerId,
      formatQuestRetryScreenText(context.userState?.payload ?? { failedAssignments: [] }),
    );
    return true;
  }

  return openAssignTeamsConfirm(context);
}

export async function startQuest(context, options = {}) {
  if (context.user?.station_id) {
    await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
    await sendAdminMenuScreen(context.vk, context.peerId, {
      env: context.env,
      user: context.user,
      message: "Раздел «Начать квест» доступен только главным администраторам без станции.",
    });
    return {
      startedTeams: [],
      waitingTeams: [],
      failedAssignments: [],
      blockedReason: "station_admin_forbidden",
    };
  }

  const preconditions = await getQuestStartPreconditions(context.env);

  if (!preconditions.canOpen) {
    await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
    await sendAdminMenuScreen(context.vk, context.peerId, {
      env: context.env,
      user: context.user,
      message: preconditions.message,
    });
    return {
      startedTeams: [],
      waitingTeams: [],
      failedAssignments: [],
      blockedReason: preconditions.message,
    };
  }

  const teams = await listTeamsWaitingForInitialAssignment(context.env);
  const stations = shuffleArray(await listFreeStationsForInitialAssignment(context.env), options.randomFn ?? context.randomFn);
  const assignableCount = Math.min(teams.length, stations.length);
  const startedTeams = [];
  const waitingTeams = [];
  const failedAssignments = [];
  const timestamp = new Date().toISOString();

  for (let index = 0; index < assignableCount; index += 1) {
    const team = teams[index];
    const station = stations[index];
    const delivery = await buildInitialStationDelivery(context, team, station);
    const deliveryReport = await deliverParticipantContentWithAdminLog(context, delivery);

    if (!deliveryReport.ok) {
      failedAssignments.push(createFailedAssignment(team, {
        stationId: station.id,
        stationName: station.station_name,
        deliveryKind: "station",
      }));
      continue;
    }

    await startStationForTeam(context.env, {
      stationId: station.id,
      teamId: team.id,
      startedByUserId: context.user.id,
      startTime: timestamp,
    });
    startedTeams.push({
      teamId: team.id,
      teamName: team.team_name,
      stationId: station.id,
      stationName: station.station_name,
    });
  }

  for (let index = assignableCount; index < teams.length; index += 1) {
    const team = teams[index];
    const delivery = await buildInitialWaitingDelivery(context, team);
    const deliveryReport = await deliverParticipantContentWithAdminLog(context, delivery);

    if (!deliveryReport.ok) {
      failedAssignments.push(createFailedAssignment(team, {
        stationId: null,
        stationName: null,
        deliveryKind: "waiting",
      }));
      continue;
    }

    await setTeamStatus(context.env, team.id, "waiting_station");
    waitingTeams.push({
      teamId: team.id,
      teamName: team.team_name,
    });
  }

  const result = {
    startedTeams,
    waitingTeams,
    failedAssignments,
  };

  await notifyMainAdmins(context, formatQuestStartSummary(result));

  if (failedAssignments.length) {
    await setUserState(context.env, context.user.id, STATE_TYPES.ASSIGN_TEAMS_RETRY, "retry_failed", {
      failedAssignments,
      startedTeams,
      waitingTeams,
    });
    await sendAssignTeamsRetryScreen(context.vk, context.peerId, formatQuestRetryScreenText(result));
    return result;
  }

  await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
  await sendAdminMenuScreen(context.vk, context.peerId, {
    env: context.env,
    user: context.user,
    message: formatQuestSuccessScreenText(result),
  });
  return result;
}

export async function retryFailedQuestAssignments(context) {
  const failedAssignments = Array.isArray(context.userState?.payload?.failedAssignments)
    ? context.userState.payload.failedAssignments
    : [];
  const recoveredAssignments = [];
  const stillFailedAssignments = [];

  for (const assignment of failedAssignments) {
    const team = await getTeamById(context.env, assignment.teamId);

    if (!team || team.status !== "waiting_start" || team.current_station_id !== null) {
      continue;
    }

    const station = await resolveRetryStation(context, assignment);
    const delivery = station
      ? await buildInitialStationDelivery(context, team, station)
      : await buildInitialWaitingDelivery(context, team);
    const deliveryReport = await deliverParticipantContentWithAdminLog(context, delivery);

    if (!deliveryReport.ok) {
      stillFailedAssignments.push(
        createFailedAssignment(team, {
          stationId: station?.id ?? null,
          stationName: station?.station_name ?? null,
          deliveryKind: station ? "station" : "waiting",
        }),
      );
      continue;
    }

    if (station) {
      await startStationForTeam(context.env, {
        stationId: station.id,
        teamId: team.id,
        startedByUserId: context.user.id,
        startTime: new Date().toISOString(),
      });
    } else {
      await setTeamStatus(context.env, team.id, "waiting_station");
    }

    recoveredAssignments.push({
      teamId: team.id,
      teamName: team.team_name,
      stationId: station?.id ?? null,
      stationName: station?.station_name ?? null,
      deliveryKind: station ? "station" : "waiting",
    });
  }

  const result = {
    recoveredAssignments,
    stillFailedAssignments,
  };

  await notifyMainAdmins(context, formatQuestRetrySummary(result));

  if (stillFailedAssignments.length) {
    await setUserState(context.env, context.user.id, STATE_TYPES.ASSIGN_TEAMS_RETRY, "retry_failed", {
      failedAssignments: stillFailedAssignments,
    });
    await sendAssignTeamsRetryScreen(context.vk, context.peerId, formatQuestRetryScreenText({
      failedAssignments: stillFailedAssignments,
      recoveredAssignments,
    }));
    return result;
  }

  await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
  await sendAdminMenuScreen(context.vk, context.peerId, {
    env: context.env,
    user: context.user,
    message: formatQuestRetrySuccessScreenText(result),
  });
  return result;
}

function buildAssignTeamsConfirmText(preconditions) {
  const lines = [
    "Начать квест",
    "",
    `Команд: ${preconditions.teamCount}`,
    `Свободных стартовых станций: ${preconditions.stationCount}`,
    "",
  ];

  if (preconditions.teamCount > preconditions.stationCount) {
    lines.push(
      "Команд больше, чем активных станций. Некоторым командам придется ожидать очереди в стартовой точке. Вы точно хотите начать квест?",
    );
  } else {
    lines.push("Вы хотите распределить команды по станциям и выслать им первое сообщение?");
  }

  return lines.join("\n");
}

function formatQuestSuccessScreenText(result) {
  return [
    "Старт квеста завершен.",
    `На станции отправлены: ${result.startedTeams.length}`,
    `Ожидают в стартовой точке: ${result.waitingTeams.length}`,
    "Ошибок доставки нет.",
  ].join("\n");
}

function formatQuestRetrySuccessScreenText(result) {
  return [
    "Повторная отправка завершена.",
    `Успешно обработано команд: ${result.recoveredAssignments.length}`,
    "Неуспешных доставок больше нет.",
  ].join("\n");
}

function formatQuestRetryScreenText(result) {
  const failedAssignments = Array.isArray(result.failedAssignments) ? result.failedAssignments : [];
  const recoveredAssignments = Array.isArray(result.recoveredAssignments) ? result.recoveredAssignments : [];
  const startedTeams = Array.isArray(result.startedTeams) ? result.startedTeams : [];
  const waitingTeams = Array.isArray(result.waitingTeams) ? result.waitingTeams : [];
  const failedLines = failedAssignments.length
    ? failedAssignments.map((item) => `• ${item.teamName}${item.stationName ? ` → ${item.stationName}` : " → ожидание"}`).join("\n")
    : "• Нет";

  return [
    "Старт квеста выполнен частично.",
    `Успешно отправлено на станции: ${startedTeams.length}`,
    `Успешно отправлено в ожидание: ${waitingTeams.length}`,
    `Успешно восстановлено повтором: ${recoveredAssignments.length}`,
    `Осталось с ошибкой доставки: ${failedAssignments.length}`,
    "",
    "Нужно повторить отправку для:",
    failedLines,
  ].join("\n");
}

function formatQuestStartSummary(result) {
  return [
    "[QUEST_START]",
    `Стартовали на станции: ${result.startedTeams.length}`,
    `Переведены в ожидание: ${result.waitingTeams.length}`,
    `Ошибки доставки: ${result.failedAssignments.length}`,
  ].join("\n");
}

function formatQuestRetrySummary(result) {
  return [
    "[QUEST_RETRY]",
    `Успешно восстановлены: ${result.recoveredAssignments.length}`,
    `Все еще с ошибкой доставки: ${result.stillFailedAssignments.length}`,
  ].join("\n");
}

async function getQuestStartPreconditions(env) {
  if (await hasAnyEvents(env)) {
    return {
      canOpen: false,
      message: "Квест уже запущен. Повторный старт недоступен.",
      teamCount: 0,
      stationCount: 0,
    };
  }

  const [teams, stations, firstAssignableStations] = await Promise.all([
    getTeams(env),
    listFreeStations(env),
    listFreeStationsForInitialAssignment(env),
  ]);

  if (!teams.length) {
    return {
      canOpen: false,
      message: "Невозможно начать квест: сначала добавьте команды.",
      teamCount: 0,
      stationCount: stations.length,
    };
  }

  if (!stations.length) {
    return {
      canOpen: false,
      message: "Невозможно начать квест: сначала добавьте станции.",
      teamCount: teams.length,
      stationCount: 0,
      firstAssignableStationCount: 0,
    };
  }

  if (!firstAssignableStations.length) {
    return {
      canOpen: false,
      message: "Невозможно начать квест: все станции помечены как недоступные для первого распределения.",
      teamCount: teams.length,
      stationCount: stations.length,
      firstAssignableStationCount: 0,
    };
  }

  return {
    canOpen: true,
    teamCount: teams.length,
    stationCount: firstAssignableStations.length,
    totalStationCount: stations.length,
  };
}

async function buildInitialStationDelivery(context, team, station) {
  const template = await getMessageByTrigger(context.env, MESSAGE_TRIGGER_TYPES.GO_TO_STATION, station.id);
  const recipients = await listParticipantUsersByTeam(context.env, team.id);

  return {
    label: "Первое сообщение участникам",
    stepLabel: `Старт квеста: станция "${station.station_name}"`,
    teamId: team.id,
    teamName: team.team_name,
    stationName: station.station_name,
    initiatedByName: context.user?.display_name ?? `VK ${context.peerId}`,
    recipients,
    contentItems: template?.content_items?.length
      ? template.content_items
      : [{ text: `Ваше первое направление: станция "${station.station_name}".`, attachments: [] }],
  };
}

async function buildInitialWaitingDelivery(context, team) {
  const template = await getMessageByTrigger(context.env, MESSAGE_TRIGGER_TYPES.WAIT_FOR_STATION, null);
  const recipients = await listParticipantUsersByTeam(context.env, team.id);

  return {
    label: "Сообщение ожидания на старте",
    stepLabel: "Старт квеста: ожидание свободной станции",
    teamId: team.id,
    teamName: team.team_name,
    stationName: null,
    initiatedByName: context.user?.display_name ?? `VK ${context.peerId}`,
    recipients,
    contentItems: template?.content_items?.length ? template.content_items : WAITING_START_FALLBACK_MESSAGE,
  };
}

async function resolveRetryStation(context, assignment) {
  if (assignment.stationId) {
    const plannedStation = await getStationById(context.env, assignment.stationId);

    if (plannedStation?.status === "free") {
      return plannedStation;
    }
  }

  const freeStations = await listFreeStations(context.env);
  return freeStations[0] ?? null;
}

async function notifyMainAdmins(context, message) {
  const admins = await listMainAdminUsers(context.env);

  for (const admin of admins) {
    try {
      await context.vk.sendText(admin.peerId, message);
    } catch (error) {
      console.error("Failed to notify main admin about quest start", error, {
        adminPeerId: admin.peerId,
        message,
      });
    }
  }
}

function createFailedAssignment(team, options) {
  return {
    teamId: team.id,
    teamName: team.team_name,
    stationId: options.stationId,
    stationName: options.stationName,
    deliveryKind: options.deliveryKind,
  };
}

function shuffleArray(items, randomFn = Math.random) {
  const array = Array.isArray(items) ? [...items] : [];

  for (let index = array.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(randomFn() * (index + 1));
    [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
  }

  return array;
}
