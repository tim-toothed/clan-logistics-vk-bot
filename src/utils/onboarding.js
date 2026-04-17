import {
  createAdminMenuKeyboard,
  createAdminStationKeyboard,
  createBackKeyboard,
  createParticipantKeyboard,
  createWhoAreYouKeyboard,
} from "./keyboards.js";
import { clearUserState, getUserState, setUserState } from "./user-state.js";
import { ensureUser } from "./users.js";

const BOT_START_MESSAGE = "Тест: стартовое сообщение бота. Здесь позже будет bot_start_message.";
const PARTICIPANT_WELCOME_MESSAGE =
  "Тест: вы зашли как участник. Во время мероприятия сюда будут приходить сообщения от бота.";
const ADMIN_MENU_MESSAGE =
  "Тест: вы вошли как организатор. Ниже базовое меню, кнопки разделов пока не подключены.";

const ADMIN_MENU_BUTTONS = new Set([
  "моя станция",
  "положение дел",
  "станции и команды",
  "сообщения бота",
  "сброс",
]);

export async function handleStartFlow(env, payload, vk) {
  const peerId = getPeerId(payload);
  const user = await ensureCurrentUser(env, payload);

  await clearUserState(env, user.id);
  await vk.sendText(peerId, BOT_START_MESSAGE);
  await sendWhoAreYouMessage(vk, peerId);
}

export async function handleRoleFlow(env, payload, vk) {
  const peerId = getPeerId(payload);
  const input = normalizeText(getMessageText(payload));
  const user = await ensureCurrentUser(env, payload);
  const userState = await getUserState(env, user.id);

  if (input === "участник") {
    await setUserState(env, user.id, "participant_home", "idle");
    await vk.sendText(peerId, PARTICIPANT_WELCOME_MESSAGE, {
      keyboard: createParticipantKeyboard(),
    });
    return;
  }

  if (input === "организатор" || input === "админ") {
    await setUserState(env, user.id, "await_admin_password", "wait_password");
    await vk.sendText(peerId, "Введите пароль");
    return;
  }

  if (input === "перепутал, я организатор") {
    await clearUserState(env, user.id);
    await sendWhoAreYouMessage(vk, peerId);
    return;
  }

  if (input === "назад") {
    await clearUserState(env, user.id);
    await sendWhoAreYouMessage(vk, peerId);
    return;
  }

  if (userState?.state_type === "await_admin_password") {
    await handleAdminPassword(env, payload, vk, user.id, input);
    return;
  }

  if (userState?.state_type === "await_admin_station") {
    await handleAdminStationChoice(env, payload, vk, user.id, input);
    return;
  }

  if (input === "выйти") {
    await clearUserState(env, user.id);
    await sendWhoAreYouMessage(vk, peerId);
    return;
  }

  if (userState?.state_type === "admin_menu") {
    await handleAdminMenuPlaceholder(payload, vk, input);
    return;
  }

  if (userState?.state_type === "participant_home") {
    await vk.sendText(peerId, "Сейчас меню для участника не предусмотрено. Во время мероприятия сюда будут приходить сообщения.", {
      keyboard: createParticipantKeyboard(),
    });
    return;
  }

  await sendWhoAreYouMessage(vk, peerId);
}

async function handleAdminPassword(env, payload, vk, userId, input) {
  const peerId = getPeerId(payload);
  const adminPassword = env.ADMIN_PASSWORD ?? "admin";

  if (input === adminPassword.toLowerCase()) {
    await setUserState(env, userId, "await_admin_station", "wait_station_choice");
    await vk.sendText(
      peerId,
      'К какой станции вы привязаны? Если станции ещё не были назначены или устарели - просто нажмите "Войти как админ"',
      {
        keyboard: createAdminStationKeyboard(),
      },
    );
    return;
  }

  await setUserState(env, userId, "await_admin_password", "wait_password");
  await vk.sendText(peerId, "Пароль неверный. Непохоже, что вы организатор", {
    keyboard: createBackKeyboard(),
  });
}

async function handleAdminStationChoice(env, payload, vk, userId, input) {
  const peerId = getPeerId(payload);

  if (input !== "войти как админ") {
    await vk.sendText(
      peerId,
      'Пока для теста доступен только вариант "Войти как админ".',
      {
        keyboard: createAdminStationKeyboard(),
      },
    );
    return;
  }

  await setUserState(env, userId, "admin_menu", "idle");
  await vk.sendText(peerId, ADMIN_MENU_MESSAGE);
  await vk.sendText(peerId, "Меню администратора", {
    keyboard: createAdminMenuKeyboard(),
  });
}

async function handleAdminMenuPlaceholder(payload, vk, input) {
  const peerId = getPeerId(payload);

  if (!ADMIN_MENU_BUTTONS.has(input)) {
    await vk.sendText(peerId, "Сейчас доступен только базовый показ меню. Остальные разделы подключим следующим шагом.", {
      keyboard: createAdminMenuKeyboard(),
    });
    return;
  }

  const label = toDisplayCase(input);
  await vk.sendText(peerId, `Раздел "${label}" пока в разработке.`, {
    keyboard: createAdminMenuKeyboard(),
  });
}

async function sendWhoAreYouMessage(vk, peerId) {
  await vk.sendText(peerId, "Кто вы?", {
    keyboard: createWhoAreYouKeyboard(),
  });
}

async function ensureCurrentUser(env, payload) {
  const vkUserId = payload?.object?.message?.from_id;

  if (!vkUserId) {
    throw new Error("VK payload did not contain from_id");
  }

  return ensureUser(env, vkUserId);
}

function getPeerId(payload) {
  return payload?.object?.message?.peer_id;
}

function getMessageText(payload) {
  return payload?.object?.message?.text ?? "";
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function toDisplayCase(value) {
  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}
