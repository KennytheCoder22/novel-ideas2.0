import assert from "node:assert/strict";
import test from "node:test";
import type { GameRecommendationRunResult } from "./gameRecommendationEngine";
import { processDurableGameRecommendationEvidence } from "./gameRecommendationEngine";
import {
  createInitialGameRecommendationIntegrationState,
  restoreGameRecommendationIntegrationState,
  type GameRecommendationIntegrationStateV1,
} from "./gameRecommendationIntegrationState";
import type { MilestoneEvaluation } from "./gameRecommendationMilestones";

function initialState() {
  return createInitialGameRecommendationIntegrationState({
    game: "media_mania",
    anonymousPlayerId: "runtime-reader",
    gameSessionId: "runtime-session",
  });
}

function milestone(evidenceCount: number): MilestoneEvaluation {
  return {
    eligible: true,
    game: "media_mania",
    milestoneId: "media_mania:runtime",
    milestoneIndex: 1,
    evidenceCount,
  };
}

function recommendation(): GameRecommendationRunResult {
  return {
    items: [{
      id: "openLibrary:/works/OL-RUNTIME",
      source: "openLibrary",
      sourceId: "/works/OL-RUNTIME",
      title: "The Durable Atlas",
      creators: ["A. Keeper"],
      formats: ["book"],
      raw: { cover_i: 6_123_456 },
      matchedSignals: ["adventure"],
    }],
  };
}

async function waitFor(condition: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (condition()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("condition_not_reached");
}

test("deferred generation persists evidence before navigation and persists the reward after scope change", async () => {
  let resolveRecommendation: (result: GameRecommendationRunResult) => void = () => {};
  const deferredRecommendation = new Promise<GameRecommendationRunResult>((resolve) => {
    resolveRecommendation = resolve;
  });
  const writes: string[] = [];
  let mountedScope = "scope-a";
  let renderedReward = false;

  const processing = processDurableGameRecommendationEvidence({
    state: initialState(),
    nativeEvidenceId: "round-6",
    signals: [{ id: "book-1", action: "like", source: "books", genres: ["adventure"] }],
    evaluateMilestone: () => milestone(1),
    evidenceMode: "cross_media",
    ageBand: "teens",
    enabledSources: { openLibrary: true },
    library: { libraryId: "default", localCollectionOnly: false },
    runRecommender: () => deferredRecommendation,
    persist: async (state) => {
      writes.push(JSON.stringify(state));
    },
    now: () => "2026-09-06T20:00:00.000Z",
  });

  await waitFor(() => writes.length === 1);
  const preGeneration = restoreGameRecommendationIntegrationState(writes[0], {
    game: "media_mania",
    anonymousPlayerId: "runtime-reader",
    gameSessionId: "runtime-session",
  });
  assert.deepEqual(preGeneration.dedupedNativeEvidenceIds, ["round-6"]);
  assert.equal(preGeneration.adaptedSignals.length, 1);
  assert.equal(preGeneration.pendingReward, null);

  mountedScope = "scope-b";
  resolveRecommendation(recommendation());
  const outcome = await processing;
  if (mountedScope === "scope-a" && outcome.status === "shown") renderedReward = true;

  assert.equal(renderedReward, false, "a stale scope must not receive a React reward update");
  assert.equal(writes.length, 2, "the completed generation must persist despite navigation");
  const remounted = restoreGameRecommendationIntegrationState(writes[1], {
    game: "media_mania",
    anonymousPlayerId: "runtime-reader",
    gameSessionId: "runtime-session",
  });
  assert.deepEqual(remounted.dedupedNativeEvidenceIds, ["round-6"]);
  assert.equal(remounted.pendingReward?.book.title, "The Durable Atlas");
});

test("a deferred generation failure preserves evidence and leaves the milestone retryable later", async () => {
  let rejectRecommendation: (error: Error) => void = () => {};
  const deferredRecommendation = new Promise<GameRecommendationRunResult>((_resolve, reject) => {
    rejectRecommendation = reject;
  });
  let durableState: GameRecommendationIntegrationStateV1 = initialState();

  const failed = processDurableGameRecommendationEvidence({
    state: durableState,
    nativeEvidenceId: "round-6",
    signals: [{ id: "book-1", action: "like", source: "books" }],
    evaluateMilestone: () => milestone(1),
    evidenceMode: "cross_media",
    ageBand: "teens",
    enabledSources: { openLibrary: true },
    library: { libraryId: "default", localCollectionOnly: false },
    runRecommender: () => deferredRecommendation,
    persist: async (state) => {
      durableState = JSON.parse(JSON.stringify(state));
    },
  });
  await waitFor(() => durableState.dedupedNativeEvidenceIds.includes("round-6"));
  rejectRecommendation(new Error("offline"));
  assert.equal((await failed).status, "error");
  assert.equal(durableState.lastFailedAttemptEvidenceCount, 1);
  assert.deepEqual(durableState.triggeredMilestoneIds, []);

  const retried = await processDurableGameRecommendationEvidence({
    state: restoreGameRecommendationIntegrationState(JSON.stringify(durableState), {
      game: "media_mania",
      anonymousPlayerId: "runtime-reader",
      gameSessionId: "runtime-session",
    }),
    nativeEvidenceId: "round-7",
    signals: [{ id: "book-2", action: "like", source: "movies" }],
    evaluateMilestone: () => milestone(2),
    evidenceMode: "cross_media",
    ageBand: "teens",
    enabledSources: { openLibrary: true },
    library: { libraryId: "default", localCollectionOnly: false },
    runRecommender: async () => recommendation(),
    persist: async (state) => {
      durableState = JSON.parse(JSON.stringify(state));
    },
  });
  assert.equal(retried.status, "shown");
  assert.deepEqual(durableState.triggeredMilestoneIds, ["media_mania:runtime"]);
});

test("generation does not start when the pre-generation durable write fails", async () => {
  let recommenderCalls = 0;
  await assert.rejects(() => processDurableGameRecommendationEvidence({
    state: initialState(),
    nativeEvidenceId: "round-storage-failure",
    signals: [{ id: "book-storage", action: "like", source: "books" }],
    evaluateMilestone: () => milestone(1),
    evidenceMode: "cross_media",
    ageBand: "teens",
    enabledSources: { openLibrary: true },
    library: { libraryId: "default", localCollectionOnly: false },
    runRecommender: async () => {
      recommenderCalls += 1;
      return recommendation();
    },
    persist: async () => {
      throw new Error("storage unavailable");
    },
  }), /storage unavailable/);
  assert.equal(recommenderCalls, 0);
});
