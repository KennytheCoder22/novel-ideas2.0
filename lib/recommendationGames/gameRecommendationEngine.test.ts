import assert from "node:assert/strict";
import test from "node:test";
import {
  attemptGameRecommendationMilestone,
  type GameRecommendationCandidateLike,
  type RunGameRecommender,
} from "./gameRecommendationEngine";
import {
  clearPendingReward,
  createInitialGameRecommendationIntegrationState,
  mergeNativeEvidence,
  recordFamiliarBook,
  restoreGameRecommendationIntegrationState,
} from "./gameRecommendationIntegrationState";
import {
  alchemistsCascadeMilestone,
  lastBookshopMilestone,
  mediaManiaMilestone,
  unwrittenMapMilestone,
} from "./gameRecommendationMilestones";
import { adaptMediaManiaEvidenceToSignals } from "./gameRecommendationEvidenceAdapters";
import {
  createGameRecommendationFeedbackEvent,
  withContinuedAt,
  type GameRecommendationEvidenceMode,
  type GameRecommendationResponse,
  type RecommendationGameId,
} from "./gameRecommendationFeedback";

const CANDIDATES: GameRecommendationCandidateLike[] = [
  { id: "googleBooks:1", source: "googleBooks", sourceId: "1", title: "Atlas of Small Stars", creators: ["E. Vesper"], coverUrl: "https://example.test/1.jpg", matchedSignals: ["cozy mystery"] },
  { id: "googleBooks:2", source: "googleBooks", sourceId: "2", title: "Neon Skyline", creators: ["R. Cole"], coverUrl: "https://example.test/2.jpg" },
  { id: "googleBooks:3", source: "googleBooks", sourceId: "3", title: "Third Candidate", creators: ["A. Author"], coverUrl: "https://example.test/3.jpg" },
];

function fixedRunner(items: GameRecommendationCandidateLike[]): RunGameRecommender {
  return async () => ({ items });
}

function initialState() {
  return createInitialGameRecommendationIntegrationState({
    game: "media_mania",
    anonymousPlayerId: "patron-abc",
    gameSessionId: "mm-session-1",
  });
}

test("a full deterministic flow: play -> milestone -> reward -> response -> continue", async () => {
  let state = initialState();
  const catalog = [
    { id: "a", source: "s", mediaSource: "books", title: "Book A", traitKeys: ["tone:cozy"] },
    { id: "b", source: "s", mediaSource: "movies", title: "Movie B", traitKeys: ["tone:tense"] },
  ];

  // Play: 6 meaningful completed rounds, each merged as its own native evidence unit.
  for (let round = 1; round <= 6; round += 1) {
    const positive = round % 2 === 0 ? [] : ["a"];
    const negative = round % 2 === 0 ? ["b"] : [];
    const signals = adaptMediaManiaEvidenceToSignals({ newPositiveItemIds: positive, newNegativeItemIds: negative, catalog });
    state = mergeNativeEvidence(state, `round-${round}`, signals);
  }
  assert.equal(state.adaptedSignals.length, 6);

  // Milestone: exactly at round 6.
  const milestone = mediaManiaMilestone(6, state.lastMilestoneEvidenceCount);
  assert.ok(milestone);

  // Reward: the engine calls the injected recommender and picks the top unseen candidate.
  const outcome = await attemptGameRecommendationMilestone({
    state,
    milestone,
    evidenceMode: "cross_media",
    ageBand: "teens",
    enabledSources: { googleBooks: true },
    runRecommender: fixedRunner(CANDIDATES),
  });
  assert.equal(outcome.status, "shown");
  if (outcome.status !== "shown") return;
  assert.equal(outcome.book.title, "Atlas of Small Stars");
  assert.equal(outcome.book.rank, 1);
  assert.equal(outcome.milestoneId, "media_mania:1");
  assert.equal(outcome.cadence, "first");
  assert.equal(outcome.state.pendingReward?.book.id, outcome.book.id);
  const restoredWhileAwaitingResponse = restoreGameRecommendationIntegrationState(
    JSON.stringify(outcome.state),
    { game: "media_mania", anonymousPlayerId: "patron-abc", gameSessionId: "mm-session-2" },
  );
  assert.equal(restoredWhileAwaitingResponse.pendingReward?.book.id, outcome.book.id);
  assert.equal(restoredWhileAwaitingResponse.pendingReward?.gameSessionId, "mm-session-1");
  state = outcome.state;

  // Response: build and validate the feedback contract event, distinct from native evidence.
  const shownAt = outcome.shownAt;
  const feedback = createGameRecommendationFeedbackEvent({
    game: "media_mania",
    anonymousPlayerId: "patron-abc",
    gameSessionId: "mm-session-1",
    milestoneIndex: outcome.milestoneIndex,
    evidenceCount: outcome.evidenceCount,
    evidenceSnapshotVersion: "v1",
    evidenceSnapshot: outcome.evidenceSnapshot,
    evidenceMode: outcome.evidenceMode,
    book: outcome.book,
    response: "yes",
    ageBand: "teens",
    library: { libraryId: "default", localCollectionOnly: false },
    shownAt,
    respondedAt: new Date(Date.parse(shownAt) + 2_000).toISOString(),
  });

  // Continue: attach continuedAt and resume gameplay - the milestone must not fire again for the
  // same meaningful count, and a later milestone must exclude the already-shown book.
  const continued = withContinuedAt(feedback, new Date(Date.parse(feedback.respondedAt) + 10).toISOString());
  assert.ok(continued?.continuedAt);

  const notEligibleAgain = await attemptGameRecommendationMilestone({
    state,
    milestone: mediaManiaMilestone(6, state.lastMilestoneEvidenceCount),
    evidenceMode: "cross_media",
    ageBand: "teens",
    enabledSources: { googleBooks: true },
    runRecommender: fixedRunner(CANDIDATES),
  });
  assert.equal(notEligibleAgain.status, "not_eligible");
});

const GAME_FLOWS: {
  game: RecommendationGameId;
  evidenceCount: number;
  evidenceMode: GameRecommendationEvidenceMode;
  response: GameRecommendationResponse;
  milestone: (count: number, last: number) => ReturnType<typeof mediaManiaMilestone>;
}[] = [
  { game: "media_mania", evidenceCount: 6, evidenceMode: "cross_media", response: "yes", milestone: mediaManiaMilestone },
  { game: "the_last_bookshop", evidenceCount: 3, evidenceMode: "semantic_only", response: "maybe", milestone: lastBookshopMilestone },
  { game: "unwritten_map", evidenceCount: 4, evidenceMode: "semantic_only", response: "no", milestone: unwrittenMapMilestone },
  { game: "alchemists_cascade", evidenceCount: 3, evidenceMode: "semantic_only", response: "already_read", milestone: alchemistsCascadeMilestone },
];

for (const flow of GAME_FLOWS) {
  test(`${flow.game}: deterministic play -> milestone -> reward -> response -> continue`, async () => {
    let state = createInitialGameRecommendationIntegrationState({
      game: flow.game,
      anonymousPlayerId: "patron-flow",
      gameSessionId: `${flow.game}-session`,
    });
    for (let index = 1; index <= flow.evidenceCount; index += 1) {
      state = mergeNativeEvidence(state, `native-${index}`, [{
        id: `signal-${index}`,
        action: index % 2 ? "like" : "dislike",
        tags: [`theme-${index}`],
      }]);
    }
    const outcome = await attemptGameRecommendationMilestone({
      state,
      milestone: flow.milestone(flow.evidenceCount, 0),
      evidenceMode: flow.evidenceMode,
      ageBand: "teens",
      enabledSources: { googleBooks: true },
      library: { libraryId: "yvhs", localCollectionOnly: false },
      runRecommender: fixedRunner(CANDIDATES),
    });
    assert.equal(outcome.status, "shown");
    if (outcome.status !== "shown") return;

    const event = createGameRecommendationFeedbackEvent({
      game: flow.game,
      anonymousPlayerId: "patron-flow",
      gameSessionId: outcome.state.pendingReward?.gameSessionId || "",
      milestoneIndex: outcome.milestoneIndex,
      evidenceCount: outcome.evidenceCount,
      evidenceSnapshotVersion: "v1",
      evidenceSnapshot: outcome.evidenceSnapshot,
      evidenceMode: outcome.evidenceMode,
      book: outcome.book,
      response: flow.response,
      ageBand: "teens",
      library: { libraryId: "yvhs", localCollectionOnly: false },
      shownAt: outcome.shownAt,
      respondedAt: new Date(Date.parse(outcome.shownAt) + 1_000).toISOString(),
    });
    const continued = withContinuedAt(event, new Date(Date.parse(event.respondedAt) + 1).toISOString());
    assert.equal(continued?.response, flow.response);
    assert.ok(continued?.continuedAt);
    assert.equal(clearPendingReward(outcome.state).pendingReward, null);
  });
}

test("the same book is never shown twice across milestones", async () => {
  let state = initialState();
  const first = await attemptGameRecommendationMilestone({
    state,
    milestone: mediaManiaMilestone(6, 0),
    evidenceMode: "cross_media",
    ageBand: "teens",
    enabledSources: {},
    runRecommender: fixedRunner(CANDIDATES),
  });
  assert.equal(first.status, "shown");
  if (first.status !== "shown") return;
  state = clearPendingReward(first.state);

  const second = await attemptGameRecommendationMilestone({
    state,
    milestone: mediaManiaMilestone(12, state.lastMilestoneEvidenceCount),
    evidenceMode: "cross_media",
    ageBand: "teens",
    enabledSources: {},
    // The recommender returns the same ranked list again; the engine must skip the already-shown
    // top candidate and pick the next unseen one.
    runRecommender: fixedRunner(CANDIDATES),
  });
  assert.equal(second.status, "shown");
  if (second.status !== "shown") return;
  assert.notEqual(second.book.id, first.book.id);
  assert.equal(second.book.title, "Neon Skyline");
});

test("the same title and author is rejected across different production sources", async () => {
  let state = initialState();
  const first = await attemptGameRecommendationMilestone({
    state,
    milestone: mediaManiaMilestone(6, 0),
    evidenceMode: "cross_media",
    ageBand: "teens",
    enabledSources: {},
    runRecommender: fixedRunner(CANDIDATES),
  });
  assert.equal(first.status, "shown");
  if (first.status !== "shown") return;
  state = clearPendingReward(first.state);

  const second = await attemptGameRecommendationMilestone({
    state,
    milestone: mediaManiaMilestone(12, state.lastMilestoneEvidenceCount),
    evidenceMode: "cross_media",
    ageBand: "teens",
    enabledSources: {},
    runRecommender: fixedRunner([
      { id: "openLibrary:OL1", source: "openLibrary", sourceId: "OL1", title: "Atlas of Small Stars", creators: ["E. Vesper"], coverUrl: "https://example.test/ol1.jpg" },
      CANDIDATES[1],
    ]),
  });
  assert.equal(second.status, "shown");
  if (second.status !== "shown") return;
  assert.equal(second.book.title, "Neon Skyline");
});

test("coverless and anime candidates are skipped so rewards always render as books", async () => {
  const outcome = await attemptGameRecommendationMilestone({
    state: initialState(),
    milestone: mediaManiaMilestone(6, 0),
    evidenceMode: "cross_media",
    ageBand: "teens",
    enabledSources: {},
    runRecommender: fixedRunner([
      { id: "googleBooks:no-cover", source: "googleBooks", sourceId: "no-cover", title: "No Cover", creators: ["A. Author"], coverUrl: null },
      { id: "kitsu:anime", source: "kitsu", sourceId: "anime", title: "Screen Story", creators: ["B. Author"], format: "anime", coverUrl: "https://example.test/anime.jpg" },
      CANDIDATES[2],
    ]),
  });
  assert.equal(outcome.status, "shown");
  if (outcome.status !== "shown") return;
  assert.equal(outcome.book.title, "Third Candidate");
});

test("already_read familiarity prevents that book from ever being shown again, without needing a repeat feedback response", async () => {
  let state = initialState();
  state = recordFamiliarBook(state, "atlas-of-small-stars:e-vesper");
  const outcome = await attemptGameRecommendationMilestone({
    state,
    milestone: mediaManiaMilestone(6, 0),
    evidenceMode: "cross_media",
    ageBand: "teens",
    enabledSources: {},
    runRecommender: fixedRunner(CANDIDATES),
  });
  assert.equal(outcome.status, "shown");
  if (outcome.status !== "shown") return;
  assert.notEqual(outcome.book.id, "atlas-of-small-stars:e-vesper");
  assert.equal(outcome.book.title, "Neon Skyline");
});

test("a thrown recommender error is graceful: no reward, a diagnostic is produced, and play is never interrupted", async () => {
  const state = initialState();
  const failingRunner: RunGameRecommender = async () => {
    throw new Error("network_unavailable");
  };
  const outcome = await attemptGameRecommendationMilestone({
    state,
    milestone: mediaManiaMilestone(6, 0),
    evidenceMode: "cross_media",
    ageBand: "teens",
    enabledSources: {},
    runRecommender: failingRunner,
  });
  assert.equal(outcome.status, "error");
  if (outcome.status !== "error" && outcome.status !== "empty") return;
  assert.equal(outcome.diagnostic.schemaVersion, "game_recommendation_diagnostic_v1");
  assert.equal(outcome.diagnostic.reason, "recommender_threw");
  assert.equal(outcome.state.lastFailedAttemptEvidenceCount, 6);
  assert.deepEqual(outcome.state.triggeredMilestoneIds, []);
});

test("generation failure retries only at a later eligible meaningful evidence count, not immediately", async () => {
  let state = initialState();
  const failingRunner: RunGameRecommender = async () => {
    throw new Error("simulated_failure");
  };
  const failed = await attemptGameRecommendationMilestone({
    state,
    milestone: mediaManiaMilestone(6, 0),
    evidenceMode: "cross_media",
    ageBand: "teens",
    enabledSources: {},
    runRecommender: failingRunner,
  });
  assert.equal(failed.status, "error");
  state = failed.state;

  // Re-attempting the very same milestone/evidence count must not retry.
  const stillNotEligible = await attemptGameRecommendationMilestone({
    state,
    milestone: mediaManiaMilestone(6, state.lastMilestoneEvidenceCount),
    evidenceMode: "cross_media",
    ageBand: "teens",
    enabledSources: {},
    runRecommender: fixedRunner(CANDIDATES),
  });
  // mediaManiaMilestone(6, 6) is null because lastMilestoneEvidenceCount tracking only advances
  // on success; simulate the caller re-deriving eligibility from the failed state directly.
  assert.equal(stillNotEligible.status, "not_eligible");

  // The next milestone (a later, higher evidence count) is eligible and succeeds.
  const retried = await attemptGameRecommendationMilestone({
    state,
    milestone: mediaManiaMilestone(12, 0),
    evidenceMode: "cross_media",
    ageBand: "teens",
    enabledSources: {},
    runRecommender: fixedRunner(CANDIDATES),
  });
  assert.equal(retried.status, "shown");
  if (retried.status === "shown") assert.equal(retried.cadence, "first");
});

test("an empty candidate list (or all candidates already shown/familiar) is reported as empty, not error, and never blocks play", async () => {
  let state = initialState();
  state = recordFamiliarBook(state, "atlas-of-small-stars:e-vesper");
  state = recordFamiliarBook(state, "neon-skyline:r-cole");
  state = recordFamiliarBook(state, "third-candidate:a-author");
  const outcome = await attemptGameRecommendationMilestone({
    state,
    milestone: mediaManiaMilestone(6, 0),
    evidenceMode: "cross_media",
    ageBand: "teens",
    enabledSources: {},
    runRecommender: fixedRunner(CANDIDATES),
  });
  assert.equal(outcome.status, "empty");
  if (outcome.status !== "empty") return;
  assert.equal(outcome.diagnostic.reason, "empty_result");
});
