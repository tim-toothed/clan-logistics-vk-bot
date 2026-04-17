import { ACTIONS } from "../../app/action-types.js";
import { STATE_TYPES } from "../../app/state-types.js";
import {
  buildMessageTriggerOptions,
  deleteMessageById,
  getMessageById,
  listMessagesForMenu,
  MESSAGE_TRIGGER_TYPES,
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

const TRIGGER_MENU_MODES = Object.freeze({
  ROOT: "root",
  STATION: "station",
});

const STATION_TRIGGER_PAGE_SIZE = 6;

export async function openBotMessagesMenu(context) {
  const messages = await listMessagesForMenu(context.env);

  await sendBotMessagesMenuScreen(
    context.vk,
    context.peerId,
    messages.map((message) => ({
      id: message.id,
      label: message.display_title,
    })),
  );
  await setUserState(context.env, context.user.id, STATE_TYPES.BOT_MESSAGES_MENU, "idle");
  return true;
}

export async function handleBotMessagesMenuState(context) {
  if (context.action === ACTIONS.BACK_TO_ADMIN_MENU || context.input === "назад") {
    await setUserState(context.env, context.user.id, STATE_TYPES.ADMIN_MENU, "idle");
    await sendAdminMenuScreen(context.vk, context.peerId);
    return true;
  }

  if (context.action === ACTIONS.MESSAGE_CREATE) {
    return openMessageTriggerMenu(context, { mode: TRIGGER_MENU_MODES.ROOT, page: 0 });
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
  const menuPayload = normalizeTriggerMenuPayload(context.userState?.payload);

  if (context.action === ACTIONS.MESSAGES_MENU_BACK || context.input === "назад") {
    if (menuPayload.mode === TRIGGER_MENU_MODES.STATION) {
      return openMessageTriggerMenu(context, { mode: TRIGGER_MENU_MODES.ROOT, page: 0 });
    }

    return openBotMessagesMenu(context);
  }

  if (context.action === ACTIONS.MESSAGE_TRIGGER_STATIONS) {
    return openMessageTriggerMenu(context, { mode: TRIGGER_MENU_MODES.STATION, page: 0 });
  }

  if (context.action === ACTIONS.MESSAGE_TRIGGER_PAGE) {
    return openMessageTriggerMenu(context, {
      mode: TRIGGER_MENU_MODES.STATION,
      page: Number(context.buttonPayload?.page ?? 0),
    });
  }

  if (context.action !== ACTIONS.MESSAGE_TRIGGER_SELECT) {
    return openMessageTriggerMenu(context, menuPayload);
  }

  await sendMessageRecordingStartScreen(context.vk, context.peerId, context.buttonPayload.title);
  await setUserState(context.env, context.user.id, STATE_TYPES.MESSAGE_RECORDING, "record", {
    triggerType: context.buttonPayload.triggerType,
    stationId: context.buttonPayload.stationId ?? null,
    title: context.buttonPayload.title,
    items: [],
  });
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

    await sendMessageRecordingStartScreen(context.vk, context.peerId, message.display_title);
    await setUserState(context.env, context.user.id, STATE_TYPES.MESSAGE_RECORDING, "record", {
      triggerType: message.trigger_type,
      stationId: message.station_id ?? null,
      title: message.title,
      items: [],
    });
    return true;
  }

  await sendMessageTemplateActionsScreen(context.vk, context.peerId, messageId);
  return true;
}

async function openMessageTriggerMenu(context, payload) {
  const screenModel = await buildTriggerMenuScreenModel(context.env, payload);

  await sendMessageTriggerSelectScreen(context.vk, context.peerId, screenModel.text, screenModel.buttons);
  await setUserState(context.env, context.user.id, STATE_TYPES.MESSAGE_TRIGGER_MENU, "idle", screenModel.statePayload);
  return true;
}

async function buildTriggerMenuScreenModel(env, payload) {
  const options = await buildMessageTriggerOptions(env);
  const normalizedPayload = normalizeTriggerMenuPayload(payload);

  if (normalizedPayload.mode === TRIGGER_MENU_MODES.STATION) {
    const stationOptions = options.filter((option) => option.triggerType === MESSAGE_TRIGGER_TYPES.GO_TO_STATION);

    if (!stationOptions.length) {
      return {
        text: "Сначала добавьте станции, и после этого здесь появятся варианты для сообщений перехода.",
        buttons: [],
        statePayload: { mode: TRIGGER_MENU_MODES.ROOT, page: 0 },
      };
    }

    const maxPage = Math.max(0, Math.ceil(stationOptions.length / STATION_TRIGGER_PAGE_SIZE) - 1);
    const currentPage = Math.min(Math.max(0, normalizedPayload.page), maxPage);
    const pageStart = currentPage * STATION_TRIGGER_PAGE_SIZE;
    const pageButtons = stationOptions.slice(pageStart, pageStart + STATION_TRIGGER_PAGE_SIZE);

    return {
      text: `Для какой станции нужно сообщение?\nСтраница ${currentPage + 1} из ${maxPage + 1}`,
      buttons: Object.assign([...pageButtons], {
        previousPage: currentPage > 0 ? currentPage - 1 : null,
        nextPage: currentPage < maxPage ? currentPage + 1 : null,
      }),
      statePayload: { mode: TRIGGER_MENU_MODES.STATION, page: currentPage },
    };
  }

  const rootButtons = options
    .filter((option) => option.triggerType !== MESSAGE_TRIGGER_TYPES.GO_TO_STATION)
    .map((option) => ({ ...option }));

  rootButtons.splice(3, 0, {
    label: "Для перехода на станцию",
    color: "primary",
    payload: { action: ACTIONS.MESSAGE_TRIGGER_STATIONS },
  });

  return {
    text: "Когда сообщение должно отправляться?",
    buttons: rootButtons,
    statePayload: { mode: TRIGGER_MENU_MODES.ROOT, page: 0 },
  };
}

function normalizeTriggerMenuPayload(payload) {
  const mode = payload?.mode === TRIGGER_MENU_MODES.STATION ? TRIGGER_MENU_MODES.STATION : TRIGGER_MENU_MODES.ROOT;
  const page = Number.isInteger(payload?.page) ? payload.page : Number(payload?.page ?? 0);

  return {
    mode,
    page: Number.isFinite(page) ? Math.max(0, page) : 0,
  };
}
