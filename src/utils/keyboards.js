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

export function createKeyboard(rows, options = {}) {
  const { oneTime = false, inline = false } = options;

  return {
    one_time: oneTime,
    inline,
    buttons: rows.map((row) => row.map((button) => createTextButton(button.label, button.color))),
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
    [{ label: "Моя станция", color: "primary" }],
    [{ label: "Положение дел", color: "primary" }],
    [{ label: "Станции и команды", color: "primary" }],
    [{ label: "Сообщения Бота", color: "primary" }],
    [{ label: "Сброс", color: "negative" }],
    [{ label: "Выйти", color: "secondary" }],
  ]);
}
