export async function handleHelpCommand(env, payload, state, vk) {
  const peerId = payload?.object?.message?.peer_id;
  const message = [
    "Сейчас доступен тестовый сценарий входа в бота.",
    "Напишите start или /start, чтобы заново открыть стартовый экран.",
    "После этого можно проверить вход как участник или как организатор.",
    "",
    "Основные кнопки меню пока выведены как заглушки.",
  ].join("\n");

  await vk.sendText(peerId, message);
}
