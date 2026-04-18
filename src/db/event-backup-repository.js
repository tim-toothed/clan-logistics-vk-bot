import { dbAll, dbBatch, dbFirst, dbRun } from "./client.js";

export const EVENT_BACKUP_SOURCE = "clan-logistics-vk-bot";
export const EVENT_BACKUP_VERSION = 1;

export async function createEventBackupSnapshot(env) {
  const [users, teams, stations, events, messages] = await Promise.all([
    dbAll(
      env,
      `
        SELECT DISTINCT
          u.id,
          u.vk_user_id,
          u.display_name,
          u.is_admin,
          u.station_id,
          u.team_id
        FROM users u
        WHERE u.is_admin = 1
           OR u.station_id IS NOT NULL
           OR u.team_id IS NOT NULL
           OR EXISTS (
             SELECT 1
             FROM events e
             WHERE e.started_by_user_id = u.id
                OR e.ended_by_user_id = u.id
           )
        ORDER BY u.id ASC
      `,
    ),
    dbAll(env, "SELECT id, team_name, status, current_station_id FROM teams ORDER BY id ASC"),
    dbAll(env, "SELECT id, station_name, status, current_team_id FROM stations ORDER BY id ASC"),
    dbAll(
      env,
      `
        SELECT
          id,
          station_id,
          team_id,
          start_time,
          end_time,
          status,
          started_by_user_id,
          ended_by_user_id
        FROM events
        ORDER BY id ASC
      `,
    ),
    dbAll(
      env,
      `
        SELECT
          id,
          trigger_type,
          station_id,
          title,
          content_json,
          is_enabled
        FROM messages
        ORDER BY id ASC
      `,
    ),
  ]);

  return {
    source: EVENT_BACKUP_SOURCE,
    version: EVENT_BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    data: {
      users,
      teams,
      stations,
      events,
      messages,
    },
  };
}

export function stringifyEventBackup(snapshot) {
  return JSON.stringify(snapshot, null, 2);
}

export function parseEventBackup(rawText) {
  let parsed;

  try {
    parsed = JSON.parse(String(rawText ?? ""));
  } catch {
    throw new Error("Не удалось прочитать JSON-файл экспорта.");
  }

  if (parsed?.source !== EVENT_BACKUP_SOURCE) {
    throw new Error("Этот файл не похож на экспорт clan-logistics-vk-bot.");
  }

  if (Number(parsed?.version) !== EVENT_BACKUP_VERSION) {
    throw new Error("Версия файла экспорта не поддерживается.");
  }

  if (!parsed?.data || typeof parsed.data !== "object") {
    throw new Error("В файле отсутствует блок данных для импорта.");
  }

  return {
    source: parsed.source,
    version: Number(parsed.version),
    exported_at: typeof parsed.exported_at === "string" ? parsed.exported_at : null,
    data: {
      users: normalizeArray(parsed.data.users),
      teams: normalizeArray(parsed.data.teams),
      stations: normalizeArray(parsed.data.stations),
      events: normalizeArray(parsed.data.events),
      messages: normalizeArray(parsed.data.messages),
    },
  };
}

export async function getEventDataCounts(env) {
  const row = await dbFirst(
    env,
    `
      SELECT
        (SELECT COUNT(*) FROM teams) AS teams_count,
        (SELECT COUNT(*) FROM stations) AS stations_count,
        (SELECT COUNT(*) FROM events) AS events_count,
        (SELECT COUNT(*) FROM messages) AS messages_count
    `,
  );

  return {
    teams: Number(row?.teams_count ?? 0),
    stations: Number(row?.stations_count ?? 0),
    events: Number(row?.events_count ?? 0),
    messages: Number(row?.messages_count ?? 0),
  };
}

export function hasEventData(counts) {
  return Object.values(counts ?? {}).some((value) => Number(value) > 0);
}

export async function importEventBackupSnapshot(env, snapshot) {
  const normalizedSnapshot = snapshot?.data ? snapshot : parseEventBackup(JSON.stringify(snapshot));
  const counts = await getEventDataCounts(env);

  if (hasEventData(counts)) {
    throw new Error("Импорт доступен только в пустое мероприятие.");
  }

  const { users, teams, stations, events, messages } = normalizedSnapshot.data;
  const userIdMap = await ensureBackupUsers(env, users);

  await insertStations(env, stations);
  await insertTeams(env, teams);
  await insertMessages(env, messages);
  await insertEvents(env, events, userIdMap);
  await restoreCircularRefs(env, teams, stations);
  await restoreUserEventRefs(env, users, userIdMap);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

async function ensureBackupUsers(env, users) {
  const userIdMap = new Map();

  for (const user of users) {
    const vkUserId = String(user?.vk_user_id ?? "").trim();

    if (!vkUserId) {
      continue;
    }

    const existingUser = await dbFirst(env, "SELECT * FROM users WHERE vk_user_id = ?", [vkUserId]);

    if (existingUser) {
      await dbRun(
        env,
        `
          UPDATE users
          SET display_name = ?,
              is_admin = ?
          WHERE id = ?
        `,
        [normalizeNullableString(user.display_name), normalizeBooleanFlag(user.is_admin), existingUser.id],
      );
      userIdMap.set(Number(user.id), existingUser.id);
      continue;
    }

    const result = await dbRun(
      env,
      `
        INSERT INTO users (vk_user_id, display_name, is_admin, station_id, team_id)
        VALUES (?, ?, ?, NULL, NULL)
      `,
      [vkUserId, normalizeNullableString(user.display_name), normalizeBooleanFlag(user.is_admin)],
    );

    userIdMap.set(Number(user.id), Number(result.meta?.last_row_id));
  }

  return userIdMap;
}

async function insertStations(env, stations) {
  if (!stations.length) {
    return;
  }

  await dbBatch(
    env,
    stations.map((station) => ({
      sql: "INSERT INTO stations (id, station_name, status, current_team_id) VALUES (?, ?, ?, NULL)",
      bindings: [station.id, station.station_name, station.status ?? "free"],
    })),
  );
}

async function insertTeams(env, teams) {
  if (!teams.length) {
    return;
  }

  await dbBatch(
    env,
    teams.map((team) => ({
      sql: "INSERT INTO teams (id, team_name, status, current_station_id) VALUES (?, ?, ?, NULL)",
      bindings: [team.id, team.team_name, team.status ?? "waiting_start"],
    })),
  );
}

async function insertMessages(env, messages) {
  if (!messages.length) {
    return;
  }

  await dbBatch(
    env,
    messages.map((message) => ({
      sql: "INSERT INTO messages (id, trigger_type, station_id, title, content_json, is_enabled) VALUES (?, ?, ?, ?, ?, ?)",
      bindings: [
        message.id,
        message.trigger_type,
        message.station_id ?? null,
        message.title,
        message.content_json,
        normalizeBooleanFlag(message.is_enabled),
      ],
    })),
  );
}

async function insertEvents(env, events, userIdMap) {
  if (!events.length) {
    return;
  }

  await dbBatch(
    env,
    events.map((event) => ({
      sql: `
        INSERT INTO events (id, station_id, team_id, start_time, end_time, status, started_by_user_id, ended_by_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      bindings: [
        event.id,
        event.station_id,
        event.team_id,
        event.start_time,
        event.end_time ?? null,
        event.status,
        mapBackupUserId(userIdMap, event.started_by_user_id),
        mapBackupUserId(userIdMap, event.ended_by_user_id),
      ],
    })),
  );
}

async function restoreCircularRefs(env, teams, stations) {
  const statements = [];

  for (const team of teams) {
    if (team.current_station_id !== null && team.current_station_id !== undefined) {
      statements.push({
        sql: "UPDATE teams SET current_station_id = ? WHERE id = ?",
        bindings: [team.current_station_id, team.id],
      });
    }
  }

  for (const station of stations) {
    if (station.current_team_id !== null && station.current_team_id !== undefined) {
      statements.push({
        sql: "UPDATE stations SET current_team_id = ? WHERE id = ?",
        bindings: [station.current_team_id, station.id],
      });
    }
  }

  if (statements.length) {
    await dbBatch(env, statements);
  }
}

async function restoreUserEventRefs(env, users, userIdMap) {
  const statements = [];

  for (const user of users) {
    const currentUserId = mapBackupUserId(userIdMap, user.id);

    if (!currentUserId) {
      continue;
    }

    statements.push({
      sql: `
        UPDATE users
        SET display_name = ?,
            is_admin = ?,
            station_id = ?,
            team_id = ?
        WHERE id = ?
      `,
      bindings: [
        normalizeNullableString(user.display_name),
        normalizeBooleanFlag(user.is_admin),
        user.station_id ?? null,
        user.team_id ?? null,
        currentUserId,
      ],
    });
  }

  if (statements.length) {
    await dbBatch(env, statements);
  }
}

function mapBackupUserId(userIdMap, backupUserId) {
  if (backupUserId === null || backupUserId === undefined) {
    return null;
  }

  return userIdMap.get(Number(backupUserId)) ?? null;
}

function normalizeBooleanFlag(value) {
  return Number(value) ? 1 : 0;
}

function normalizeNullableString(value) {
  const normalizedValue = String(value ?? "").trim();
  return normalizedValue || null;
}
