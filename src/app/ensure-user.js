import { ensureUser, isFallbackDisplayName } from "../db/users-repository.js";

export async function ensureVkUser(env, vk, vkUserId) {
  const user = await ensureUser(env, vkUserId);

  if (!shouldRefreshDisplayName(user, vkUserId) || !vk?.getUserDisplayName) {
    return user;
  }

  try {
    const displayName = await vk.getUserDisplayName(vkUserId);

    if (!displayName || displayName === user.display_name) {
      return user;
    }

    return ensureUser(env, vkUserId, displayName);
  } catch (error) {
    console.warn("Failed to resolve VK user display name", {
      vkUserId,
      error: error instanceof Error ? error.message : String(error),
    });
    return user;
  }
}

function shouldRefreshDisplayName(user, vkUserId) {
  return !user?.display_name || isFallbackDisplayName(user.display_name, vkUserId);
}
