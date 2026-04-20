import { dbAll, dbFirst, dbRun } from "./client.js";

const VK_FALLBACK_DISPLAY_NAME_PREFIX = "VK ";

export async function ensureUser(env, vkUserId, displayName = null) {
  const normalizedVkUserId = String(vkUserId);
  const fallbackDisplayName = getFallbackDisplayName(normalizedVkUserId);
  const normalizedDisplayName = normalizeDisplayName(displayName, fallbackDisplayName);
  const existingUser = await dbFirst(env, "SELECT * FROM users WHERE vk_user_id = ?", [normalizedVkUserId]);

  if (!existingUser) {
    await dbRun(
      env,
      `
        INSERT INTO users (vk_user_id, display_name, is_admin, station_id, team_id)
        VALUES (?, ?, 0, NULL, NULL)
      `,
      [normalizedVkUserId, normalizedDisplayName ?? fallbackDisplayName],
    );

    return dbFirst(env, "SELECT * FROM users WHERE vk_user_id = ?", [normalizedVkUserId]);
  }

  if (normalizedDisplayName && normalizedDisplayName !== existingUser.display_name) {
    await dbRun(
      env,
      `
        UPDATE users
        SET display_name = ?
        WHERE id = ?
      `,
      [normalizedDisplayName, existingUser.id],
    );

    return {
      ...existingUser,
      display_name: normalizedDisplayName,
    };
  }

  return existingUser;
}

export function getFallbackDisplayName(vkUserId) {
  return `${VK_FALLBACK_DISPLAY_NAME_PREFIX}${String(vkUserId)}`;
}

export function isFallbackDisplayName(displayName, vkUserId = null) {
  if (typeof displayName !== "string") {
    return true;
  }

  const normalizedDisplayName = displayName.trim();

  if (vkUserId !== null && vkUserId !== undefined) {
    return normalizedDisplayName === getFallbackDisplayName(vkUserId);
  }

  return normalizedDisplayName.startsWith(VK_FALLBACK_DISPLAY_NAME_PREFIX);
}

function normalizeDisplayName(displayName, fallbackDisplayName) {
  const normalizedDisplayName = String(displayName ?? "").trim();

  if (!normalizedDisplayName || normalizedDisplayName === fallbackDisplayName) {
    return null;
  }

  return normalizedDisplayName;
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

export async function listAllAdminPeerIds(env) {
  const rows = await dbAll(
    env,
    `
      SELECT DISTINCT vk_user_id
      FROM users
      WHERE is_admin = 1
      ORDER BY id ASC
    `,
  );

  return rows.map((row) => Number(row.vk_user_id)).filter(Boolean);
}

export async function listMainAdminUsers(env) {
  const rows = await dbAll(
    env,
    `
      SELECT vk_user_id, display_name
      FROM users
      WHERE is_admin = 1
        AND station_id IS NULL
      ORDER BY id ASC
    `,
  );

  return rows
    .map((row) => ({
      peerId: Number(row.vk_user_id),
      displayName: row.display_name || getFallbackDisplayName(row.vk_user_id),
    }))
    .filter((row) => row.peerId);
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

  return rows.map((row) => row.display_name || getFallbackDisplayName(row.vk_user_id));
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

export async function listParticipantUsersByTeam(env, teamId) {
  const rows = await dbAll(
    env,
    `
      SELECT vk_user_id, display_name
      FROM users
      WHERE is_admin = 0
        AND team_id = ?
      ORDER BY id ASC
    `,
    [teamId],
  );

  return rows
    .map((row) => ({
      peerId: Number(row.vk_user_id),
      vkUserId: Number(row.vk_user_id),
      displayName: row.display_name || getFallbackDisplayName(row.vk_user_id),
    }))
    .filter((row) => row.peerId);
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
