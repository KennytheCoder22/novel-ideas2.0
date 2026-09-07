import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseMediaManiaCandidate,
  createMediaManiaState,
  markMediaManiaCandidateUnknown,
  recordMediaManiaSessionContinued,
  resolveMediaManiaUnlock,
  restoreMediaManiaState,
  startMediaMania,
  undoLastMediaManiaChoice,
  type MediaManiaState,
} from "./mediaManiaCore.mjs";
import { MEDIA_MANIA_CATALOG } from "./mediaManiaCatalog";
import {
  processGameRecommendationEvidence,
  type GameRecommendationEngineOutcome,
  type RunGameRecommender,
} from "../../../lib/recommendationGames/gameRecommendationEngine";
import { adaptMediaManiaEvidenceToSignals } from "../../../lib/recommendationGames/gameRecommendationEvidenceAdapters";
import {
  clearPendingReward,
  createInitialGameRecommendationIntegrationState,
  retractNativeEvidence,
  restoreGameRecommendationIntegrationState,
  type GameRecommendationIntegrationStateV1,
} from "../../../lib/recommendationGames/gameRecommendationIntegrationState";
import { mediaManiaMilestone } from "../../../lib/recommendationGames/gameRecommendationMilestones";

const fixedRandom = () => 0.17;

function recommendationRunner(): RunGameRecommender {
  let call = 0;
  return async () => {
    call += 1;
    return {
      items: [{
        id: `openLibrary:/works/OL${call}W`,
        source: "openLibrary",
        sourceId: `/works/OL${call}W`,
        title: `Milestone Book ${call}`,
        creators: ["A. Author"],
        formats: ["book"],
        raw: { cover_i: 6_000_000 + call },
        matchedSignals: ["adventure"],
      }],
    };
  };
}

function freshGame() {
  const created = createMediaManiaState({
    playerId: "integration-player",
    sessionId: "integration-session",
    libraryId: "default",
    ageBand: "teens",
    nowMs: 1_000,
  });
  return startMediaMania(created, "books", MEDIA_MANIA_CATALOG, { random: fixedRandom, nowMs: 1_001 }).state;
}

async function completeRound(args: {
  game: MediaManiaState;
  integration: GameRecommendationIntegrationStateV1;
  runRecommender: RunGameRecommender;
}): Promise<{
  game: MediaManiaState;
  integration: GameRecommendationIntegrationStateV1;
  outcome: GameRecommendationEngineOutcome;
  nativeEvidenceId: string;
  roundWasCrossMedia: boolean;
  roundType: "LIKE" | "DISLIKE";
}> {
  const round = args.game.currentRound;
  assert.ok(round, "the harness requires an active Media Mania round");
  const selectedId = round.candidates[0].id;
  const result = chooseMediaManiaCandidate(args.game, selectedId, MEDIA_MANIA_CATALOG, {
    random: fixedRandom,
    nowMs: 2_000 + args.game.completedRoundCount,
  });
  const completed = result.events.find((event) => event.action === "round_completed");
  assert.ok(completed?.eventId, "a real completed round must emit native evidence");
  const outcome = await processGameRecommendationEvidence({
    state: args.integration,
    nativeEvidenceId: String(completed.eventId),
    signals: adaptMediaManiaEvidenceToSignals({
      newPositiveItemIds: round.roundType === "LIKE" ? [selectedId] : [],
      newNegativeItemIds: round.roundType === "DISLIKE" ? [selectedId] : [],
      catalog: MEDIA_MANIA_CATALOG,
    }),
    evaluateMilestone: (lastMilestoneEvidenceCount) => (
      mediaManiaMilestone(result.state.completedRoundCount, lastMilestoneEvidenceCount)
    ),
    evidenceMode: "cross_media",
    ageBand: "teens",
    enabledSources: { openLibrary: true },
    library: { libraryId: "default", localCollectionOnly: false },
    runRecommender: args.runRecommender,
  });
  return {
    game: result.state,
    integration: outcome.state,
    outcome,
    nativeEvidenceId: String(completed.eventId),
    roundWasCrossMedia: round.isCrossMedia,
    roundType: round.roundType,
  };
}

function continueAfterReward(state: GameRecommendationIntegrationStateV1) {
  return clearPendingReward(state);
}

test("fresh play shows rewards at six and twelve meaningful rounds, including dislike and cross-media rounds", async () => {
  let game = freshGame();
  let integration = createInitialGameRecommendationIntegrationState({
    game: "media_mania",
    anonymousPlayerId: game.playerId,
    gameSessionId: game.sessionId,
  });
  const runRecommender = recommendationRunner();
  const roundTypes = new Set<string>();
  let sawCrossMedia = false;

  for (let count = 1; count <= 12; count += 1) {
    const completed = await completeRound({ game, integration, runRecommender });
    game = completed.game;
    integration = completed.integration;
    roundTypes.add(completed.roundType);
    sawCrossMedia ||= completed.roundWasCrossMedia;

    if (count === 6 || count === 12) {
      assert.equal(completed.outcome.status, "shown");
      assert.ok(integration.pendingReward, `reward must be render-eligible at ${count} meaningful rounds`);
      assert.match(integration.pendingReward?.coverUrl || "", /^https:\/\/covers\.openlibrary\.org\/b\/id\//);
      integration = continueAfterReward(integration);
    } else {
      assert.equal(completed.outcome.status, "not_eligible");
    }

    if (game.unlockStatus === "offered") {
      game = resolveMediaManiaUnlock(
        game,
        game.unlockOptions[0],
        MEDIA_MANIA_CATALOG,
        { random: fixedRandom, nowMs: 3_000 + count },
      ).state;
    }
  }

  assert.deepEqual([...roundTypes].sort(), ["DISLIKE", "LIKE"]);
  assert.equal(sawCrossMedia, true);
  assert.equal(game.completedRoundCount, 12);
  assert.deepEqual(integration.triggeredMilestoneIds, ["media_mania:1", "media_mania:2"]);
});

test("unknown replacement and undo preserve the exact meaningful-round count and eligibility", async () => {
  let game = freshGame();
  let integration = createInitialGameRecommendationIntegrationState({
    game: "media_mania",
    anonymousPlayerId: game.playerId,
    gameSessionId: game.sessionId,
  });
  const runRecommender = recommendationRunner();
  const beforeUnknown = game.completedRoundCount;
  game = markMediaManiaCandidateUnknown(
    game,
    game.currentRound!.candidates[0].id,
    MEDIA_MANIA_CATALOG,
    { random: fixedRandom, nowMs: 1_500 },
  ).state;
  assert.equal(game.completedRoundCount, beforeUnknown);

  const first = await completeRound({ game, integration, runRecommender });
  game = first.game;
  integration = first.integration;
  assert.equal(game.completedRoundCount, 1);
  game = undoLastMediaManiaChoice(game, { nowMs: 1_600 }).state;
  integration = retractNativeEvidence(integration, first.nativeEvidenceId);
  assert.equal(game.completedRoundCount, 0);
  assert.equal(integration.adaptedSignals.length, 0);

  for (let count = 1; count <= 6; count += 1) {
    const completed = await completeRound({ game, integration, runRecommender });
    game = completed.game;
    integration = completed.integration;
    if (game.unlockStatus === "offered" && count < 6) {
      game = resolveMediaManiaUnlock(game, null, MEDIA_MANIA_CATALOG, { random: fixedRandom }).state;
    }
  }
  assert.equal(game.completedRoundCount, 6);
  assert.ok(integration.pendingReward);
});

test("a resumed game eventually reaches its next reward milestone", async () => {
  let game = freshGame();
  let integration = createInitialGameRecommendationIntegrationState({
    game: "media_mania",
    anonymousPlayerId: game.playerId,
    gameSessionId: game.sessionId,
  });
  const runRecommender = recommendationRunner();
  for (let count = 1; count <= 4; count += 1) {
    const completed = await completeRound({ game, integration, runRecommender });
    game = completed.game;
    integration = completed.integration;
  }

  game = recordMediaManiaSessionContinued(
    restoreMediaManiaState(JSON.parse(JSON.stringify(game)))!,
    { nowMs: 5_000 },
  ).state;
  integration = restoreGameRecommendationIntegrationState(JSON.stringify(integration), {
    game: "media_mania",
    anonymousPlayerId: game.playerId,
    gameSessionId: game.sessionId,
  });

  for (let count = 5; count <= 6; count += 1) {
    const completed = await completeRound({ game, integration, runRecommender });
    game = completed.game;
    integration = completed.integration;
  }
  assert.equal(game.completedRoundCount, 6);
  assert.ok(integration.pendingReward);
});

test("a failed generation is not consumed and retries at the next valid six-round milestone", async () => {
  let game = freshGame();
  let integration = createInitialGameRecommendationIntegrationState({
    game: "media_mania",
    anonymousPlayerId: game.playerId,
    gameSessionId: game.sessionId,
  });
  let attempts = 0;
  const runRecommender: RunGameRecommender = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("simulated_preview_failure");
    return recommendationRunner()({
      ageBand: "teens",
      signals: [],
      enabledSources: { openLibrary: true },
    });
  };

  for (let count = 1; count <= 12; count += 1) {
    const completed = await completeRound({ game, integration, runRecommender });
    game = completed.game;
    integration = completed.integration;
    if (count === 6) {
      assert.equal(completed.outcome.status, "error");
      assert.deepEqual(integration.triggeredMilestoneIds, []);
    }
    if (game.unlockStatus === "offered") {
      game = resolveMediaManiaUnlock(game, null, MEDIA_MANIA_CATALOG, { random: fixedRandom }).state;
    }
  }

  assert.equal(attempts, 2);
  assert.ok(integration.pendingReward);
  assert.deepEqual(integration.triggeredMilestoneIds, ["media_mania:2"]);
});
