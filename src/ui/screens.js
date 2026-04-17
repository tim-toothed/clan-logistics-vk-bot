import {
  createAdminMenuKeyboard,
  createAdminStationKeyboard,
  createBackKeyboard,
  createParticipantKeyboard,
  createStationsTeamsKeyboard,
  createWhoAreYouKeyboard,
} from "./keyboards.js";

export const BOT_START_MESSAGE = "Тест: стартовое сообщение бота. Здесь позже будет bot_start_message.";
export const PARTICIPANT_WELCOME_MESSAGE =
  "Тест: вы зашли как участник. Во время мероприятия сюда будут приходить сообщения от бота.";
export const ADMIN_MENU_WELCOME_MESSAGE =
  "Тест: вы вошли как организатор. Ниже базовое меню, а раздел «Станции и команды» уже подключен.";

export async function sendWhoAreYouScreen(vk, peerId) {
  await vk.sendText(peerId, "Кто вы?", {
    keyboard: createWhoAreYouKeyboard(),
  });
}

export async function sendParticipantHomeScreen(vk, peerId) {
  await vk.sendText(peerId, PARTICIPANT_WELCOME_MESSAGE, {
    keyboard: createParticipantKeyboard(),
  });
}

export async function sendParticipantIdleScreen(vk, peerId) {
  await vk.sendText(peerId, "Сейчас меню для участника не предусмотрено. Во время мероприятия сюда будут приходить сообщения.", {
    keyboard: createParticipantKeyboard(),
  });
}

export async function sendAskAdminPasswordScreen(vk, peerId) {
  await vk.sendText(peerId, "Введите пароль", {
    keyboard: createBackKeyboard(),
  });
}

export async function sendInvalidPasswordScreen(vk, peerId) {
  await vk.sendText(peerId, "Пароль неверный. Непохоже, что вы организатор", {
    keyboard: createBackKeyboard(),
  });
}

export async function sendAdminStationChoiceScreen(vk, peerId, stationNames) {
  await vk.sendText(
    peerId,
    'К какой станции вы привязаны? Если станции ещё не были назначены или устарели - просто нажмите "Войти как админ"',
    {
      keyboard: createAdminStationKeyboard(stationNames),
    },
  );
}

export async function sendInvalidAdminStationScreen(vk, peerId, stationNames) {
  await vk.sendText(
    peerId,
    'Не удалось найти такую станцию. Выберите кнопку из списка или нажмите "Войти как админ".',
    {
      keyboard: createAdminStationKeyboard(stationNames),
    },
  );
}

export async function sendAdminMenuScreen(vk, peerId, message = "Выберите раздел.") {
  await vk.sendText(peerId, message, {
    keyboard: createAdminMenuKeyboard(),
  });
}

export async function sendAdminMenuPlaceholderScreen(vk, peerId) {
  await vk.sendText(peerId, "Сейчас доступен только базовый показ меню. Раздел «Станции и команды» уже работает, остальные подключим следующим шагом.", {
    keyboard: createAdminMenuKeyboard(),
  });
}

export async function sendSectionInDevelopmentScreen(vk, peerId, label) {
  await vk.sendText(peerId, `Раздел "${label}" пока в разработке.`, {
    keyboard: createAdminMenuKeyboard(),
  });
}

export async function sendStationsTeamsMenuScreen(vk, peerId) {
  await vk.sendText(peerId, "Какой раздел вы хотите редактировать?", {
    keyboard: createStationsTeamsKeyboard(),
  });
}

export async function sendTeamsEditPromptScreen(vk, peerId, currentTeams) {
  await vk.sendText(
    peerId,
    `Впишите новый список команд. Текущий список команд:\n${currentTeams}\n\nФормат:\n1. text\n2. text\n3. ...`,
    {
      keyboard: createBackKeyboard(),
    },
  );
}

export async function sendStationsEditPromptScreen(vk, peerId, currentStations) {
  await vk.sendText(
    peerId,
    `Впишите новый список станций. Текущий список станций:\n${currentStations}\n\nФормат:\n1. text\n2. text\n3. ...`,
    {
      keyboard: createBackKeyboard(),
    },
  );
}

export async function sendInvalidListFormatScreen(vk, peerId) {
  await vk.sendText(peerId, "Некорректный формат списка. Попробуйте ещё раз", {
    keyboard: createBackKeyboard(),
  });
}

export async function sendTeamsUpdatedScreen(vk, peerId, listText) {
  await vk.sendText(peerId, `Список команд обновлён.\n\nТекущий список команд:\n${listText}`, {
    keyboard: createStationsTeamsKeyboard(),
  });
}

export async function sendStationsUpdatedScreen(vk, peerId, listText) {
  await vk.sendText(peerId, `Список станций обновлён.\n\nТекущий список станций:\n${listText}`, {
    keyboard: createStationsTeamsKeyboard(),
  });
}
