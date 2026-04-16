export async function handleStartCommand({ event, vk }) {
  const message = [
    "Привет. Это минимальный шаблон VK-бота на Cloudflare Workers.",
    "Структура уже готова под main.js, CommandMap.js и отдельные команды.",
    "Напиши help, чтобы увидеть следующий шаг.",
  ].join("\n");

  await vk.sendText(event.peerId, message);
}
