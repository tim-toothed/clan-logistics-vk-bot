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
import { setUserState } from "../../db/user-state-repository.js";
import { listAllAdminPeerIds, resetUsersEventData } from "../../db/users-repository.js";
import { sendAdminMenuScreen } from "../admin-home/screens.js";
import {
  sendImportAdminOnlyScreen,
  sendImportAwaitFileScreen,
  sendImportBlockedScreen,
  sendImportCompletedScreen,
  sendImportFailedScreen,
  sendResetBackupFailedScreen,
  sendResetBackupNotificationScreen,
  sendResetConfirmScreen,
} from "./screens.js";

const IMPORT_FILE_EXTENSION = ".json";

export async function openResetConfirm(context) {
  await setUserState(context.env, context.user.id, STATE_TYPES.RESET_CONFIRM, "confirm");
  await sendResetConfirmScreen(context.vk, context.peerId);
  return true;
}

export async function handleResetConfirmState(context) {
  if (context.action === ACTIONS.BACK_TO_ADMIN_MENU || context.input === "назад") {
    await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
    await sendAdminMenuScreen(context.vk, context.peerId);
    return true;
  }

  if (context.action !== ACTIONS.RESET_CONFIRM && context.input !== "да") {
    await sendResetConfirmScreen(context.vk, context.peerId);
    return true;
  }

  const adminPeerIds = await listAllAdminPeerIds(context.env);
  const backupSnapshot = await createEventBackupSnapshot(context.env);
  const backupFileName = buildBackupFileName();
  let backupAttachment;

  try {
    backupAttachment = await context.vk.uploadMessageDocument(
      context.peerId,
      backupFileName,
      stringifyEventBackup(backupSnapshot),
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
    await sendAdminMenuScreen(context.vk, context.peerId);
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
  return `clan-logistics-backup-${timestamp}${IMPORT_FILE_EXTENSION}`;
}

function extractImportDocument(payload) {
  const attachments = payload?.object?.message?.attachments;

  if (!Array.isArray(attachments)) {
    return null;
  }

  return attachments.find((attachment) => attachment?.type === "doc" && attachment?.doc)?.doc ?? null;
}

async function downloadImportDocumentText(context, document) {
  if (typeof document?.ext === "string" && document.ext && document.ext.toLowerCase() !== "json") {
    throw new Error("Нужен JSON-файл экспорта мероприятия.");
  }

  const documentUrl = await resolveImportDocumentUrl(context, document);

  if (!documentUrl) {
    throw new Error("Не удалось получить ссылку на файл из VK.");
  }

  const response = await fetch(documentUrl);

  if (!response.ok) {
    throw new Error("Не удалось скачать приложенный файл.");
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
