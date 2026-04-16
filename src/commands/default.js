export async function handleDefaultMessage({ event, vk }) {
  const message = [
    "Шаблон уже задеплоен и принимает сообщения из VK.",
    "Попробуй команды start или help.",
    event.text ? `Получил сообщение: ${event.text}` : "Поле text пока пустое.",
  ].join("\n");

  await vk.sendText(event.peerId, message);
}
