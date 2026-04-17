import { ACTIONS } from "../../app/action-types.js";
import { STATE_TYPES } from "../../app/state-types.js";
import {
  buildMessageTriggerOptions,
  deleteMessageById,
  getMessageById,
  listMessagesForMenu,
  upsertMessageTemplate,
} from "../../db/messages-repository.js";
import { setUserState } from "../../db/user-state-repository.js";
import { sendTemplateSequence, buildTemplateChunkFromPayload } from "../../utils/vk-message.js";
import { sendAdminMenuScreen } from "../admin-home/screens.js";
import {
  sendBotMessagesMenuScreen,
  sendMessageDeletedScreen,
  sendMessageRecordingContinueScreen,
  sendMessageRecordingStartScreen,
  sendMessageTemplateActionsScreen,
  sendMessageTriggerSelectScreen,
} from "./screens.js";

export async function openBotMessagesMenu(context) {
  const messages = await listMessagesForMenu(context.env);

  await setUserState(context.env, context.user.id, STATE_TYPES.BOT_MESSAGES_MENU, "idle");
  await sendBotMessagesMenuScreen(
    context.vk,
    context.peerId,
    messages.map((message) => ({
      id: message.id,
      label: message.display_title,
    })),
  );
  return true;
}

export async function handleBotMessagesMenuState(context) {
  if (context.action === ACTIONS.BACK_TO_ADMIN_MENU || context.input === "назад") {
    await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
    await sendAdminMenuScreen(context.vk, context.peerId);
    return true;
  }

  if (context.action === ACTIONS.MESSAGE_CREATE) {
    const triggerButtons = await buildMessageTriggerOptions(context.env);

    await setUserState(context.env, context.user.id, STATE_TYPES.MESSAGE_TRIGGER_MENU, "idle");
    await sendMessageTriggerSelectScreen(context.vk, context.peerId, triggerButtons);
    return true;
  }

  if (context.action === ACTIONS.MESSAGE_OPEN && context.buttonPayload?.messageId) {
    const message = await getMessageById(context.env, context.buttonPayload.messageId);

    if (!message) {
      return openBotMessagesMenu(context);
    }

    for (const item of message.content_items) {
      await sendTemplateSequence(context.vk, context.peerId, [item]);
    }

    await setUserState(context.env, context.user.id, STATE_TYPES.MESSAGE_TEMPLATE_ACTIONS, "idle", {
      messageId: message.id,
    });
    await sendMessageTemplateActionsScreen(context.vk, context.peerId, message.id);
    return true;
  }

  return openBotMessagesMenu(context);
}

export async function handleMessageTriggerMenuState(context) {
  if (context.action === ACTIONS.MESSAGES_MENU_BACK || context.input === "назад") {
    return openBotMessagesMenu(context);
  }

  if (context.action !== ACTIONS.MESSAGE_TRIGGER_SELECT) {
    const triggerButtons = await buildMessageTriggerOptions(context.env);
    await sendMessageTriggerSelectScreen(context.vk, context.peerId, triggerButtons);
    return true;
  }

  await setUserState(context.env, context.user.id, STATE_TYPES.MESSAGE_RECORDING, "record", {
    triggerType: context.buttonPayload.triggerType,
    stationId: context.buttonPayload.stationId ?? null,
    title: context.buttonPayload.title,
    items: [],
  });
  await sendMessageRecordingStartScreen(context.vk, context.peerId, context.buttonPayload.title);
  return true;
}

export async function handleMessageRecordingState(context) {
  const statePayload = context.userState?.payload ?? {};
  const currentItems = Array.isArray(statePayload.items) ? statePayload.items : [];

  if (context.action === ACTIONS.MESSAGE_RECORD_CANCEL) {
    return openBotMessagesMenu(context);
  }

  if (context.action === ACTIONS.MESSAGE_RECORD_CONFIRM) {
    if (!currentItems.length) {
      await sendMessageRecordingContinueScreen(context.vk, context.peerId);
      return true;
    }

    await upsertMessageTemplate(context.env, {
      triggerType: statePayload.triggerType,
      stationId: statePayload.stationId ?? null,
      title: statePayload.title,
      contentItems: currentItems,
    });

    return openBotMessagesMenu(context);
  }

  if (context.input === "назад") {
    return openBotMessagesMenu(context);
  }

  const chunk = buildTemplateChunkFromPayload(context.payload);

  if (!chunk) {
    await sendMessageRecordingContinueScreen(context.vk, context.peerId);
    return true;
  }

  const updatedItems = [...currentItems, chunk];

  await setUserState(context.env, context.user.id, STATE_TYPES.MESSAGE_RECORDING, "record", {
    ...statePayload,
    items: updatedItems,
  });
  await sendMessageRecordingContinueScreen(context.vk, context.peerId);
  return true;
}

export async function handleMessageTemplateActionsState(context) {
  const messageId = context.userState?.payload?.messageId;

  if (!messageId) {
    return openBotMessagesMenu(context);
  }

  if (context.action === ACTIONS.MESSAGES_MENU_BACK || context.input === "назад") {
    return openBotMessagesMenu(context);
  }

  if (context.action === ACTIONS.MESSAGE_DELETE) {
    await deleteMessageById(context.env, messageId);
    await sendMessageDeletedScreen(context.vk, context.peerId);
    return openBotMessagesMenu(context);
  }

  if (context.action === ACTIONS.MESSAGE_REPLACE) {
    const message = await getMessageById(context.env, messageId);

    if (!message) {
      return openBotMessagesMenu(context);
    }

    await setUserState(context.env, context.user.id, STATE_TYPES.MESSAGE_RECORDING, "record", {
      triggerType: message.trigger_type,
      stationId: message.station_id ?? null,
      title: message.title,
      items: [],
    });
    await sendMessageRecordingStartScreen(context.vk, context.peerId, message.display_title);
    return true;
  }

  await sendMessageTemplateActionsScreen(context.vk, context.peerId, messageId);
  return true;
}
