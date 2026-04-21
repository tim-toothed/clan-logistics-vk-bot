import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { ACTIONS } from "../src/app/action-types.js";
import { STATE_TYPES } from "../src/app/state-types.js";
import { getStationById, getTeamById, startStationForTeam } from "../src/db/events-repository.js";
import { getUserState } from "../src/db/user-state-repository.js";
import { buildMainAdminMenuModel, buildStationAdminMenuModel } from "../src/modules/admin-home/keyboards.js";
import { createAssignTeamsConfirmKeyboard, createAssignTeamsRetryKeyboard } from "../src/modules/assign-teams/keyboards.js";
import { retryFailedQuestAssignments, startQuest } from "../src/modules/assign-teams/router.js";
import { formatStationDefinitions, parseStationDefinitions } from "../src/db/setup-repository.js";

const MIGRATION_SQL = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8");

async function main() {
  testAdminMenuModels();
  testAssignTeamsKeyboards();
  testStationDefinitionParsing();
  await testQuestStartAndRetry();
  await testQuestStartSkipsNotFirstStations();
  console.log("assign-teams-scenario-ok");
}

function testAdminMenuModels() {
  const mainAdminActions = buildMainAdminMenuModel({ canStartQuest: true }).map((button) => button.payload.action);
  const hiddenStartActions = buildMainAdminMenuModel({ canStartQuest: false }).map((button) => button.payload.action);
  const stationAdminActions = buildStationAdminMenuModel().map((button) => button.payload.action);

  assertIncludes(mainAdminActions, ACTIONS.OPEN_ASSIGN_TEAMS, "Главный админ должен видеть кнопку старта квеста.");
  assertNotIncludes(mainAdminActions, ACTIONS.OPEN_MY_STATION, "Главный админ не должен видеть кнопку моей станции.");
  assertNotIncludes(hiddenStartActions, ACTIONS.OPEN_ASSIGN_TEAMS, "После старта квеста кнопка запуска должна скрываться.");
  assertIncludes(stationAdminActions, ACTIONS.OPEN_MY_STATION, "Организатор станции должен видеть кнопку своей станции.");
}

function testAssignTeamsKeyboards() {
  const confirmActions = extractKeyboardActions(createAssignTeamsConfirmKeyboard());
  const retryActions = extractKeyboardActions(createAssignTeamsRetryKeyboard());

  assertIncludes(confirmActions, ACTIONS.ASSIGN_TEAMS_CONFIRM, "Клавиатура подтверждения должна содержать действие подтверждения.");
  assertIncludes(confirmActions, ACTIONS.BACK_TO_ADMIN_MENU, "Клавиатура подтверждения должна уметь возвращать назад.");
  assertIncludes(retryActions, ACTIONS.ASSIGN_TEAMS_RETRY_FAILED, "Клавиатура ретрая должна содержать повторную отправку.");
}

function testStationDefinitionParsing() {
  const definitions = parseStationDefinitions(["Станция 1", "Станция 2*"]);

  assertEqual(definitions?.[0]?.station_name, "Станция 1", "Обычная станция должна сохранять имя без изменений.");
  assertEqual(definitions?.[0]?.not_first, 0, "Обычная станция не должна помечаться как not_first.");
  assertEqual(definitions?.[1]?.station_name, "Станция 2", "Станция со звездочкой должна сохраняться без символа * в названии.");
  assertEqual(definitions?.[1]?.not_first, 1, "Станция со звездочкой должна помечаться как not_first.");
  assertEqual(
    formatStationDefinitions(definitions),
    "1. Станция 1\n2. Станция 2*",
    "При отображении список станций должен возвращать * для not_first.",
  );
}

async function testQuestStartAndRetry() {
  const env = createTestEnv();
  const vk = new FakeVkClient();
  await seedQuestStartScenario(env);

  const admin = await getUserByVkUserId(env, "9001");
  const context = {
    env,
    vk,
    peerId: 9001,
    user: admin,
    userState: {
      state_type: STATE_TYPES.ASSIGN_TEAMS_CONFIRM,
      step_key: "confirm",
      payload: null,
    },
    action: ACTIONS.ASSIGN_TEAMS_CONFIRM,
    input: "",
    rawText: "",
    buttonPayload: { action: ACTIONS.ASSIGN_TEAMS_CONFIRM },
    randomFn: () => 0.999,
  };

  vk.failPeerIds.add(3002);
  const startResult = await startQuest(context);

  assertEqual(startResult.startedTeams.length, 1, "Должна успешно стартовать только одна команда.");
  assertEqual(startResult.waitingTeams.length, 1, "Одна команда должна уйти в ожидание на старте.");
  assertEqual(startResult.failedAssignments.length, 1, "Одна команда должна остаться с ошибкой доставки.");
  assertEqual(startResult.failedAssignments[0]?.teamName, "Команда 2", "Ошибка доставки должна относиться ко второй команде.");

  const teamOne = await getTeamById(env, 1);
  const teamTwo = await getTeamById(env, 2);
  const teamThree = await getTeamById(env, 3);
  const stationOne = await getStationById(env, 1);
  const stationTwo = await getStationById(env, 2);
  const retryState = await getUserState(env, admin.id);
  const initiatorLogsAfterStart = vk.getTextsForPeer(9001).filter((text) => text.includes("Старт квеста:"));
  const otherMainAdminLogsAfterStart = vk.getTextsForPeer(9004).filter((text) => text.includes("Старт квеста:"));

  assertEqual(teamOne?.status, "on_station", "Первая команда должна оказаться на станции.");
  assertEqual(teamTwo?.status, "waiting_start", "Команда с ошибкой доставки не должна считаться стартовавшей.");
  assertEqual(teamThree?.status, "waiting_station", "Лишняя команда должна перейти в ожидание свободной станции.");
  assertEqual(stationOne?.status, "occupied", "Первая станция должна быть занята.");
  assertEqual(stationTwo?.status, "free", "Станция с недоставленным стартом должна остаться свободной.");
  assertEqual(retryState?.state_type, STATE_TYPES.ASSIGN_TEAMS_RETRY, "После частичного старта должен открываться экран повторной отправки.");
  assertEqual(initiatorLogsAfterStart.length, 0, "Администратор-инициатор не должен получать дублирующий summary-лог старта.");
  assertEqual(otherMainAdminLogsAfterStart.length, 1, "Другие главные админы должны получить итоговый лог по старту.");

  vk.failPeerIds.delete(3002);
  context.action = ACTIONS.ASSIGN_TEAMS_RETRY_FAILED;
  context.buttonPayload = { action: ACTIONS.ASSIGN_TEAMS_RETRY_FAILED };
  context.userState = retryState;
  const retryResult = await retryFailedQuestAssignments(context);

  const updatedTeamTwo = await getTeamById(env, 2);
  const updatedStationTwo = await getStationById(env, 2);
  const finalState = await getUserState(env, admin.id);
  const initiatorLogsAfterRetry = vk.getTextsForPeer(9001).filter((text) => text.includes("Повторная отправка:"));
  const otherMainAdminLogsAfterRetry = vk.getTextsForPeer(9004).filter((text) => text.includes("Повторная отправка:"));

  assertEqual(retryResult.recoveredAssignments.length, 1, "Повторная отправка должна восстановить проблемную команду.");
  assertEqual(retryResult.stillFailedAssignments.length, 0, "После успешного ретрая не должно остаться неуспешных команд.");
  assertEqual(updatedTeamTwo?.status, "on_station", "Вторая команда должна попасть на свою станцию после ретрая.");
  assertEqual(updatedStationTwo?.status, "occupied", "Освободившаяся стартовая станция должна заняться после ретрая.");
  assertEqual(finalState?.state_type, STATE_TYPES.ADMIN_MENU, "После успешного ретрая админ должен вернуться в обычное меню.");
  assertEqual(initiatorLogsAfterRetry.length, 0, "Администратор-инициатор не должен получать дублирующий summary-лог повторной отправки.");
  assertEqual(otherMainAdminLogsAfterRetry.length, 1, "Другие главные админы должны получить итоговый лог по повторной отправке.");
}

async function testQuestStartSkipsNotFirstStations() {
  const env = createTestEnv();
  const vk = new FakeVkClient();
  await seedQuestStartScenarioWithNotFirst(env);

  const admin = await getUserByVkUserId(env, "9001");
  const context = {
    env,
    vk,
    peerId: 9001,
    user: admin,
    userState: {
      state_type: STATE_TYPES.ASSIGN_TEAMS_CONFIRM,
      step_key: "confirm",
      payload: null,
    },
    action: ACTIONS.ASSIGN_TEAMS_CONFIRM,
    input: "",
    rawText: "",
    buttonPayload: { action: ACTIONS.ASSIGN_TEAMS_CONFIRM },
    randomFn: () => 0,
  };

  const startResult = await startQuest(context);
  const teamOne = await getTeamById(env, 1);
  const teamTwo = await getTeamById(env, 2);
  const startBlockedStation = await getStationById(env, 1);
  const allowedStartStation = await getStationById(env, 2);

  assertEqual(startResult.startedTeams.length, 1, "В первую волну должна попасть только одна стартовая станция.");
  assertEqual(startResult.waitingTeams.length, 1, "Команда без доступной стартовой станции должна уйти в ожидание.");
  assertEqual(startResult.startedTeams[0]?.stationId, 2, "Станция с not_first не должна использоваться в первом распределении.");
  assertEqual(teamOne?.current_station_id, 2, "Команда должна попасть на первую доступную станцию без not_first.");
  assertEqual(teamTwo?.status, "waiting_station", "Вторая команда должна ожидать, если оставшаяся станция помечена not_first.");
  assertEqual(startBlockedStation?.status, "free", "Станция с not_first должна остаться свободной после первого распределения.");
  assertEqual(allowedStartStation?.status, "occupied", "Разрешенная стартовая станция должна заняться.");
}

async function seedQuestStartScenario(env) {
  await insertUser(env, { id: 1, vkUserId: "9001", displayName: "Главный админ", isAdmin: 1, stationId: null, teamId: null });
  await insertUser(env, { id: 5, vkUserId: "9004", displayName: "Главный админ 2", isAdmin: 1, stationId: null, teamId: null });
  await insertTeam(env, { id: 1, teamName: "Команда 1", status: "waiting_start", currentStationId: null });
  await insertTeam(env, { id: 2, teamName: "Команда 2", status: "waiting_start", currentStationId: null });
  await insertTeam(env, { id: 3, teamName: "Команда 3", status: "waiting_start", currentStationId: null });
  await insertStation(env, { id: 1, stationName: "Станция 1", status: "free", currentTeamId: null });
  await insertStation(env, { id: 2, stationName: "Станция 2", status: "free", currentTeamId: null });
  await insertUser(env, { id: 2, vkUserId: "3001", displayName: "Игрок 1", isAdmin: 0, stationId: null, teamId: 1 });
  await insertUser(env, { id: 3, vkUserId: "3002", displayName: "Игрок 2", isAdmin: 0, stationId: null, teamId: 2 });
  await insertUser(env, { id: 4, vkUserId: "3003", displayName: "Игрок 3", isAdmin: 0, stationId: null, teamId: 3 });
}

async function seedQuestStartScenarioWithNotFirst(env) {
  await insertUser(env, { id: 1, vkUserId: "9001", displayName: "Главный админ", isAdmin: 1, stationId: null, teamId: null });
  await insertUser(env, { id: 4, vkUserId: "9004", displayName: "Главный админ 2", isAdmin: 1, stationId: null, teamId: null });
  await insertTeam(env, { id: 1, teamName: "Команда 1", status: "waiting_start", currentStationId: null });
  await insertTeam(env, { id: 2, teamName: "Команда 2", status: "waiting_start", currentStationId: null });
  await insertStation(env, { id: 1, stationName: "Финишная станция", status: "free", currentTeamId: null, notFirst: 1 });
  await insertStation(env, { id: 2, stationName: "Стартовая станция", status: "free", currentTeamId: null, notFirst: 0 });
  await insertUser(env, { id: 2, vkUserId: "3001", displayName: "Игрок 1", isAdmin: 0, stationId: null, teamId: 1 });
  await insertUser(env, { id: 3, vkUserId: "3002", displayName: "Игрок 2", isAdmin: 0, stationId: null, teamId: 2 });
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
    .prepare("INSERT INTO stations (id, station_name, not_first, status, current_team_id) VALUES (?, ?, ?, ?, ?)")
    .bind(station.id, station.stationName, station.notFirst ?? 0, station.status, station.currentTeamId)
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

function assertNotIncludes(values, expected, message) {
  if (values.includes(expected)) {
    throw new Error(`${message}\nDid not expect: ${expected}\nActual: ${JSON.stringify(values)}`);
  }
}

class FakeVkClient {
  constructor() {
    this.failPeerIds = new Set();
    this.messages = [];
  }

  async sendText(peerId, message, params = {}) {
    const normalizedPeerId = Number(peerId);
    this.messages.push({
      peerId: normalizedPeerId,
      message: String(message ?? ""),
      params,
    });

    if (this.failPeerIds.has(normalizedPeerId)) {
      throw new Error(`Simulated VK delivery failure for peer ${peerId}`);
    }

    return { response: 1 };
  }

  getTextsForPeer(peerId) {
    return this.messages.filter((item) => item.peerId === Number(peerId)).map((item) => item.message);
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
