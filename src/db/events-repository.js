import { dbAll, dbBatch, dbFirst, dbRun } from "./client.js";

export async function getStationById(env, stationId) {
  return dbFirst(env, "SELECT * FROM stations WHERE id = ?", [stationId]);
}

export async function getTeamById(env, teamId) {
  return dbFirst(env, "SELECT * FROM teams WHERE id = ?", [teamId]);
}

export async function hasAnyEvents(env) {
  const row = await dbFirst(env, "SELECT COUNT(*) AS total FROM events");
  return Number(row?.total ?? 0) > 0;
}

export async function getActiveEventForStation(env, stationId) {
  return dbFirst(
    env,
    `
      SELECT *
      FROM events
      WHERE station_id = ?
        AND status = 'active'
      ORDER BY id DESC
      LIMIT 1
    `,
    [stationId],
  );
}

export async function getCompletedStationIdsForTeam(env, teamId) {
  const rows = await dbAll(
    env,
    `
      SELECT DISTINCT station_id
      FROM events
      WHERE team_id = ?
        AND status = 'completed'
    `,
    [teamId],
  );

  return rows.map((row) => row.station_id);
}

export async function getAvailableTeamsForStation(env, stationId) {
  return dbAll(
    env,
    `
      SELECT t.*
      FROM teams t
      WHERE t.status != 'finished'
        AND t.current_station_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM events e
          WHERE e.station_id = ?
            AND e.team_id = t.id
            AND e.status = 'completed'
        )
      ORDER BY t.id ASC
    `,
    [stationId],
  );
}

export async function assignTeamToPreparingStation(env, { stationId, teamId }) {
  await dbBatch(env, [
    {
      sql: "UPDATE stations SET status = 'preparing', current_team_id = ? WHERE id = ?",
      bindings: [teamId, stationId],
    },
    {
      sql: "UPDATE teams SET status = 'on_station', current_station_id = ? WHERE id = ?",
      bindings: [stationId, teamId],
    },
    {
      sql: "INSERT INTO events (station_id, team_id, start_time, end_time, status, started_by_user_id, ended_by_user_id) VALUES (?, ?, NULL, NULL, 'active', NULL, NULL)",
      bindings: [stationId, teamId],
    },
  ]);
}

export async function markPreparedStationReady(env, { stationId, teamId, startedByUserId, startTime }) {
  const [stationResult, eventResult] = await dbBatch(env, [
    {
      sql: "UPDATE stations SET status = 'occupied' WHERE id = ? AND status = 'preparing' AND current_team_id = ?",
      bindings: [stationId, teamId],
    },
    {
      sql: "UPDATE events SET start_time = ?, started_by_user_id = ? WHERE station_id = ? AND team_id = ? AND status = 'active' AND start_time IS NULL",
      bindings: [startTime, startedByUserId, stationId, teamId],
    },
  ]);

  return Number(stationResult?.meta?.changes ?? 0) === 1 && Number(eventResult?.meta?.changes ?? 0) === 1;
}

export async function claimActiveEventForCompletion(env, { eventId, stationId, claimingUserId }) {
  const result = await dbRun(
    env,
    "UPDATE events SET ended_by_user_id = ? WHERE id = ? AND station_id = ? AND status = 'active' AND ended_by_user_id IS NULL",
    [claimingUserId, eventId, stationId],
  );

  return Number(result?.meta?.changes ?? 0) === 1;
}

export async function releaseActiveEventCompletionClaim(env, { eventId, stationId, claimingUserId }) {
  await dbRun(
    env,
    "UPDATE events SET ended_by_user_id = NULL WHERE id = ? AND station_id = ? AND status = 'active' AND ended_by_user_id = ?",
    [eventId, stationId, claimingUserId],
  );
}

export async function claimNextStationForTeam(env, { stationId, teamId }) {
  const result = await dbRun(
    env,
    "UPDATE stations SET status = 'preparing', current_team_id = ? WHERE id = ? AND status = 'free' AND current_team_id IS NULL",
    [teamId, stationId],
  );

  return Number(result?.meta?.changes ?? 0) === 1;
}

export async function releaseClaimedNextStation(env, { stationId, teamId }) {
  await dbRun(
    env,
    "UPDATE stations SET status = 'free', current_team_id = NULL WHERE id = ? AND status = 'preparing' AND current_team_id = ?",
    [stationId, teamId],
  );
}

export async function claimWaitingTeamAssignment(env, { stationId, teamId }) {
  const teamResult = await dbRun(
    env,
    "UPDATE teams SET current_station_id = ? WHERE id = ? AND status = 'waiting_station' AND current_station_id IS NULL",
    [stationId, teamId],
  );

  if (Number(teamResult?.meta?.changes ?? 0) !== 1) {
    return { ok: false, reason: "team_unavailable" };
  }

  const stationClaimed = await claimNextStationForTeam(env, { stationId, teamId });

  if (!stationClaimed) {
    await dbRun(
      env,
      "UPDATE teams SET current_station_id = NULL WHERE id = ? AND status = 'waiting_station' AND current_station_id = ?",
      [teamId, stationId],
    );
    return { ok: false, reason: "station_unavailable" };
  }

  return { ok: true };
}

export async function finalizeWaitingTeamAssignment(env, { stationId, teamId }) {
  await dbBatch(env, [
    {
      sql: "UPDATE teams SET status = 'on_station', current_station_id = ? WHERE id = ? AND status = 'waiting_station' AND current_station_id = ?",
      bindings: [stationId, teamId, stationId],
    },
    {
      sql: "INSERT INTO events (station_id, team_id, start_time, end_time, status, started_by_user_id, ended_by_user_id) VALUES (?, ?, NULL, NULL, 'active', NULL, NULL)",
      bindings: [stationId, teamId],
    },
  ]);
}

export async function releaseWaitingTeamAssignment(env, { stationId, teamId }) {
  await dbBatch(env, [
    {
      sql: "DELETE FROM events WHERE station_id = ? AND team_id = ? AND status = 'active' AND ended_by_user_id IS NULL",
      bindings: [stationId, teamId],
    },
    {
      sql: "UPDATE teams SET current_station_id = NULL WHERE id = ? AND status = 'waiting_station' AND current_station_id = ?",
      bindings: [teamId, stationId],
    },
    {
      sql: "UPDATE stations SET status = 'free', current_team_id = NULL WHERE id = ? AND status = 'preparing' AND current_team_id = ?",
      bindings: [stationId, teamId],
    },
  ]);
}

export async function completeStationForTeam(env, { eventId, stationId, teamId, endedByUserId, endTime, stationDone, teamStatus }) {
  await dbBatch(env, [
    {
      sql: "UPDATE events SET end_time = ?, status = 'completed', ended_by_user_id = ? WHERE id = ? AND status = 'active'",
      bindings: [endTime, endedByUserId, eventId],
    },
    {
      sql: "UPDATE stations SET status = ?, current_team_id = NULL WHERE id = ?",
      bindings: [stationDone ? "done" : "free", stationId],
    },
    {
      sql: "UPDATE teams SET status = ?, current_station_id = NULL WHERE id = ?",
      bindings: [teamStatus, teamId],
    },
  ]);
}

export async function transitionTeamToNextStation(
  env,
  { eventId, stationId, teamId, nextStationId, endedByUserId, endTime, stationDone },
) {
  await dbBatch(env, [
    {
      sql: "UPDATE events SET end_time = ?, status = 'completed', ended_by_user_id = ? WHERE id = ? AND status = 'active'",
      bindings: [endTime, endedByUserId, eventId],
    },
    {
      sql: "UPDATE stations SET status = ?, current_team_id = NULL WHERE id = ?",
      bindings: [stationDone ? "done" : "free", stationId],
    },
    {
      sql: "UPDATE stations SET status = 'preparing', current_team_id = ? WHERE id = ?",
      bindings: [teamId, nextStationId],
    },
    {
      sql: "UPDATE teams SET status = 'on_station', current_station_id = ? WHERE id = ?",
      bindings: [nextStationId, teamId],
    },
    {
      sql: "INSERT INTO events (station_id, team_id, start_time, end_time, status, started_by_user_id, ended_by_user_id) VALUES (?, ?, NULL, NULL, 'active', NULL, NULL)",
      bindings: [nextStationId, teamId],
    },
  ]);
}

export async function getCandidateStationsForTeam(env, teamId) {
  return dbAll(
    env,
    `
      SELECT
        s.*,
        MAX(e.end_time) AS last_end_time
      FROM stations s
      LEFT JOIN events e
        ON e.station_id = s.id
       AND e.status = 'completed'
      WHERE s.status = 'free'
        AND NOT EXISTS (
          SELECT 1
          FROM events te
          WHERE te.station_id = s.id
            AND te.team_id = ?
            AND te.status = 'completed'
        )
      GROUP BY s.id
      ORDER BY
        CASE WHEN MAX(e.end_time) IS NULL THEN 0 ELSE 1 END ASC,
        MAX(e.end_time) ASC,
        s.id ASC
    `,
    [teamId],
  );
}

export async function getRemainingStationsForTeam(env, teamId) {
  return dbAll(
    env,
    `
      SELECT s.*
      FROM stations s
      WHERE NOT EXISTS (
        SELECT 1
        FROM events e
        WHERE e.station_id = s.id
          AND e.team_id = ?
          AND e.status = 'completed'
      )
      ORDER BY s.id ASC
    `,
    [teamId],
  );
}

export async function getPendingTeamsForStation(env, stationId) {
  return dbAll(
    env,
    `
      SELECT t.*
      FROM teams t
      WHERE NOT EXISTS (
        SELECT 1
        FROM events e
        WHERE e.station_id = ?
          AND e.team_id = t.id
          AND e.status = 'completed'
      )
      ORDER BY t.id ASC
    `,
    [stationId],
  );
}

export async function getWaitingTeams(env) {
  return dbAll(
    env,
    `
      SELECT *
      FROM teams
      WHERE status = 'waiting_station'
      ORDER BY id ASC
    `,
  );
}

export async function listTeamsWaitingForInitialAssignment(env) {
  return dbAll(
    env,
    `
      SELECT *
      FROM teams
      WHERE status = 'waiting_start'
        AND current_station_id IS NULL
      ORDER BY id ASC
    `,
  );
}

export async function listFreeStations(env) {
  return dbAll(
    env,
    `
      SELECT *
      FROM stations
      WHERE status = 'free'
      ORDER BY id ASC
    `,
  );
}

export async function listFreeStationsForInitialAssignment(env) {
  return dbAll(
    env,
    `
      SELECT *
      FROM stations
      WHERE status = 'free'
        AND not_first = 0
      ORDER BY id ASC
    `,
  );
}

export async function hasStationCompletedAllTeams(env, stationId) {
  const row = await dbFirst(
    env,
    `
      SELECT
        (SELECT COUNT(*) FROM teams) AS total_teams,
        (
          SELECT COUNT(DISTINCT team_id)
          FROM events
          WHERE station_id = ?
            AND status = 'completed'
        ) AS completed_teams
    `,
    [stationId],
  );

  return Number(row?.total_teams ?? 0) > 0 && Number(row?.total_teams ?? 0) === Number(row?.completed_teams ?? 0);
}

export async function hasTeamCompletedAllStations(env, teamId) {
  const row = await dbFirst(
    env,
    `
      SELECT
        (SELECT COUNT(*) FROM stations) AS total_stations,
        (
          SELECT COUNT(DISTINCT station_id)
          FROM events
          WHERE team_id = ?
            AND status = 'completed'
        ) AS completed_stations
    `,
    [teamId],
  );

  return Number(row?.total_stations ?? 0) > 0 && Number(row?.total_stations ?? 0) === Number(row?.completed_stations ?? 0);
}

export async function getStationProgressSummary(env) {
  return dbAll(
    env,
    `
      SELECT
        s.id,
        s.station_name,
        s.status,
        s.current_team_id,
        COUNT(DISTINCT CASE WHEN e.status = 'completed' THEN e.team_id END) AS completed_teams_count,
        AVG(
          CASE
            WHEN e.status = 'completed' AND e.end_time IS NOT NULL
            THEN (julianday(e.end_time) - julianday(e.start_time)) * 86400.0
            ELSE NULL
          END
        ) AS avg_duration_seconds
      FROM stations s
      LEFT JOIN events e ON e.station_id = s.id
      GROUP BY s.id
      ORDER BY s.id ASC
    `,
  );
}

export async function getCompletedEventDurationsForStation(env, stationId) {
  return dbAll(
    env,
    `
      SELECT
        team_id,
        start_time,
        end_time,
        (julianday(end_time) - julianday(start_time)) * 86400.0 AS duration_seconds
      FROM events
      WHERE station_id = ?
        AND status = 'completed'
        AND end_time IS NOT NULL
      ORDER BY id ASC
    `,
    [stationId],
  );
}

export async function resetEventData(env) {
  await dbBatch(env, [
    { sql: "UPDATE teams SET status = 'waiting_start', current_station_id = NULL" },
    { sql: "UPDATE stations SET status = 'free', current_team_id = NULL" },
    { sql: "DELETE FROM events" },
  ]);
}

export async function deleteTeamsAndStations(env) {
  await dbBatch(env, [{ sql: "DELETE FROM teams" }, { sql: "DELETE FROM stations" }]);
}

export async function setTeamStatus(env, teamId, status) {
  await dbRun(env, "UPDATE teams SET status = ? WHERE id = ?", [status, teamId]);
}
