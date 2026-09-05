import assert from "node:assert/strict";
import test from "node:test";
import { buildTasteProfile } from "../../app/recommender-v2";
import {
  adaptAlchemistsCascadeCatalystToSignal,
  adaptLastBookshopEncounterToSignals,
  adaptUnwrittenMapChoiceToSignal,
} from "./gameRecommendationEvidenceAdapters";
import {
  attemptGameRecommendationMilestone,
  type GameRecommendationCandidateLike,
  type RunGameRecommender,
} from "./gameRecommendationEngine";
import {
  createGameRecommendationHistory,
  recordGameRecommendationFamiliarBook,
  synchronizeGameRecommendationHistory,
} from "./gameRecommendationHistory";
import {
  clearPendingReward,
  createInitialGameRecommendationIntegrationState,
  mergeNativeEvidence,
  type GameRecommendationIntegrationStateV1,
} from "./gameRecommendationIntegrationState";
import {
  alchemistsCascadeMilestone,
  lastBookshopMilestone,
  unwrittenMapMilestone,
} from "./gameRecommendationMilestones";
import type { RecommendationGameId } from "./gameRecommendationFeedback";

const CANDIDATES: GameRecommendationCandidateLike[] = [
  { id: "book-a", source: "googleBooks", title: "Book A", creators: ["Author A"], coverUrl: "https://example.test/a.jpg" },
  { id: "book-familiar", source: "openLibrary", title: "Familiar Book", creators: ["Author F"], coverUrl: "https://example.test/f.jpg" },
  { id: "book-b", source: "googleBooks", title: "Book B", creators: ["Author B"], coverUrl: "https://example.test/b.jpg" },
  { id: "book-c", source: "openLibrary", title: "Book C", creators: ["Author C"], coverUrl: "https://example.test/c.jpg" },
];

const runner: RunGameRecommender = async () => ({ items: CANDIDATES });

function stateWithSignals(game: RecommendationGameId, signals: Parameters<typeof mergeNativeEvidence>[2][]): GameRecommendationIntegrationStateV1 {
  return signals.reduce(
    (state, eventSignals, index) => mergeNativeEvidence(state, `${game}-native-${index + 1}`, eventSignals),
    createInitialGameRecommendationIntegrationState({
      game,
      anonymousPlayerId: "shared-reader",
      gameSessionId: `${game}-session`,
    }),
  );
}

test("realistic cross-game evidence stays distinct and shared history suppresses shown and familiar books", async () => {
  const bookshopSignals = adaptLastBookshopEncounterToSignals({
    selectedWorkIds: ["astral", "tea", "horror"],
    predictedWorkId: "astral",
    pitchCharm: "world",
    works: [
      { id: "astral", title: "Astral Atlas", tags: ["space", "mystery", "quiet"] },
      { id: "tea", title: "Tea Road", tags: ["cozy", "adventure", "found-family"] },
      { id: "horror", title: "Winter Museum", tags: ["horror", "tense", "dark"] },
    ],
  });
  const mapSignals = [
    ["fair", { id: "stage", label: "Take the stage", tags: ["performative", "playful"], tasteVector: { social_energy: 2, humor: 1 } }],
    ["bridge", { id: "rope", label: "Cross by rope", tags: ["adventure", "bold"], tasteVector: { intensity: 2, pace: 1 } }],
    ["marsh", { id: "stars", label: "Step onto stars", tags: ["surreal", "cosmic"], tasteVector: { imagination: 2, novelty: 2 } }],
    ["library", { id: "listen", label: "Listen to a book", tags: ["poignant", "intimate"], tasteVector: { emotional_depth: 2, pace: -1 } }],
  ].map(([scenarioId, option]) => adaptUnwrittenMapChoiceToSignal({
    scenarioId: scenarioId as string,
    option: option as Parameters<typeof adaptUnwrittenMapChoiceToSignal>[0]["option"],
  }));
  const cascadeSignals = [
    adaptAlchemistsCascadeCatalystToSignal({
      id: "hearth-song",
      title: "Sing to the flame",
      tags: ["bold", "playful", "kinetic"],
      tasteVector: { intensity: 2, pace: 1, humor: 1 },
    }),
    adaptAlchemistsCascadeCatalystToSignal({
      id: "lunar-proof",
      title: "Follow the old notation",
      tags: ["ordered", "familiar", "reflective"],
      tasteVector: { structure: 2, novelty: -1, emotional_depth: 1 },
    }),
    adaptAlchemistsCascadeCatalystToSignal({
      id: "wild-distillation",
      title: "Invite the impossible",
      tags: ["surreal", "unfamiliar", "wandering"],
      tasteVector: { imagination: 2, novelty: 2, structure: -1 },
    }),
  ];

  const profiles = [bookshopSignals, mapSignals, cascadeSignals].map((signals) => {
    const profile = buildTasteProfile({ ageBand: "teens", signals });
    return JSON.stringify({
      genres: profile.genreFamily,
      tones: profile.tone,
      themes: profile.themes,
      pacing: profile.pacing,
      characters: profile.characterDynamics,
    });
  });
  assert.equal(new Set(profiles).size, 3);

  let history = recordGameRecommendationFamiliarBook(
    createGameRecommendationHistory({
      anonymousPlayerId: "shared-reader",
      libraryId: "central",
      ageBand: "teens",
    }),
    "familiar-book:author-f",
  );

  const flows = [
    {
      game: "the_last_bookshop" as const,
      state: stateWithSignals("the_last_bookshop", bookshopSignals.map((signal) => [signal])),
      milestone: lastBookshopMilestone(3, 0),
      expected: "Book A",
    },
    {
      game: "unwritten_map" as const,
      state: stateWithSignals("unwritten_map", mapSignals.map((signal) => [signal])),
      milestone: unwrittenMapMilestone(4, 0),
      expected: "Book B",
    },
    {
      game: "alchemists_cascade" as const,
      state: stateWithSignals("alchemists_cascade", cascadeSignals.map((signal) => [signal])),
      milestone: alchemistsCascadeMilestone(3, 0),
      expected: "Book C",
    },
  ];

  for (const flow of flows) {
    const synchronized = synchronizeGameRecommendationHistory(history, flow.state);
    const outcome = await attemptGameRecommendationMilestone({
      state: synchronized.state,
      milestone: flow.milestone,
      evidenceMode: flow.game === "the_last_bookshop" ? "cross_media" : "semantic_only",
      ageBand: "teens",
      enabledSources: { googleBooks: true, openLibrary: true },
      library: { libraryId: "central", localCollectionOnly: false },
      runRecommender: runner,
    });
    assert.equal(outcome.status, "shown");
    if (outcome.status !== "shown") return;
    assert.equal(outcome.book.title, flow.expected);
    ({ history } = synchronizeGameRecommendationHistory(history, clearPendingReward(outcome.state)));
  }

  assert.deepEqual(history.shownBookIdentityIds, [
    "book-a:author-a",
    "book-b:author-b",
    "book-c:author-c",
  ]);
  assert.deepEqual(history.familiarBookIdentityIds, ["familiar-book:author-f"]);
});

