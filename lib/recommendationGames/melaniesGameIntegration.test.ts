import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createInitialGameRecommendationIntegrationState, mergeNativeEvidence } from "./gameRecommendationIntegrationState";
import { canonicalBookIdentity, generateGameRecommendationSlate } from "./gameRecommendationEngine";
import {
  createGameRecommendationSlateFeedbackEvent,
  isGameRecommendationSlateFeedbackEventV1,
} from "./gameRecommendationFeedback";
import { normalizeGameRouteAgeBand } from "./gameRecommendationRouteConfig";
import {
  adaptMelanieEvidenceToSignals,
  completeMelanieFinal,
  completeMelanieRanking,
  createInitialMelanieGame,
  restoreMelanieGameState,
  selectMelanieConcepts,
} from "./melaniesGame";

function completeTournament() {
  const initial = createInitialMelanieGame({
    anonymousPlayerId: "player-a",
    libraryId: "library-a",
    ageBand: "teens",
    gameSessionId: "melanie-e2e",
    now: "2026-09-07T00:00:00.000Z",
  });
  const round1 = completeMelanieRanking(selectMelanieConcepts(initial, initial.currentConceptIds.slice(0, 3)));
  const round2 = completeMelanieRanking(selectMelanieConcepts(round1, [
    round1.currentConceptIds[0],
    round1.currentConceptIds[2],
    round1.currentConceptIds[4],
  ]));
  return completeMelanieFinal(selectMelanieConcepts(round2, round2.currentConceptIds.slice(0, 3)));
}

const candidates = Array.from({ length: 10 }, (_, index) => ({
  id: `candidate-${index}`,
  source: index % 2 ? "googleBooks" : "openLibrary",
  sourceId: `source-${index}`,
  title: `Real Production Book ${index}`,
  creators: [`Author ${index}`],
  coverUrl: `https://example.test/cover-${index}.jpg`,
  description: `Production description ${index}.`,
  format: "book" as const,
  matchedSignals: [`signal-${index}`, "atmospheric"],
  raw: {},
}));

test("new-player copy is exact and no fictional patron is introduced", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app", "games", "melanies-game.tsx"), "utf8");
  const hookSource = fs.readFileSync(path.join(process.cwd(), "hooks", "useGameRecommendationMilestone.ts"), "utf8");
  assert(source.includes("There is no imaginary person. Pick the book YOU want."));
  assert(!/\b(customer|patron|choose for Melanie)\b/i.test(source));
  assert(source.includes("sessionScopedEvidence: true"));
  assert(source.includes("flushMelanieEvidence()"));
  assert(source.includes("Let the Tournament Begin"));
  assert(source.includes("ConceptCover"));
  assert(hookSource.includes("args.sessionScopedEvidence ? args.gameSessionId : undefined"));
});

test("canonical book identities preserve non-Latin titles and authors", () => {
  const first = canonicalBookIdentity({
    id: "jp-1", source: "googleBooks", title: "東京物語", creators: ["山田太郎"],
  });
  const second = canonicalBookIdentity({
    id: "jp-2", source: "googleBooks", title: "海辺の城", creators: ["佐藤花子"],
  });
  assert.notEqual(first, second);
  assert.notEqual(first, ":unknown-author");
});

test("all four route vocabularies map to age-specific Melanie pools", () => {
  assert.equal(normalizeGameRouteAgeBand("kids"), "kids");
  assert.equal(normalizeGameRouteAgeBand("preteens"), "preteens");
  assert.equal(normalizeGameRouteAgeBand("teens"), "teens");
  assert.equal(normalizeGameRouteAgeBand("adults"), "adult");
});

test("reload restore is exact-context only and rejects legacy or cross-context state", () => {
  const completed = completeTournament();
  const raw = JSON.stringify(completed);
  assert.deepEqual(restoreMelanieGameState(raw, {
    anonymousPlayerId: "player-a",
    libraryId: "library-a",
    ageBand: "teens",
  }), completed);
  assert.equal(restoreMelanieGameState(raw, {
    anonymousPlayerId: "player-b",
    libraryId: "library-a",
    ageBand: "teens",
  }), null);
  assert.equal(restoreMelanieGameState(raw, {
    anonymousPlayerId: "player-a",
    libraryId: "library-b",
    ageBand: "teens",
  }), null);
  assert.equal(restoreMelanieGameState(raw, {
    anonymousPlayerId: "player-a",
    libraryId: "library-a",
    ageBand: "adult",
  }), null);
  assert.equal(restoreMelanieGameState(JSON.stringify({ ...completed, schemaVersion: "legacy" }), {
    anonymousPlayerId: "player-a",
    libraryId: "library-a",
    ageBand: "teens",
  }), null);
  assert.equal(restoreMelanieGameState(JSON.stringify({
    ...completed,
    recommendations: [{}],
    finalRecommendationRanking: [""],
  }), {
    anonymousPlayerId: "player-a",
    libraryId: "library-a",
    ageBand: "teens",
  }), null);
});

test("full tournament feeds production recommender constraints and returns three positioned real books", async () => {
  const completed = completeTournament();
  const signals = adaptMelanieEvidenceToSignals(completed.evidence);
  const integration = mergeNativeEvidence(
    createInitialGameRecommendationIntegrationState({
      game: "melanies_game",
      anonymousPlayerId: completed.anonymousPlayerId,
      gameSessionId: completed.gameSessionId,
    }),
    `${completed.gameSessionId}:final-tournament`,
    signals,
  );
  let received: Record<string, unknown> | null = null;
  const outcome = await generateGameRecommendationSlate({
    state: { ...integration, shownBookIdentityIds: ["real-production-book-0:author-0"] },
    ageBand: "teens",
    enabledSources: { googleBooks: false, openLibrary: false, localLibrary: true },
    localLibraryCurationTrusted: true,
    runRecommender: async (session) => {
      received = session;
      return { items: candidates };
    },
    now: () => "2026-09-07T00:05:00.000Z",
  });
  assert.equal(outcome.status, "shown");
  if (outcome.status !== "shown") return;
  assert.deepEqual(outcome.items.map((item) => item.position), ["strongest", "strong", "adventurous"]);
  assert.equal(outcome.items.length, 3);
  assert(!outcome.items.some((item) => item.book.id === "real-production-book-0:author-0"));
  assert.equal((received as any).ageBand, "teens");
  assert.equal((received as any).enabledSources.localLibrary, true);
  assert.equal((received as any).localLibraryCurationTrusted, true);
  assert.equal((received as any).signals.length, signals.length);
  assert(outcome.state.shownBookIdentityIds.length >= 4);
});

test("production recommendation failure is retryable and does not mutate shown history", async () => {
  const state = createInitialGameRecommendationIntegrationState({
    game: "melanies_game",
    anonymousPlayerId: "player-a",
    gameSessionId: "melanie-e2e",
  });
  const outcome = await generateGameRecommendationSlate({
    state,
    ageBand: "adult",
    enabledSources: { googleBooks: true },
    runRecommender: async () => {
      throw new Error("offline");
    },
  });
  assert.equal(outcome.status, "error");
  assert.deepEqual(outcome.state, state);
});

test("final slate admits only explicit book formats", async () => {
  const state = createInitialGameRecommendationIntegrationState({
    game: "melanies_game",
    anonymousPlayerId: "player-a",
    gameSessionId: "melanie-books-only",
  });
  const outcome = await generateGameRecommendationSlate({
    state,
    ageBand: "teens",
    enabledSources: { googleBooks: true, kitsu: true, comicVine: true },
    runRecommender: async () => ({
      items: [
        { ...candidates[0], id: "comic", format: "comic", formats: ["comic"] },
        { ...candidates[1], id: "manga", format: "manga", formats: ["manga"] },
        ...candidates.slice(2, 6).map((candidate) => ({ ...candidate, formats: ["book"] as const })),
      ],
    }),
  });
  assert.equal(outcome.status, "shown");
  if (outcome.status !== "shown") return;
  assert(!outcome.items.some((item) => item.book.sourceId === "source-0" || item.book.sourceId === "source-1"));
});

test("optional final ranking uses the dedicated durable recommendation feedback contract", () => {
  const event = createGameRecommendationSlateFeedbackEvent({
    game: "melanies_game",
    anonymousPlayerId: "player-a",
    gameSessionId: "melanie-e2e",
    evidenceSnapshotVersion: "v1",
    evidenceSnapshot: {
      signalCount: 18,
      positiveSignalCount: 9,
      negativeSignalCount: 9,
      sources: ["melanies_game"],
      semanticTags: ["mystery"],
    },
    evidenceMode: "semantic_only",
    recommendations: candidates.slice(0, 3).map((candidate, index) => ({
      id: `real-production-book-${index}:author-${index}`,
      source: candidate.source,
      sourceId: candidate.sourceId,
      title: candidate.title,
      author: candidate.creators[0],
      rank: index + 1,
    })),
    ranking: [
      "real-production-book-1:author-1",
      "real-production-book-0:author-0",
      "real-production-book-2:author-2",
    ],
    preferredBookId: "real-production-book-1:author-1",
    ageBand: "teens",
    library: { libraryId: "library-a", localCollectionOnly: false },
    shownAt: "2026-09-07T00:05:00.000Z",
    respondedAt: "2026-09-07T00:06:00.000Z",
  });
  assert(isGameRecommendationSlateFeedbackEventV1(event));
  assert.equal(event.schemaVersion, "game_recommendation_slate_feedback_v1");
});
