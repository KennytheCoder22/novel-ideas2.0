import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  module._compile(output, filename);
};

const game = require(resolve(root, "lib/recommendationGames/unwrittenMap.ts"));
const evidence = require(resolve(root, "lib/recommendationGames/unwrittenMapEvidenceClient.ts"));

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

class MemoryStorage {
  values = new Map();
  async getItem(key) {
    return this.values.get(key) ?? null;
  }
  async setItem(key, value) {
    this.values.set(key, value);
  }
}

async function main() {
  const checks = [];
  const routeSource = readFileSync(resolve(root, "app/games/unwritten-map.tsx"), "utf8");
  const hubSource = readFileSync(resolve(root, "app/games/index.tsx"), "utf8");
  const layoutSource = readFileSync(resolve(root, "app/_layout.tsx"), "utf8");
  const contractSource = readFileSync(resolve(root, "lib/recommendationGames/unwrittenMap.ts"), "utf8");
  const apiSource = readFileSync(resolve(root, "api/unwritten-map-event.ts"), "utf8");

  assert(hubSource.includes("The Unwritten Map"), "Games chooser entry missing");
  assert(hubSource.includes('router.push("/games/unwritten-map"'), "Games chooser route missing");
  assert(layoutSource.includes('name="games/unwritten-map"'), "map game route is not registered");
  assert(routeSource.includes('document.title = "The Unwritten Map"'), "browser title must preserve game fiction");
  checks.push("route_and_games_hub");

  assert(game.UNWRITTEN_MAP_TILES.length === 11, "overworld must contain eleven tile rows");
  assert(game.UNWRITTEN_MAP_TILES.every((row) => row.length === 15), "overworld rows must be fifteen tiles wide");
  assert(game.UNWRITTEN_MAP_SCENARIOS.length === 4, "first journey must contain four encounters");
  assert(game.UNWRITTEN_MAP_SCENARIOS.every((scenario) => scenario.choices.length === 4), "every encounter must offer four equal choices");
  assert(game.moveOnMap({ x: 7, y: 5 }, "up").y === 4, "player should move across walkable paths");
  assert(game.moveOnMap({ x: 1, y: 1 }, "left").x === 1, "trees must block movement");
  checks.push("tile_movement_and_encounters");

  const playerId = game.createUnwrittenMapPlayerId(1_700_000_000_000, 0.25);
  const initial = game.createInitialUnwrittenMapSave(playerId, "2026-09-01T00:00:00.000Z");
  const restored = game.restoreUnwrittenMapSave(JSON.stringify(initial));
  assert(JSON.stringify(restored) === JSON.stringify(initial), "save must survive an exact round trip");
  assert(game.restoreUnwrittenMapSave('{"schemaVersion":"wrong"}') === null, "unknown save schemas must be rejected");
  const scenario = game.UNWRITTEN_MAP_SCENARIOS[0];
  const positioned = game.updateMapPosition(initial, scenario.position, "2026-09-01T00:00:01.000Z");
  assert(positioned.discoveredScenarioIds.includes(scenario.id), "walking onto a marker must discover it");
  const decided = game.applyMapChoice(positioned, scenario.id, scenario.choices[0].id, "2026-09-01T00:00:02.000Z");
  assert(decided.decisions.length === 1, "choice must persist in the map journal");
  let duplicateBlocked = false;
  try {
    game.applyMapChoice(decided, scenario.id, scenario.choices[1].id);
  } catch (error) {
    duplicateBlocked = String(error.message).includes("scenario_already_completed");
  }
  assert(duplicateBlocked, "completed encounters must reject duplicate decisions");
  checks.push("persistent_map_journal");

  const presentedOptionIds = scenario.choices.map((choice) => choice.id);
  const event = game.createUnwrittenMapChoiceEvent({
    save: positioned,
    scenario,
    selectedOptionId: scenario.choices[1].id,
    presentedOptionIds,
    gameSessionId: "map-session-test",
    startedAtMs: Date.now() - 500,
    occurredAt: "2026-09-01T00:00:03.000Z",
  });
  assert(game.isUnwrittenMapChoiceEventV1(event), "generated raw choice event must validate");
  assert(event.selectedOptionId === scenario.choices[1].id, "selection must remain raw and explicit");
  assert(event.rejectedOptionIds.length === 3, "non-selected presented options must remain explicit");
  assert(!("preferenceScore" in event) && !("personality" in event), "raw evidence must not invent analytical truth");
  assert(
    !game.isUnwrittenMapChoiceEventV1({ ...event, selectedOptionId: "not-presented" }),
    "validator must reject selections outside the presented set",
  );
  assert(
    !game.isUnwrittenMapChoiceEventV1({ ...event, responseTimeMs: event.responseTimeMs + 1 }),
    "event identity must be bound to its complete normalized payload",
  );
  const normalized = game.normalizeUnwrittenMapChoiceEventV1({ ...event, unexpectedPersonalData: "discard" });
  assert(normalized && !("unexpectedPersonalData" in normalized), "durable records must use an explicit allowlist");
  assert(contractSource.includes('"unwritten_map_choice_event_v1"'), "versioned map evidence schema missing");
  assert(!contractSource.includes("TasteFeedbackEvent"), "map evidence must not overload TasteFeedbackEvent");
  assert(!contractSource.includes("human_review_record_v1"), "map evidence must not overload Human Review");
  checks.push("raw_evidence_contract");

  const storage = new MemoryStorage();
  await evidence.queueUnwrittenMapEvent(storage, event);
  await evidence.queueUnwrittenMapEvent(storage, event);
  assert((await evidence.readQueuedUnwrittenMapEvents(storage)).length === 1, "queue must deduplicate event IDs");
  const pendingFlush = await evidence.flushUnwrittenMapEvents(storage, async () => true);
  assert(pendingFlush.sent === 0 && pendingFlush.remaining === 1, "uncommitted evidence must never be delivered");
  await evidence.commitUnwrittenMapEvent(storage, event.eventId);
  const failedFlush = await evidence.flushUnwrittenMapEvents(storage, async () => false);
  assert(failedFlush.remaining === 1, "failed delivery must remain queued");
  const successfulFlush = await evidence.flushUnwrittenMapEvents(storage, async () => true);
  assert(successfulFlush.sent === 1 && successfulFlush.remaining === 0, "successful delivery must clear the queue");
  assert(apiSource.includes("recommendation-games/the-unwritten-map/v1"), "durable namespace must be game-specific");
  assert(apiSource.includes("allowOverwrite: true"), "durable retries must be idempotent");
  checks.push("isolated_durable_queue");

  assert(routeSource.includes('document.addEventListener("keydown"'), "keyboard movement missing");
  assert(routeSource.includes("function DPad"), "touch direction pad missing");
  assert(routeSource.includes("ArrowUp") && routeSource.includes('event.key.toLowerCase() === "w"'), "arrow and WASD controls missing");
  assert(routeSource.includes("await queueUnwrittenMapEvent(gameStorage, event)"), "choice evidence must queue locally");
  assert(routeSource.includes("await persistSave(nextSave)"), "choice progress must persist locally");
  assert(routeSource.includes("flushUnwrittenMapEvents(gameStorage, sendUnwrittenMapEvent)"), "durable delivery retry missing");
  checks.push("accessible_playable_route");

  console.log(JSON.stringify({
    name: "the-unwritten-map-regressions",
    status: "pass",
    checks,
    count: checks.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
