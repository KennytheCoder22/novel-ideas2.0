import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
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
require.extensions[".webp"] = (module, filename) => {
  module.exports = filename;
};

const game = require(resolve(root, "lib/recommendationGames/lastBookshop.ts"));
const evidence = require(resolve(root, "lib/recommendationGames/evidenceClient.ts"));
const portraits = require(resolve(root, "lib/recommendationGames/lastBookshopPortraits.ts"));

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
  const appSource = readFileSync(resolve(root, "app/games/last-bookshop.tsx"), "utf8");
  const hubSource = readFileSync(resolve(root, "app/games/index.tsx"), "utf8");
  const menuSource = readFileSync(resolve(root, "app/(tabs)/index.tsx"), "utf8");
  const layoutSource = readFileSync(resolve(root, "app/_layout.tsx"), "utf8");
  const contractSource = readFileSync(resolve(root, "lib/recommendationGames/lastBookshop.ts"), "utf8");
  const humanReviewSource = readFileSync(resolve(root, "screens/swipe/humanReviewContract.ts"), "utf8");
  const vercel = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8"));

  assert(menuSource.includes(">Games</Text>"), "Games menu entry missing");
  assert(!menuSource.includes("Play Recommendation Games"), "retired game menu label must not remain");
  assert(menuSource.includes('pathname: "/games"'), "game menu must open the game chooser");
  assert(hubSource.includes("Media Mania"), "game chooser must preserve Media Mania");
  assert(hubSource.includes("The Last Bookshop"), "game chooser must include The Last Bookshop");
  assert(hubSource.includes('route: "/media-mania"'), "Media Mania route missing from game chooser");
  assert(hubSource.includes('route: "/games/last-bookshop"'), "Last Bookshop route missing from game chooser");
  assert(hubSource.includes("router.push({ pathname: game.route, params: forwardedParams }"), "game chooser must forward shared context");
  assert(menuSource.includes("Librarian Review"), "Librarian Review must remain separate");
  assert(layoutSource.includes('name="games/last-bookshop"'), "game route is not registered");
  assert(vercel.rewrites.some((rewrite) => rewrite.source === "/games/:path*" && rewrite.destination === "/"), "game SPA rewrite missing");
  checks.push("separate_route_and_menu");

  assert(appSource.includes('THE LAST{"\\n"}BOOKSHOP'), "video-game title screen missing");
  assert(appSource.includes("Search the Shelves"), "shelf-search phase missing");
  assert(appSource.includes("Set the Counter"), "counter-building phase missing");
  assert(appSource.includes("Ring the Bell"), "outcome action missing");
  assert(appSource.includes("Night 3 Complete") || appSource.includes("Night {completedNight} Complete"), "night progression missing");
  assert(appSource.includes('document.title = "The Last Bookshop"'), "browser title must preserve the game fiction");
  assert(appSource.includes("function PitchCharmChoice"), "pitch charms must render as visual choices");
  assert(appSource.includes("function CharmIllustration"), "pitch charms must have distinct illustrated artwork");
  assert(appSource.includes("function CandleIllustration"), "confidence choices must have distinct illustrated candles");
  assert(appSource.includes("function CandleSelector"), "confidence must use a visible candle control");
  assert(appSource.includes("Animated.loop"), "the confidence candle flame must animate");
  assert(appSource.includes("isReduceMotionEnabled"), "candle animation must honor reduced-motion preferences");
  assert(
    game.PITCH_CHARMS.every((charm) => !["Velvet Ribbon", "Brass Compass", "Silver Key", "Moth Wing"].includes(charm.label)),
    "pitch charms must be labeled by represented vibe rather than object name",
  );
  assert(game.LAST_BOOKSHOP_CUSTOMERS.length === 5, "vertical slice must contain five recurring patrons");
  assert(game.LAST_BOOKSHOP_WORKS.length >= 18, "vertical slice inventory is too small");
  assert(game.LAST_BOOKSHOP_ENCOUNTERS.length === 9, "vertical slice must contain three encounters per night");
  checks.push("playable_vertical_slice");

  const expectedPortraits = {
    mara: "mara-venn.webp",
    orin: "orin-bell.webp",
    kit: "kit-wren.webp",
    elsie: "elsie-thorn.webp",
    bram: "bram-hearth.webp",
  };
  const customerIds = game.LAST_BOOKSHOP_CUSTOMERS.map((customer) => customer.id);
  assert(
    JSON.stringify([...customerIds].sort()) === JSON.stringify(Object.keys(expectedPortraits).sort()),
    "every authored patron must have exactly one portrait mapping",
  );
  const portraitPaths = customerIds.map((customerId) => {
    const portraitPath = portraits.lastBookshopPortraitForCustomer(customerId);
    assert(typeof portraitPath === "string", `portrait mapping missing for ${customerId}`);
    assert(portraitPath.endsWith(expectedPortraits[customerId]), `portrait mapping is incorrect for ${customerId}`);
    assert(existsSync(portraitPath), `portrait asset does not exist for ${customerId}`);
    const bytes = readFileSync(portraitPath);
    assert(bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP", `${customerId} portrait must be WebP`);
    assert(statSync(portraitPath).size < 100_000, `${customerId} portrait exceeds the web payload budget`);
    return { portraitPath, hash: createHash("sha256").update(bytes).digest("hex") };
  });
  assert(new Set(portraitPaths.map(({ portraitPath }) => portraitPath)).size === 5, "all five patrons must map to distinct portrait assets");
  assert(new Set(portraitPaths.map(({ hash }) => hash)).size === 5, "all five portrait assets must contain distinct artwork");
  assert(portraits.lastBookshopPortraitForCustomer("unknown") === null, "unmapped patrons must use the abstract fallback");
  assert(appSource.includes('resizeMode="contain"'), "patron artwork must preserve its authored framing");
  assert(appSource.includes("accessibilityLabel={accessibilityLabel}"), "patron portraits must expose an accessibility label");
  assert(appSource.includes("onError={() => setFailedCustomerId(customer.id)}"), "patron artwork must retain the abstract fallback on load failure");
  checks.push("customer_portrait_assets");

  assert(contractSource.includes('"recommendation_game_event_v1"'), "game event schema missing");
  assert(!contractSource.includes("TasteFeedbackEvent"), "game evidence must not overload TasteFeedbackEvent");
  assert(!contractSource.includes("human_review_record_v1"), "game evidence must not overload Human Review records");
  assert(humanReviewSource.includes('"human_review_record_v1"'), "Human Review contract was unexpectedly changed");
  checks.push("evidence_semantics_separate");

  const playerId = game.createAnonymousPlayerId(1_700_000_000_000, 0.25);
  const initial = game.createInitialLastBookshopProgress(playerId);
  const restored = game.restoreLastBookshopProgress(JSON.stringify(initial));
  assert(JSON.stringify(restored) === JSON.stringify(initial), "progress must survive exact round trip");
  assert(game.restoreLastBookshopProgress('{"schemaVersion":"wrong"}') === null, "unknown progress schemas must be rejected");
  const recovered = game.restoreLastBookshopProgress(JSON.stringify({ ...initial, encounterIndex: 999 }));
  assert(recovered.encounterIndex === 2, "out-of-range encounter progress must recover to a playable step");
  checks.push("progress_round_trip");

  const encounter = game.LAST_BOOKSHOP_ENCOUNTERS[0];
  const selected = ["atlas-of-small-stars", "iron-suns", "tea-at-worlds-end"];
  const outcome = game.resolveEncounterOutcome(encounter, selected);
  assert(outcome.chosenWorkId === "atlas-of-small-stars", "authored patron reaction must be deterministic");
  assert(outcome.boundaryViolations.includes("war"), "explicit customer boundaries must be detected");
  assert(outcome.selectionDiversity >= 2, "shelf diversity must be measured");
  let invalidSelectionBlocked = false;
  try {
    game.resolveEncounterOutcome(encounter, [selected[0], selected[0], selected[1]]);
  } catch (error) {
    invalidSelectionBlocked = String(error.message).includes("three_unique");
  }
  assert(invalidSelectionBlocked, "counter must require three unique works");
  checks.push("deterministic_customer_resolution");

  const correctReward = game.calculateRoundReward(outcome.chosenWorkId, outcome);
  const incorrectReward = game.calculateRoundReward("iron-suns", outcome);
  assert(correctReward.reputation > incorrectReward.reputation, "correct customer prediction should earn more renown");
  assert(incorrectReward.reputation >= 1, "player must always make forward progress");
  checks.push("non_punitive_progression");

  const event = game.createRecommendationGameEvent({
    progress: initial,
    encounter,
    selectedWorkIds: selected,
    predictedWorkId: outcome.chosenWorkId,
    confidence: "high",
    pitchCharm: "mood",
    outcome,
    reward: correctReward,
    gameSessionId: "lbs-test-session",
    startedAtMs: Date.now() - 1000,
    occurredAt: "2026-09-01T00:00:00.000Z",
  });
  assert(game.isRecommendationGameEventV1(event), "generated event must satisfy recommendation_game_event_v1");
  assert(event.gameId === "the_last_bookshop", "game identity missing");
  assert(event.selectedCandidateIds.length === 3, "selected slate missing");
  assert(event.outcome.predictionCorrect === true, "prediction result missing");
  assert(event.anonymousPlayerId === playerId, "anonymous player identity missing");
  assert(
    !game.isRecommendationGameEventV1({ ...event, predictedCustomerChoiceId: "not-presented" }),
    "event validator must reject predictions outside the selected slate",
  );
  assert(
    !game.isRecommendationGameEventV1({ ...event, selectedCandidateIds: ["not-presented", "also-wrong", "still-wrong"] }),
    "event validator must reject unknown works without throwing",
  );
  const normalized = game.normalizeRecommendationGameEventV1({ ...event, unexpectedPersonalData: "must not persist" });
  assert(normalized && !("unexpectedPersonalData" in normalized), "stored events must use an explicit allowlist");
  checks.push("event_contract");

  const storage = new MemoryStorage();
  await evidence.queueRecommendationGameEvent(storage, event);
  await evidence.queueRecommendationGameEvent(storage, event);
  assert((await evidence.readQueuedRecommendationGameEvents(storage)).length === 1, "event queue must deduplicate event IDs");
  const failedFlush = await evidence.flushRecommendationGameEvents(storage, async () => false);
  assert(failedFlush.remaining === 1, "failed delivery must remain queued");
  const successfulFlush = await evidence.flushRecommendationGameEvents(storage, async () => true);
  assert(successfulFlush.sent === 1 && successfulFlush.remaining === 0, "successful delivery must clear queue");
  checks.push("isolated_event_queue");

  const next = game.advanceLastBookshopProgress(initial, encounter, correctReward);
  assert(next.completedEncounterIds.includes(encounter.id), "completed encounter must persist");
  assert(next.reputation === correctReward.reputation, "renown must persist");
  assert(next.encounterIndex === 1, "night progression must advance");
  const queueIndex = appSource.indexOf("await queueRecommendationGameEvent(gameStorage, event)");
  const persistIndex = appSource.indexOf("await persistProgress(nextProgress)");
  const flushIndex = appSource.indexOf("flushRecommendationGameEvents(gameStorage, sendRecommendationGameEvent)", persistIndex);
  assert(queueIndex > 0 && queueIndex < persistIndex && persistIndex < flushIndex, "local evidence and progress must persist before delivery");
  checks.push("night_progression");

  console.log(JSON.stringify({
    name: "the-last-bookshop-regressions",
    status: "pass",
    checks,
    count: checks.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
