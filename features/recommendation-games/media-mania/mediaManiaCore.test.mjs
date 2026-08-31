import assert from "node:assert/strict";
import test from "node:test";
import {
  MEDIA_MANIA_EVENT_SCHEMA_VERSION,
  MEDIA_MANIA_AGE_BANDS,
  MEDIA_MANIA_SOURCES,
  MEDIA_MANIA_UNLOCK_SCORE,
  changeMediaManiaAgeBand,
  chooseMediaManiaCandidate,
  createMediaManiaState,
  eligibleMediaManiaCatalog,
  markMediaManiaBasisUnknown,
  markMediaManiaCandidateUnknown,
  resolveMediaManiaUnlock,
  restoreMediaManiaState,
  serializeMediaManiaEvent,
  startMediaMania,
  undoLastMediaManiaChoice,
} from "./mediaManiaCore.mjs";

const random = () => 0;
const catalog = MEDIA_MANIA_SOURCES.flatMap((mediaSource) =>
  Array.from({ length: 14 }, (_, index) => ({
    id: `${mediaSource}-${index}`,
    source: `fixture:${mediaSource}`,
    mediaSource,
    title: `${mediaSource} ${index}`,
    creator: `creator ${index}`,
    ageBands: [...MEDIA_MANIA_AGE_BANDS],
    traitKeys: [`tone:${index % 3}`, `pace:${index % 2}`],
  })),
);

function fresh() {
  return createMediaManiaState({ playerId: "player-1", sessionId: "session-1", nowMs: 1_000 });
}

function start(source = "movies") {
  return startMediaMania(fresh(), source, catalog, { random, nowMs: 2_000 }).state;
}

function chooseFirst(state, nowMs) {
  return chooseMediaManiaCandidate(state, state.currentRound.candidates[0].id, catalog, { random, nowMs });
}

test("all seven sources can start a clean single-source game", () => {
  for (const source of MEDIA_MANIA_SOURCES) {
    const result = startMediaMania(fresh(), source, catalog, { random, nowMs: 2_000 });
    assert.deepEqual(result.state.activeSources, [source]);
    assert.equal(result.state.currentRound.candidates.length, 3);
    assert.ok(result.state.currentRound.candidates.every((item) => item.mediaSource === source));
    assert.equal(result.events[0].action, "starting_source_selected");
  }
});

test("all four age bands start with age-eligible candidates across all seven sources", () => {
  for (const ageBand of MEDIA_MANIA_AGE_BANDS) {
    for (const source of MEDIA_MANIA_SOURCES) {
      const state = createMediaManiaState({ playerId: "player-1", sessionId: `${ageBand}-${source}`, ageBand, nowMs: 1_000 });
      const result = startMediaMania(state, source, catalog, { random, nowMs: 2_000 });
      assert.equal(result.state.ageBand, ageBand);
      assert.equal(result.state.currentRound.ageBand, ageBand);
      assert.ok(result.state.currentRound.candidates.every((item) => item.ageBands.includes(ageBand)));
      assert.equal(result.events[0].activeAgeBand, ageBand);
    }
  }
});

test("kids rounds exclude adult-only titles before cross-media selection", () => {
  const mixedCatalog = [
    ...catalog.map((item) => ({ ...item, ageBands: ["kids"] })),
    { id: "adult-expanse", source: "fixture:adult", mediaSource: "tv", title: "The Expanse", creator: "Prime Video", ageBands: ["adults"], traitKeys: ["epic"] },
  ];
  const state = createMediaManiaState({ playerId: "player-1", sessionId: "kids-session", ageBand: "kids", nowMs: 1_000 });
  const result = startMediaMania(state, "tv", mixedCatalog, { random, nowMs: 2_000 });
  const shown = [...result.state.currentRound.basisItems, ...result.state.currentRound.candidates];
  assert.ok(shown.every((item) => item.ageBands.includes("kids")));
  assert.ok(!shown.some((item) => item.title === "The Expanse"));
  assert.ok(!eligibleMediaManiaCatalog(mixedCatalog, "kids").some((item) => item.id === "adult-expanse"));
});

test("LIKE and DISLIKE evidence accumulate separately", () => {
  let state = start();
  for (let round = 1; round <= 3; round += 1) {
    assert.equal(state.currentRound.roundType, "LIKE");
    state = chooseFirst(state, 3_000 + round).state;
  }
  assert.equal(state.currentRound.roundType, "DISLIKE");
  const dislikedId = state.currentRound.candidates[0].id;
  const result = chooseFirst(state, 4_000);
  assert.equal(result.state.positiveItemIds.length, 3);
  assert.deepEqual(result.state.negativeItemIds, [dislikedId]);
  assert.ok(!result.state.positiveItemIds.includes(dislikedId));
  assert.equal(result.events[0].roundType, "DISLIKE");
});

test("unknown candidate is replaced without becoming dislike or earning score", () => {
  const state = start();
  const before = state.currentRound.candidates.map((item) => item.id);
  const unknownId = before[1];
  const result = markMediaManiaCandidateUnknown(state, unknownId, catalog, { random, nowMs: 2_500 });
  const after = result.state.currentRound.candidates.map((item) => item.id);
  assert.equal(after[0], before[0]);
  assert.notEqual(after[1], unknownId);
  assert.equal(after[2], before[2]);
  assert.deepEqual(result.state.negativeItemIds, []);
  assert.equal(result.state.tasteScore, 0);
  assert.equal(result.state.ageBand, "teens");
  assert.deepEqual(result.events[0].familiarityActions[0].familiarity, "unknown");
});

test("changing age band safely regenerates and clears cross-age game evidence", () => {
  let state = start();
  state = chooseFirst(state, 3_000).state;
  assert.ok(state.tasteScore > 0);
  const result = changeMediaManiaAgeBand(state, "kids", catalog, { random, nowMs: 4_000 });
  assert.equal(result.state.ageBand, "kids");
  assert.equal(result.state.tasteScore, 0);
  assert.deepEqual(result.state.positiveItemIds, []);
  assert.deepEqual(result.state.negativeItemIds, []);
  assert.equal(result.state.currentRound.roundNumber, 1);
  assert.ok(result.state.currentRound.candidates.every((item) => item.ageBands.includes("kids")));
  assert.equal(result.events[0].action, "age_band_changed");
  assert.equal(result.events[0].previousAgeBand, "teens");
  assert.equal(result.events[0].selectedAgeBand, "kids");
});

test("likes and dislikes never infer or change the active age band", () => {
  let state = createMediaManiaState({ playerId: "player-1", sessionId: "stable-age", ageBand: "preteens", nowMs: 1_000 });
  state = startMediaMania(state, "books", catalog, { random, nowMs: 2_000 }).state;
  for (let round = 0; round < 4; round += 1) state = chooseFirst(state, 3_000 + round).state;
  assert.equal(state.ageBand, "preteens");
  assert.equal(state.currentRound.ageBand, "preteens");
});

test("unknown basis regenerates the whole round without a taste signal", () => {
  const state = start();
  const oldRoundId = state.currentRound.id;
  const basisId = state.currentRound.basisItems[0].id;
  const result = markMediaManiaBasisUnknown(state, basisId, catalog, { random, nowMs: 2_600 });
  assert.notEqual(result.state.currentRound.id, oldRoundId);
  assert.notEqual(result.state.currentRound.basisItems[0].id, basisId);
  assert.deepEqual(result.state.positiveItemIds, []);
  assert.deepEqual(result.state.negativeItemIds, []);
  assert.equal(result.state.tasteScore, 0);
});

test("score unlock is optional and declining preserves single-source play", () => {
  let state = start();
  while (state.tasteScore < MEDIA_MANIA_UNLOCK_SCORE) state = chooseFirst(state, 5_000 + state.completedRoundCount).state;
  assert.equal(state.unlockStatus, "offered");
  assert.equal(state.unlockOptions.length, 3);
  const result = resolveMediaManiaUnlock(state, null, catalog, { random, nowMs: 6_000 });
  assert.equal(result.state.unlockStatus, "declined");
  assert.deepEqual(result.state.activeSources, ["movies"]);
  assert.ok(result.state.currentRound);
});

test("accepting a second source creates cross-media rounds", () => {
  let state = start();
  while (state.tasteScore < MEDIA_MANIA_UNLOCK_SCORE) state = chooseFirst(state, 7_000 + state.completedRoundCount).state;
  const secondSource = state.unlockOptions[0];
  const result = resolveMediaManiaUnlock(state, secondSource, catalog, { random, nowMs: 8_000 });
  assert.deepEqual(result.state.activeSources, ["movies", secondSource]);
  assert.equal(result.state.currentRound.isCrossMedia, true);
  assert.ok(new Set(result.state.currentRound.candidates.map((item) => item.mediaSource)).size > 1);
});

test("cross-media unlocks remain age-eligible in every band", () => {
  for (const ageBand of MEDIA_MANIA_AGE_BANDS) {
    let state = createMediaManiaState({ playerId: "player-1", sessionId: `cross-${ageBand}`, ageBand, nowMs: 1_000 });
    state = startMediaMania(state, "movies", catalog, { random, nowMs: 2_000 }).state;
    while (state.tasteScore < MEDIA_MANIA_UNLOCK_SCORE) state = chooseFirst(state, 5_000 + state.completedRoundCount).state;
    const result = resolveMediaManiaUnlock(state, state.unlockOptions[0], catalog, { random, nowMs: 8_000 });
    assert.equal(result.state.currentRound.isCrossMedia, true);
    assert.ok(result.state.currentRound.candidates.every((item) => item.ageBands.includes(ageBand)));
  }
});

test("undo restores the completed round and reverses its raw taste signal", () => {
  let state = start();
  for (let round = 1; round <= 3; round += 1) state = chooseFirst(state, 3_000 + round).state;
  assert.equal(state.currentRound.roundType, "DISLIKE");
  const before = JSON.parse(JSON.stringify(state));
  const completed = chooseFirst(state, 4_000);
  assert.equal(completed.state.negativeItemIds.length, 1);

  const undone = undoLastMediaManiaChoice(completed.state, { nowMs: 4_100 });
  assert.deepEqual(undone.state.positiveItemIds, before.positiveItemIds);
  assert.deepEqual(undone.state.negativeItemIds, before.negativeItemIds);
  assert.equal(undone.state.tasteScore, before.tasteScore);
  assert.equal(undone.state.completedRoundCount, before.completedRoundCount);
  assert.equal(undone.state.currentRound.roundType, "DISLIKE");
  assert.equal(undone.events[0].action, "round_choice_undone");
  assert.equal(undone.events[0].reversedEventId, completed.events[0].eventId);
  assert.equal(undone.events[0].scoreDelta, -completed.events[0].scoreDelta);
});
test("raw event serialization preserves reconstructable evidence", () => {
  const state = start();
  const result = chooseFirst(state, 3_250);
  const event = result.events[0];
  const parsed = JSON.parse(serializeMediaManiaEvent(event));
  assert.equal(parsed.schemaVersion, MEDIA_MANIA_EVENT_SCHEMA_VERSION);
  assert.equal(parsed.gameId, "media_mania");
  assert.equal(parsed.gameVersion, 1);
  assert.equal(parsed.activeAgeBand, "teens");
  assert.equal(parsed.responseTimeMs, 1_249);
  assert.equal(parsed.candidates.length, 3);
  assert.equal(parsed.presentationOrder.length, 3);
  assert.ok(parsed.selectedItem.id);
  assert.ok(parsed.visiblePositiveContext);
  assert.ok(parsed.visibleNegativeContext);
  assert.equal("similarityScore" in parsed, false);
});

test("versioned state restores while foreign schemas are rejected", () => {
  const state = start();
  assert.equal(restoreMediaManiaState(JSON.parse(JSON.stringify(state))).sessionId, state.sessionId);
  assert.equal(restoreMediaManiaState({ ...state, schemaVersion: "human_review_record_v1" }), null);
});

test("legacy Media Mania state restarts safely in Teens instead of preserving a mixed round", () => {
  const legacy = { ...start() };
  delete legacy.ageBand;
  const restored = restoreMediaManiaState(legacy);
  assert.equal(restored.ageBand, "teens");
  assert.equal(restored.startingSource, null);
  assert.equal(restored.currentRound, null);
  assert.deepEqual(restored.positiveItemIds, []);
});
