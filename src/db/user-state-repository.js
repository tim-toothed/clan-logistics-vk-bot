import { dbFirst, dbRun } from "./client.js";

export async function getUserState(env, userId) {
  const row = await dbFirst(env, "SELECT * FROM user_state WHERE user_id = ?", [userId]);

  if (!row) {
    return null;
  }

  return {
    ...row,
    payload: safeParseJson(row.payload_json),
  };
}

export async function setUserState(env, userId, stateType, stepKey, payload = null) {
  const payloadJson = payload === null ? null : JSON.stringify(payload);

  await dbRun(
    env,
    `
      INSERT INTO user_state (user_id, state_type, step_key, payload_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        state_type = excluded.state_type,
        step_key = excluded.step_key,
        payload_json = excluded.payload_json
    `,
    [userId, stateType, stepKey, payloadJson],
  );
}

export async function clearUserState(env, userId) {
  await dbRun(env, "DELETE FROM user_state WHERE user_id = ?", [userId]);
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
