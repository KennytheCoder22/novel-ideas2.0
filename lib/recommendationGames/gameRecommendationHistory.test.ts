import assert from "node:assert/strict";
import test from "node:test";
import {
  createGameRecommendationHistory,
  gameRecommendationHistoryStorageKey,
  recordGameRecommendationFamiliarBook,
  restoreGameRecommendationHistory,
  synchronizeGameRecommendationHistory,
} from "./gameRecommendationHistory";
import {
  createInitialGameRecommendationIntegrationState,
  recordShownBook,
} from "./gameRecommendationIntegrationState";

const scope = { anonymousPlayerId: "reader-1", libraryId: "central", ageBand: "teens" as const };

test("shared history synchronizes shown and familiar books across game states", () => {
  let history = createGameRecommendationHistory(scope);
  const bookshop = recordShownBook(createInitialGameRecommendationIntegrationState({
    game: "the_last_bookshop",
    anonymousPlayerId: scope.anonymousPlayerId,
    gameSessionId: "bookshop-1",
  }), "book-a:author-a");
  ({ history } = synchronizeGameRecommendationHistory(history, bookshop));
  history = recordGameRecommendationFamiliarBook(history, "book-b:author-b");

  const map = createInitialGameRecommendationIntegrationState({
    game: "unwritten_map",
    anonymousPlayerId: scope.anonymousPlayerId,
    gameSessionId: "map-1",
  });
  const synchronized = synchronizeGameRecommendationHistory(history, map);
  assert.deepEqual(synchronized.state.shownBookIdentityIds, ["book-a:author-a"]);
  assert.deepEqual(synchronized.state.familiarBookIdentityIds, ["book-b:author-b"]);
});

test("history is scoped by pseudonymous player, library, and age band", () => {
  const history = recordGameRecommendationFamiliarBook(
    createGameRecommendationHistory(scope),
    "book-a:author-a",
  );
  const restoredForAnotherAge = restoreGameRecommendationHistory(JSON.stringify(history), {
    ...scope,
    ageBand: "adult",
  });
  assert.deepEqual(restoredForAnotherAge.familiarBookIdentityIds, []);
  assert.notEqual(
    gameRecommendationHistoryStorageKey(scope),
    gameRecommendationHistoryStorageKey({ ...scope, ageBand: "adult" }),
  );
});

