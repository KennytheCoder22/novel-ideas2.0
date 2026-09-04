// Pure orchestration for one milestone-triggered recommendation attempt. This module never talks
// to storage or the network directly - callers inject `runRecommender` (in production, the real
// `runRecommenderV2` from `app/recommender-v2`) and persist the returned state/diagnostic
// themselves. Keeping this pure is what makes deterministic play -> milestone -> reward tests
// possible without a real recommender call.
import type { AgeBandV2, CandidateFormatV2, SourceIdV2, SwipeSignalV2 } from "../../app/recommender-v2";
import type { MilestoneEvaluation } from "./gameRecommendationMilestones";
import {
  isMilestoneEligibleForAttempt,
  recordFailedAttempt,
  recordMilestoneSucceeded,
  recordShownBook,
  type GameRecommendationIntegrationStateV1,
} from "./gameRecommendationIntegrationState";
import {
  createGameRecommendationDiagnosticEvent,
  type GameRecommendationDiagnosticEventV1,
} from "./gameRecommendationDiagnostics";
import type {
  GameRecommendationBookIdentity,
  GameRecommendationEvidenceMode,
  GameRecommendationEvidenceSnapshot,
} from "./gameRecommendationFeedback";

export const GAME_RECOMMENDATION_EVIDENCE_SNAPSHOT_VERSION = "v1";

export type GameRecommendationCandidateLike = {
  id: string;
  source: string;
  sourceId?: string | null;
  title: string;
  creators: readonly string[];
  coverUrl?: string | null;
  format?: CandidateFormatV2;
  matchedSignals?: readonly string[];
};

export type GameRecommendationRunResult = {
  items: readonly GameRecommendationCandidateLike[];
};

export type RunGameRecommender = (session: {
  ageBand: AgeBandV2;
  signals: SwipeSignalV2[];
  limit?: number;
  enabledSources?: Partial<Record<SourceIdV2, boolean>>;
  diversitySeed?: string;
  localLibraryCurationTrusted?: boolean;
}) => Promise<GameRecommendationRunResult>;

export type GameRecommendationEngineOutcome =
  | {
      status: "shown";
      state: GameRecommendationIntegrationStateV1;
      book: GameRecommendationBookIdentity;
      // Presentation-only: never part of the durable `game_recommendation_feedback_v1` contract.
      coverUrl: string | null;
      milestoneId: string;
      milestoneIndex: number;
      evidenceCount: number;
      evidenceMode: GameRecommendationEvidenceMode;
      evidenceSnapshot: GameRecommendationEvidenceSnapshot;
      matchedSignals: string[];
      cadence: "first" | "later";
      shownAt: string;
    }
  | { status: "empty" | "error"; state: GameRecommendationIntegrationStateV1; diagnostic: GameRecommendationDiagnosticEventV1 }
  | { status: "not_eligible"; state: GameRecommendationIntegrationStateV1 };

function canonicalBookIdentity(candidate: GameRecommendationCandidateLike): string {
  const title = candidate.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const author = (candidate.creators[0] || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${title}:${author || "unknown-author"}`.slice(0, 400);
}

function bookIdentityFromCandidate(candidate: GameRecommendationCandidateLike, rank: number): GameRecommendationBookIdentity {
  return {
    id: canonicalBookIdentity(candidate),
    source: candidate.source,
    sourceId: candidate.sourceId || null,
    title: candidate.title,
    author: candidate.creators[0] || "",
    rank,
  };
}

export function createGameRecommendationEvidenceSnapshot(
  signals: readonly SwipeSignalV2[],
): GameRecommendationEvidenceSnapshot {
  const semanticTags = new Set<string>();
  const sources = new Set<string>();
  for (const signal of signals) {
    if (signal.source) sources.add(signal.source);
    [...(signal.tags || []), ...(signal.genres || []), ...(signal.tones || []), ...(signal.themes || [])]
      .forEach((tag) => {
        const normalized = String(tag || "").trim().toLowerCase();
        if (normalized && semanticTags.size < 40) semanticTags.add(normalized.slice(0, 120));
      });
  }
  return {
    signalCount: signals.length,
    positiveSignalCount: signals.filter((signal) => signal.action === "like").length,
    negativeSignalCount: signals.filter((signal) => signal.action === "dislike").length,
    sources: [...sources].slice(0, 20),
    semanticTags: [...semanticTags],
  };
}

/** Attempts to satisfy an already-evaluated milestone. Generation failures (a thrown error or an
 * exhausted candidate list, e.g. every returned book was already shown or already read) never
 * throw: they are reported as a diagnostic event plus an updated state recording the failed
 * attempt's evidence count, so the caller can render nothing this time and retry only once a
 * later meaningful evidence count reaches eligibility again. */
export async function attemptGameRecommendationMilestone(args: {
  state: GameRecommendationIntegrationStateV1;
  milestone: MilestoneEvaluation | null;
  evidenceMode: GameRecommendationEvidenceMode;
  ageBand: AgeBandV2;
  enabledSources: Partial<Record<SourceIdV2, boolean>>;
  library?: { libraryId: string; localCollectionOnly: boolean };
  localLibraryCurationTrusted?: boolean;
  runRecommender: RunGameRecommender;
  now?: () => string;
}): Promise<GameRecommendationEngineOutcome> {
  const { state, milestone } = args;
  if (!milestone) return { status: "not_eligible", state };
  if (state.pendingReward) return { status: "not_eligible", state };
  if (!isMilestoneEligibleForAttempt(state, milestone.milestoneId, milestone.evidenceCount)) {
    return { status: "not_eligible", state };
  }
  const now = args.now || (() => new Date().toISOString());

  let result: GameRecommendationRunResult;
  try {
    result = await args.runRecommender({
      ageBand: args.ageBand,
      signals: state.adaptedSignals,
      limit: 10,
      enabledSources: args.enabledSources,
      diversitySeed: `${state.game}:${state.gameSessionId}:${milestone.milestoneId}`,
      localLibraryCurationTrusted: args.localLibraryCurationTrusted,
    });
  } catch (error) {
    const diagnostic = createGameRecommendationDiagnosticEvent({
      game: state.game,
      anonymousPlayerId: state.anonymousPlayerId,
      gameSessionId: state.gameSessionId,
      milestoneId: milestone.milestoneId,
      milestoneIndex: milestone.milestoneIndex,
      evidenceCount: milestone.evidenceCount,
      reason: "recommender_threw",
      detail: error instanceof Error ? error.message : String(error),
    });
    return { status: "error", state: recordFailedAttempt(state, milestone.evidenceCount), diagnostic };
  }

  const excluded = new Set([...state.shownBookIdentityIds, ...state.familiarBookIdentityIds]);
  const pickedIndex = result.items.findIndex((candidate) => {
    const isBookFormat = !candidate.format || candidate.format !== "anime";
    return isBookFormat && Boolean(candidate.coverUrl) && !excluded.has(canonicalBookIdentity(candidate));
  });
  if (pickedIndex === -1) {
    const diagnostic = createGameRecommendationDiagnosticEvent({
      game: state.game,
      anonymousPlayerId: state.anonymousPlayerId,
      gameSessionId: state.gameSessionId,
      milestoneId: milestone.milestoneId,
      milestoneIndex: milestone.milestoneIndex,
      evidenceCount: milestone.evidenceCount,
      reason: "empty_result",
      detail: `${result.items.length} candidates returned; none was an unseen book with production cover art`,
    });
    return { status: "empty", state: recordFailedAttempt(state, milestone.evidenceCount), diagnostic };
  }

  const candidate = result.items[pickedIndex];
  const book = bookIdentityFromCandidate(candidate, pickedIndex + 1);
  const cadence: "first" | "later" = state.triggeredMilestoneIds.length === 0 ? "first" : "later";
  const shownAt = now();
  const evidenceSnapshot = createGameRecommendationEvidenceSnapshot(state.adaptedSignals);
  const matchedSignals = [...(candidate.matchedSignals || [])];
  const nextState = {
    ...recordShownBook(
      recordMilestoneSucceeded(state, milestone.milestoneId, milestone.evidenceCount),
      book.id,
    ),
    pendingReward: {
      cadence,
      gameSessionId: state.gameSessionId,
      ageBand: args.ageBand,
      library: args.library || { libraryId: "default", localCollectionOnly: false },
      book,
      coverUrl: candidate.coverUrl || "",
      milestoneId: milestone.milestoneId,
      milestoneIndex: milestone.milestoneIndex,
      evidenceCount: milestone.evidenceCount,
      evidenceMode: args.evidenceMode,
      evidenceSnapshot,
      matchedSignals,
      shownAt,
    },
  };
  return {
    status: "shown",
    state: nextState,
    book,
    coverUrl: candidate.coverUrl || null,
    milestoneId: milestone.milestoneId,
    milestoneIndex: milestone.milestoneIndex,
    evidenceCount: milestone.evidenceCount,
    evidenceMode: args.evidenceMode,
    evidenceSnapshot,
    matchedSignals,
    cadence,
    shownAt,
  };
}
