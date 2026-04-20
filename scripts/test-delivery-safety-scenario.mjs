import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { ACTIONS } from "../src/app/action-types.js";
import { getActiveEventForStation, getStationById, getTeamById, startStationForTeam } from "../src/db/events-repository.js";
import { getUserState } from "../src/db/user-state-repository.js";
import { handleMyStationActiveState } from "../src/modules/my-station/router.js";

const MIGRATION_SQL = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8");

async function main() {
  const env = createTestEnv();
  const vk = new FakeVkClient();

  await seedScenario(env);

  const organizer = await getUserByVkUserId(env, "9001");
  const context = {
    env,
    vk,
    peerId: 9001,
    user: organizer,
    userState: {
      state_type: "my_station_active",
      step_key: "active",
      payload: { teamId: 1 },
    },
    action: ACTIONS.STATION_FINISH,
    input: "",
    rawText: "",
    buttonPayload: { action: ACTIONS.STATION_FINISH, teamId: 1 },
  };

  vk.failPeerIds.add(3001);
  await handleMyStationActiveState(context);

  const confirmationState = await getUserState(env, organizer.id);
  assertEqual(confirmationState?.step_key, "confirm_finish", "Перед завершением должен показываться экран подтверждения.");

  context.action = ACTIONS.STATION_FINISH_CONFIRM;
  context.buttonPayload = { action: ACTIONS.STATION_FINISH_CONFIRM, teamId: 1 };
  context.userState = confirmationState;
  await handleMyStationActiveState(context);

  const failureAssertions = await collectFailurePhaseAssertions(env, vk, organizer.id);

  vk.failPeerIds.delete(3001);
  context.action = ACTIONS.STATION_FORCE_FINISH;
  context.buttonPayload = { action: ACTIONS.STATION_FORCE_FINISH, teamId: 1 };
  const failedState = await getUserState(env, organizer.id);
  context.userState = failedState;

  await handleMyStationActiveState(context);

  const forceAssertions = await collectForcePhaseAssertions(env, vk, organizer.id);
  const results = [...failureAssertions, ...forceAssertions];

  for (const result of results) {
    console.log(`PASS ${result.name}`);

    for (const detail of result.details) {
      console.log(`  - ${detail}`);
    }
  }
}

async function collectFailurePhaseAssertions(env, vk, organizerUserId) {
  const station = await getStationById(env, 1);
  const team = await getTeamById(env, 1);
  const activeEvent = await getActiveEventForStation(env, 1);
  const organizerState = await getUserState(env, organizerUserId);
  const mainAdminMessages = vk.getTextsForPeer(9002);
  const organizerLastMessage = vk.getLastMessage(9001);
  const organizerKeyboardActions = extractKeyboardActions(organizerLastMessage?.params?.keyboard);

  assertEqual(station?.status, "occupied", "Станция не должна завершаться, если сообщение команде не доставлено.");
  assertEqual(team?.status, "on_station", "Команда не должна менять статус, если доставка неуспешна.");
  assertEqual(activeEvent?.status, "active", "Активное событие станции должно оставаться active при ошибке доставки.");
  assertEqual(organizerState?.step_key, "delivery_failed", "Организатор должен попасть в аварийный экран после ошибки доставки.");
  assertIncludes(organizerKeyboardActions, ACTIONS.STATION_FORCE_FINISH, "На аварийном экране должна быть кнопка принудительного завершения.");
  assertSome(mainAdminMessages, (text) => text.includes("[FAIL]"), "Главный админ должен получить FAIL-уведомление о проблеме доставки.");

  return [
    {
      name: "1. Main admins receive failure notifications",
      details: mainAdminMessages.filter((text) => text.includes("[FAIL]")),
    },
    {
      name: "2. Organizer cannot finish station while delivery fails",
      details: [
        `Статус станции 1: ${station?.status}`,
        `Статус команды 1: ${team?.status}`,
        `Статус активного события: ${activeEvent?.status}`,
      ],
    },
    {
      name: "3. Organizer sees force-finish button after failure",
      details: [`Доступные действия на клавиатуре: ${organizerKeyboardActions.join(", ")}`],
    },
  ];
}

async function collectForcePhaseAssertions(env, vk, organizerUserId) {
  const station = await getStationById(env, 1);
  const teamOne = await getTeamById(env, 1);
  const teamTwo = await getTeamById(env, 2);
  const activeEvent = await getActiveEventForStation(env, 1);
  const organizerState = await getUserState(env, organizerUserId);
  const waitingTeamMessages = vk.getTextsForPeer(3002);
  const organizerMessages = vk.getTextsForPeer(9001);
  const mainAdminMessages = vk.getTextsForPeer(9002);

  assertEqual(station?.status, "occupied", "После принудительного завершения станция должна сразу заняться ожидающей командой.");
  assertEqual(teamOne?.status, "waiting_station", "Команда, для которой форсировали завершение, должна перейти в waiting_station.");
  assertEqual(teamTwo?.status, "on_station", "Ожидающая команда должна получить новую станцию и сразу перейти в on_station.");
  assertEqual(activeEvent?.team_id, 2, "После принудительного завершения на станции должно появиться активное событие для ожидавшей команды.");
  assertEqual(organizerState?.step_key, "idle", "Организатор должен вернуться в обычное состояние меню станции.");
  assertSome(
    waitingTeamMessages,
    (text) => text.includes("Станция 1"),
    "Команда, ожидавшая освобождения станции, должна получить сообщение о переходе на станцию 1.",
  );
  assertSome(
    organizerMessages,
    (text) => text.includes("принудительно завершена"),
    "Организатор должен получить текст для ручной передачи после принудительного завершения.",
  );
  assertSome(mainAdminMessages, (text) => text.includes("[FORCE]"), "Главный админ должен получить лог о принудительном завершении.");
  assertSome(
    mainAdminMessages,
    (text) => text.includes("выведена из ожидания"),
    "Главный админ должен увидеть, что ожидающая команда получила освободившуюся станцию.",
  );

  return [
    {
      name: "4. Force finish frees station and notifies waiting team",
      details: [
        `Статус станции 1: ${station?.status}`,
        `Статус команды 1: ${teamOne?.status}`,
        `Статус команды 2: ${teamTwo?.status}`,
        `Сообщение команде 2: ${waitingTeamMessages.at(-1) ?? "(нет)"}`,
      ],
    },
  ];
}

async function seedScenario(env) {
  await insertTeam(env, { id: 1, teamName: "Команда 1", status: "on_station", currentStationId: null });
  await insertTeam(env, { id: 2, teamName: "Команда 2", status: "waiting_station", currentStationId: null });

  await insertStation(env, { id: 1, stationName: "Станция 1", status: "occupied", currentTeamId: 1 });
  await insertStation(env, { id: 2, stationName: "Станция 2", status: "occupied", currentTeamId: null });

  await env.DB.prepare("UPDATE teams SET current_station_id = ? WHERE id = ?").bind(1, 1).run();

  await insertUser(env, { id: 1, vkUserId: "9001", displayName: "Орг станции 1", isAdmin: 1, stationId: 1, teamId: null });
  await insertUser(env, { id: 2, vkUserId: "9002", displayName: "Главный админ", isAdmin: 1, stationId: null, teamId: null });
  await insertUser(env, { id: 3, vkUserId: "3001", displayName: "Игрок 1", isAdmin: 0, stationId: null, teamId: 1 });
  await insertUser(env, { id: 4, vkUserId: "3002", displayName: "Игрок 2", isAdmin: 0, stationId: null, teamId: 2 });

  await startStationForTeam(env, {
    stationId: 1,
    teamId: 1,
    startedByUserId: 1,
    startTime: "2026-04-20T10:00:00.000Z",
  });

  await env.DB
    .prepare("INSERT INTO events (station_id, team_id, start_time, end_time, status, started_by_user_id, ended_by_user_id) VALUES (?, ?, ?, ?, 'completed', ?, ?)")
    .bind(2, 2, "2026-04-20T09:00:00.000Z", "2026-04-20T09:15:00.000Z", 1, 1)
    .run();
}

function createTestEnv() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(MIGRATION_SQL);

  return {
    DB: new D1DatabaseShim(sqlite),
  };
}

async function insertUser(env, user) {
  await env.DB
    .prepare("INSERT INTO users (id, vk_user_id, display_name, is_admin, station_id, team_id) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(user.id, user.vkUserId, user.displayName, user.isAdmin, user.stationId, user.teamId)
    .run();
}

async function insertTeam(env, team) {
  await env.DB
    .prepare("INSERT INTO teams (id, team_name, status, current_station_id) VALUES (?, ?, ?, ?)")
    .bind(team.id, team.teamName, team.status, team.currentStationId)
    .run();
}

async function insertStation(env, station) {
  await env.DB
    .prepare("INSERT INTO stations (id, station_name, status, current_team_id) VALUES (?, ?, ?, ?)")
    .bind(station.id, station.stationName, station.status, station.currentTeamId)
    .run();
}

async function getUserByVkUserId(env, vkUserId) {
  return env.DB.prepare("SELECT * FROM users WHERE vk_user_id = ?").bind(vkUserId).first();
}

function extractKeyboardActions(keyboard) {
  const rows = Array.isArray(keyboard?.buttons) ? keyboard.buttons : [];
  return rows.flatMap((row) =>
    row
      .map((button) => {
        try {
          return JSON.parse(button?.action?.payload ?? "{}")?.action ?? null;
        } catch {
          return null;
        }
      })
      .filter(Boolean),
  );
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
  }
}

function assertIncludes(values, expected, message) {
  if (!values.includes(expected)) {
    throw new Error(`${message}\nExpected to find: ${expected}\nActual: ${JSON.stringify(values)}`);
  }
}

function assertSome(values, predicate, message) {
  if (!values.some(predicate)) {
    throw new Error(`${message}\nActual: ${JSON.stringify(values)}`);
  }
}

class FakeVkClient {
  constructor() {
    this.failPeerIds = new Set();
    this.messages = [];
  }

  async sendText(peerId, message, params = {}) {
    const record = {
      peerId: Number(peerId),
      message: String(message ?? ""),
      params,
    };

    this.messages.push(record);

    if (this.failPeerIds.has(Number(peerId))) {
      throw new Error(`Simulated VK delivery failure for peer ${peerId}`);
    }

    return { response: 1 };
  }

  getTextsForPeer(peerId) {
    return this.messages.filter((item) => item.peerId === Number(peerId)).map((item) => item.message);
  }

  getLastMessage(peerId) {
    const messages = this.messages.filter((item) => item.peerId === Number(peerId));
    return messages.at(-1) ?? null;
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
