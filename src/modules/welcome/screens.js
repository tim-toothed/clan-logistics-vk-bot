import {
  createAdminStationKeyboard,
  createBackKeyboard,
  createParticipantKeyboard,
  createParticipantTeamKeyboard,
  createWhoAreYouKeyboard,
} from "./keyboards.js";

export const BOT_START_MESSAGE = "Тест: стартовое сообщение бота. Здесь позже будет bot_start_message.";
export const PARTICIPANT_WELCOME_MESSAGE =
  "Тест: вы зашли как участник. Во время мероприятия сюда будут приходить сообщения от бота.";
export const ADMIN_MENU_WELCOME_MESSAGE =
  "Тест: вы вошли как организатор. Основные разделы меню уже доступны для проверки.";

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

export async function sendParticipantTeamChoiceScreen(vk, peerId, teams) {
  if (!teams.length) {
    await vk.sendText(peerId, "Команды пока не добавлены. Попросите организатора сначала заполнить список команд.", {
      keyboard: createBackKeyboard(),
    });
    return;
  }

  await vk.sendText(peerId, "К какой команде вы относитесь?", {
    keyboard: createParticipantTeamKeyboard(teams),
  });
}

export async function sendInvalidParticipantTeamScreen(vk, peerId, teams) {
  await vk.sendText(peerId, "Не удалось найти такую команду. Выберите кнопку из списка.", {
    keyboard: createParticipantTeamKeyboard(teams),
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
