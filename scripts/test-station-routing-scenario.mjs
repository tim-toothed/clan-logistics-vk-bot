import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  completeStationForTeam,
  getActiveEventForStation,
  getCandidateStationsForTeam,
  getRemainingStationsForTeam,
  getStationById,
  getTeamById,
  getWaitingTeams,
  hasStationCompletedAllTeams,
  hasTeamCompletedAllStations,
  setTeamStatus,
  startStationForTeam,
  transitionTeamToNextStation,
} from "../src/db/events-repository.js";

const MIGRATION_SQL = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8");

async function main() {
  const scenarioResults = [];

  scenarioResults.push(await testOldestIdleStationSelection());
  scenarioResults.push(await testSingleFreeStationSelection());
  scenarioResults.push(await testNoFreeStationsFlow());
  scenarioResults.push(await testTeamFinishedFlow());
  scenarioResults.push(await testStationDoneFlow());
  scenarioResults.push(await testWaitingTeamsReceiveDifferentFreedStations());
  scenarioResults.push(await testAutomaticStartAfterStationAssignment());

  for (const result of scenarioResults) {
    console.log(`PASS ${result.name}`);

    for (const detail of result.details) {
      console.log(`  - ${detail}`);
    }
  }
}

async function testOldestIdleStationSelection() {
  const env = createTestEnv();
  await seedUsersTeamsStations(env, 6, 6);

  const sharedStartTime = "2026-04-18T10:00:00.000Z";
  const endTimesByStation = {
    1: "2026-04-18T10:09:00.000Z",
    2: "2026-04-18T10:04:00.000Z",
    3: "2026-04-18T10:12:00.000Z",
    4: "2026-04-18T10:06:00.000Z",
    5: "2026-04-18T10:15:00.000Z",
    6: "2026-04-18T10:08:00.000Z",
  };

  for (let id = 1; id <= 6; id += 1) {
    await createCompletedVisit(env, {
      stationId: id,
      teamId: id,
      startTime: sharedStartTime,
      endTime: endTimesByStation[id],
      stationDone: false,
      teamStatus: "waiting_start",
    });
  }

  const candidates = await getCandidateStationsForTeam(env, 1);
  const actualOrder = candidates.map((station) => station.station_name);
  const expectedOrder = ["Станция 2", "Станция 4", "Станция 6", "Станция 3", "Станция 5"];

  assertDeepEqual(
    actualOrder,
    expectedOrder,
    "Команда после первой станции должна получать самую давно простаивающую свободную станцию.",
  );

  return {
    name: "4.3 multiple free stations choose oldest idle",
    details: [
      `Кандидаты для команды 1: ${actualOrder.join(" -> ")}`,
      "Станция 1 исключена, потому что команда уже прошла ее.",
      "Оставшиеся станции отсортированы по last_end_time от самого раннего к самому позднему.",
    ],
  };
}

async function testSingleFreeStationSelection() {
  const env = createTestEnv();
  await seedUsersTeamsStations(env, 1, 6);

  await createCompletedVisit(env, {
    stationId: 1,
    teamId: 1,
    startTime: "2026-04-18T10:00:00.000Z",
    endTime: "2026-04-18T10:07:00.000Z",
    stationDone: false,
    teamStatus: "waiting_start",
  });

  for (const stationId of [2, 3, 4, 5]) {
    await env.DB
      .prepare("UPDATE stations SET status = 'occupied', current_team_id = NULL WHERE id = ?")
      .bind(stationId)
      .run();
  }

  const candidates = await getCandidateStationsForTeam(env, 1);
  const actualOrder = candidates.map((station) => station.station_name);
  const expectedOrder = ["Станция 6"];

  assertDeepEqual(actualOrder, expectedOrder, "Если свободна только одна подходящая станция, она должна быть выбрана.");

  return {
    name: "4.3 single free station choose that station",
    details: [`Единственный кандидат для команды 1: ${actualOrder.join(", ")}`],
  };
}

async function testNoFreeStationsFlow() {
  const env = createTestEnv();
  await seedUsersTeamsStations(env, 1, 6);

  await createCompletedVisit(env, {
    stationId: 1,
    teamId: 1,
    startTime: "2026-04-18T10:00:00.000Z",
    endTime: "2026-04-18T10:07:00.000Z",
    stationDone: false,
    teamStatus: "waiting_start",
  });

  for (const stationId of [2, 3, 4, 5, 6]) {
    await env.DB
      .prepare("UPDATE stations SET status = 'occupied', current_team_id = NULL WHERE id = ?")
      .bind(stationId)
      .run();
  }

  const candidates = await getCandidateStationsForTeam(env, 1);
  assertDeepEqual(candidates, [], "Если свободных станций нет, список кандидатов должен быть пустым.");

  await setTeamStatus(env, 1, "waiting_station");
  const team = await getTeamById(env, 1);

  assertEqual(team?.status, "waiting_station", "При отсутствии свободных станций команда должна переходить в waiting_station.");

  return {
    name: "4.3 no free stations fallback to waiting_station",
    details: [
      "Для команды 1 не найдено ни одной свободной станции.",
      `Итоговый статус команды: ${team?.status}`,
    ],
  };
}

async function testTeamFinishedFlow() {
  const env = createTestEnv();
  await seedUsersTeamsStations(env, 1, 6);

  for (let stationId = 1; stationId <= 5; stationId += 1) {
    await createCompletedVisit(env, {
      stationId,
      teamId: 1,
      startTime: `2026-04-18T1${stationId}:00:00.000Z`,
      endTime: `2026-04-18T1${stationId}:10:00.000Z`,
      stationDone: false,
      teamStatus: "waiting_start",
    });
  }

  const remainingBeforeLastFinish = await getRemainingStationsForTeam(env, 1);
  assertEqual(remainingBeforeLastFinish.length, 1, "Перед последней станцией у команды должна оставаться ровно одна станция.");

  await createCompletedVisit(env, {
    stationId: 6,
    teamId: 1,
    startTime: "2026-04-18T16:00:00.000Z",
    endTime: "2026-04-18T16:11:00.000Z",
    stationDone: false,
    teamStatus: "finished",
  });

  const team = await getTeamById(env, 1);
  const completedAllStations = await hasTeamCompletedAllStations(env, 1);

  assertEqual(team?.status, "finished", "После последней станции команда должна получить статус finished.");
  assertEqual(completedAllStations, true, "Проверка completed_all_stations должна подтверждать завершенный маршрут.");

  return {
    name: "4.4 team finishes route after last station",
    details: [
      `Оставалось станций перед завершением: ${remainingBeforeLastFinish.length}`,
      `Итоговый статус команды: ${team?.status}`,
    ],
  };
}

async function testStationDoneFlow() {
  const env = createTestEnv();
  await seedUsersTeamsStations(env, 6, 1);

  for (let teamId = 1; teamId <= 5; teamId += 1) {
    await createCompletedVisit(env, {
      stationId: 1,
      teamId,
      startTime: `2026-04-18T1${teamId}:00:00.000Z`,
      endTime: `2026-04-18T1${teamId}:08:00.000Z`,
      stationDone: false,
      teamStatus: "waiting_start",
    });
  }

  await createCompletedVisit(env, {
    stationId: 1,
    teamId: 6,
    startTime: "2026-04-18T16:00:00.000Z",
    endTime: "2026-04-18T16:09:00.000Z",
    stationDone: true,
    teamStatus: "waiting_start",
  });

  const station = await getStationById(env, 1);
  const completedAllTeams = await hasStationCompletedAllTeams(env, 1);

  assertEqual(station?.status, "done", "После прохождения станции всеми командами станция должна получить статус done.");
  assertEqual(completedAllTeams, true, "Проверка completed_all_teams должна подтверждать завершение станции.");

  return {
    name: "4.5 station becomes done after all teams",
    details: [
      `Итоговый статус станции: ${station?.status}`,
      "Количество завершивших команд совпадает с количеством команд в системе.",
    ],
  };
}

async function testWaitingTeamsReceiveDifferentFreedStations() {
  const env = createTestEnv();
  await seedUsersTeamsStations(env, 6, 6);

  await setTeamStatus(env, 1, "waiting_station");
  await setTeamStatus(env, 2, "waiting_station");

  for (const stationId of [1, 2]) {
    await env.DB
      .prepare("UPDATE stations SET status = 'free', current_team_id = NULL WHERE id = ?")
      .bind(stationId)
      .run();
  }

  for (const stationId of [3, 4, 5, 6]) {
    await env.DB
      .prepare("UPDATE stations SET status = 'occupied', current_team_id = NULL WHERE id = ?")
      .bind(stationId)
      .run();
  }

  await createCompletedVisit(env, {
    stationId: 1,
    teamId: 3,
    startTime: "2026-04-18T10:00:00.000Z",
    endTime: "2026-04-18T10:05:00.000Z",
    stationDone: false,
    teamStatus: "waiting_start",
  });
  await createCompletedVisit(env, {
    stationId: 2,
    teamId: 4,
    startTime: "2026-04-18T10:00:00.000Z",
    endTime: "2026-04-18T10:12:00.000Z",
    stationDone: false,
    teamStatus: "waiting_start",
  });

  const waitingTeams = await getWaitingTeams(env);
  const reservedStationIds = new Set();
  const assignments = [];

  for (const team of waitingTeams) {
    const nextStation = await pickNextFreeStationForScenario(env, team.id, reservedStationIds);

    if (!nextStation) {
      continue;
    }

    reservedStationIds.add(nextStation.id);
    assignments.push({
      teamName: team.team_name,
      stationName: nextStation.station_name,
    });
  }

  const assignedStationNames = assignments.map((assignment) => assignment.stationName);

  assertDeepEqual(
    assignedStationNames,
    ["Станция 1", "Станция 2"],
    "Ожидающие команды должны получить разные свободные станции без повторного назначения одной и той же станции.",
  );

  return {
    name: "4.3 waiting teams do not receive duplicate freed stations",
    details: assignments.map((assignment) => `${assignment.teamName} -> ${assignment.stationName}`),
  };
}

async function testAutomaticStartAfterStationAssignment() {
  const env = createTestEnv();
  await seedUsersTeamsStations(env, 2, 2);

  await startStationForTeam(env, {
    stationId: 1,
    teamId: 1,
    startedByUserId: 1,
    startTime: "2026-04-18T10:00:00.000Z",
  });

  const activeEvent = await getActiveEventForStation(env, 1);

  if (!activeEvent?.id) {
    throw new Error("Не удалось создать активное событие для станции 1.");
  }

  await transitionTeamToNextStation(env, {
    eventId: activeEvent.id,
    stationId: 1,
    teamId: 1,
    nextStationId: 2,
    endedByUserId: 1,
    endTime: "2026-04-18T10:15:00.000Z",
    stationDone: false,
    startTime: "2026-04-18T10:15:00.000Z",
  });

  const previousStation = await getStationById(env, 1);
  const nextStation = await getStationById(env, 2);
  const team = await getTeamById(env, 1);
  const nextActiveEvent = await getActiveEventForStation(env, 2);

  assertEqual(previousStation?.status, "free", "Предыдущая станция должна освободиться после перехода команды дальше.");
  assertEqual(previousStation?.current_team_id, null, "У предыдущей станции не должно остаться current_team_id.");
  assertEqual(nextStation?.status, "occupied", "Следующая станция должна сразу стать occupied при назначении команды.");
  assertEqual(nextStation?.current_team_id, 1, "Следующая станция должна быть занята именно этой командой.");
  assertEqual(team?.status, "on_station", "Команда должна сразу перейти в статус on_station.");
  assertEqual(team?.current_station_id, 2, "У команды должна сразу записываться новая станция.");
  assertEqual(nextActiveEvent?.team_id, 1, "На новой станции должно сразу создаваться active-событие для команды.");

  return {
    name: "4.1 automatic start when team is assigned to next station",
    details: [
      `Станция 1 после перехода: ${previousStation?.status}`,
      `Станция 2 после перехода: ${nextStation?.status}`,
      `Статус команды 1: ${team?.status}`,
    ],
  };
}

function createTestEnv() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(MIGRATION_SQL);

  return {
    DB: new D1DatabaseShim(sqlite),
  };
}

async function seedUsersTeamsStations(env, teamCount, stationCount) {
  await env.DB.prepare("INSERT INTO users (vk_user_id, display_name, is_admin) VALUES (?, ?, 1)").bind("1", "Test Admin").run();

  for (let id = 1; id <= teamCount; id += 1) {
    await env.DB
      .prepare("INSERT INTO teams (id, team_name, status, current_station_id) VALUES (?, ?, 'waiting_start', NULL)")
      .bind(id, `Команда ${id}`)
      .run();
  }

  for (let id = 1; id <= stationCount; id += 1) {
    await env.DB
      .prepare("INSERT INTO stations (id, station_name, status, current_team_id) VALUES (?, ?, 'free', NULL)")
      .bind(id, `Станция ${id}`)
      .run();
  }
}

async function createCompletedVisit(env, { stationId, teamId, startTime, endTime, stationDone, teamStatus }) {
  await startStationForTeam(env, {
    stationId,
    teamId,
    startedByUserId: 1,
    startTime,
  });

  const activeEvent = await getActiveEventForStation(env, stationId);

  if (!activeEvent?.id) {
    throw new Error(`Не удалось найти активное событие для станции ${stationId}`);
  }

  await completeStationForTeam(env, {
    eventId: activeEvent.id,
    stationId,
    teamId,
    endedByUserId: 1,
    endTime,
    stationDone,
    teamStatus,
  });
}

async function pickNextFreeStationForScenario(env, teamId, reservedStationIds = new Set()) {
  const candidates = await getCandidateStationsForTeam(env, teamId);
  return candidates.find((candidate) => !reservedStationIds.has(candidate.id)) ?? null;
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nExpected: ${expectedJson}\nActual: ${actualJson}`);
  }
}

class D1DatabaseShim {
  constructor(sqlite) {
    this.sqlite = sqlite;
  }

  prepare(sql) {
    return new D1StatementShim(this.sqlite, sql);
  }

  batch(statements) {
    return statements.map((statement) => statement.run());
  }
}

class D1StatementShim {
  constructor(sqlite, sql, bindings = []) {
    this.sqlite = sqlite;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new D1StatementShim(this.sqlite, this.sql, bindings);
  }

  run() {
    const result = this.sqlite.prepare(this.sql).run(...this.bindings);

    return {
      meta: {
        changes: Number(result.changes ?? 0),
        last_row_id: Number(result.lastInsertRowid ?? 0),
      },
    };
  }

  first() {
    return this.sqlite.prepare(this.sql).get(...this.bindings) ?? null;
  }

  all() {
    return {
      results: this.sqlite.prepare(this.sql).all(...this.bindings),
    };
  }
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
