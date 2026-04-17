import { handleStartFlow } from "../utils/onboarding.js";

export async function handleStartCommand(env, payload, state, vk) {
  await handleStartFlow(env, payload, vk);
}
