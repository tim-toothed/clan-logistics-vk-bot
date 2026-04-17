import {
  createActiveStationKeyboard,
  createAdminMenuKeyboard,
  createAdminStationKeyboard,
  createBackKeyboard,
  createBotMessagesKeyboard,
  createButtonsKeyboard,
  createExistingMessageActionsKeyboard,
  createMessageRecordingKeyboard,
  createMessageTriggerKeyboard,
  createMyStationTeamsKeyboard,
  createParticipantKeyboard,
  createParticipantTeamKeyboard,
  createResetConfirmKeyboard,
  createStationsTeamsKeyboard,
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

export async function sendAdminMenuScreen(vk, peerId, message = "Выберите раздел.") {
  await vk.sendText(peerId, message, {
    keyboard: createAdminMenuKeyboard(),
  });
}

export async function sendAdminMenuPlaceholderScreen(vk, peerId) {
  await vk.sendText(peerId, "Этот раздел ещё в разработке. Остальные основные разделы уже можно проверять.", {
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

export async function sendMyStationUnavailableScreen(vk, peerId) {
  await vk.sendText(peerId, 'Этот раздел доступен только организатору, привязанному к станции. Если станции ещё не назначены, используйте "Станции и команды" или войдите заново.', {
    keyboard: createAdminMenuKeyboard(),
  });
}

export async function sendMyStationMenuScreen(vk, peerId, teams) {
  if (!teams.length) {
    await vk.sendText(peerId, "Готовы начать станцию? Сейчас нет доступных команд для этой станции.", {
      keyboard: createButtonsKeyboard([
        { label: "Назад", color: "secondary", payload: { action: "back_to_admin_menu" } },
      ]),
    });
    return;
  }

  await vk.sendText(peerId, "Готовы начать станцию? Какая команда к вам пришла?", {
    keyboard: createMyStationTeamsKeyboard(teams),
  });
}

export async function sendActiveStationScreen(vk, peerId, teamName, teamId) {
  await vk.sendText(
    peerId,
    `Вы ведете станцию для команды ${teamName}. Не забудьте нажать "Завершить станцию", когда закончите - иначе участники заблудятся.`,
    {
      keyboard: createActiveStationKeyboard(teamId),
    },
  );
}

export async function sendStatusScreen(vk, peerId, text) {
  await vk.sendText(peerId, text, {
    keyboard: createBackKeyboard(),
  });
}

export async function sendBotMessagesMenuScreen(vk, peerId, messageButtons) {
  await vk.sendText(peerId, "Вот, какие сообщения сейчас есть для участников", {
    keyboard: createBotMessagesKeyboard(messageButtons),
  });
}

export async function sendMessageTriggerSelectScreen(vk, peerId, triggerButtons) {
  await vk.sendText(peerId, "Когда сообщение должно отправляться?", {
    keyboard: createMessageTriggerKeyboard(triggerButtons),
  });
}

export async function sendMessageRecordingStartScreen(vk, peerId, triggerTitle) {
  await vk.sendText(
    peerId,
    `Какое сообщение стоит отправлять участникам как ${triggerTitle}? Вы можете отправить любого рода сообщение или цепочку сообщений`,
    {
      keyboard: createBackKeyboard(),
    },
  );
}

export async function sendMessageRecordingContinueScreen(vk, peerId) {
  await vk.sendText(
    peerId,
    'Получил! Если это всё, тогда нажмите кнопку "Подтвердить". Если вы хотите отправить цепочку сообщений, то продолжайте, я слушаю.',
    {
      keyboard: createMessageRecordingKeyboard(),
    },
  );
}

export async function sendMessageTemplateActionsScreen(vk, peerId, messageId) {
  await vk.sendText(peerId, "Хотите переделать?", {
    keyboard: createExistingMessageActionsKeyboard(messageId),
  });
}

export async function sendMessageDeletedScreen(vk, peerId) {
  await vk.sendText(peerId, "Сообщение удалено.", {
    keyboard: createBackKeyboard(),
  });
}

export async function sendResetConfirmScreen(vk, peerId) {
  await vk.sendText(peerId, "Вы хотите удалить все данные о текущем мероприятии?", {
    keyboard: createResetConfirmKeyboard(),
  });
}

export async function sendResetCompletedScreen(vk, peerId) {
  await vk.sendText(peerId, "Данные текущего мероприятия удалены.", {
    keyboard: createAdminMenuKeyboard(),
  });
}
