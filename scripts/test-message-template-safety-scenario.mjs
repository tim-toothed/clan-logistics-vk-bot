import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { getMessageById, MESSAGE_TRIGGER_TYPES, upsertMessageTemplate } from "../src/db/messages-repository.js";
import { replaceStations } from "../src/db/setup-repository.js";
import { prepareTemplateChunkForStorage } from "../src/utils/vk-message.js";

const MIGRATION_SQL = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8");

async function main() {
  await testAudioMessageChunkConversion();
  await testStationRenameUpdatesMessageTitle();
  console.log("PASS message template safety scenario");
}

async function testAudioMessageChunkConversion() {
  const vk = new FakeVkClient();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    assertEqual(url, "https://example.com/source.ogg", "Должен скачиваться именно OGG-файл из payload VK.");
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: {
        "content-type": "audio/ogg",
      },
    });
  };

  try {
    const chunk = await prepareTemplateChunkForStorage(vk, 123, {
      text: "",
      attachments: [
        {
          type: "audio_message",
          vk_attachment: "audio_message1_1_access",
          source_url: "https://example.com/source.ogg",
        },
      ],
    });

    assertEqual(vk.uploads.length, 1, "Голосовое сообщение должно переупаковываться через VK upload flow.");
    assertEqual(vk.uploads[0].peerId, 123, "Переупаковка должна идти в контексте текущего peer_id.");
    assertEqual(vk.uploads[0].contentType, "audio/ogg", "Для загрузки аудиосообщения должен использоваться audio/ogg.");
    assertEqual(chunk.attachments[0].vk_attachment, "audio_message999_555_key", "В шаблон должен сохраняться уже новый VK attachment.");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testStationRenameUpdatesMessageTitle() {
  const env = createTestEnv();

  await env.DB
    .prepare("INSERT INTO stations (id, station_name, not_first, status, current_team_id) VALUES (?, ?, ?, 'free', NULL)")
    .bind(1, "Станция 2", 0)
    .run();

  await upsertMessageTemplate(env, {
    triggerType: MESSAGE_TRIGGER_TYPES.GO_TO_STATION,
    stationId: 1,
    title: 'Переход на "Станция 2"',
    contentItems: [{ text: "Старый текст", attachments: [] }],
  });

  await replaceStations(env, [
    {
      station_name: "Взлом",
      not_first: 0,
    },
  ]);

  const message = await getMessageById(env, 1);
  assertEqual(message?.title, 'Переход на "Взлом"', "При переименовании станции title шаблона должен синхронизироваться.");
  assertEqual(message?.display_title, 'Переход на "Взлом"', "Отображаемый заголовок тоже должен остаться корректным.");
}

function createTestEnv() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(MIGRATION_SQL);

  return {
    DB: new D1DatabaseShim(sqlite),
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
  }
}

function assertIncludes(actual, expectedSubstring, message) {
  if (!String(actual ?? "").includes(expectedSubstring)) {
    throw new Error(`${message}\nExpected substring: ${expectedSubstring}\nActual: ${actual}`);
  }
}

class FakeVkClient {
  constructor() {
    this.uploads = [];
  }

  async uploadAudioMessage(peerId, fileName, fileContents, contentType = "audio/ogg") {
    this.uploads.push({
      peerId: Number(peerId),
      fileName,
      size: fileContents?.length ?? 0,
      contentType,
    });

    return "audio_message999_555_key";
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
