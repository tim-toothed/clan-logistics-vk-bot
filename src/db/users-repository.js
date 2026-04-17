import { dbAll, dbFirst, dbRun } from "./client.js";

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

export async function setUserParticipantTeam(env, userId, teamId) {
  await dbRun(
    env,
    `
      UPDATE users
      SET is_admin = 0,
          station_id = NULL,
          team_id = ?
      WHERE id = ?
    `,
    [teamId, userId],
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

export async function getUserById(env, userId) {
  return dbFirst(env, "SELECT * FROM users WHERE id = ?", [userId]);
}

export async function listAdminPeerIdsByStation(env, stationId) {
  const rows = await dbAll(
    env,
    `
      SELECT vk_user_id
      FROM users
      WHERE is_admin = 1
        AND station_id = ?
    `,
    [stationId],
  );

  return rows.map((row) => Number(row.vk_user_id)).filter(Boolean);
}

export async function listAdminLabelsByStation(env, stationId) {
  const rows = await dbAll(
    env,
    `
      SELECT display_name, vk_user_id
      FROM users
      WHERE is_admin = 1
        AND station_id = ?
      ORDER BY id ASC
    `,
    [stationId],
  );

  return rows.map((row) => row.display_name || `VK ${row.vk_user_id}`);
}

export async function listParticipantPeerIdsByTeam(env, teamId) {
  const rows = await dbAll(
    env,
    `
      SELECT vk_user_id
      FROM users
      WHERE is_admin = 0
        AND team_id = ?
    `,
    [teamId],
  );

  return rows.map((row) => Number(row.vk_user_id)).filter(Boolean);
}

export async function resetUsersEventData(env) {
  await dbRun(
    env,
    `
      UPDATE users
      SET station_id = NULL,
          team_id = NULL
    `,
  );
}
