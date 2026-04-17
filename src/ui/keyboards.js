function createTextButton(label, color = "secondary") {
  return {
    action: {
      type: "text",
      label,
      payload: JSON.stringify({ label }),
    },
    color,
  };
}

function createRichTextButton(button) {
  return {
    action: {
      type: "text",
      label: button.label,
      payload: JSON.stringify(button.payload ?? { label: button.label }),
    },
    color: button.color ?? "secondary",
  };
}

export function createKeyboard(rows, options = {}) {
  const { oneTime = false, inline = false } = options;

  return {
    one_time: oneTime,
    inline,
    buttons: rows.map((row) => row.map((button) => createRichTextButton(button))),
  };
}

export function createWhoAreYouKeyboard() {
  return createKeyboard([
    [{ label: "Участник", color: "primary" }],
    [{ label: "Организатор", color: "primary" }],
  ]);
}

export function createParticipantKeyboard() {
  return createKeyboard([[{ label: "Перепутал, я организатор", color: "secondary" }]]);
}

export function createParticipantTeamKeyboard(teams = []) {
  const rows = teams.map((team) => [
    {
      label: team.team_name,
      color: "primary",
      payload: {
        action: "participant_team_select",
        teamId: team.id,
      },
    },
  ]);

  rows.push([{ label: "Назад", color: "secondary", payload: { action: "back_to_who_are_you" } }]);
  return createKeyboard(rows);
}

export function createBackKeyboard() {
  return createKeyboard([[{ label: "Назад", color: "secondary" }]]);
}

export function createAdminStationKeyboard(stations = []) {
  const rows = [[{ label: "Войти как админ", color: "positive" }]];

  for (const stationName of stations) {
    rows.push([{ label: stationName, color: "primary" }]);
  }

  return createKeyboard(rows);
}

export function createStationsTeamsKeyboard() {
  return createKeyboard([
    [{ label: "Команды", color: "primary" }],
    [{ label: "Станции", color: "primary" }],
    [{ label: "Назад", color: "secondary" }],
  ]);
}

export function createAdminMenuKeyboard() {
  return createKeyboard([
    [{ label: "Моя станция", color: "primary", payload: { action: "open_my_station" } }],
    [{ label: "Положение дел", color: "primary", payload: { action: "open_status" } }],
    [{ label: "Станции и команды", color: "primary", payload: { action: "open_stations_teams" } }],
    [{ label: "Сообщения Бота", color: "primary", payload: { action: "open_bot_messages" } }],
    [{ label: "Сброс", color: "negative", payload: { action: "open_reset" } }],
    [{ label: "Выйти", color: "secondary", payload: { action: "exit" } }],
  ]);
}

export function createSingleButtonKeyboard(label, color = "secondary", payload = null) {
  return createKeyboard([[{ label, color, payload }]]);
}

export function createButtonsKeyboard(buttons, options = {}) {
  const rows = buttons.map((button) => [button]);
  return createKeyboard(rows, options);
}

export function createMyStationTeamsKeyboard(teams, options = {}) {
  const buttons = teams.map((team) => ({
    label: team.team_name,
    color: "primary",
    payload: {
      action: "station_team_select",
      teamId: team.id,
    },
  }));

  if (options.includeBack !== false) {
    buttons.push({
      label: "Назад",
      color: "secondary",
      payload: { action: "back_to_admin_menu" },
    });
  }

  return createButtonsKeyboard(buttons);
}

export function createActiveStationKeyboard(teamId) {
  return createKeyboard([
    [
      {
        label: "Завершить станцию",
        color: "positive",
        payload: { action: "station_finish", teamId },
      },
    ],
  ]);
}

export function createBotMessagesKeyboard(messageButtons = []) {
  return createKeyboard([
    [{ label: "Создать новое сообщение", color: "positive", payload: { action: "message_create" } }],
    ...messageButtons.map((messageButton) => [
      {
        label: messageButton.label,
        color: "primary",
        payload: {
          action: "message_open",
          messageId: messageButton.id,
        },
      },
    ]),
    [{ label: "Назад", color: "secondary", payload: { action: "back_to_admin_menu" } }],
  ]);
}

export function createMessageTriggerKeyboard(triggerButtons = []) {
  return createKeyboard([
    ...triggerButtons.map((button) => [
      {
        label: button.label,
        color: "primary",
        payload: {
          action: "message_trigger_select",
          triggerType: button.triggerType,
          stationId: button.stationId ?? null,
          title: button.title,
        },
      },
    ]),
    [{ label: "Назад", color: "secondary", payload: { action: "messages_menu_back" } }],
  ]);
}

export function createMessageRecordingKeyboard() {
  return createKeyboard([
    [{ label: "Подтвердить", color: "positive", payload: { action: "message_record_confirm" } }],
    [{ label: "Отмена", color: "negative", payload: { action: "message_record_cancel" } }],
  ]);
}

export function createExistingMessageActionsKeyboard(messageId) {
  return createKeyboard([
    [{ label: "Заменить сообщение", color: "primary", payload: { action: "message_replace", messageId } }],
    [{ label: "Удалить сообщение", color: "negative", payload: { action: "message_delete", messageId } }],
    [{ label: "Назад", color: "secondary", payload: { action: "messages_menu_back" } }],
  ]);
}

export function createResetConfirmKeyboard() {
  return createKeyboard([
    [{ label: "Да", color: "negative", payload: { action: "reset_confirm" } }],
    [{ label: "Назад", color: "secondary", payload: { action: "back_to_admin_menu" } }],
  ]);
}
