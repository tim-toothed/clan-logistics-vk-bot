import { handleRoleFlow } from "../utils/onboarding.js";

export async function handleDefaultMessage(env, payload, state, vk) {
  await handleRoleFlow(env, payload, vk);
}
