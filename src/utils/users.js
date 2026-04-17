import { dbFirst, dbRun } from "./db.js";

export async function ensureUser(env, vkUserId) {
  const normalizedVkUserId = String(vkUserId);
  const defaultDisplayName = `VK ${normalizedVkUserId}`;

  await dbRun(
    env,
    `
      INSERT INTO users (vk_user_id, display_name, is_admin, station_id, team_id)
      VALUES (?, ?, 0, NULL, NULL)
      ON CONFLICT(vk_user_id) DO UPDATE SET
        display_name = excluded.display_name
    `,
    [normalizedVkUserId, defaultDisplayName],
  );

  return dbFirst(env, "SELECT * FROM users WHERE vk_user_id = ?", [normalizedVkUserId]);
}
