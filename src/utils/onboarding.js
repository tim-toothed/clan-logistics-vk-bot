import {
  createAdminMenuKeyboard,
  createAdminStationKeyboard,
  createBackKeyboard,
  createParticipantKeyboard,
  createStationsTeamsKeyboard,
  createWhoAreYouKeyboard,
} from "./keyboards.js";
import {
  findStationByName,
  formatNumberedList,
  getStations,
  getTeams,
  parseNumberedList,
  replaceStations,
  replaceTeams,
} from "./setup-lists.js";
import { clearUserState, getUserState, setUserState } from "./user-state.js";
import { ensureUser, resetUserRole, setUserAdminMode, setUserParticipantMode } from "./users.js";

const BOT_START_MESSAGE = "Тест: стартовое сообщение бота. Здесь позже будет bot_start_message.";
const PARTICIPANT_WELCOME_MESSAGE =
  "Тест: вы зашли как участник. Во время мероприятия сюда будут приходить сообщения от бота.";
const ADMIN_MENU_MESSAGE =
  "Тест: вы вошли как организатор. Ниже базовое меню, а раздел «Станции и команды» уже подключен.";

const ADMIN_MENU_BUTTONS = new Set(["моя станция", "положение дел", "станции и команды", "сообщения бота", "сброс"]);

export async function handleStartFlow(env, payload, vk) {
  const peerId = getPeerId(payload);
  const user = await ensureCurrentUser(env, payload);

  await resetUserRole(env, user.id);
  await clearUserState(env, user.id);
  await vk.sendText(peerId, BOT_START_MESSAGE);
  await sendWhoAreYouMessage(vk, peerId);
}

export async function handleRoleFlow(env, payload, vk) {
  const peerId = getPeerId(payload);
  const rawText = getMessageText(payload);
  const input = normalizeText(rawText);
  const user = await ensureCurrentUser(env, payload);
  const userState = await getUserState(env, user.id);

  if (input === "участник") {
    await setUserParticipantMode(env, user.id);
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
    await resetUserRole(env, user.id);
    await clearUserState(env, user.id);
    await sendWhoAreYouMessage(vk, peerId);
    return;
  }

  if (userState?.state_type === "await_admin_password") {
    await handleAdminPassword(env, payload, vk, user.id, input);
    return;
  }

  if (userState?.state_type === "await_admin_station") {
    await handleAdminStationChoice(env, payload, vk, user.id, input, rawText);
    return;
  }

  if (userState?.state_type === "manage_lists_menu") {
    await handleStationsTeamsMenu(env, payload, vk, user.id, input);
    return;
  }

  if (userState?.state_type === "edit_teams_list") {
    await handleTeamsEdit(env, payload, vk, user.id, input, rawText);
    return;
  }

  if (userState?.state_type === "edit_stations_list") {
    await handleStationsEdit(env, payload, vk, user.id, input, rawText);
    return;
  }

  if (input === "назад") {
    await resetUserRole(env, user.id);
    await clearUserState(env, user.id);
    await sendWhoAreYouMessage(vk, peerId);
    return;
  }

  if (input === "выйти") {
    await resetUserRole(env, user.id);
    await clearUserState(env, user.id);
    await sendWhoAreYouMessage(vk, peerId);
    return;
  }

  if (userState?.state_type === "admin_menu") {
    await handleAdminMenu(env, payload, vk, user.id, input);
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
    const stations = await getStations(env);

    await setUserState(env, userId, "await_admin_station", "wait_station_choice");
    await vk.sendText(
      peerId,
      'К какой станции вы привязаны? Если станции ещё не были назначены или устарели - просто нажмите "Войти как админ"',
      {
        keyboard: createAdminStationKeyboard(stations.map((station) => station.station_name)),
      },
    );
    return;
  }

  await setUserState(env, userId, "await_admin_password", "wait_password");
  await vk.sendText(peerId, "Пароль неверный. Непохоже, что вы организатор", {
    keyboard: createBackKeyboard(),
  });
}

async function handleAdminStationChoice(env, payload, vk, userId, input, rawText) {
  const peerId = getPeerId(payload);

  if (input === "назад") {
    await resetUserRole(env, userId);
    await clearUserState(env, userId);
    await sendWhoAreYouMessage(vk, peerId);
    return;
  }

  if (input === "войти как админ") {
    await setUserAdminMode(env, userId, null);
    await setUserState(env, userId, "admin_menu", "idle");
    await vk.sendText(peerId, ADMIN_MENU_MESSAGE);
    await sendAdminMenu(vk, peerId);
    return;
  }

  const selectedStation = await findStationByName(env, rawText);

  if (!selectedStation) {
    const stations = await getStations(env);

    await vk.sendText(
      peerId,
      'Не удалось найти такую станцию. Выберите кнопку из списка или нажмите "Войти как админ".',
      {
        keyboard: createAdminStationKeyboard(stations.map((station) => station.station_name)),
      },
    );
    return;
  }

  await setUserAdminMode(env, userId, selectedStation.id);
  await setUserState(env, userId, "admin_menu", "idle");
  await vk.sendText(peerId, `Вы вошли как организатор станции "${selectedStation.station_name}".`);
  await sendAdminMenu(vk, peerId);
}

async function handleAdminMenu(env, payload, vk, userId, input) {
  const peerId = getPeerId(payload);

  if (input === "станции и команды") {
    await setUserState(env, userId, "manage_lists_menu", "idle");
    await sendStationsTeamsMenu(vk, peerId);
    return;
  }

  if (!ADMIN_MENU_BUTTONS.has(input)) {
    await vk.sendText(peerId, "Сейчас доступен только базовый показ меню. Раздел «Станции и команды» уже работает, остальные подключим следующим шагом.", {
      keyboard: createAdminMenuKeyboard(),
    });
    return;
  }

  const label = toDisplayCase(input);
  await vk.sendText(peerId, `Раздел "${label}" пока в разработке.`, {
    keyboard: createAdminMenuKeyboard(),
  });
}

async function handleStationsTeamsMenu(env, payload, vk, userId, input) {
  const peerId = getPeerId(payload);

  if (input === "назад") {
    await setUserState(env, userId, "admin_menu", "idle");
    await sendAdminMenu(vk, peerId);
    return;
  }

  if (input === "команды") {
    await setUserState(env, userId, "edit_teams_list", "wait_list");
    await sendTeamsEditPrompt(env, vk, peerId);
    return;
  }

  if (input === "станции") {
    await setUserState(env, userId, "edit_stations_list", "wait_list");
    await sendStationsEditPrompt(env, vk, peerId);
    return;
  }

  await sendStationsTeamsMenu(vk, peerId);
}

async function handleTeamsEdit(env, payload, vk, userId, input, rawText) {
  const peerId = getPeerId(payload);

  if (input === "назад") {
    await setUserState(env, userId, "manage_lists_menu", "idle");
    await sendStationsTeamsMenu(vk, peerId);
    return;
  }

  const teamNames = parseNumberedList(rawText);

  if (!teamNames) {
    await vk.sendText(peerId, "Некорректный формат списка. Попробуйте ещё раз", {
      keyboard: createBackKeyboard(),
    });
    return;
  }

  await replaceTeams(env, teamNames);
  await setUserState(env, userId, "manage_lists_menu", "idle");
  await vk.sendText(peerId, `Список команд обновлён.\n\nТекущий список команд:\n${teamNames.map(formatListLine).join("\n")}`, {
    keyboard: createStationsTeamsKeyboard(),
  });
}

async function handleStationsEdit(env, payload, vk, userId, input, rawText) {
  const peerId = getPeerId(payload);

  if (input === "назад") {
    await setUserState(env, userId, "manage_lists_menu", "idle");
    await sendStationsTeamsMenu(vk, peerId);
    return;
  }

  const stationNames = parseNumberedList(rawText);

  if (!stationNames) {
    await vk.sendText(peerId, "Некорректный формат списка. Попробуйте ещё раз", {
      keyboard: createBackKeyboard(),
    });
    return;
  }

  await replaceStations(env, stationNames);
  await setUserState(env, userId, "manage_lists_menu", "idle");
  await vk.sendText(peerId, `Список станций обновлён.\n\nТекущий список станций:\n${stationNames.map(formatListLine).join("\n")}`, {
    keyboard: createStationsTeamsKeyboard(),
  });
}

async function sendWhoAreYouMessage(vk, peerId) {
  await vk.sendText(peerId, "Кто вы?", {
    keyboard: createWhoAreYouKeyboard(),
  });
}

async function sendAdminMenu(vk, peerId) {
  await vk.sendText(peerId, "Меню администратора", {
    keyboard: createAdminMenuKeyboard(),
  });
}

async function sendStationsTeamsMenu(vk, peerId) {
  await vk.sendText(peerId, "Какой раздел вы хотите редактировать?", {
    keyboard: createStationsTeamsKeyboard(),
  });
}

async function sendTeamsEditPrompt(env, vk, peerId) {
  const teams = await getTeams(env);
  const currentTeams = formatNumberedList(teams, "team_name");

  await vk.sendText(
    peerId,
    `Впишите новый список команд. Текущий список команд:\n${currentTeams}\n\nФормат:\n1. text\n2. text\n3. ...`,
    {
      keyboard: createBackKeyboard(),
    },
  );
}

async function sendStationsEditPrompt(env, vk, peerId) {
  const stations = await getStations(env);
  const currentStations = formatNumberedList(stations, "station_name");

  await vk.sendText(
    peerId,
    `Впишите новый список станций. Текущий список станций:\n${currentStations}\n\nФормат:\n1. text\n2. text\n3. ...`,
    {
      keyboard: createBackKeyboard(),
    },
  );
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

function formatListLine(value, index) {
  return `${index + 1}. ${value}`;
}
