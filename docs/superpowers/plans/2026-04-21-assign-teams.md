# Assign Teams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-time "Начать квест" flow for main admins that randomly assigns teams to stations, starts the first wave safely, and retries failed first-wave deliveries.

**Architecture:** Extend `admin-home` to expose different menus for main admins and station admins, add a focused `assign-teams` module for confirmation/retry UI, and reuse the existing delivery-first routing model so teams only start after successful message delivery. Persist start-state in D1 via existing `teams`, `stations`, `events`, and `user_state` rather than adding new tables.

**Tech Stack:** Cloudflare Workers, VK Bot API, D1 (SQLite), plain JavaScript ES modules, script-based scenario tests.

---

### Task 1: Update admin-home menus and routing for main-admin quest start

**Files:**
- Create: none
- Modify: `src/modules/admin-home/keyboards.js`
- Modify: `src/modules/admin-home/screens.js`
- Modify: `src/modules/admin-home/router.js`
- Modify: `src/app/action-types.js`
- Test: `scripts/test-assign-teams-scenario.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { ACTIONS } from "../src/app/action-types.js";
import { buildMainAdminMenuModel, buildStationAdminMenuModel } from "../src/modules/admin-home/keyboards.js";

function testMainAdminMenuShowsAssignTeams() {
  const buttons = buildMainAdminMenuModel();
  const actions = buttons.map((button) => button.payload.action);

  if (!actions.includes(ACTIONS.OPEN_ASSIGN_TEAMS)) {
    throw new Error("Main admin menu should include OPEN_ASSIGN_TEAMS.");
  }

  if (actions.includes(ACTIONS.OPEN_MY_STATION)) {
    throw new Error("Main admin menu should not include OPEN_MY_STATION.");
  }
}

function testStationAdminMenuShowsMyStation() {
  const buttons = buildStationAdminMenuModel();
  const actions = buttons.map((button) => button.payload.action);

  if (!actions.includes(ACTIONS.OPEN_MY_STATION)) {
    throw new Error("Station admin menu should include OPEN_MY_STATION.");
  }
}

testMainAdminMenuShowsAssignTeams();
testStationAdminMenuShowsMyStation();
console.log("admin-home-menu-models-ok");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node .\scripts\test-assign-teams-scenario.mjs`
Expected: FAIL with import or missing `OPEN_ASSIGN_TEAMS` / missing builders.

- [ ] **Step 3: Write minimal implementation**

```js
// src/app/action-types.js
OPEN_ASSIGN_TEAMS: "open_assign_teams",
ASSIGN_TEAMS_CONFIRM: "assign_teams_confirm",
ASSIGN_TEAMS_RETRY_FAILED: "assign_teams_retry_failed",

// src/modules/admin-home/keyboards.js
export function buildMainAdminMenuModel() {
  return [
    { label: "Начать квест", color: "primary", payload: { action: ACTIONS.OPEN_ASSIGN_TEAMS } },
    { label: "Статистика", color: "primary", payload: { action: ACTIONS.OPEN_STATUS } },
    { label: "Станции и команды", color: "primary", payload: { action: ACTIONS.OPEN_STATIONS_TEAMS } },
    { label: "Сообщения Бота", color: "primary", payload: { action: ACTIONS.OPEN_BOT_MESSAGES } },
    { label: "Сброс", color: "negative", payload: { action: ACTIONS.OPEN_RESET } },
    { label: "Выйти", color: "secondary", payload: { action: ACTIONS.EXIT } },
  ];
}

export function buildStationAdminMenuModel() {
  return [
    { label: "Моя станция", color: "primary", payload: { action: ACTIONS.OPEN_MY_STATION } },
    { label: "Статистика", color: "primary", payload: { action: ACTIONS.OPEN_STATUS } },
    { label: "Станции и команды", color: "primary", payload: { action: ACTIONS.OPEN_STATIONS_TEAMS } },
    { label: "Сообщения Бота", color: "primary", payload: { action: ACTIONS.OPEN_BOT_MESSAGES } },
    { label: "Сброс", color: "negative", payload: { action: ACTIONS.OPEN_RESET } },
    { label: "Выйти", color: "secondary", payload: { action: ACTIONS.EXIT } },
  ];
}

export function createAdminMenuKeyboard(user) {
  const buttons = user?.station_id ? buildStationAdminMenuModel() : buildMainAdminMenuModel();
  return createButtonsKeyboard(buttons);
}

// src/modules/admin-home/screens.js
export async function sendAdminMenuScreen(vk, peerId, message, user = null) {
  await vk.sendText(peerId, message, {
    keyboard: createAdminMenuKeyboard(user),
  });
}

// src/modules/admin-home/router.js
await sendAdminMenuScreen(context.vk, context.peerId, message, context.user);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node .\scripts\test-assign-teams-scenario.mjs`
Expected: PASS with `admin-home-menu-models-ok`

- [ ] **Step 5: Commit**

```bash
git add src/app/action-types.js src/modules/admin-home/keyboards.js src/modules/admin-home/screens.js src/modules/admin-home/router.js scripts/test-assign-teams-scenario.mjs
git commit -m "Split admin menus for quest start flow"
```

### Task 2: Add assign-teams module UI and main route integration

**Files:**
- Create: `src/modules/assign-teams/keyboards.js`
- Create: `src/modules/assign-teams/screens.js`
- Create: `src/modules/assign-teams/router.js`
- Modify: `src/app/state-types.js`
- Modify: `src/app/ui-router.js`
- Test: `scripts/test-assign-teams-scenario.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { createAssignTeamsConfirmKeyboard, createAssignTeamsRetryKeyboard } from "../src/modules/assign-teams/keyboards.js";
import { ACTIONS } from "../src/app/action-types.js";

function getActions(keyboard) {
  return keyboard.buttons.flatMap((row) =>
    row.map((button) => JSON.parse(button.action.payload).action),
  );
}

function testConfirmKeyboard() {
  const actions = getActions(createAssignTeamsConfirmKeyboard());

  if (!actions.includes(ACTIONS.ASSIGN_TEAMS_CONFIRM)) {
    throw new Error("Confirm keyboard should include ASSIGN_TEAMS_CONFIRM.");
  }

  if (!actions.includes(ACTIONS.BACK_TO_ADMIN_MENU)) {
    throw new Error("Confirm keyboard should include BACK_TO_ADMIN_MENU.");
  }
}

function testRetryKeyboard() {
  const actions = getActions(createAssignTeamsRetryKeyboard());

  if (!actions.includes(ACTIONS.ASSIGN_TEAMS_RETRY_FAILED)) {
    throw new Error("Retry keyboard should include ASSIGN_TEAMS_RETRY_FAILED.");
  }
}

testConfirmKeyboard();
testRetryKeyboard();
console.log("assign-teams-keyboards-ok");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node .\scripts\test-assign-teams-scenario.mjs`
Expected: FAIL with missing module or missing exports.

- [ ] **Step 3: Write minimal implementation**

```js
// src/app/state-types.js
ASSIGN_TEAMS_CONFIRM: "assign_teams_confirm",
ASSIGN_TEAMS_RETRY: "assign_teams_retry",

// src/modules/assign-teams/keyboards.js
export function createAssignTeamsConfirmKeyboard() {
  return createKeyboard([
    [{ label: "Да", color: "primary", payload: { action: ACTIONS.ASSIGN_TEAMS_CONFIRM } }],
    [{ label: "Назад", color: "secondary", payload: { action: ACTIONS.BACK_TO_ADMIN_MENU } }],
  ]);
}

export function createAssignTeamsRetryKeyboard() {
  return createKeyboard([
    [{ label: "Повторить отправку", color: "primary", payload: { action: ACTIONS.ASSIGN_TEAMS_RETRY_FAILED } }],
    [{ label: "Назад", color: "secondary", payload: { action: ACTIONS.BACK_TO_ADMIN_MENU } }],
  ]);
}

// src/modules/assign-teams/screens.js
export async function sendAssignTeamsConfirmScreen(vk, peerId, text) {
  await vk.sendText(peerId, text, { keyboard: createAssignTeamsConfirmKeyboard() });
}

export async function sendAssignTeamsRetryScreen(vk, peerId, text) {
  await vk.sendText(peerId, text, { keyboard: createAssignTeamsRetryKeyboard() });
}

// src/modules/assign-teams/router.js
export async function openAssignTeamsConfirm(context) { /* set state + send screen */ }
export async function handleAssignTeamsState(context) { /* route confirm/back/retry */ }

// src/app/ui-router.js
// wire OPEN_ASSIGN_TEAMS and ASSIGN_TEAMS_CONFIRM/RETRY states
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node .\scripts\test-assign-teams-scenario.mjs`
Expected: PASS with `assign-teams-keyboards-ok`

- [ ] **Step 5: Commit**

```bash
git add src/modules/assign-teams/keyboards.js src/modules/assign-teams/screens.js src/modules/assign-teams/router.js src/app/state-types.js src/app/ui-router.js scripts/test-assign-teams-scenario.mjs
git commit -m "Add assign-teams confirmation module"
```

### Task 3: Add repository helpers for quest-start preconditions and team/station snapshots

**Files:**
- Create: none
- Modify: `src/db/events-repository.js`
- Modify: `src/db/setup-repository.js`
- Test: `scripts/test-assign-teams-scenario.mjs`

- [ ] **Step 1: Write the failing test**

```js
import {
  hasAnyEvents,
  listTeamsWaitingForInitialAssignment,
  listFreeStations,
} from "../src/db/events-repository.js";

async function testQuestStartQueries(env) {
  const hasEventsInitially = await hasAnyEvents(env);
  const teams = await listTeamsWaitingForInitialAssignment(env);
  const stations = await listFreeStations(env);

  if (hasEventsInitially !== false) {
    throw new Error("Expected no events initially.");
  }

  if (teams.length !== 3) {
    throw new Error(`Expected 3 teams, got ${teams.length}.`);
  }

  if (stations.length !== 2) {
    throw new Error(`Expected 2 free stations, got ${stations.length}.`);
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node .\scripts\test-assign-teams-scenario.mjs`
Expected: FAIL with missing exports.

- [ ] **Step 3: Write minimal implementation**

```js
export async function hasAnyEvents(env) {
  const row = await dbFirst(env, "SELECT COUNT(*) AS total FROM events");
  return Number(row?.total ?? 0) > 0;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node .\scripts\test-assign-teams-scenario.mjs`
Expected: PASS on repository helper assertions.

- [ ] **Step 5: Commit**

```bash
git add src/db/events-repository.js src/db/setup-repository.js scripts/test-assign-teams-scenario.mjs
git commit -m "Add quest start repository helpers"
```

### Task 4: Implement first-wave assignment with delivery-first commit logic

**Files:**
- Create: none
- Modify: `src/modules/assign-teams/router.js`
- Modify: `src/utils/participant-delivery.js`
- Modify: `src/db/events-repository.js`
- Test: `scripts/test-assign-teams-scenario.mjs`

- [ ] **Step 1: Write the failing test**

```js
async function testQuestStartAssignsOnlySuccessfulTeams(env, context) {
  const result = await startQuest(context);

  if (result.startedTeams.length !== 2) {
    throw new Error(`Expected 2 started teams, got ${result.startedTeams.length}.`);
  }

  if (result.waitingTeams.length !== 1) {
    throw new Error(`Expected 1 waiting team, got ${result.waitingTeams.length}.`);
  }

  if (result.failedTeams.length !== 1) {
    throw new Error(`Expected 1 failed team, got ${result.failedTeams.length}.`);
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node .\scripts\test-assign-teams-scenario.mjs`
Expected: FAIL because `startQuest` is missing or incomplete.

- [ ] **Step 3: Write minimal implementation**

```js
export async function startQuest(context) {
  const teams = await listTeamsWaitingForInitialAssignment(context.env);
  const stations = shuffleArray(await listFreeStations(context.env));
  const assignableCount = Math.min(teams.length, stations.length);
  const startedTeams = [];
  const failedTeams = [];
  const waitingTeams = [];

  for (let index = 0; index < assignableCount; index += 1) {
    const team = teams[index];
    const station = stations[index];
    const delivery = await buildInitialStationDelivery(context, team, station);
    const report = await deliverParticipantContentWithAdminLog(context, delivery);

    if (!report.ok) {
      failedTeams.push({ team, station, report });
      continue;
    }

    await startStationForTeam(context.env, {
      stationId: station.id,
      teamId: team.id,
      startedByUserId: context.user.id,
      startTime: new Date().toISOString(),
    });
    startedTeams.push({ team, station });
  }

  for (let index = assignableCount; index < teams.length; index += 1) {
    const team = teams[index];
    const delivery = await buildInitialWaitingDelivery(context, team);
    const report = await deliverParticipantContentWithAdminLog(context, delivery);

    if (!report.ok) {
      failedTeams.push({ team, station: null, report });
      continue;
    }

    await setTeamStatus(context.env, team.id, "waiting_station");
    waitingTeams.push({ team });
  }

  return { startedTeams, waitingTeams, failedTeams };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node .\scripts\test-assign-teams-scenario.mjs`
Expected: PASS on first-wave assignment assertions.

- [ ] **Step 5: Commit**

```bash
git add src/modules/assign-teams/router.js src/utils/participant-delivery.js src/db/events-repository.js scripts/test-assign-teams-scenario.mjs
git commit -m "Implement first-wave quest assignment"
```

### Task 5: Implement retry flow for failed first-wave teams

**Files:**
- Create: none
- Modify: `src/modules/assign-teams/router.js`
- Modify: `src/modules/assign-teams/screens.js`
- Modify: `src/db/user-state-repository.js`
- Test: `scripts/test-assign-teams-scenario.mjs`

- [ ] **Step 1: Write the failing test**

```js
async function testRetryStartsPreviouslyFailedTeam(env, context) {
  const initial = await startQuest(context);
  const retried = await retryFailedQuestAssignments(context, initial.failedTeams);

  if (retried.recoveredTeams.length !== 1) {
    throw new Error(`Expected 1 recovered team, got ${retried.recoveredTeams.length}.`);
  }

  const recoveredTeam = await getTeamById(env, 3);

  if (recoveredTeam.status !== "on_station") {
    throw new Error(`Expected recovered team to be on_station, got ${recoveredTeam.status}.`);
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node .\scripts\test-assign-teams-scenario.mjs`
Expected: FAIL because retry flow is not implemented.

- [ ] **Step 3: Write minimal implementation**

```js
export async function retryFailedQuestAssignments(context) {
  const failedAssignments = context.userState?.payload?.failedAssignments ?? [];
  const recoveredTeams = [];
  const stillFailedTeams = [];

  for (const item of failedAssignments) {
    const team = await getTeamById(context.env, item.teamId);

    if (!team || team.status !== "waiting_start") {
      continue;
    }

    const station = item.stationId ? await getStationById(context.env, item.stationId) : await pickNextFreeStation(context, team.id);
    const delivery = station
      ? await buildInitialStationDelivery(context, team, station)
      : await buildInitialWaitingDelivery(context, team);
    const report = await deliverParticipantContentWithAdminLog(context, delivery);

    if (!report.ok) {
      stillFailedTeams.push({ teamId: team.id, stationId: station?.id ?? null });
      continue;
    }

    if (station) {
      await startStationForTeam(context.env, {
        stationId: station.id,
        teamId: team.id,
        startedByUserId: context.user.id,
        startTime: new Date().toISOString(),
      });
    } else {
      await setTeamStatus(context.env, team.id, "waiting_station");
    }

    recoveredTeams.push(team.id);
  }

  await setUserState(context.env, context.user.id, STATE_TYPES.ASSIGN_TEAMS_RETRY, "idle", {
    failedAssignments: stillFailedTeams,
  });

  return { recoveredTeams, stillFailedTeams };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node .\scripts\test-assign-teams-scenario.mjs`
Expected: PASS on retry assertions.

- [ ] **Step 5: Commit**

```bash
git add src/modules/assign-teams/router.js src/modules/assign-teams/screens.js src/db/user-state-repository.js scripts/test-assign-teams-scenario.mjs
git commit -m "Add retry flow for failed quest start deliveries"
```

### Task 6: Add main-admin quest-start summaries and docs/tests updates

**Files:**
- Create: none
- Modify: `src/modules/assign-teams/router.js`
- Modify: `src/documentation/IMPLEMENTATION_PLAN.md`
- Modify: `src/documentation/UI_NAVIGATION.md`
- Modify: `docs/superpowers/specs/2026-04-21-assign-teams-design.md`
- Test: `scripts/test-assign-teams-scenario.mjs`
- Test: `scripts/test-station-routing-scenario.mjs`
- Test: `scripts/test-delivery-safety-scenario.mjs`

- [ ] **Step 1: Write the failing test**

```js
async function testQuestStartSummaryIncludesStartedWaitingAndFailed(vk, context) {
  await startQuest(context);
  const mainAdminTexts = vk.getTextsForPeer(9002);

  if (!mainAdminTexts.some((text) => text.includes("Старт квеста"))) {
    throw new Error("Expected quest start summary log for main admin.");
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node .\scripts\test-assign-teams-scenario.mjs`
Expected: FAIL because summary log is missing.

- [ ] **Step 3: Write minimal implementation**

```js
function formatQuestStartSummary(result) {
  return [
    "Старт квеста завершен.",
    `Успешно стартовали: ${result.startedTeams.length}`,
    `Ушли в ожидание: ${result.waitingTeams.length}`,
    `Ошибки доставки: ${result.failedTeams.length}`,
  ].join("\n");
}

await notifyMainAdmins(context, formatQuestStartSummary(result));
```

Update the docs so they describe:

- `Начать квест` in main-admin menu
- one-time start only while `events` is empty
- random first-wave distribution
- waiting behavior when teams exceed stations
- retry for failed first-wave deliveries

- [ ] **Step 4: Run test suite to verify it passes**

Run: `npm run check`
Expected: PASS

Run: `node .\scripts\test-assign-teams-scenario.mjs`
Expected: PASS

Run: `node .\scripts\test-station-routing-scenario.mjs`
Expected: PASS

Run: `node .\scripts\test-delivery-safety-scenario.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/assign-teams/router.js src/documentation/IMPLEMENTATION_PLAN.md src/documentation/UI_NAVIGATION.md docs/superpowers/specs/2026-04-21-assign-teams-design.md scripts/test-assign-teams-scenario.mjs scripts/test-station-routing-scenario.mjs scripts/test-delivery-safety-scenario.mjs
git commit -m "Add quest start flow for main admins"
```
