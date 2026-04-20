import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { ACTIONS } from "../src/app/action-types.js";
import { STATE_TYPES } from "../src/app/state-types.js";
import { getUserState } from "../src/db/user-state-repository.js";
import { handleResetConfirmState, openResetConfirm } from "../src/modules/reset/router.js";

const MIGRATION_SQL = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8");

async function main() {
  await testResetMenuAndActivityHistory();
  await testFullResetStillDeletesAllDataWithBackup();
  console.log("reset-scenario-ok");
}

async function testResetMenuAndActivityHistory() {
  const env = createTestEnv();
  const vk = new FakeVkClient();
  await seedResetScenario(env);
  const admin = await getUserByVkUserId(env, "9001");
  const context = createContext(env, vk, admin);

  await openResetConfirm(context);
  const menuState = await getUserState(env, admin.id);
  assertEqual(menuState?.state_type, STATE_TYPES.RESET_MENU, "После входа в раздел должен открываться экран выбора типа сброса.");

  context.userState = menuState;
  context.action = ACTIONS.OPEN_RESET_ACTIVITY_HISTORY;
  await handleResetConfirmState(context);

  const confirmState = await getUserState(env, admin.id);
  assertEqual(confirmState?.state_type, STATE_TYPES.RESET_CONFIRM, "После выбора истории активности должен открываться экран подтверждения.");
  assertEqual(confirmState?.step_key, "activity_history", "Подтверждение должно помнить, что удаляется только история активности.");

  context.userState = confirmState;
  context.action = ACTIONS.RESET_CONFIRM_ACTIVITY_HISTORY;
  await handleResetConfirmState(context);

  const eventsCount = await firstValue(env, "SELECT COUNT(*) AS total FROM events");
  const teamsCount = await firstValue(env, "SELECT COUNT(*) AS total FROM teams");
  const stationsCount = await firstValue(env, "SELECT COUNT(*) AS total FROM stations");
  const messagesCount = await firstValue(env, "SELECT COUNT(*) AS total FROM messages");
  const teamStatus = await env.DB.prepare("SELECT status, current_station_id FROM teams WHERE id = 1").bind().first();
  const stationStatus = await env.DB.prepare("SELECT status, current_team_id FROM stations WHERE id = 1").bind().first();

  assertEqual(Number(eventsCount), 0, "Мягкий сброс должен очищать только events.");
  assertEqual(Number(teamsCount), 2, "Команды должны сохраняться при очистке истории активности.");
  assertEqual(Number(stationsCount), 2, "Станции должны сохраняться при очистке истории активности.");
  assertEqual(Number(messagesCount), 2, "Сообщения должны сохраняться при очистке истории активности.");
  assertEqual(teamStatus?.status, "waiting_start", "После очистки истории команды должны возвращаться в waiting_start.");
  assertEqual(teamStatus?.current_station_id, null, "После очистки истории у команды не должно быть текущей станции.");
  assertEqual(stationStatus?.status, "free", "После очистки истории станции должны стать свободными.");
  assertEqual(stationStatus?.current_team_id, null, "После очистки истории у станции не должно быть текущей команды.");
}

async function testFullResetStillDeletesAllDataWithBackup() {
  const env = createTestEnv();
  const vk = new FakeVkClient();
  await seedResetScenario(env);
  const admin = await getUserByVkUserId(env, "9001");
  const context = createContext(env, vk, admin);

  await openResetConfirm(context);
  context.userState = await getUserState(env, admin.id);
  context.action = ACTIONS.OPEN_RESET_ALL_DATA;
  await handleResetConfirmState(context);

  context.userState = await getUserState(env, admin.id);
  context.action = ACTIONS.RESET_CONFIRM_ALL_DATA;
  await handleResetConfirmState(context);

  const eventsCount = await firstValue(env, "SELECT COUNT(*) AS total FROM events");
  const teamsCount = await firstValue(env, "SELECT COUNT(*) AS total FROM teams");
  const stationsCount = await firstValue(env, "SELECT COUNT(*) AS total FROM stations");
  const messagesCount = await firstValue(env, "SELECT COUNT(*) AS total FROM messages");
  const userRole = await env.DB.prepare("SELECT station_id, team_id FROM users WHERE id = 2").bind().first();

  assertEqual(Number(eventsCount), 0, "Полный сброс должен очищать events.");
  assertEqual(Number(teamsCount), 0, "Полный сброс должен очищать команды.");
  assertEqual(Number(stationsCount), 0, "Полный сброс должен очищать станции.");
  assertEqual(Number(messagesCount), 0, "Полный сброс должен очищать сообщения.");
  assertEqual(userRole?.station_id, null, "После полного сброса у пользователей не должно оставаться station_id.");
  assertEqual(userRole?.team_id, null, "После полного сброса у пользователей не должно оставаться team_id.");
  assertEqual(vk.uploads.length, 1, "При полном сбросе должен создаваться backup-файл.");
}

function createContext(env, vk, user) {
  return {
    env,
    vk,
    peerId: Number(user.vk_user_id),
    user,
    userState: null,
    action: null,
    input: "",
    rawText: "",
    buttonPayload: null,
  };
}

async function seedResetScenario(env) {
  await insertStation(env, { id: 1, stationName: "Станция 1", status: "occupied", currentTeamId: null });
  await insertStation(env, { id: 2, stationName: "Станция 2", status: "free", currentTeamId: null });
  await insertTeam(env, { id: 1, teamName: "Команда 1", status: "on_station", currentStationId: 1 });
  await insertTeam(env, { id: 2, teamName: "Команда 2", status: "waiting_station", currentStationId: null });
  await env.DB.prepare("UPDATE stations SET current_team_id = ? WHERE id = ?").bind(1, 1).run();
  await insertUser(env, { id: 1, vkUserId: "9001", displayName: "Главный админ", isAdmin: 1, stationId: null, teamId: null });
  await insertUser(env, { id: 2, vkUserId: "9002", displayName: "Орг станции", isAdmin: 1, stationId: 1, teamId: null });
  await insertMessage(env, { id: 1, triggerType: "go_to_station", stationId: 1, title: "Переход", contentJson: "[]" });
  await insertMessage(env, { id: 2, triggerType: "wait_for_station", stationId: null, title: "Ожидание", contentJson: "[]" });
  await insertEvent(env, { id: 1, stationId: 1, teamId: 1, status: "active" });
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

async function insertMessage(env, message) {
  await env.DB
    .prepare("INSERT INTO messages (id, trigger_type, station_id, title, content_json, is_enabled) VALUES (?, ?, ?, ?, ?, 1)")
    .bind(message.id, message.triggerType, message.stationId, message.title, message.contentJson)
    .run();
}

async function insertEvent(env, event) {
  await env.DB
    .prepare("INSERT INTO events (id, station_id, team_id, start_time, end_time, status, started_by_user_id, ended_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(event.id, event.stationId, event.teamId, "2026-04-21T10:00:00.000Z", null, event.status, 1, null)
    .run();
}

async function getUserByVkUserId(env, vkUserId) {
  return env.DB.prepare("SELECT * FROM users WHERE vk_user_id = ?").bind(vkUserId).first();
}

async function firstValue(env, sql) {
  const row = await env.DB.prepare(sql).bind().first();
  return row?.total ?? 0;
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
  }
}

class FakeVkClient {
  constructor() {
    this.messages = [];
    this.uploads = [];
  }

  async sendText(peerId, message, params = {}) {
    this.messages.push({ peerId: Number(peerId), message: String(message ?? ""), params });
    return { response: 1 };
  }

  async uploadMessageDocument(peerId, fileName, contents, contentType) {
    this.uploads.push({
      peerId: Number(peerId),
      fileName,
      size: contents?.length ?? 0,
      contentType,
    });

    return "doc1_1";
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
