import { createFlowContext } from "../../app/create-context.js";
import { ACTIONS } from "../../app/action-types.js";
import { STATE_TYPES } from "../../app/state-types.js";
import {
  createEventBackupSnapshot,
  getEventDataCounts,
  hasEventData,
  importEventBackupSnapshot,
  parseEventBackup,
  stringifyEventBackup,
} from "../../db/event-backup-repository.js";
import { deleteAllMessages } from "../../db/messages-repository.js";
import { deleteTeamsAndStations, resetEventData } from "../../db/events-repository.js";
import { clearUserStates, setUserState } from "../../db/user-state-repository.js";
import {
  listAllAdminPeerIds,
  listAssignedParticipantUsers,
  listMainAdminUsers,
  listStationAdminUsers,
  resetStationAdminsAndParticipants,
  resetUsersEventData,
} from "../../db/users-repository.js";
import { sendAdminMenuScreen } from "../admin-home/screens.js";
import {
  sendImportAdminOnlyScreen,
  sendImportAwaitFileScreen,
  sendImportBlockedScreen,
  sendImportCompletedScreen,
  sendImportFailedScreen,
  sendResetBackupFailedScreen,
  sendResetBackupNotificationScreen,
  sendResetCompletedScreen,
  sendResetConfirmScreen,
  sendResetMenuScreen,
  sendResetUsersAssignmentsLogScreen,
} from "./screens.js";

const BACKUP_FILE_EXTENSION = ".json.gz";
const LEGACY_IMPORT_FILE_EXTENSION = ".json";

export async function openResetConfirm(context) {
  await setUserState(context.env, context.user.id, STATE_TYPES.RESET_MENU, "menu");
  await sendResetMenuScreen(context.vk, context.peerId);
  return true;
}

export async function handleResetConfirmState(context) {
  if (context.action === ACTIONS.BACK_TO_ADMIN_MENU || context.input === "назад") {
    await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
    await sendAdminMenuScreen(context.vk, context.peerId, { env: context.env, user: context.user });
    return true;
  }

  if (context.userState?.state_type === STATE_TYPES.RESET_MENU) {
    if (context.action === ACTIONS.OPEN_RESET_ACTIVITY_HISTORY || context.input === "история активности") {
      await setUserState(context.env, context.user.id, STATE_TYPES.RESET_CONFIRM, "activity_history");
      await sendResetConfirmScreen(context.vk, context.peerId, "activity_history");
      return true;
    }

    if (context.action === ACTIONS.OPEN_RESET_USERS_ASSIGNMENTS || context.input === "участники и орги") {
      await setUserState(context.env, context.user.id, STATE_TYPES.RESET_CONFIRM, "users_assignments");
      await sendResetConfirmScreen(context.vk, context.peerId, "users_assignments");
      return true;
    }

    if (context.action === ACTIONS.OPEN_RESET_ALL_DATA || context.input === "все данные") {
      await setUserState(context.env, context.user.id, STATE_TYPES.RESET_CONFIRM, "all_data");
      await sendResetConfirmScreen(context.vk, context.peerId, "all_data");
      return true;
    }

    await sendResetMenuScreen(context.vk, context.peerId);
    return true;
  }

  if (context.action === ACTIONS.OPEN_RESET) {
    await setUserState(context.env, context.user.id, STATE_TYPES.RESET_MENU, "menu");
    await sendResetMenuScreen(context.vk, context.peerId);
    return true;
  }

  if (context.userState?.step_key === "activity_history") {
    if (context.action !== ACTIONS.RESET_CONFIRM_ACTIVITY_HISTORY && context.input !== "да") {
      await sendResetConfirmScreen(context.vk, context.peerId, "activity_history");
      return true;
    }

    await resetEventData(context.env);
    await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
    await sendResetCompletedScreen(context.vk, context.peerId, "История активности удалена. Команды, станции и сообщения сохранены.");
    return true;
  }

  if (context.userState?.step_key === "users_assignments") {
    if (context.action !== ACTIONS.RESET_CONFIRM_USERS_ASSIGNMENTS && context.input !== "да") {
      await sendResetConfirmScreen(context.vk, context.peerId, "users_assignments");
      return true;
    }

    const [stationAdmins, participants, mainAdmins] = await Promise.all([
      listStationAdminUsers(context.env),
      listAssignedParticipantUsers(context.env),
      listMainAdminUsers(context.env),
    ]);

    await clearUserStates(context.env, [...stationAdmins.map((user) => user.id), ...participants.map((user) => user.id)]);
    await resetStationAdminsAndParticipants(context.env);

    await notifyUsersAboutAssignmentsReset(
      context,
      stationAdmins,
      'Основной админ сбросил организаторов со всех станций. Если хотите зайти снова отправьте "/start" или "Начать"',
    );
    await notifyUsersAboutAssignmentsReset(
      context,
      participants,
      'Участники сброшены из команд. Если хотите зайти снова отправьте "/start" или "Начать"',
    );

    const counts = {
      stationAdmins: stationAdmins.length,
      participants: participants.length,
    };
    const initiatorWasReset = stationAdmins.some((user) => user.id === context.user.id) || participants.some((user) => user.id === context.user.id);

    for (const admin of mainAdmins) {
      if (admin.peerId === context.peerId) {
        continue;
      }
      await sendResetUsersAssignmentsLogScreen(context.vk, admin.peerId, counts, true);
    }

    if (!initiatorWasReset) {
      await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
      await sendResetCompletedScreen(
        context.vk,
        context.peerId,
        `Сброшены привязки пользователей.\n\nОрганизаторов со станций: ${counts.stationAdmins}\nУчастников из команд: ${counts.participants}`,
      );
    }

    return true;
  }

  if (context.action !== ACTIONS.RESET_CONFIRM_ALL_DATA && context.input !== "да") {
    await sendResetConfirmScreen(context.vk, context.peerId, "all_data");
    return true;
  }

  const adminPeerIds = await listAllAdminPeerIds(context.env);
  const backupSnapshot = await createEventBackupSnapshot(context.env);
  const backupFileName = buildBackupFileName();
  let backupAttachment;

  try {
    const backupFileContents = await compressBackupText(stringifyEventBackup(backupSnapshot));

    backupAttachment = await context.vk.uploadMessageDocument(
      context.peerId,
      backupFileName,
      backupFileContents,
      "application/gzip",
    );
  } catch (error) {
    console.error("Failed to create reset backup file", error);
    await sendResetBackupFailedScreen(context.vk, context.peerId);
    return true;
  }

  await resetEventData(context.env);
  await deleteAllMessages(context.env);
  await deleteTeamsAndStations(context.env);
  await resetUsersEventData(context.env);

  await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");

  const notificationPeerIds = adminPeerIds.length ? adminPeerIds : [context.peerId];

  for (const peerId of notificationPeerIds) {
    await sendResetBackupNotificationScreen(context.vk, peerId, backupAttachment, peerId === context.peerId);
  }

  if (!notificationPeerIds.includes(context.peerId)) {
    await sendResetBackupNotificationScreen(context.vk, context.peerId, backupAttachment, true);
  }

  return true;
}

export async function handleImportCommand(env, payload, state, vk) {
  void state;

  const context = await createFlowContext(env, payload, vk);

  if (!context.user?.is_admin) {
    await sendImportAdminOnlyScreen(vk, context.peerId);
    return;
  }

  const counts = await getEventDataCounts(env);

  if (hasEventData(counts)) {
    await sendImportBlockedScreen(vk, context.peerId);
    return;
  }

  await setUserState(env, context.user.id, STATE_TYPES.IMPORT_WAIT_FILE, "await_file");
  await sendImportAwaitFileScreen(vk, context.peerId);
}

export async function handleImportWaitFileState(context) {
  if (context.input === "назад") {
    await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
    await sendAdminMenuScreen(context.vk, context.peerId, { env: context.env, user: context.user });
    return true;
  }

  const counts = await getEventDataCounts(context.env);

  if (hasEventData(counts)) {
    await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
    await sendImportBlockedScreen(context.vk, context.peerId);
    return true;
  }

  const document = extractImportDocument(context.payload);

  if (!document) {
    await sendImportFailedScreen(context.vk, context.peerId, "Ожидается документ JSON, прикрепленный к следующему сообщению.");
    return true;
  }

  try {
    const rawBackupText = await downloadImportDocumentText(context, document);
    const snapshot = parseEventBackup(rawBackupText);

    await importEventBackupSnapshot(context.env, snapshot);
    await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
    await sendImportCompletedScreen(context.vk, context.peerId);
  } catch (error) {
    console.error("Failed to import event backup", error);
    await sendImportFailedScreen(
      context.vk,
      context.peerId,
      error instanceof Error ? error.message : "Неизвестная ошибка импорта.",
    );
  }

  return true;
}

function buildBackupFileName() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `clan-logistics-backup-${timestamp}${BACKUP_FILE_EXTENSION}`;
}

function extractImportDocument(payload) {
  const attachments = payload?.object?.message?.attachments;

  if (!Array.isArray(attachments)) {
    return null;
  }

  return attachments.find((attachment) => attachment?.type === "doc" && attachment?.doc)?.doc ?? null;
}

async function downloadImportDocumentText(context, document) {
  if (!isSupportedImportDocument(document)) {
    throw new Error("Нужен файл экспорта мероприятия от бота.");
  }

  const documentUrl = await resolveImportDocumentUrl(context, document);

  if (!documentUrl) {
    throw new Error("Не удалось получить ссылку на файл из VK.");
  }

  const response = await fetch(documentUrl);

  if (!response.ok) {
    throw new Error("Не удалось скачать приложенный файл.");
  }

  if (isCompressedImportDocument(document)) {
    return decompressBackupResponse(response);
  }

  return response.text();
}

async function resolveImportDocumentUrl(context, document) {
  if (typeof document?.url === "string" && document.url) {
    return document.url;
  }

  if (!document?.owner_id || !document?.id) {
    return null;
  }

  const docs = await context.vk.call("docs.getById", {
    docs: buildDocumentId(document),
  });

  return docs?.[0]?.url ?? null;
}

function buildDocumentId(document) {
  const accessKeySuffix = document.access_key ? `_${document.access_key}` : "";
  return `${document.owner_id}_${document.id}${accessKeySuffix}`;
}

async function compressBackupText(rawText) {
  const stream = new Blob([rawText], { type: "application/json" }).stream();
  const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));
  const compressedBuffer = await new Response(compressedStream).arrayBuffer();

  return new Uint8Array(compressedBuffer);
}

async function decompressBackupResponse(response) {
  if (!response.body) {
    throw new Error("Не удалось прочитать содержимое файла экспорта.");
  }

  const decompressedStream = response.body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(decompressedStream).text();
}

function isSupportedImportDocument(document) {
  const extension = getImportDocumentExtension(document);
  return extension === "gz" || extension === "json";
}

function isCompressedImportDocument(document) {
  const extension = getImportDocumentExtension(document);

  if (extension === "gz") {
    return true;
  }

  const title = String(document?.title ?? "").toLowerCase();
  return title.endsWith(BACKUP_FILE_EXTENSION);
}

function getImportDocumentExtension(document) {
  const explicitExtension = String(document?.ext ?? "")
    .trim()
    .toLowerCase();

  if (explicitExtension) {
    return explicitExtension;
  }

  const title = String(document?.title ?? "").trim().toLowerCase();

  if (title.endsWith(BACKUP_FILE_EXTENSION)) {
    return "gz";
  }

  if (title.endsWith(LEGACY_IMPORT_FILE_EXTENSION)) {
    return "json";
  }

  return "";
}

async function notifyUsersAboutAssignmentsReset(context, users, message) {
  for (const user of users) {
    try {
      await context.vk.sendText(user.peerId, message);
    } catch (error) {
      console.error("Failed to notify user about assignment reset", error, {
        peerId: user.peerId,
        userId: user.id,
      });
    }
  }
}
