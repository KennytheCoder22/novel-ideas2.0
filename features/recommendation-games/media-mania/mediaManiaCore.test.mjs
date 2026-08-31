import assert from "node:assert/strict";
import test from "node:test";
import {
  MEDIA_MANIA_EVENT_SCHEMA_VERSION,
  MEDIA_MANIA_SOURCES,
  MEDIA_MANIA_UNLOCK_SCORE,
  chooseMediaManiaCandidate,
  createMediaManiaState,
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
  assert.deepEqual(result.events[0].familiarityActions[0].familiarity, "unknown");
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
