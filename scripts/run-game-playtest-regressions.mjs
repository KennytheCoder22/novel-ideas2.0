import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const analysis = require(resolve(root, "lib/gamePlaytest/analysis.ts"));
const fixtures = require(resolve(root, "lib/gamePlaytest/fixtures.ts"));
const repositoryModule = require(resolve(root, "lib/gamePlaytest/repository.ts"));
const evidenceStorage = require(resolve(root, "lib/mediaMania/evidenceStorage.ts"));
const api = readFileSync(resolve(root, "api/game-playtest-report.ts"), "utf8");
const repository = readFileSync(resolve(root, "lib/gamePlaytest/repository.ts"), "utf8");
const dashboard = readFileSync(resolve(root, "app/admin/game-playtest.tsx"), "utf8");
const captureScript = readFileSync(resolve(root, "scripts/capture-game-playtest-screenshots.mjs"), "utf8");

function assert(value, message) { if (!value) throw new Error(`FAIL: ${message}`); }
function event(overrides = {}) {
  return { id: "e1", game: "media_mania", sessionId: "mm-session-a", playerId: "patron-a", libraryId: "library-a", ageBand: "teens", occurredAt: "2026-09-01T10:00:00.000Z", type: "round_completed", payload: { roundType: "LIKE", selectedItem: { title: "One" }, responseTimeMs: 5000 }, rawSchema: "test", ...overrides };
}

const report = analysis.buildPlaytestReport([
  event(), event({ id: "e2", type: "round_choice_undone", occurredAt: "2026-09-01T10:01:00.000Z", payload: { reversedEventId: "e1" } }),
  event({ id: "e3", game: "the_unwritten_map", sessionId: "map-a", libraryId: "library-a", type: "choice_made", occurredAt: "2026-09-01T10:02:00.000Z", payload: { scenarioId: "lantern-fair", selectedSlot: 1, chosenOption: { label: "Path", tasteVector: { wonder: 2 } }, latencyCategory: "returned", explorationContext: { regionId: "coast", discoveredCount: 2 } } }),
  event({ id: "e3", game: "the_unwritten_map", sessionId: "map-a", libraryId: "library-a", type: "choice_made", occurredAt: "2026-09-01T10:02:00.000Z", payload: { scenarioId: "lantern-fair", selectedSlot: 1, chosenOption: { label: "Path", tasteVector: { wonder: 2 } }, latencyCategory: "returned", explorationContext: { regionId: "coast", discoveredCount: 2 } } }),
  event({ id: "e4", game: "the_unwritten_map", sessionId: "map-a", libraryId: "library-a", type: "encounter_skipped", occurredAt: "2026-09-01T10:03:00.000Z", payload: {} }),
  event({ id: "e-map-undo", game: "the_unwritten_map", sessionId: "map-a", libraryId: "library-a", type: "choice_undone", occurredAt: "2026-09-01T10:03:30.000Z", payload: { scenarioId: "lantern-fair", originalEvidence: { eventId: "e3" }, originalOutcomeKind: "choice" } }),
  event({ id: "e5", game: "the_alchemists_cascade", sessionId: "cascade-a", libraryId: "library-a", type: "move_applied", occurredAt: "2026-09-01T10:04:00.000Z", payload: { preferenceInference: "none_from_gameplay" } }),
  event({ id: "e6", game: "the_alchemists_cascade", sessionId: "cascade-a", libraryId: "library-a", type: "catalyst_selected", occurredAt: "2026-09-01T10:05:00.000Z", payload: { preferenceInference: "eligible_balanced_semantic_choice", eligibility: { eligible: true }, selectedOption: { label: "Catalyst" } } }),
  event({ id: "e7", game: "the_last_bookshop", sessionId: "book-a", libraryId: null, type: "encounter_completed", occurredAt: "2026-09-01T10:06:00.000Z", payload: { selectedCandidateIds: ["a", "b", "c"], outcome: { predictionCorrect: true, boundaryViolations: [], selectionDiversity: 3 }, reasonTags: ["mood"] } }),
  event({ id: "e8", sessionId: "mm-exit", type: "session_exited", occurredAt: "2026-09-01T10:07:00.000Z", payload: {} }),
], analysis.DEFAULT_PLAYTEST_FILTERS);
assert(report.evidenceClasses.find((row) => row.kind === "direct_item_affinity").count === 0, "undone Media Mania evidence must be excluded");
assert(report.evidenceClasses.find((row) => row.kind === "semantic_vector").count === 0, "Map undo must reverse semantic evidence");
assert(report.games.find((row) => row.game === "the_unwritten_map").details.completed === 0, "Map undo must reverse completed choices");
assert(report.games.find((row) => row.game === "the_unwritten_map").details.axisCoverage === 0, "Map undo must reverse axis coverage");
assert(report.inventory.events === 9, "idempotent duplicate events must be deduplicated");
assert(report.evidenceClasses.find((row) => row.kind === "controlled_semantic").count === 1, "eligible catalyst must retain controlled semantic evidence");
assert(report.games.find((row) => row.game === "the_alchemists_cascade").usableSignals === 1, "ordinary Cascade movement must never become taste");
assert(report.games.find((row) => row.game === "media_mania").exits === 1, "Media Mania explicit exits must be counted without calling them abandonment");
assert(report.games.find((row) => row.game === "media_mania").sessionsCompleted === null && report.games.find((row) => row.game === "media_mania").completionRate === null, "Media Mania must not manufacture completion lifecycle metrics");
assert(report.games.find((row) => row.game === "the_last_bookshop").sessionsStarted === null && report.games.find((row) => row.game === "the_last_bookshop").sessionsCompleted === null, "Bookshop must not manufacture session lifecycle metrics");
assert(report.games.find((row) => row.game === "the_alchemists_cascade").sessionsStarted === null && report.games.find((row) => row.game === "the_alchemists_cascade").sessionsCompleted === null, "Cascade must expose level, not whole-game, lifecycle metrics");
assert(report.replays.some((row) => row.checkpoints.some((step) => step.label === "Choice later undone")), "replay must mark reversed choice");
assert(report.replays.some((row) => row.checkpoints.some((step) => step.label === "Undo checkpoint")), "replay must render Map undo checkpoint");
assert(report.replays.some((row) => row.checkpoints.some((step) => step.detail.includes("vector wonder:2"))), "Map replay must retain its semantic vector");
const bookshopReplay = report.replays.find((row) => row.game === "the_last_bookshop").checkpoints[0];
assert(bookshopReplay.label === "Visitor encounter resolved" && bookshopReplay.detail.includes("confidence"), "Bookshop encounter events must render complete replay checkpoints");
const isolated = analysis.buildPlaytestReport([event(), event({ id: "other", libraryId: "library-b" }), event({ id: "legacy", libraryId: null })], { ...analysis.DEFAULT_PLAYTEST_FILTERS, libraryIds: ["library-a"] });
assert(isolated.inventory.events === 1 && isolated.inventory.unscopedExcludedByLibraryFilter === 1, "library filters must exclude other and legacy libraries");
assert(analysis.parsePlaytestFilters({ games: "media_mania", startDate: "2026-09-01", endDate: "2026-09-02" }).games.length === 1, "valid filters must parse");
let invalid = false; try { analysis.parsePlaytestFilters({ games: "not-a-game" }); } catch { invalid = true; }
assert(invalid, "unknown games must be rejected");
assert(!fixtures.isGamePlaytestFixtureEnabled("cascade-catalyst-selection"), "fixtures must remain disabled without explicit environment flag");
const oldNodeEnv = process.env.NODE_ENV; const oldFixtureEnv = process.env.EXPO_PUBLIC_GAME_PLAYTEST_FIXTURES;
process.env.NODE_ENV = "production"; process.env.EXPO_PUBLIC_GAME_PLAYTEST_FIXTURES = "1";
assert(!fixtures.isGamePlaytestFixtureEnabled("cascade-catalyst-selection"), "production must reject developer fixtures even with the public fixture flag");
process.env.NODE_ENV = "development";
assert(fixtures.isGamePlaytestFixtureEnabled("cascade-catalyst-selection"), "development fixtures must require and accept the public fixture flag");
process.env.NODE_ENV = oldNodeEnv; process.env.EXPO_PUBLIC_GAME_PLAYTEST_FIXTURES = oldFixtureEnv;
assert(api.includes("hasValidOwnerAnalyticsSession") && api.includes("owner_session_required"), "report API must enforce owner auth");
assert(repository.includes("recommendation-games/the-unwritten-map/v1/") && repository.includes("recommendation-games/the-unwritten-map/v2/"), "reader must tolerate Map schema generations");
const malformedMap = repositoryModule.normalizeGamePlaytestEvent("the_unwritten_map", { eventId: "legacy-map", gameSessionId: "", anonymousPlayerId: "map-player", occurredAt: "not-a-date", schemaVersion: "unwritten_map_choice_event_v1" });
assert(malformedMap === null, "malformed records must not create empty-session collisions");
const efficiency = analysis.buildPlaytestReport([
  event({ id: "visit-one-start", type: "session_started", sessionId: "two-visits", occurredAt: "2026-09-01T00:00:00.000Z" }),
  event({ id: "visit-one-choice", sessionId: "two-visits", occurredAt: "2026-09-01T00:01:00.000Z" }),
  event({ id: "visit-one-exit", type: "session_exited", sessionId: "two-visits", occurredAt: "2026-09-01T00:02:00.000Z" }),
  event({ id: "visit-two-continue", type: "session_continued", sessionId: "two-visits", occurredAt: "2026-09-01T08:00:00.000Z" }),
  event({ id: "visit-two-choice", sessionId: "two-visits", occurredAt: "2026-09-01T08:01:00.000Z" }),
  event({ id: "visit-two-exit", type: "session_exited", sessionId: "two-visits", occurredAt: "2026-09-01T08:03:00.000Z" }),
], analysis.DEFAULT_PLAYTEST_FILTERS);
assert(efficiency.evidenceClasses.find((row) => row.kind === "direct_item_affinity").usableSignalsPerMinute === 0.4, "two visits on one persistent session must sum only the 2- and 3-minute closed active intervals, not the hours between them");
const undoneSkip = analysis.buildPlaytestReport([
  event({ id: "skip-a", game: "the_unwritten_map", sessionId: "skip-map", type: "encounter_skipped", payload: { scenarioId: "lantern-fair" } }),
  event({ id: "undo-skip-a", game: "the_unwritten_map", sessionId: "skip-map", type: "choice_undone", occurredAt: "2026-09-01T10:01:00.000Z", payload: { originalEvidence: { eventId: "skip-a" }, originalOutcomeKind: "skip" } }),
], analysis.DEFAULT_PLAYTEST_FILTERS);
assert(undoneSkip.games.find((row) => row.game === "the_unwritten_map").details.skips === 0, "Map undo must reverse skipped completion counts too");
const zeroLifecycle = analysis.buildPlaytestReport([], analysis.DEFAULT_PLAYTEST_FILTERS).games.find((row) => row.game === "media_mania");
assert(zeroLifecycle.sessionsStarted === 0 && zeroLifecycle.sessionsCompleted === null, "Media Mania may report started sessions but must leave unavailable completion metrics null");
assert(dashboard.includes("Evidence efficiency — class-specific") && !dashboard.includes("Librarian Review"), "dashboard must separate playtest evidence");
assert(captureScript.includes("--dump-dom") && captureScript.includes("fixtureSentinel") && captureScript.includes("Refusing to capture a non-fixture page"), "the screenshot script must verify each exact fixture DOM sentinel before capture");
assert((captureScript.match(/EXPO_PUBLIC_GAME_PLAYTEST_FIXTURES/g) || []).length >= 2, "the screenshot server and browser must receive the public Expo fixture flag");

const undoOutsideDateRange = analysis.buildPlaytestReport([
  event({ id: "filtered-choice", sessionId: "lineage-session", libraryId: "library-a", occurredAt: "2026-09-02T10:00:00.000Z" }),
  event({ id: "later-undo", type: "round_choice_undone", sessionId: "lineage-session", libraryId: "library-a", occurredAt: "2026-09-03T10:00:00.000Z", payload: { reversedEventId: "filtered-choice" } }),
], { ...analysis.DEFAULT_PLAYTEST_FILTERS, startDate: "2026-09-02", endDate: "2026-09-02" });
assert(undoOutsideDateRange.evidenceClasses.find((row) => row.kind === "direct_item_affinity").count === 0, "an in-range choice undone outside the date filter must remain inactive");
const libraryScopedUndo = analysis.buildPlaytestReport([
  event({ id: "same-id", sessionId: "shared-session", libraryId: "library-a" }),
  event({ id: "undo-other-library", type: "round_choice_undone", sessionId: "shared-session", libraryId: "library-b", occurredAt: "2026-09-01T10:01:00.000Z", payload: { reversedEventId: "same-id" } }),
], analysis.DEFAULT_PLAYTEST_FILTERS);
assert(libraryScopedUndo.evidenceClasses.find((row) => row.kind === "direct_item_affinity").count === 1, "an undo must not reverse a same-id event from another library lineage");

// --- Focused metric-completeness regressions (task B) -------------------------------------------

// Media Mania: cross-media rate must count distinct completed rounds, not every event; unknown vs
// replacement must stay distinct; unlock acceptance, undo, score progression, and the top unknown
// candidate/source combination must all be derived from the real schema fields.
const mediaMania = analysis.buildPlaytestReport([
  event({ id: "mm1p", sessionId: "mm-metrics", type: "round_presented", occurredAt: "2026-09-01T09:59:59.000Z", payload: { roundId: "r1", isCrossMedia: true } }),
  event({ id: "mm1", sessionId: "mm-metrics", occurredAt: "2026-09-01T10:00:00.000Z", payload: { roundId: "r1", roundNumber: 1, roundType: "LIKE", isCrossMedia: true, tasteScoreAfter: 10 } }),
  event({ id: "mm2", sessionId: "mm-metrics", occurredAt: "2026-09-01T10:01:00.000Z", payload: { roundId: "r2", roundNumber: 2, roundType: "DISLIKE", isCrossMedia: false, tasteScoreAfter: 22 } }),
  event({ id: "mm3", sessionId: "mm-metrics", type: "candidate_marked_unknown", occurredAt: "2026-09-01T10:02:00.000Z", payload: { replacedCandidateId: "cand-1", candidates: [{ id: "cand-1", title: "Old Show", source: "src-1", mediaSource: "anime" }], replacementItem: { id: "cand-2", title: "New Show" } } }),
  event({ id: "mm4", sessionId: "mm-metrics", type: "basis_marked_unknown", occurredAt: "2026-09-01T10:03:00.000Z", payload: { replacementRound: { basisItems: [{ title: "New Basis" }] } } }),
  event({ id: "mm5", sessionId: "mm-metrics", type: "source_unlock_offered", occurredAt: "2026-09-01T10:04:00.000Z", payload: { offeredMediaSources: ["manga", "comics"] } }),
  event({ id: "mm6", sessionId: "mm-metrics", type: "source_unlock_selected", occurredAt: "2026-09-01T10:05:00.000Z", payload: { offeredMediaSources: ["manga", "comics"], selectedMediaSource: "manga" } }),
  event({ id: "mm7", sessionId: "mm-metrics", occurredAt: "2026-09-01T10:06:00.000Z", payload: { roundId: "r3", roundNumber: 3, roundType: "LIKE", tasteScoreAfter: 5 } }),
  event({ id: "mm8", sessionId: "mm-metrics", type: "round_choice_undone", occurredAt: "2026-09-01T10:07:00.000Z", payload: { reversedEventId: "mm7" } }),
], analysis.DEFAULT_PLAYTEST_FILTERS).games.find((row) => row.game === "media_mania");
assert(mediaMania.details.crossMediaRounds === 1, "cross-media rate must count distinct completed rounds, not the presented+completed pair");
assert(mediaMania.details.crossMediaRoundRate === 50, "cross-media round rate must be a percentage of completed rounds");
assert(mediaMania.details.unknownItemCount === 1 && mediaMania.details.replacementCount === 1, "unknown-item and basis-replacement must stay distinct counts");
assert(mediaMania.details.unlockAcceptanceRate === 100, "unlock acceptance rate must reflect offered/accepted/declined events");
assert(mediaMania.details.undo === 1 && mediaMania.details.undoRate != null, "undo rate must be derived");
assert(mediaMania.details.scoreProgressionMin === 10 && mediaMania.details.scoreProgressionMax === 22, "reversed rounds must not pollute score progression");
assert(mediaMania.details.topUnknownCandidateSource === "cand-1 (anime) ×1", "top unknown candidate/source combination must be named");
assert(mediaMania.details.immediatelyReversed === 1, "an undo immediately following its round must be counted as an immediate reversal");
assert(mediaMania.details.retriesOrFailures === "Unavailable: Media Mania has no retry or failure events.", "Media Mania must not fabricate a retry/failure metric");

// Bookshop: confidence-bucketed prediction accuracy, Pitch Charm distribution, slate diversity, and
// renown progression must all be derived; shelf-vs-counter split must be an explicit gap.
const bookshopEvent = (overrides) => event({ game: "the_last_bookshop", type: "encounter_completed", libraryId: "library-a", payload: {}, ...overrides });
const bookshop = analysis.buildPlaytestReport([
  bookshopEvent({ id: "b1", sessionId: "book-1", payload: { confidence: "low", selectedOrder: ["a", "b", "c"], reasonTags: ["mood"], gameContext: { night: 1 }, outcome: { predictionCorrect: true, boundaryViolations: [], selectionDiversity: 2, reputationEarned: 3 } } }),
  bookshopEvent({ id: "b2", sessionId: "book-2", payload: { confidence: "low", selectedOrder: ["a", "b", "c"], reasonTags: ["mood"], gameContext: { night: 2 }, outcome: { predictionCorrect: false, boundaryViolations: ["age-cap"], selectionDiversity: 1, reputationEarned: 0 } } }),
  bookshopEvent({ id: "b3", sessionId: "book-3", payload: { confidence: "high", selectedOrder: ["x", "y", "z"], reasonTags: ["world"], gameContext: { night: 3 }, outcome: { predictionCorrect: true, boundaryViolations: [], selectionDiversity: 3, reputationEarned: 2 } } }),
], analysis.DEFAULT_PLAYTEST_FILTERS).games.find((row) => row.game === "the_last_bookshop");
assert(bookshop.details.predictionAccuracyConfidence_low === 50, "confidence-bucketed prediction accuracy must be computed per bucket");
assert(bookshop.details.predictionAccuracyConfidence_high === 100, "high-confidence bucket must be computed separately");
assert(typeof bookshop.details.predictionAccuracyConfidence_medium === "string" && bookshop.details.predictionAccuracyConfidence_medium.startsWith("Unavailable"), "an empty confidence bucket must be an explicit gap, not a fabricated rate");
assert(bookshop.details.pitchCharmDistribution === "mood:2, world:1", "Pitch Charm must be a distribution, not just a usage count");
assert(bookshop.details.boundaryViolationRate != null && bookshop.details.boundaryViolationCount === 1, "boundary violation count and rate must both be derived");
assert(bookshop.details.diverseSlateRate != null && bookshop.details.repeatedSlateRate != null, "repeated vs diverse slate rates must both be derived");
assert(bookshop.details.renownEarnedTotal === 5 && bookshop.details.renownProgressionMedian === 2, "renown progression must be derived from reputationEarned");
assert(bookshop.details.progressionDepth === 3, "Bookshop progression depth must track the furthest night reached");
assert(bookshop.details.shelfVsCounterSplit.startsWith("Unavailable"), "shelf-vs-counter split must be an explicit gap because no separate lifecycle events exist");
assert(bookshop.details.abandonmentByNightOrEncounter.startsWith("Unavailable"), "Bookshop abandonment-by-night must be an explicit gap");
assert(bookshop.details.immediatelyReversed === "Unavailable: Bookshop has no undo events.", "Bookshop must not fabricate an immediate-reversal count");
const bookshopTiming = analysis.buildPlaytestReport([
  bookshopEvent({ id: "bookshop-timing", sessionId: "bookshop-timing", payload: { responseTimeMs: 2_000 } }),
], analysis.DEFAULT_PLAYTEST_FILTERS);
assert(bookshopTiming.evidenceClasses.find((row) => row.kind === "recommendation_reasoning").usableSignalsPerMinute === 30, "Bookshop signal efficiency must use its responseTimeMs decision duration");

// The Unwritten Map: skip/undo rates, region distribution, signed axis distribution, and
// latency-category distribution must all exclude reversed choices/skips, and abandonment must
// attribute to a region when no scenario context is present.
const map = analysis.buildPlaytestReport([
  event({ id: "u1", game: "the_unwritten_map", sessionId: "map-metrics", libraryId: "library-a", type: "encounter_presented", occurredAt: "2026-09-01T11:00:00.000Z", payload: { scenarioId: "lantern-fair", explorationContext: { regionId: "sunmeadow" } } }),
  event({ id: "u2", game: "the_unwritten_map", sessionId: "map-metrics", libraryId: "library-a", type: "encounter_presented", occurredAt: "2026-09-01T11:00:30.000Z", payload: { scenarioId: "lantern-fair", explorationContext: { regionId: "sunmeadow" } } }),
  event({ id: "u3", game: "the_unwritten_map", sessionId: "map-metrics", libraryId: "library-a", type: "choice_made", occurredAt: "2026-09-01T11:01:00.000Z", payload: { scenarioId: "lantern-fair", chosenOption: { tasteVector: { intensity: 1, novelty: 2 } }, latencyCategory: "quick", explorationContext: { regionId: "sunmeadow", discoveredCount: 1 } } }),
  event({ id: "u4", game: "the_unwritten_map", sessionId: "map-metrics", libraryId: "library-a", type: "encounter_skipped", occurredAt: "2026-09-01T11:02:00.000Z", payload: { scenarioId: "whisper-orchard", latencyCategory: "instant", explorationContext: { regionId: "sunmeadow", discoveredCount: 1 } } }),
  event({ id: "u5", game: "the_unwritten_map", sessionId: "map-metrics", libraryId: "library-a", type: "choice_made", occurredAt: "2026-09-01T11:03:00.000Z", payload: { scenarioId: "clockwork-bridge", chosenOption: { tasteVector: { intensity: -1 } }, latencyCategory: "considered", explorationContext: { regionId: "ironwood", discoveredCount: 2 } } }),
  event({ id: "u6", game: "the_unwritten_map", sessionId: "map-metrics", libraryId: "library-a", type: "choice_undone", occurredAt: "2026-09-01T11:03:30.000Z", payload: { scenarioId: "clockwork-bridge", originalEvidence: { eventId: "u5" }, originalOutcomeKind: "choice", explorationContext: { regionId: "ironwood", discoveredCount: 2 } } }),
  event({ id: "u7", game: "the_unwritten_map", sessionId: "map-metrics", libraryId: "library-a", type: "session_exited", occurredAt: "2026-09-01T11:04:00.000Z", payload: { explorationContext: { regionId: "ironwood", discoveredCount: 2 } } }),
], analysis.DEFAULT_PLAYTEST_FILTERS).games.find((row) => row.game === "the_unwritten_map");
assert(map.details.completed === 1 && map.details.skips === 1 && map.details.undo === 1, "Map completion/skip/undo counts must exclude reversed choices");
assert(map.details.skipRate != null && map.details.undoRate != null, "Map skip and undo rates must be derived");
assert(map.details.revisits === 1 && map.details.revisitRate === 50, "Map revisit rate must be derived from repeated presentations");
assert(map.details.regionDistribution === "sunmeadow:1", "Map region distribution must exclude the reversed choice's region");
assert(map.details.axisSignedDistribution === "intensity:+1, novelty:+2", "Map signed axis distribution must reflect the surviving choice's taste vector");
assert(map.details.latencyCategoryDistribution.includes("quick:1") && map.details.latencyCategoryDistribution.includes("instant:1"), "Map latency-category distribution must be derived");
assert(map.details.immediatelyReversed === 1, "an undo immediately following its choice must be counted as an immediate reversal");
assert(map.exitPoint === "ironwood (1)", "Map exits must attribute to a region when no scenario context is present on the exit event");

// The Alchemist's Cascade: level attempt rates, catalyst rates, mechanical eligibility, stars and
// cascade activity distributions, and incomplete-level abandonment must all be derived; ordinary
// gameplay must stay excluded from preference evidence.
const cascade = analysis.buildPlaytestReport([
  event({ id: "c1", game: "the_alchemists_cascade", sessionId: "cascade-metrics", libraryId: "library-a", type: "level_started", occurredAt: "2026-09-01T12:00:00.000Z", payload: { levelId: "level-1" } }),
  event({ id: "c2", game: "the_alchemists_cascade", sessionId: "cascade-metrics", libraryId: "library-a", type: "catalyst_presented", occurredAt: "2026-09-01T12:00:10.000Z", payload: { levelId: "level-1", realmId: "copper-garden", eligibility: { eligible: true } } }),
  event({ id: "c3", game: "the_alchemists_cascade", sessionId: "cascade-metrics", libraryId: "library-a", type: "catalyst_selected", occurredAt: "2026-09-01T12:00:20.000Z", payload: { levelId: "level-1", realmId: "copper-garden", eligibility: { eligible: true }, preferenceInference: "eligible_balanced_semantic_choice", selectedOption: { tasteVector: { intensity: 2, novelty: -1 } } } }),
  event({ id: "c4", game: "the_alchemists_cascade", sessionId: "cascade-metrics", libraryId: "library-a", type: "move_applied", occurredAt: "2026-09-01T12:01:00.000Z", payload: { levelId: "level-1", cascadeSteps: [{}, {}, {}], preferenceInference: "none_from_gameplay" } }),
  event({ id: "c5", game: "the_alchemists_cascade", sessionId: "cascade-metrics", libraryId: "library-a", type: "cascade_resolved", occurredAt: "2026-09-01T12:01:30.000Z", payload: { levelId: "level-1", cascadeSteps: [{}, {}, {}, {}, {}], preferenceInference: "none_from_gameplay" } }),
  event({ id: "c6", game: "the_alchemists_cascade", sessionId: "cascade-metrics", libraryId: "library-a", type: "level_completed", occurredAt: "2026-09-01T12:02:00.000Z", payload: { levelId: "level-1", stars: 3, movesRemaining: 10 } }),
  event({ id: "c7", game: "the_alchemists_cascade", sessionId: "cascade-metrics", libraryId: "library-a", type: "level_started", occurredAt: "2026-09-01T12:03:00.000Z", payload: { levelId: "level-2" } }),
  event({ id: "c8", game: "the_alchemists_cascade", sessionId: "cascade-metrics", libraryId: "library-a", type: "catalyst_presented", occurredAt: "2026-09-01T12:03:10.000Z", payload: { levelId: "level-2", realmId: "copper-garden", eligibility: { eligible: false } } }),
  event({ id: "c9", game: "the_alchemists_cascade", sessionId: "cascade-metrics", libraryId: "library-a", type: "catalyst_skipped", occurredAt: "2026-09-01T12:03:20.000Z", payload: { levelId: "level-2", realmId: "copper-garden", eligibility: { eligible: false }, preferenceInference: "none_neutral_skip" } }),
  event({ id: "c10", game: "the_alchemists_cascade", sessionId: "cascade-metrics", libraryId: "library-a", type: "dead_board_reshuffled", occurredAt: "2026-09-01T12:03:30.000Z", payload: { levelId: "level-2" } }),
  event({ id: "c11", game: "the_alchemists_cascade", sessionId: "cascade-metrics", libraryId: "library-a", type: "level_retried", occurredAt: "2026-09-01T12:04:00.000Z", payload: { levelId: "level-1", previousAttempt: 1, attempt: 2 } }),
], analysis.DEFAULT_PLAYTEST_FILTERS).games.find((row) => row.game === "the_alchemists_cascade");
assert(cascade.details.levelAttemptCompletionRate === 33.3 && cascade.details.levelAttemptFailureRate === 0, "level completion/failure rates must use all starts and retries as actual attempts");
assert(cascade.details.levelRetryRate === 33.3, "level retry rate must use actual attempts as its denominator");
assert(cascade.details.cascadeActivityRate === 100, "cascade activity rate must be derived from moves that triggered a cascade");
assert(cascade.details.meanCascadeDepth === 4, "mean cascade depth must average recorded cascade step lengths");
assert(cascade.details.deadBoardReshuffles === 1, "dead-board reshuffles must be counted");
assert(cascade.details.movesUsedPerCompletedLevelMedian === 14, "moves used per completed attempt must be derived from the level's move budget");
assert(cascade.details.starsDistribution === "3:1", "stars distribution must be derived, not just a raw count");
assert(cascade.details.catalystSelectRate === 50 && cascade.details.catalystSkipRate === 50, "catalyst presented/selected/skipped rates must be derived");
assert(cascade.details.mechanicallyEligibleCatalysts === 1, "mechanically eligible catalyst presentations must be counted regardless of what was selected");
assert(cascade.details.semanticAxisSignedDistribution === "intensity:+2, novelty:-1", "Cascade semantic-axis signed distribution must reflect only eligible, selected catalysts");
assert(cascade.details.progressionDepth === 2, "Cascade progression depth must track the furthest level number reached");
assert(cascade.details.incompleteLevelAttempts === 2, "a retry must be its own incomplete attempt even when its earlier attempt resolved");
assert(cascade.details.retriesOrFailures === "1 retries / 0 failures", "Cascade retries/failures must be reported together");
assert(cascade.usableSignals === 1, "ordinary Cascade gameplay must stay neutral even alongside a mechanically eligible catalyst");
const cascadeRetries = analysis.buildPlaytestReport([
  event({ id: "attempt-one", game: "the_alchemists_cascade", sessionId: "retry-session", type: "level_started", occurredAt: "2026-09-01T15:00:00.000Z", payload: { levelId: "level-1", attempt: 1 } }),
  event({ id: "attempt-one-failed", game: "the_alchemists_cascade", sessionId: "retry-session", type: "level_failed", occurredAt: "2026-09-01T15:01:00.000Z", payload: { levelId: "level-1" } }),
  event({ id: "attempt-two", game: "the_alchemists_cascade", sessionId: "retry-session", type: "level_retried", occurredAt: "2026-09-01T15:02:00.000Z", payload: { levelId: "level-1", attempt: 2 } }),
  event({ id: "attempt-two-failed", game: "the_alchemists_cascade", sessionId: "retry-session", type: "level_failed", occurredAt: "2026-09-01T15:03:00.000Z", payload: { levelId: "level-1" } }),
  event({ id: "attempt-three", game: "the_alchemists_cascade", sessionId: "retry-session", type: "level_retried", occurredAt: "2026-09-01T15:04:00.000Z", payload: { levelId: "level-1", attempt: 3 } }),
], analysis.DEFAULT_PLAYTEST_FILTERS).games.find((row) => row.game === "the_alchemists_cascade");
assert(cascadeRetries.details.levelAttempts === 3 && cascadeRetries.details.levelsFailed === 2 && cascadeRetries.details.levelAttemptFailureRate === 66.7, "Cascade must count start plus each retry as a distinct paired attempt with rates bounded by actual attempts");
assert(cascadeRetries.details.incompleteLevelAttempts === 1 && cascadeRetries.details.abandonmentByLevelOrRealm === "level-1 (copper-garden) ×1", "a final active retry must remain visible after prior attempts resolved");

// Replay accuracy (task C): unknown checkpoints must name both items, unlock checkpoints must show
// options/selected/declined, and Bookshop checkpoints must expose the real six-book shelf.
const replayEvents = [
  event({ id: "r-unknown", type: "candidate_marked_unknown", sessionId: "replay-mm", occurredAt: "2026-09-01T13:00:00.000Z", payload: { replacedCandidateId: "cand-1", familiarityActions: [{ item: { title: "Old Show" }, familiarity: "unknown" }], replacementItem: { id: "cand-2", title: "New Show" } } }),
  event({ id: "r-unlock", type: "source_unlock_selected", sessionId: "replay-mm", occurredAt: "2026-09-01T13:01:00.000Z", payload: { offeredMediaSources: ["manga", "comics"], selectedMediaSource: "manga" } }),
];
const replayCheckpoints = analysis.buildReplay(replayEvents);
const unknownCheckpoint = replayCheckpoints.find((step) => step.label === "Unknown replacement");
assert(unknownCheckpoint.detail.includes("Old Show") && unknownCheckpoint.detail.includes("New Show"), "unknown checkpoint must name both the replaced item and the replacement item");
const unlockCheckpoint = replayCheckpoints.find((step) => step.label === "Source unlock");
assert(unlockCheckpoint.options.includes("manga") && unlockCheckpoint.options.includes("comics") && unlockCheckpoint.choice === "manga", "unlock checkpoint must show the offered options and the selected source");
const bookshopReplayFull = analysis.buildReplay([
  bookshopEvent({ id: "r-shelf", sessionId: "replay-book", occurredAt: "2026-09-01T13:02:00.000Z", payload: { presentedCandidateIds: ["s1", "s2", "s3", "s4", "s5", "s6"], selectedOrder: ["s2", "s4", "s6"], predictedCustomerChoiceId: "s2", simulatedCustomerChoiceId: "s2", confidence: "high", reasonTags: ["mood"], outcome: { predictionCorrect: true } } }),
])[0];
assert(bookshopReplayFull.options.length === 6 && bookshopReplayFull.options.every((id) => id.startsWith("s")), "Bookshop checkpoint must expose the real six-book presentedCandidateIds");
assert(bookshopReplayFull.choice === "s2 → s4 → s6", "Bookshop checkpoint must expose the selected order");
const longReplay = analysis.buildPlaytestReport(Array.from({ length: 81 }, (_value, index) => event({
  id: `long-replay-${index}`, sessionId: "long-replay", occurredAt: new Date(Date.UTC(2026, 8, 1, 16, index)).toISOString(),
})), analysis.DEFAULT_PLAYTEST_FILTERS).replays.find((row) => row.session === analysis.pseudonym("long-replay"));
assert(longReplay.totalCheckpointCount === 81 && longReplay.checkpoints.length === 80 && longReplay.truncated === true, "bounded replays must disclose their complete checkpoint count and truncation");

// Collision-resistant pseudonym (task A): must be at least 64 bits (three base-36 groups) and must
// not use the previous 32-bit hash, so casual session collisions are effectively impossible.
assert(/^s-[0-9a-z]{21}$/.test(analysis.pseudonym("some-session-id")), "pseudonym must be a 64-bit+ deterministic representation");
assert(analysis.pseudonym("session-a") !== analysis.pseudonym("session-b"), "distinct sessions must not collide");
assert(analysis.pseudonym("session-a") === analysis.pseudonym("session-a"), "pseudonym must be deterministic");

// Filter validation and normalization (task A): unknown age bands must be rejected, and library ids
// and games must be capped and normalized (deduped, case-insensitive) rather than passed through raw.
let invalidAgeBand = false;
try { analysis.parsePlaytestFilters({ ageBands: "not-a-real-age-band" }); } catch { invalidAgeBand = true; }
assert(invalidAgeBand, "unsupported age bands must be rejected against Media Mania's supported bands");
assert(analysis.parsePlaytestFilters({ ageBands: "kids,teens" }).ageBands.length === 2, "valid age bands must parse");
assert(analysis.parsePlaytestFilters({ libraryIds: "Library-A,library-a" }).libraryIds.length === 1, "library ids must be normalized (case-insensitive dedupe)");
const manyLibraries = Array.from({ length: 40 }, (_value, index) => `library-${index}`).join(",");
assert(analysis.parsePlaytestFilters({ libraryIds: manyLibraries }).libraryIds.length <= 25, "library id filters must be capped");
assert(analysis.parsePlaytestFilters({ games: "media_mania,media_mania" }).games.length === 1, "duplicate game filters must be deduplicated");

// Repository hardening (task A): a single malformed or undecryptable Media Mania record must not
// fail the whole read, and hitting the per-game cap must be reported as truncated.
class FakeMediaManiaStore {
  async read(pathname) { return pathname === "p0" ? null : { bogus: true }; }
  async put() {}
  async list(_prefix, maxRecords) { return Array.from({ length: Math.min(5, maxRecords) }, (_value, index) => `p${index}`); }
}
const boundedRead = await evidenceStorage.listMediaManiaEvidenceForAnalysis(3, new FakeMediaManiaStore());
assert(boundedRead.events.length === 0 && boundedRead.malformedRecords === 3, "malformed or unreadable records must be counted, not thrown");
assert(boundedRead.truncated === true, "hitting the per-game cap must be reported as truncated");
const unboundedRead = await evidenceStorage.listMediaManiaEvidenceForAnalysis(10, new FakeMediaManiaStore());
assert(unboundedRead.truncated === false, "reads that do not hit the cap must not be reported as truncated");
assert(repository.includes("truncated"), "the repository must propagate a truncation signal alongside malformed-record counts");
assert(api.includes("storageTruncated"), "the report API must surface truncated reads, not imply complete coverage");
assert(dashboard.includes("storageTruncated") && dashboard.includes("this may not be complete coverage"), "the dashboard must surface truncated-read warnings, not imply complete coverage");
assert(dashboard.includes("Back to session list") && dashboard.includes("View replay"), "the dashboard must show concise session rows with links, and a way back from a single session's in-depth replay");
assert(!/:\s*any\b/.test(dashboard) && !/as any/.test(dashboard), "the dashboard must not fall back to `any`");

// Screenshot workflow honesty (task E): the fixtures route must not claim to be a real gameplay
// mount, must be explicitly documented as illustrative, and must reuse real production content
// rather than fabricated placeholder titles.
const fixturesRoute = readFileSync(resolve(root, "app/admin/game-playtest-fixtures.tsx"), "utf8");
const gamePlaytestDocs = readFileSync(resolve(root, "docs/game-playtest.md"), "utf8");
assert(fixturesRoute.includes("not frame-exact mounts of the real game routes"), "the fixtures route must explicitly document that it is not a real gameplay mount");
assert(fixturesRoute.includes("MEDIA_MANIA_CATALOG") && !fixturesRoute.includes("Spirited Away") && !fixturesRoute.includes("Cinder Chorus"), "the fixtures route must use real catalog/catalyst content, not fabricated placeholder titles");
assert(fixturesRoute.includes("game-playtest-fixture:${state}") && fixturesRoute.includes("testID={sentinel}") && fixturesRoute.includes("accessibilityLabel={sentinel}"), "each fixture root must expose its exact state sentinel in the DOM");
assert(gamePlaytestDocs.includes("not frame-exact recordings"), "the docs must disclose that captures are illustrative fixtures, not real gameplay recordings");

console.log("game_playtest_regressions: ok");
