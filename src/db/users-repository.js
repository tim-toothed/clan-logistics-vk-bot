import { dbFirst, dbRun } from "./client.js";

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

export async function setUserAdminMode(env, userId, stationId = null) {
  await dbRun(
    env,
    `
      UPDATE users
      SET is_admin = 1,
          station_id = ?,
          team_id = NULL
      WHERE id = ?
    `,
    [stationId, userId],
  );
}

export async function setUserParticipantMode(env, userId) {
  await dbRun(
    env,
    `
      UPDATE users
      SET is_admin = 0,
          station_id = NULL
      WHERE id = ?
    `,
    [userId],
  );
}

export async function resetUserRole(env, userId) {
  await dbRun(
    env,
    `
      UPDATE users
      SET is_admin = 0,
          station_id = NULL,
          team_id = NULL
      WHERE id = ?
    `,
    [userId],
  );
}
