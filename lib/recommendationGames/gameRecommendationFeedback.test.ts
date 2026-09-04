import assert from "node:assert/strict";
import test from "node:test";
import {
  createGameRecommendationFeedbackEvent,
  isGameRecommendationFeedbackEventV1,
  withContinuedAt,
  GAME_RECOMMENDATION_RESPONSES,
  type GameRecommendationBookIdentity,
  type GameRecommendationLibraryContext,
} from "./gameRecommendationFeedback";
import {
  createGameRecommendationDiagnosticEvent,
  isGameRecommendationDiagnosticEventV1,
} from "./gameRecommendationDiagnostics";

const book: GameRecommendationBookIdentity = {
  id: "googleBooks:abc123",
  source: "googleBooks",
  sourceId: "abc123",
  title: "Atlas of Small Stars",
  author: "E. Vesper",
  rank: 1,
};

const library: GameRecommendationLibraryContext = { libraryId: "yvhs", localCollectionOnly: false };

function baseArgs(overrides: Partial<Parameters<typeof createGameRecommendationFeedbackEvent>[0]> = {}) {
  return {
    game: "media_mania" as const,
    anonymousPlayerId: "patron-abc",
    gameSessionId: "mm-session-1",
    milestoneIndex: 1,
    evidenceCount: 6,
    evidenceSnapshotVersion: "v1",
    evidenceSnapshot: {
      signalCount: 6,
      positiveSignalCount: 3,
      negativeSignalCount: 3,
      sources: ["books", "movies"],
      semanticTags: ["tone:cozy", "tone:tense"],
    },
    evidenceMode: "cross_media" as const,
    book,
    response: "yes" as const,
    ageBand: "teens" as const,
    library,
    shownAt: "2026-01-01T00:00:00.000Z",
    respondedAt: "2026-01-01T00:00:05.000Z",
    ...overrides,
  };
}

test("builds a valid, versioned feedback event with a deterministic milestone-scoped eventId", () => {
  const event = createGameRecommendationFeedbackEvent(baseArgs());
  assert.equal(event.schemaVersion, "game_recommendation_feedback_v1");
  assert.equal(event.milestoneId, "media_mania:1");
  assert.equal(event.eventId, "mm-session-1:media_mania:1");
  assert.equal(event.continuedAt, null);
  assert.ok(isGameRecommendationFeedbackEventV1(event));
});

test("accepts every documented response value", () => {
  for (const response of GAME_RECOMMENDATION_RESPONSES) {
    const event = createGameRecommendationFeedbackEvent(baseArgs({ response }));
    assert.equal(event.response, response);
  }
});

test("already_read is stored as plain familiarity, structurally indistinguishable in shape from yes/no/maybe", () => {
  const alreadyRead = createGameRecommendationFeedbackEvent(baseArgs({ response: "already_read" }));
  const yes = createGameRecommendationFeedbackEvent(baseArgs({ response: "yes" }));
  assert.deepEqual(Object.keys(alreadyRead).sort(), Object.keys(yes).sort());
  // The contract itself carries no notion of "positive"/"negative" weight - that judgement is
  // entirely the consuming taste engine's responsibility, and already_read must never be mapped
  // to a like or dislike anywhere downstream.
  assert.equal(alreadyRead.response, "already_read");
});

test("rejects payloads with extra fields, unknown games, or out-of-range values", () => {
  const event = createGameRecommendationFeedbackEvent(baseArgs());
  assert.equal(isGameRecommendationFeedbackEventV1({ ...event, extra: "field" }), false);
  assert.equal(isGameRecommendationFeedbackEventV1({ ...event, game: "unknown_game" }), false);
  assert.equal(isGameRecommendationFeedbackEventV1({ ...event, milestoneIndex: 0 }), false);
  assert.equal(isGameRecommendationFeedbackEventV1({ ...event, response: "like" }), false);
  assert.equal(isGameRecommendationFeedbackEventV1({ ...event, evidenceMode: "toy_recommender" }), false);
  assert.equal(isGameRecommendationFeedbackEventV1({ ...event, milestoneId: "wrong:1" }), false);
});

test("validates the complete evidence snapshot instead of accepting only a count", () => {
  const event = createGameRecommendationFeedbackEvent(baseArgs());
  assert.deepEqual(event.evidenceSnapshot.semanticTags, ["tone:cozy", "tone:tense"]);
  assert.equal(isGameRecommendationFeedbackEventV1({
    ...event,
    evidenceSnapshot: { ...event.evidenceSnapshot, signalCount: -1 },
  }), false);
  assert.equal(isGameRecommendationFeedbackEventV1({
    ...event,
    evidenceSnapshot: { ...event.evidenceSnapshot, unknownField: true },
  }), false);
});

test("rejects a respondedAt before shownAt, and a continuedAt before respondedAt", () => {
  assert.throws(() => createGameRecommendationFeedbackEvent(baseArgs({
    shownAt: "2026-01-01T00:00:10.000Z",
    respondedAt: "2026-01-01T00:00:00.000Z",
  })));
  const event = createGameRecommendationFeedbackEvent(baseArgs());
  assert.equal(withContinuedAt(event, "2026-01-01T00:00:01.000Z"), null);
  const continued = withContinuedAt(event, "2026-01-01T00:00:06.000Z");
  assert.ok(continued);
  assert.equal(continued?.continuedAt, "2026-01-01T00:00:06.000Z");
});

test("age band and library context map through unchanged for every supported age band", () => {
  for (const ageBand of ["kids", "preteens", "teens", "adult"] as const) {
    const event = createGameRecommendationFeedbackEvent(baseArgs({ ageBand }));
    assert.equal(event.ageBand, ageBand);
  }
  const localOnly = createGameRecommendationFeedbackEvent(baseArgs({
    library: { libraryId: "yvhs", localCollectionOnly: true },
  }));
  assert.equal(localOnly.library.localCollectionOnly, true);
});

test("diagnostic events are a distinct, separately versioned contract", () => {
  const diagnostic = createGameRecommendationDiagnosticEvent({
    game: "the_last_bookshop",
    anonymousPlayerId: "patron-abc",
    gameSessionId: "lbs-session-1",
    milestoneId: "the_last_bookshop:1",
    milestoneIndex: 1,
    evidenceCount: 3,
    reason: "recommender_threw",
    detail: "simulated failure",
  });
  assert.equal(diagnostic.schemaVersion, "game_recommendation_diagnostic_v1");
  assert.ok(isGameRecommendationDiagnosticEventV1(diagnostic));
  assert.equal(isGameRecommendationDiagnosticEventV1({ ...diagnostic, response: "yes" }), false);
});
