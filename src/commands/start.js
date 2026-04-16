export async function handleStartCommand(env, payload, state, vk) {
  const peerId = payload?.object?.message?.peer_id;
  const message = [
    "Privet. Eto minimalnyi shablon VK-bota na Cloudflare Workers.",
    "Struktura uzhe gotova pod universalnyi main.js, CommandMap.js i otdelnye komandy.",
    "Napishi help, chtoby uvidet sleduyushchii shag.",
  ].join("\n");

  await vk.sendText(peerId, message);
}
