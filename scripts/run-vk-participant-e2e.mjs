import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { handleMessageNew } from "../src/app/ui-router.js";
import { ACTIONS } from "../src/app/action-types.js";
import { createVkClient } from "../src/utils/vk-api.js";
import { upsertMessageTemplate, MESSAGE_TRIGGER_TYPES } from "../src/db/messages-repository.js";

const REPO_ROOT_URL = new URL("../", import.meta.url);
const MIGRATION_SQL = readFileSync(new URL("./../migrations/0001_init.sql", import.meta.url), "utf8");
const DEV_VARS_PATH = new URL("./../.dev.vars", import.meta.url);

const PARTICIPANT_PEER_ID = 98293533;
const TEAM_COUNT = 6;
const STATION_COUNT = 6;
const ADMIN_PEER_IDS = Array.from({ length: STATION_COUNT }, (_, index) => 880000000 + index + 1);

const state = {};

async function main() {
  const env = createEnv();
  const liveVk = createVkClient(env);
  const vk = createScenarioVkClient(env, liveVk);

  await seedScenarioData(env);

  await vk.sendText(
    PARTICIPANT_PEER_ID,
    [
      "Начинаю автоматический тестовый прогон.",
      "Сейчас бот сам пройдёт сценарий для участника «Команда 1» и будет присылать тебе реальные сообщения в этот чат.",
    ].join("\n\n"),
  );

  await simulateParticipantOnboarding(env, vk);
  await pause(1500);

  for (let stationId = 1; stationId <= STATION_COUNT; stationId += 1) {
    await simulateStationPass(env, vk, stationId);
    await pause(stationId === STATION_COUNT ? 1000 : 2000);
  }

  await vk.sendText(
    PARTICIPANT_PEER_ID,
    "Автоматический тест завершён. Если хочешь, теперь можем сверить глазами всю последовательность сообщений и поведение маршрута.",
  );
}

function createEnv() {
  const vars = parseDevVars(readFileSync(DEV_VARS_PATH, "utf8"));
  const sqlite = new DatabaseSync(":memory:");

  sqlite.exec(MIGRATION_SQL);

  return {
    DB: new D1DatabaseShim(sqlite),
    VK_GROUP_TOKEN: vars.VK_GROUP_TOKEN,
    VK_API_VERSION: vars.VK_API_VERSION ?? "5.199",
  };
}

async function seedScenarioData(env) {
  await seedTeamsAndStations(env);
  await seedUsers(env);
  await seedMessageTemplates(env);
}

async function seedTeamsAndStations(env) {
  for (let index = 1; index <= TEAM_COUNT; index += 1) {
    await env.DB.prepare("INSERT INTO teams (id, team_name, status, current_station_id) VALUES (?, ?, 'waiting_start', NULL)")
      .bind(index, `Команда ${index}`)
      .run();
  }

  for (let index = 1; index <= STATION_COUNT; index += 1) {
    await env.DB.prepare("INSERT INTO stations (id, station_name, status, current_team_id) VALUES (?, ?, 'free', NULL)")
      .bind(index, `Станция ${index}`)
      .run();
  }
}

async function seedUsers(env) {
  await env.DB
    .prepare("INSERT INTO users (vk_user_id, display_name, is_admin, station_id, team_id) VALUES (?, ?, 0, NULL, NULL)")
    .bind(String(PARTICIPANT_PEER_ID), "Тестовый участник")
    .run();

  for (let index = 1; index <= STATION_COUNT; index += 1) {
    await env.DB
      .prepare("INSERT INTO users (vk_user_id, display_name, is_admin, station_id, team_id) VALUES (?, ?, 1, ?, NULL)")
      .bind(String(ADMIN_PEER_IDS[index - 1]), `Тестовый организатор ${index}`, index)
      .run();
  }
}

async function seedMessageTemplates(env) {
  await upsertMessageTemplate(env, {
    triggerType: MESSAGE_TRIGGER_TYPES.BOT_START,
    title: "Стартовое сообщение бота",
    contentItems: [
      {
        text: "Тестовый сценарий подготовлен. Сейчас бот автоматически пройдёт маршрут для Команды 1.",
        attachments: [],
      },
    ],
  });

  await upsertMessageTemplate(env, {
    triggerType: MESSAGE_TRIGGER_TYPES.PARTICIPANT_WELCOME,
    title: "Приветственное сообщение",
    contentItems: [
      {
        text: "Привет! Ты вошёл как участник Команды 1. Ниже начнётся автоматический прогон маршрута.",
        attachments: [],
      },
    ],
  });

  await upsertMessageTemplate(env, {
    triggerType: MESSAGE_TRIGGER_TYPES.WAIT_FOR_STATION,
    title: "Сообщение об ожидании",
    contentItems: [
      {
        text: "Все станции заняты. Пожалуйста, ожидайте следующего указания.",
        attachments: [],
      },
    ],
  });

  await upsertMessageTemplate(env, {
    triggerType: MESSAGE_TRIGGER_TYPES.TEAM_FINISHED_ALL,
    title: "После последней станции",
    contentItems: [
      {
        text: "Маршрут завершён. Вы успешно прошли все станции тестового сценария.",
        attachments: [],
      },
    ],
  });

  for (let stationId = 1; stationId <= STATION_COUNT; stationId += 1) {
    await upsertMessageTemplate(env, {
      triggerType: MESSAGE_TRIGGER_TYPES.GO_TO_STATION,
      stationId,
      title: `Переход на "Станция ${stationId}"`,
      contentItems: [
        {
          text: `Переходите на Станцию ${stationId}. Это тестовое сообщение для маршрута Команды 1.`,
          attachments: [],
        },
      ],
    });
  }
}

async function simulateParticipantOnboarding(env, vk) {
  await dispatchIncomingMessage(env, vk, buildTextPayload(PARTICIPANT_PEER_ID, "/start"));
  await pause(1200);
  await dispatchIncomingMessage(env, vk, buildTextPayload(PARTICIPANT_PEER_ID, "Участник"));
  await pause(1200);
  await dispatchIncomingMessage(env, vk, buildTextPayload(PARTICIPANT_PEER_ID, "Команда 1"));
}

async function simulateStationPass(env, vk, stationId) {
  const adminPeerId = ADMIN_PEER_IDS[stationId - 1];

  await dispatchIncomingMessage(
    env,
    vk,
    buildActionPayload(adminPeerId, "Моя станция", { action: ACTIONS.OPEN_MY_STATION }),
  );
  await pause(500);
  await dispatchIncomingMessage(
    env,
    vk,
    buildActionPayload(adminPeerId, "Команда 1", { action: ACTIONS.STATION_TEAM_SELECT, teamId: 1 }),
  );
  await pause(500);
  await dispatchIncomingMessage(
    env,
    vk,
    buildActionPayload(adminPeerId, "Завершить станцию", { action: ACTIONS.STATION_FINISH, teamId: 1 }),
  );
}

async function dispatchIncomingMessage(env, vk, payload) {
  await handleMessageNew(env, payload, state, vk, createCtxShim());
}

function createScenarioVkClient(env, liveVk) {
  return {
    ...liveVk,

    async sendText(peerId, message, params = {}) {
      if (Number(peerId) === PARTICIPANT_PEER_ID) {
        return liveVk.sendText(peerId, message, params);
      }

      console.log(`[suppressed message to ${peerId}] ${message}`);
      return null;
    },

    async getUserDisplayName(vkUserId) {
      if (Number(vkUserId) === PARTICIPANT_PEER_ID) {
        return "Тестовый участник";
      }

      const adminIndex = ADMIN_PEER_IDS.findIndex((peerId) => Number(peerId) === Number(vkUserId));

      if (adminIndex >= 0) {
        return `Тестовый организатор ${adminIndex + 1}`;
      }

      return `VK ${vkUserId}`;
    },

    async uploadMessageDocument(peerId, fileName, fileContents, contentType) {
      if (Number(peerId) === PARTICIPANT_PEER_ID) {
        return liveVk.uploadMessageDocument(peerId, fileName, fileContents, contentType);
      }

      return null;
    },

    async call(method, params = {}) {
      if (method === "users.get") {
        const requestedIds = String(params.user_ids ?? "")
          .split(",")
          .map((value) => Number(String(value).trim()))
          .filter(Number.isFinite);

        return requestedIds.map((userId) => {
          if (userId === PARTICIPANT_PEER_ID) {
            return { id: userId, first_name: "Тестовый", last_name: "Участник" };
          }

          const adminIndex = ADMIN_PEER_IDS.findIndex((peerId) => peerId === userId);

          if (adminIndex >= 0) {
            return { id: userId, first_name: "Тестовый", last_name: `Организатор ${adminIndex + 1}` };
          }

          return { id: userId, first_name: "VK", last_name: String(userId) };
        });
      }

      return liveVk.call(method, params);
    },
  };
}

function buildTextPayload(peerId, text) {
  return {
    type: "message_new",
    object: {
      message: {
        from_id: peerId,
        peer_id: peerId,
        text,
        attachments: [],
      },
    },
  };
}

function buildActionPayload(peerId, text, actionPayload) {
  return {
    type: "message_new",
    object: {
      message: {
        from_id: peerId,
        peer_id: peerId,
        text,
        payload: JSON.stringify(actionPayload),
        attachments: [],
      },
    },
  };
}

function createCtxShim() {
  return {
    waitUntil(promise) {
      return promise;
    },
  };
}

function parseDevVars(source) {
  const env = {};

  for (const rawLine of String(source ?? "").split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    env[key] = value;
  }

  if (!env.VK_GROUP_TOKEN) {
    throw new Error(`VK_GROUP_TOKEN is missing in ${DEV_VARS_PATH.pathname}`);
  }

  return env;
}

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
