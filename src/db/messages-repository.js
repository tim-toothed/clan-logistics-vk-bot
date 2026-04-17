import { dbAll, dbBatch, dbFirst, dbRun } from "./client.js";

export const MESSAGE_TRIGGER_TYPES = {
  BOT_START: "bot_start_message",
  PARTICIPANT_WELCOME: "participant_welcome",
  GO_TO_STATION: "go_to_station",
  WAIT_FOR_STATION: "wait_for_station",
  TEAM_FINISHED_ALL: "team_finished_all",
};

export async function getMessageByTrigger(env, triggerType, stationId = null) {
  if (stationId === null) {
    return dbFirst(
      env,
      `
        SELECT *
        FROM messages
        WHERE trigger_type = ?
          AND station_id IS NULL
          AND is_enabled = 1
        ORDER BY id DESC
        LIMIT 1
      `,
      [triggerType],
    );
  }

  return dbFirst(
    env,
    `
      SELECT *
      FROM messages
      WHERE trigger_type = ?
        AND station_id = ?
        AND is_enabled = 1
      ORDER BY id DESC
      LIMIT 1
    `,
    [triggerType, stationId],
  );
}

export async function listMessagesForMenu(env) {
  const rows = await dbAll(
    env,
    `
      SELECT
        m.*,
        s.station_name
      FROM messages m
      LEFT JOIN stations s ON s.id = m.station_id
      WHERE m.is_enabled = 1
      ORDER BY
        CASE m.trigger_type
          WHEN 'bot_start_message' THEN 1
          WHEN 'participant_welcome' THEN 2
          WHEN 'wait_for_station' THEN 3
          WHEN 'go_to_station' THEN 4
          WHEN 'team_finished_all' THEN 5
          ELSE 99
        END,
        m.id ASC
    `,
  );

  return rows.map(normalizeMessageRow);
}

export async function getMessageById(env, messageId) {
  const row = await dbFirst(
    env,
    `
      SELECT
        m.*,
        s.station_name
      FROM messages m
      LEFT JOIN stations s ON s.id = m.station_id
      WHERE m.id = ?
    `,
    [messageId],
  );

  return row ? normalizeMessageRow(row) : null;
}

export async function upsertMessageTemplate(env, { triggerType, stationId = null, title, contentItems }) {
  const existing = await findExistingMessageSlot(env, triggerType, stationId);
  const contentJson = JSON.stringify(contentItems);

  if (existing) {
    await dbRun(
      env,
      `
        UPDATE messages
        SET title = ?,
            content_json = ?,
            is_enabled = 1
        WHERE id = ?
      `,
      [title, contentJson, existing.id],
    );

    return existing.id;
  }

  const result = await dbRun(
    env,
    `
      INSERT INTO messages (trigger_type, station_id, title, content_json, is_enabled)
      VALUES (?, ?, ?, ?, 1)
    `,
    [triggerType, stationId, title, contentJson],
  );

  return result.meta?.last_row_id ?? null;
}

export async function deleteMessageById(env, messageId) {
  await dbRun(env, "DELETE FROM messages WHERE id = ?", [messageId]);
}

export async function deleteAllMessages(env) {
  await dbRun(env, "DELETE FROM messages");
}

export async function buildMessageTriggerOptions(env) {
  const stations = await dbAll(env, "SELECT id, station_name FROM stations ORDER BY id ASC");

  return [
    {
      triggerType: MESSAGE_TRIGGER_TYPES.BOT_START,
      stationId: null,
      title: "Стартовое сообщение бота",
      label: "Стартовое сообщение бота",
    },
    {
      triggerType: MESSAGE_TRIGGER_TYPES.PARTICIPANT_WELCOME,
      stationId: null,
      title: "Приветственное сообщение",
      label: "Приветственное сообщение",
    },
    {
      triggerType: MESSAGE_TRIGGER_TYPES.WAIT_FOR_STATION,
      stationId: null,
      title: "Сообщение об ожидании",
      label: "Сообщение об ожидании",
    },
    ...stations.map((station) => ({
      triggerType: MESSAGE_TRIGGER_TYPES.GO_TO_STATION,
      stationId: station.id,
      title: `Для перехода на станцию ${station.station_name}`,
      label: `Для перехода на станцию ${station.station_name}`,
    })),
    {
      triggerType: MESSAGE_TRIGGER_TYPES.TEAM_FINISHED_ALL,
      stationId: null,
      title: "После прохождения станций",
      label: "После прохождения станций",
    },
  ];
}

async function findExistingMessageSlot(env, triggerType, stationId) {
  if (stationId === null) {
    return dbFirst(env, "SELECT id FROM messages WHERE trigger_type = ? AND station_id IS NULL ORDER BY id DESC LIMIT 1", [
      triggerType,
    ]);
  }

  return dbFirst(
    env,
    "SELECT id FROM messages WHERE trigger_type = ? AND station_id = ? ORDER BY id DESC LIMIT 1",
    [triggerType, stationId],
  );
}

function normalizeMessageRow(row) {
  return {
    ...row,
    content_items: safeParseJson(row.content_json) ?? [],
    display_title: buildDisplayTitle(row),
  };
}

function buildDisplayTitle(row) {
  if (row.trigger_type === MESSAGE_TRIGGER_TYPES.GO_TO_STATION) {
    return row.station_name ? `Для перехода на станцию ${row.station_name}` : "Для перехода на станцию !ERROR!";
  }

  if (row.trigger_type === MESSAGE_TRIGGER_TYPES.BOT_START) {
    return "Стартовое сообщение бота";
  }

  if (row.trigger_type === MESSAGE_TRIGGER_TYPES.PARTICIPANT_WELCOME) {
    return "Приветственное сообщение";
  }

  if (row.trigger_type === MESSAGE_TRIGGER_TYPES.WAIT_FOR_STATION) {
    return "Сообщение об ожидании";
  }

  if (row.trigger_type === MESSAGE_TRIGGER_TYPES.TEAM_FINISHED_ALL) {
    return "После прохождения станций";
  }

  return row.title;
}

function safeParseJson(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
