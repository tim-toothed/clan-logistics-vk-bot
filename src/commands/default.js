export async function handleDefaultMessage(env, payload, state, vk) {
  const peerId = payload?.object?.message?.peer_id;
  const text = payload?.object?.message?.text?.trim?.() ?? "";
  const message = [
    "Shablon uzhe zadeploen i prinimaet soobshcheniia iz VK.",
    "Poprobui komandy start ili help.",
    text ? `Poluchil soobshchenie: ${text}` : "Pole text poka pustoe.",
  ].join("\n");

  await vk.sendText(peerId, message);
}
