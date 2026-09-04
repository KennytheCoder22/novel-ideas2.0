import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialGameRecommendationIntegrationState,
  isBookAlreadySeen,
  isMilestoneEligibleForAttempt,
  mergeNativeEvidence,
  recordFailedAttempt,
  recordFamiliarBook,
  recordMilestoneSucceeded,
  recordShownBook,
  resetGameRecommendationSession,
  retractNativeEvidence,
  restoreGameRecommendationIntegrationState,
} from "./gameRecommendationIntegrationState";

function initial() {
  return createInitialGameRecommendationIntegrationState({
    game: "media_mania",
    anonymousPlayerId: "patron-abc",
    gameSessionId: "mm-session-1",
  });
}

test("merging the same native evidence id twice never duplicates adapted signals", () => {
  let state = initial();
  const signal = { id: "a", action: "like" as const };
  state = mergeNativeEvidence(state, "round-1", [signal]);
  state = mergeNativeEvidence(state, "round-1", [signal]);
  assert.equal(state.adaptedSignals.length, 1);
  assert.deepEqual(state.dedupedNativeEvidenceIds, ["round-1"]);
});

test("merging a new native evidence id appends without touching prior signals", () => {
  let state = initial();
  state = mergeNativeEvidence(state, "round-1", [{ id: "a", action: "like" as const }]);
  state = mergeNativeEvidence(state, "round-2", [{ id: "b", action: "dislike" as const }]);
  assert.equal(state.adaptedSignals.length, 2);
  assert.deepEqual(state.dedupedNativeEvidenceIds, ["round-1", "round-2"]);
});

test("retracting an undone native event removes only its derived recommendation signals", () => {
  let state = initial();
  state = mergeNativeEvidence(state, "round-1", [{ id: "a", action: "like" as const }]);
  state = mergeNativeEvidence(state, "round-2", [{ id: "b", action: "dislike" as const }]);
  state = retractNativeEvidence(state, "round-1");
  assert.deepEqual(state.dedupedNativeEvidenceIds, ["round-2"]);
  assert.deepEqual(state.adaptedSignals, [{ id: "b", action: "dislike" }]);
  assert.deepEqual(retractNativeEvidence(state, "missing"), state);
});

test("shown and familiar (already_read) book identities both prevent a repeat", () => {
  let state = initial();
  state = recordShownBook(state, "book-1");
  assert.equal(isBookAlreadySeen(state, "book-1"), true);
  assert.equal(isBookAlreadySeen(state, "book-2"), false);
  state = recordFamiliarBook(state, "book-2");
  assert.equal(isBookAlreadySeen(state, "book-2"), true);
  // Recording the same identity twice must stay idempotent.
  const before = state;
  state = recordFamiliarBook(state, "book-2");
  assert.deepEqual(state, before);
});

test("a new gameplay session resets milestones and evidence but preserves shown and familiar books", () => {
  let state = initial();
  state = mergeNativeEvidence(state, "round-1", [{ id: "a", action: "like" as const }]);
  state = recordShownBook(state, "book-1");
  state = recordFamiliarBook(state, "book-2");
  state = recordMilestoneSucceeded(state, "media_mania:1", 6);
  state = resetGameRecommendationSession(state, "mm-session-2");
  assert.equal(state.gameSessionId, "mm-session-2");
  assert.deepEqual(state.adaptedSignals, []);
  assert.deepEqual(state.triggeredMilestoneIds, []);
  assert.deepEqual(state.shownBookIdentityIds, ["book-1"]);
  assert.deepEqual(state.familiarBookIdentityIds, ["book-2"]);
});

test("a successful milestone clears any prior failed-attempt marker and raises the last evidence count", () => {
  let state = initial();
  state = recordFailedAttempt(state, 6);
  assert.equal(state.lastFailedAttemptEvidenceCount, 6);
  state = recordMilestoneSucceeded(state, "media_mania:1", 6);
  assert.equal(state.lastFailedAttemptEvidenceCount, null);
  assert.equal(state.lastMilestoneEvidenceCount, 6);
  assert.deepEqual(state.triggeredMilestoneIds, ["media_mania:1"]);
});

test("a milestone that has already succeeded is never eligible for another attempt", () => {
  let state = initial();
  state = recordMilestoneSucceeded(state, "media_mania:1", 6);
  assert.equal(isMilestoneEligibleForAttempt(state, "media_mania:1", 6), false);
});

test("a failed attempt only becomes eligible again at a later meaningful evidence count", () => {
  let state = initial();
  state = recordFailedAttempt(state, 12);
  assert.equal(isMilestoneEligibleForAttempt(state, "media_mania:2", 12), false);
  assert.equal(isMilestoneEligibleForAttempt(state, "media_mania:2", 13), true);
});

test("restoring persisted state round-trips accumulated history and rehydrates the current session id", () => {
  let state = initial();
  state = mergeNativeEvidence(state, "round-1", [{ id: "a", action: "like" as const }]);
  state = recordShownBook(state, "book-1");
  state = recordMilestoneSucceeded(state, "media_mania:1", 6);
  const raw = JSON.stringify(state);
  const restored = restoreGameRecommendationIntegrationState(raw, {
    game: "media_mania",
    anonymousPlayerId: "patron-abc",
    gameSessionId: "mm-session-2",
  });
  assert.equal(restored.gameSessionId, "mm-session-2");
  assert.deepEqual(restored.shownBookIdentityIds, ["book-1"]);
  assert.deepEqual(restored.triggeredMilestoneIds, ["media_mania:1"]);
  assert.equal(restored.adaptedSignals.length, 1);
});

test("restoring corrupt, mismatched, or missing persisted state falls back to a fresh initial state", () => {
  const expected = { game: "media_mania" as const, anonymousPlayerId: "patron-abc", gameSessionId: "mm-session-2" };
  assert.deepEqual(restoreGameRecommendationIntegrationState(null, expected), createInitialGameRecommendationIntegrationState(expected));
  assert.deepEqual(restoreGameRecommendationIntegrationState("not json", expected), createInitialGameRecommendationIntegrationState(expected));
  const otherPlayer = JSON.stringify(mergeNativeEvidence(initial(), "round-1", [{ id: "a", action: "like" as const }]));
  assert.deepEqual(
    restoreGameRecommendationIntegrationState(otherPlayer, { ...expected, anonymousPlayerId: "someone-else" }),
    createInitialGameRecommendationIntegrationState({ ...expected, anonymousPlayerId: "someone-else" }),
  );
});
