export async function handleHelpCommand({ event, vk }) {
  const message = [
    "Сейчас доступны команды:",
    "start - стартовое сообщение",
    "help - эта подсказка",
    "",
    "Дальше можно добавлять новые команды в src/commands и регистрировать их в CommandMap.js.",
  ].join("\n");

  await vk.sendText(event.peerId, message);
}
