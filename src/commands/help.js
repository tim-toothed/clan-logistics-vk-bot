export async function handleHelpCommand(env, payload, state, vk) {
  const peerId = payload?.object?.message?.peer_id;
  const message = [
    "Seichas dostupny komandy:",
    "start - startovoe soobshchenie",
    "help - eta podskazka",
    "",
    "Dalshe mozhno dobavliat novye komandy v src/commands i registrirovat ikh v CommandMap.js.",
  ].join("\n");

  await vk.sendText(peerId, message);
}
