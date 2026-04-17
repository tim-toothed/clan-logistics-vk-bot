import { dbAll, dbBatch, dbFirst } from "./client.js";

export async function getTeams(env) {
  return dbAll(env, "SELECT id, team_name FROM teams ORDER BY id ASC");
}

export async function findTeamByName(env, teamName) {
  return dbFirst(env, "SELECT id, team_name FROM teams WHERE lower(team_name) = lower(?)", [
    String(teamName ?? "").trim(),
  ]);
}

export async function getStations(env) {
  return dbAll(env, "SELECT id, station_name FROM stations ORDER BY id ASC");
}

export async function findStationByName(env, stationName) {
  return dbFirst(env, "SELECT id, station_name FROM stations WHERE lower(station_name) = lower(?)", [
    String(stationName ?? "").trim(),
  ]);
}

export async function replaceTeams(env, teamNames) {
  const existingTeams = await getTeams(env);
  const statements = [];

  for (const [index, teamName] of teamNames.entries()) {
    const currentTeam = existingTeams[index];

    if (currentTeam) {
      if (currentTeam.team_name !== teamName) {
        statements.push({
          sql: "UPDATE teams SET team_name = ? WHERE id = ?",
          bindings: [teamName, currentTeam.id],
        });
      }

      continue;
    }

    statements.push({
      sql: "INSERT INTO teams (team_name) VALUES (?)",
      bindings: [teamName],
    });
  }

  for (const team of existingTeams.slice(teamNames.length)) {
    statements.push({ sql: "UPDATE users SET team_id = NULL WHERE team_id = ?", bindings: [team.id] });
    statements.push({ sql: "UPDATE stations SET current_team_id = NULL WHERE current_team_id = ?", bindings: [team.id] });
    statements.push({ sql: "DELETE FROM teams WHERE id = ?", bindings: [team.id] });
  }

  if (!statements.length) {
    return;
  }

  await dbBatch(env, statements);
}

export async function replaceStations(env, stationNames) {
  const existingStations = await getStations(env);
  const statements = [];

  for (const [index, stationName] of stationNames.entries()) {
    const currentStation = existingStations[index];

    if (currentStation) {
      if (currentStation.station_name !== stationName) {
        statements.push({
          sql: "UPDATE stations SET station_name = ? WHERE id = ?",
          bindings: [stationName, currentStation.id],
        });
      }

      continue;
    }

    statements.push({
      sql: "INSERT INTO stations (station_name) VALUES (?)",
      bindings: [stationName],
    });
  }

  for (const station of existingStations.slice(stationNames.length)) {
    statements.push({ sql: "UPDATE users SET station_id = NULL WHERE station_id = ?", bindings: [station.id] });
    statements.push({ sql: "UPDATE teams SET current_station_id = NULL WHERE current_station_id = ?", bindings: [station.id] });
    statements.push({ sql: "DELETE FROM stations WHERE id = ?", bindings: [station.id] });
  }

  if (!statements.length) {
    return;
  }

  await dbBatch(env, statements);
}
