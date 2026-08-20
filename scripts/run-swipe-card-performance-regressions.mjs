#!/usr/bin/env node

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(output, filename);
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const {
  applySwipeCardPerformanceEvent,
  deriveSwipeCardPerformance,
  listSwipeCardPerformanceBlob,
  parseSwipeCardPerformanceEvent,
  recordSwipeCardPerformanceBlob,
} = require(resolve(repoRoot, "lib", "swipeCardPerformance.ts"));

let passed = 0;
let failed = 0;
const pendingTests = [];

function test(name, fn) {
  pendingTests.push(Promise.resolve().then(fn).then(() => {
    console.log(`  PASS ${name}`);
    passed += 1;
  }).catch((error) => {
    console.error(`  FAIL ${name}`);
    console.error(`       ${error.message}`);
    failed += 1;
  }));
}

const empty = { timesShown: 0, likes: 0, dislikes: 0, skips: 0 };

test("like increments shown and likes", () => {
  assert.deepEqual(applySwipeCardPerformanceEvent(empty, "like"), {
    timesShown: 1, likes: 1, dislikes: 0, skips: 0,
  });
});

test("dislike increments shown and dislikes", () => {
  assert.deepEqual(applySwipeCardPerformanceEvent(empty, "dislike"), {
    timesShown: 1, likes: 0, dislikes: 1, skips: 0,
  });
});

test("skip increments shown and skips while remaining unrecognized", () => {
  const counts = applySwipeCardPerformanceEvent(empty, "skip");
  const row = deriveSwipeCardPerformance({
    cardId: "card-1",
    cardType: "books",
    title: "Example",
    ageBand: "teens",
    ...counts,
  });
  assert.equal(row.timesShown, 1);
  assert.equal(row.skips, 1);
  assert.equal(row.recognitionCount, 0);
  assert.equal(row.recognitionRate, 0);
});

test("presentation gate prevents rerender double counting", () => {
  const recorded = new Set();
  const presentationKey = "ms_hs:0:card-1";
  const claim = () => {
    if (recorded.has(presentationKey)) return false;
    recorded.add(presentationKey);
    return true;
  };
  assert.equal(claim(), true);
  assert.equal(claim(), false);
  assert.equal(recorded.size, 1);
});

test("presentation gate resets with the deck session", () => {
  const screen = readFileSync(resolve(repoRoot, "screens", "SwipeDeckScreen.tsx"), "utf8");
  const resetEffect = screen.slice(screen.indexOf("React.useEffect(() => {", screen.indexOf("function rememberRecommendationFeedback")));
  assert.match(resetEffect, /recordedCardPerformanceRef\.current\.clear\(\)/);
});

test("statistics remain separated by age band", () => {
  const aggregates = new Map();
  for (const [ageBand, action] of [["kids", "like"], ["teens", "skip"]]) {
    const key = `same-card:${ageBand}`;
    aggregates.set(key, applySwipeCardPerformanceEvent(aggregates.get(key) || empty, action));
  }
  assert.equal(aggregates.get("same-card:kids").likes, 1);
  assert.equal(aggregates.get("same-card:kids").skips, 0);
  assert.equal(aggregates.get("same-card:teens").likes, 0);
  assert.equal(aggregates.get("same-card:teens").skips, 1);
});

test("accepted payload contains no patron-identifying fields", () => {
  const event = parseSwipeCardPerformanceEvent({
    cardId: "card-1",
    cardType: "books",
    title: "Example",
    ageBand: "teens",
    action: "like",
    eventId: "swipe-test-event",
    patronId: "must-not-persist",
    sessionId: "must-not-persist",
    deviceId: "must-not-persist",
  });
  assert.deepEqual(Object.keys(event).sort(), ["action", "ageBand", "cardId", "cardType", "eventId", "title"]);
});

test("server schema stores only aggregate card counters", () => {
  const migration = readFileSync(resolve(repoRoot, "migrations", "swipe-card-performance-init.sql"), "utf8");
  assert.match(migration, /PRIMARY KEY \(card_id, age_band\)/);
  assert.doesNotMatch(migration, /patron|user_id|session_id|device|history/i);
});

test("server accepts only canonical cards for the matching age band", () => {
  const source = readFileSync(resolve(repoRoot, "lib", "swipeCardPerformance.ts"), "utf8");
  assert.match(source, /CARD_CATALOG/);
  assert.match(source, /invalid_swipe_card_identity/);
  assert.match(source, /canonicalizeSwipeCardPerformanceEvent/);
});

test("telemetry identity separates matching titles across media types", () => {
  const { swipeCardPerformanceIdentity } = require(resolve(repoRoot, "data", "swipeDecks", "cardMetadata.ts"));
  assert.notEqual(
    swipeCardPerformanceIdentity({ title: "Same Title", tags: ["media:book"] }),
    swipeCardPerformanceIdentity({ title: "Same Title", tags: ["media:movie"] }),
  );
});

test("collector sends no patron or session identity", () => {
  const screen = readFileSync(resolve(repoRoot, "screens", "SwipeDeckScreen.tsx"), "utf8");
  const start = screen.indexOf("  function recordCardPerformance");
  const end = screen.indexOf("\nfunction handleRight", start);
  const collector = screen.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(collector, /pipelineUserId|pipelineSessionId|patron|device/i);
  assert.match(collector, /recordedCardPerformanceRef/);
});

test("native collector resolves an absolute production API URL", () => {
  const screen = readFileSync(resolve(repoRoot, "screens", "SwipeDeckScreen.tsx"), "utf8");
  assert.match(screen, /EXPO_PUBLIC_NOVELIDEAS_API_ORIGIN/);
  assert.match(screen, /https:\/\/novelideas\.app/);
});

test("collector retries with a stable idempotency key", () => {
  const screen = readFileSync(resolve(repoRoot, "screens", "SwipeDeckScreen.tsx"), "utf8");
  assert.match(screen, /const eventId = `swipe-/);
  assert.match(screen, /for \(let attempt = 1; attempt <= 3; attempt \+= 1\)/);
  assert.match(screen, /recordedCardPerformanceRef\.current\.delete\(presentationKey\)/);
});

test("Blob fallback records idempotent events and aggregates them", async () => {
  const k2Module = require(resolve(repoRoot, "data", "swipeDecks", "k2.ts"));
  const card = (k2Module.default || k2Module.k2).cards[0];
  const { cardCategoryFromTags, swipeCardPerformanceIdentity } =
    require(resolve(repoRoot, "data", "swipeDecks", "cardMetadata.ts"));
  const records = new Map();
  const store = {
    async putJson(pathname, value) { records.set(pathname, value); },
    async list(prefix) {
      return [...records.keys()].filter((pathname) => pathname.startsWith(prefix))
        .map((pathname) => ({ pathname, uploadedAt: new Date().toISOString() }));
    },
    async readJson(pathname) { return records.get(pathname) || null; },
  };
  const base = {
    eventId: "swipe-blob-event",
    cardId: swipeCardPerformanceIdentity(card),
    cardType: cardCategoryFromTags(card),
    title: String(card.title || card.prompt),
    ageBand: "kids",
    action: "like",
  };
  await recordSwipeCardPerformanceBlob(base, store);
  await recordSwipeCardPerformanceBlob(base, store);
  const rows = await listSwipeCardPerformanceBlob(store);
  assert.equal(records.size, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].timesShown, 1);
  assert.equal(rows[0].likes, 1);
});

test("Human Review Dashboard reads and displays aggregate results", () => {
  const collectorApi = readFileSync(resolve(repoRoot, "api", "swipe-card-performance.ts"), "utf8");
  const api = readFileSync(resolve(repoRoot, "api", "human-review-dashboard.ts"), "utf8");
  const dashboard = readFileSync(resolve(repoRoot, "app", "admin", "human-review.tsx"), "utf8");
  assert.match(api, /listSwipeCardPerformance/);
  assert.match(api, /listSwipeCardPerformanceBlob/);
  assert.match(api, /swipeCardPerformanceStorageMode/);
  assert.match(api, /swipeCardPerformanceError/);
  assert.match(api, /storageMode: "error"/);
  assert.match(dashboard, /Swipe Card Performance/);
  assert.match(dashboard, /Collection active/);
  assert.match(dashboard, /no durable storage is configured/);
  assert.match(dashboard, /Recognition %/);
  assert.match(dashboard, /highest_skip_rate/);
  assert.match(dashboard, /lowest_recognition_rate/);
  assert.match(dashboard, /highest_recognition_rate/);
  assert.match(collectorApi, /req\.method === "GET"/);
  assert.match(collectorApi, /status: storageMode === "unavailable" \? "unavailable" : "ready"/);
});

test("Admin source toggles retain their existing behavior", () => {
  const admin = readFileSync(resolve(repoRoot, "app", "app_admin-web.tsx"), "utf8");
  assert.match(admin, /sourceEnabled\[sourceKey\] = next/);
});

await Promise.all(pendingTests);
console.log(`\nSwipe Card Performance regressions: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
