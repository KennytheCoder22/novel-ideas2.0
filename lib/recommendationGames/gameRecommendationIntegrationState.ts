// Shared per-game-session integration state for the game-recommendation-milestone loop. This is
// the durable bridge between each game's native evidence and the shared reward engine: it
// deduplicates adapted signals by native evidence id, tracks which book identities have already
// been shown (so no book repeats) and which are merely familiar via "already_read" (so an
// already-read book never repeats either), and tracks which milestones have already produced a
// successful reward plus the evidence count of the most recent failed generation attempt (so a
// retry only happens at a later, still-eligible meaningful evidence count). Raw native evidence
// itself is never mutated or duplicated here - only derived `SwipeSignalV2` signals are stored.
import type { AgeBandV2, SwipeSignalV2 } from "../../app/recommender-v2";
import {
  RECOMMENDATION_GAME_IDS,
  type GameRecommendationBookIdentity,
  type GameRecommendationEvidenceMode,
  type GameRecommendationEvidenceSnapshot,
  type RecommendationGameId,
} from "./gameRecommendationFeedback";
import {
  isGameRecommendationDescriptionProvenance,
  type GameRecommendationDescriptionProvenance,
} from "./gameRecommendationDescription";

export const GAME_RECOMMENDATION_INTEGRATION_STATE_SCHEMA = "game_recommendation_integration_state_v1" as const;

export type PersistedGameRecommendationReward = {
  cadence: "first" | "later";
  gameSessionId: string;
  ageBand: AgeBandV2;
  library: { libraryId: string; localCollectionOnly: boolean };
  book: GameRecommendationBookIdentity;
  coverUrl: string;
  description?: string;
  descriptionProvenance?: GameRecommendationDescriptionProvenance;
  milestoneId: string;
  milestoneIndex: number;
  evidenceCount: number;
  evidenceMode: GameRecommendationEvidenceMode;
  evidenceSnapshot: GameRecommendationEvidenceSnapshot;
  matchedSignals: string[];
  shownAt: string;
};

export type GameRecommendationIntegrationStateV1 = {
  schemaVersion: typeof GAME_RECOMMENDATION_INTEGRATION_STATE_SCHEMA;
  game: RecommendationGameId;
  anonymousPlayerId: string;
  gameSessionId: string;
  adaptedSignals: SwipeSignalV2[];
  nativeEvidence: { id: string; signals: SwipeSignalV2[] }[];
  dedupedNativeEvidenceIds: string[];
  shownBookIdentityIds: string[];
  familiarBookIdentityIds: string[];
  triggeredMilestoneIds: string[];
  lastMilestoneEvidenceCount: number;
  lastFailedAttemptEvidenceCount: number | null;
  pendingReward: PersistedGameRecommendationReward | null;
};

export function createInitialGameRecommendationIntegrationState(args: {
  game: RecommendationGameId;
  anonymousPlayerId: string;
  gameSessionId: string;
}): GameRecommendationIntegrationStateV1 {
  return {
    schemaVersion: GAME_RECOMMENDATION_INTEGRATION_STATE_SCHEMA,
    game: args.game,
    anonymousPlayerId: args.anonymousPlayerId,
    gameSessionId: args.gameSessionId,
    adaptedSignals: [],
    nativeEvidence: [],
    dedupedNativeEvidenceIds: [],
    shownBookIdentityIds: [],
    familiarBookIdentityIds: [],
    triggeredMilestoneIds: [],
    lastMilestoneEvidenceCount: 0,
    lastFailedAttemptEvidenceCount: null,
    pendingReward: null,
  };
}

/** Merges newly adapted signals for one native evidence id (e.g. a round/encounter/choice/level
 * event id). If that native evidence id has already been merged, the state is returned unchanged
 * so the same gameplay moment can never be double-counted as evidence. */
export function mergeNativeEvidence(
  state: GameRecommendationIntegrationStateV1,
  nativeEvidenceId: string,
  signals: readonly SwipeSignalV2[],
): GameRecommendationIntegrationStateV1 {
  if (state.dedupedNativeEvidenceIds.includes(nativeEvidenceId)) return state;
  return {
    ...state,
    adaptedSignals: [...state.adaptedSignals, ...signals],
    nativeEvidence: [...state.nativeEvidence, { id: nativeEvidenceId, signals: [...signals] }],
    dedupedNativeEvidenceIds: [...state.dedupedNativeEvidenceIds, nativeEvidenceId],
  };
}

/** Removes only the derived recommendation signals for an undone native game event. The game's
 * own raw evidence remains authoritative and is not mutated here. */
export function retractNativeEvidence(
  state: GameRecommendationIntegrationStateV1,
  nativeEvidenceId: string,
): GameRecommendationIntegrationStateV1 {
  if (!state.dedupedNativeEvidenceIds.includes(nativeEvidenceId)) return state;
  const nativeEvidence = state.nativeEvidence.filter((entry) => entry.id !== nativeEvidenceId);
  return {
    ...state,
    nativeEvidence,
    adaptedSignals: nativeEvidence.flatMap((entry) => entry.signals),
    dedupedNativeEvidenceIds: state.dedupedNativeEvidenceIds.filter((id) => id !== nativeEvidenceId),
  };
}

export function clearPendingReward(
  state: GameRecommendationIntegrationStateV1,
): GameRecommendationIntegrationStateV1 {
  return state.pendingReward ? { ...state, pendingReward: null } : state;
}

/** Starts a fresh gameplay progression while retaining the player's cross-session shown/familiar
 * history, so campaign resets earn milestones again without resurfacing known books. */
export function resetGameRecommendationSession(
  state: GameRecommendationIntegrationStateV1,
  gameSessionId: string,
): GameRecommendationIntegrationStateV1 {
  return {
    ...createInitialGameRecommendationIntegrationState({
      game: state.game,
      anonymousPlayerId: state.anonymousPlayerId,
      gameSessionId,
    }),
    shownBookIdentityIds: state.shownBookIdentityIds,
    familiarBookIdentityIds: state.familiarBookIdentityIds,
  };
}

export function isBookAlreadySeen(state: GameRecommendationIntegrationStateV1, bookIdentityId: string): boolean {
  return state.shownBookIdentityIds.includes(bookIdentityId) || state.familiarBookIdentityIds.includes(bookIdentityId);
}

export function recordShownBook(
  state: GameRecommendationIntegrationStateV1,
  bookIdentityId: string,
): GameRecommendationIntegrationStateV1 {
  if (state.shownBookIdentityIds.includes(bookIdentityId)) return state;
  return { ...state, shownBookIdentityIds: [...state.shownBookIdentityIds, bookIdentityId] };
}

/** already_read is familiarity only. Recording it here only ever prevents that book from being
 * shown again - it must never feed into taste scoring. */
export function recordFamiliarBook(
  state: GameRecommendationIntegrationStateV1,
  bookIdentityId: string,
): GameRecommendationIntegrationStateV1 {
  if (state.familiarBookIdentityIds.includes(bookIdentityId)) return state;
  return { ...state, familiarBookIdentityIds: [...state.familiarBookIdentityIds, bookIdentityId] };
}

export function recordMilestoneSucceeded(
  state: GameRecommendationIntegrationStateV1,
  milestoneId: string,
  evidenceCount: number,
): GameRecommendationIntegrationStateV1 {
  return {
    ...state,
    triggeredMilestoneIds: state.triggeredMilestoneIds.includes(milestoneId)
      ? state.triggeredMilestoneIds
      : [...state.triggeredMilestoneIds, milestoneId],
    lastMilestoneEvidenceCount: Math.max(state.lastMilestoneEvidenceCount, evidenceCount),
    lastFailedAttemptEvidenceCount: null,
  };
}

export function recordFailedAttempt(
  state: GameRecommendationIntegrationStateV1,
  evidenceCount: number,
): GameRecommendationIntegrationStateV1 {
  return { ...state, lastFailedAttemptEvidenceCount: evidenceCount };
}

/** A milestone may attempt generation only if it has not already succeeded, and either no prior
 * attempt failed or this attempt's evidence count is strictly greater than the evidence count of
 * the last failure (i.e. it is a later eligible meaningful evidence count). */
export function isMilestoneEligibleForAttempt(
  state: GameRecommendationIntegrationStateV1,
  milestoneId: string,
  evidenceCount: number,
): boolean {
  if (state.triggeredMilestoneIds.includes(milestoneId)) return false;
  if (state.lastFailedAttemptEvidenceCount === null) return true;
  return evidenceCount > state.lastFailedAttemptEvidenceCount;
}

/** Replaces only the session identifier on an existing state, preserving every accumulated field
 * (shown/familiar identities, triggered milestones, adapted signals, dedupe). Some games mint a
 * fresh in-memory `gameSessionId` on every app launch even though their own progress persists
 * across launches (e.g. The Last Bookshop); callers must rehydrate persisted integration state
 * with the *current* session id so freshly emitted feedback events reference the session the
 * player is actually in, without losing the durable history keyed by player+library. */
export function withCurrentGameSessionId(
  state: GameRecommendationIntegrationStateV1,
  gameSessionId: string,
): GameRecommendationIntegrationStateV1 {
  return state.gameSessionId === gameSessionId ? state : { ...state, gameSessionId };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPendingReward(value: unknown): value is PersistedGameRecommendationReward | null {
  if (value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const reward = value as Partial<PersistedGameRecommendationReward>;
  return (reward.cadence === "first" || reward.cadence === "later")
    && typeof reward.gameSessionId === "string"
    && ["kids", "preteens", "teens", "adult"].includes(String(reward.ageBand))
    && Boolean(reward.library && typeof reward.library === "object"
      && typeof reward.library.libraryId === "string"
      && typeof reward.library.localCollectionOnly === "boolean")
    && Boolean(reward.book && typeof reward.book === "object")
    && typeof reward.coverUrl === "string"
    && (reward.description === undefined || typeof reward.description === "string")
    && (reward.descriptionProvenance === undefined
      || isGameRecommendationDescriptionProvenance(reward.descriptionProvenance))
    && typeof reward.milestoneId === "string"
    && Number.isInteger(reward.milestoneIndex) && Number(reward.milestoneIndex) > 0
    && Number.isInteger(reward.evidenceCount) && Number(reward.evidenceCount) >= 0
    && (reward.evidenceMode === "cross_media" || reward.evidenceMode === "semantic_only")
    && Boolean(reward.evidenceSnapshot && typeof reward.evidenceSnapshot === "object")
    && isStringArray(reward.matchedSignals)
    && typeof reward.shownAt === "string";
}

/** Best-effort restore for persisted integration state: any structural mismatch, a schema/game/
 * player mismatch, or a corrupt array simply yields a fresh initial state rather than throwing, so
 * a storage read failure or format change can never block play - it only means shown/familiar
 * history and milestone progress reset. */
export function restoreGameRecommendationIntegrationState(
  raw: string | null,
  expected: { game: RecommendationGameId; anonymousPlayerId: string; gameSessionId: string },
): GameRecommendationIntegrationStateV1 {
  const fallback = () => createInitialGameRecommendationIntegrationState(expected);
  if (!raw) return fallback();
  try {
    const value = JSON.parse(raw) as Partial<GameRecommendationIntegrationStateV1>;
    if (
      value.schemaVersion !== GAME_RECOMMENDATION_INTEGRATION_STATE_SCHEMA
      || !RECOMMENDATION_GAME_IDS.includes(value.game as RecommendationGameId)
      || value.game !== expected.game
      || typeof value.anonymousPlayerId !== "string" || value.anonymousPlayerId !== expected.anonymousPlayerId
      || typeof value.gameSessionId !== "string"
      || !Array.isArray(value.adaptedSignals)
      || !Array.isArray(value.nativeEvidence)
      || !value.nativeEvidence.every((entry) => entry && typeof entry === "object"
        && typeof (entry as { id?: unknown }).id === "string"
        && Array.isArray((entry as { signals?: unknown }).signals))
      || !isStringArray(value.dedupedNativeEvidenceIds)
      || !isStringArray(value.shownBookIdentityIds)
      || !isStringArray(value.familiarBookIdentityIds)
      || !isStringArray(value.triggeredMilestoneIds)
      || !Number.isFinite(value.lastMilestoneEvidenceCount)
      || (value.lastFailedAttemptEvidenceCount !== null && !Number.isFinite(value.lastFailedAttemptEvidenceCount))
      || !isPendingReward(value.pendingReward)
    ) return fallback();
    return withCurrentGameSessionId(
      {
        schemaVersion: GAME_RECOMMENDATION_INTEGRATION_STATE_SCHEMA,
        game: value.game,
        anonymousPlayerId: value.anonymousPlayerId,
        gameSessionId: value.gameSessionId,
        adaptedSignals: value.adaptedSignals as SwipeSignalV2[],
        nativeEvidence: value.nativeEvidence as { id: string; signals: SwipeSignalV2[] }[],
        dedupedNativeEvidenceIds: value.dedupedNativeEvidenceIds,
        shownBookIdentityIds: value.shownBookIdentityIds,
        familiarBookIdentityIds: value.familiarBookIdentityIds,
        triggeredMilestoneIds: value.triggeredMilestoneIds,
        lastMilestoneEvidenceCount: Number(value.lastMilestoneEvidenceCount),
        lastFailedAttemptEvidenceCount: value.lastFailedAttemptEvidenceCount === null
          ? null
          : Number(value.lastFailedAttemptEvidenceCount),
        pendingReward: value.pendingReward,
      },
      expected.gameSessionId,
    );
  } catch {
    return fallback();
  }
}
