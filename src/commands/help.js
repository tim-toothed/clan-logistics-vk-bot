export async function handleHelpCommand(env, payload, state, vk) {
  const peerId = payload?.object?.message?.peer_id;
  const message = [
    "Сейчас доступен рабочий сценарий входа в бота.",
    "Напишите start или /start, чтобы заново открыть стартовый экран.",
    "После этого можно проверить вход как участник или как организатор.",
    "",
    "В меню организатора уже доступны разделы:",
    "- Моя станция",
    "- Положение дел",
    "- Станции и команды",
    "- Сообщения Бота",
    "- Сброс",
  ].join("\n");

  await vk.sendText(peerId, message);
}
