// Pure orchestration for one milestone-triggered recommendation attempt. This module never talks
// to storage or the network directly - callers inject `runRecommender` (in production, the real
// `runRecommenderV2` from `app/recommender-v2`) and persist the returned state/diagnostic
// themselves. Keeping this pure is what makes deterministic play -> milestone -> reward tests
// possible without a real recommender call.
import type { AgeBandV2, CandidateFormatV2, SourceIdV2, SwipeSignalV2 } from "../../app/recommender-v2";
import type { MilestoneEvaluation } from "./gameRecommendationMilestones";
import {
  isMilestoneEligibleForAttempt,
  mergeNativeEvidence,
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
import { gameRecommendationDescription } from "./gameRecommendationDescription";

type LibraryScope = { libraryId: string; localCollectionOnly: boolean };

function scopedSources(enabledSources: Partial<Record<SourceIdV2, boolean>>, library?: LibraryScope) {
  if (!library?.localCollectionOnly && !enabledSources.localLibrary) return enabledSources;
  return { mock: false, googleBooks: false, openLibrary: false, kitsu: false, comicVine: false, nyt: false, localLibrary: true };
}

export const GAME_RECOMMENDATION_EVIDENCE_SNAPSHOT_VERSION = "v1";

export type GameRecommendationCandidateLike = {
  id: string;
  source: string;
  sourceId?: string | null;
  title: string;
  creators: readonly string[];
  coverUrl?: string | null;
  description?: string | null;
  displayDescription?: string | null;
  format?: CandidateFormatV2;
  formats?: readonly CandidateFormatV2[];
  matchedSignals?: readonly string[];
  raw?: unknown;
};

export type GameRecommendationRunResult = {
  items: readonly GameRecommendationCandidateLike[];
};

export type RunGameRecommender = (session: {
  ageBand: AgeBandV2;
  libraryId?: string;
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
      description: string | null;
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

export type PreparedGameRecommendationEvidence = {
  state: GameRecommendationIntegrationStateV1;
  milestone: MilestoneEvaluation | null;
};

export function canonicalBookIdentity(candidate: GameRecommendationCandidateLike): string {
  const slug = (value: string) => value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  const title = slug(candidate.title) || `${slug(candidate.source)}-${slug(candidate.sourceId || candidate.id)}`;
  const author = slug(candidate.creators[0] || "");
  return `${title}:${author || "unknown-author"}`.slice(0, 400);
}

export function bookIdentityFromCandidate(candidate: GameRecommendationCandidateLike, rank: number): GameRecommendationBookIdentity {
  return {
    id: canonicalBookIdentity(candidate),
    source: candidate.source,
    sourceId: candidate.sourceId || null,
    title: candidate.title,
    author: candidate.creators[0] || "",
    rank,
  };
}

export type GameRecommendationSlateItem = {
  book: GameRecommendationBookIdentity;
  coverUrl: string | null;
  description: string | null;
  matchedSignals: string[];
  position: "strongest" | "strong" | "adventurous";
};

export type GameRecommendationSlateOutcome =
  | { status: "shown"; state: GameRecommendationIntegrationStateV1; items: GameRecommendationSlateItem[]; shownAt: string }
  | { status: "empty" | "error"; state: GameRecommendationIntegrationStateV1; error: string };

/** Generates a compact final slate through the same production recommender and identity/history
 * rules as milestone rewards. The adventurous slot comes from deeper in the still-compatible
 * production ranking; it is never synthesized or sourced from a toy catalog. */
export async function generateGameRecommendationSlate(args: {
  state: GameRecommendationIntegrationStateV1;
  ageBand: AgeBandV2;
  enabledSources: Partial<Record<SourceIdV2, boolean>>;
  library?: LibraryScope;
  localLibraryCurationTrusted?: boolean;
  runRecommender: RunGameRecommender;
  now?: () => string;
}): Promise<GameRecommendationSlateOutcome> {
  let result: GameRecommendationRunResult;
  try {
    result = await args.runRecommender({
      ageBand: args.ageBand,
      signals: args.state.adaptedSignals,
      limit: 18,
      enabledSources: scopedSources(args.enabledSources, args.library),
      libraryId: args.library?.libraryId,
      diversitySeed: `${args.state.game}:${args.state.gameSessionId}:final-slate`,
      localLibraryCurationTrusted: args.localLibraryCurationTrusted,
    });
  } catch (error) {
    return { status: "error", state: args.state, error: error instanceof Error ? error.message : String(error) };
  }
  const excluded = new Set([...args.state.shownBookIdentityIds, ...args.state.familiarBookIdentityIds]);
  const eligible = result.items.filter((candidate) => {
    if ((args.library?.localCollectionOnly || args.enabledSources.localLibrary) && candidate.source !== "localLibrary") return false;
    const identity = canonicalBookIdentity(candidate);
    const isBookFormat = candidate.format === "book" || candidate.formats?.includes("book");
    if (!isBookFormat || !gameRecommendationCoverUrl(candidate) || excluded.has(identity)) return false;
    excluded.add(identity);
    return true;
  });
  if (eligible.length < 3) return { status: "empty", state: args.state, error: "fewer_than_three_unseen_books" };
  const adventurousIndex = Math.min(eligible.length - 1, Math.max(2, Math.floor(eligible.length * 0.45)));
  const picks = [eligible[0], eligible[1], eligible[adventurousIndex]];
  const positions = ["strongest", "strong", "adventurous"] as const;
  const items = picks.map((candidate, index): GameRecommendationSlateItem => {
    const description = gameRecommendationDescription(candidate);
    return {
      book: bookIdentityFromCandidate(candidate, result.items.indexOf(candidate) + 1),
      coverUrl: gameRecommendationCoverUrl(candidate),
      description: description?.text || null,
      matchedSignals: [...(candidate.matchedSignals || [])],
      position: positions[index],
    };
  });
  const state = items.reduce((next, item) => recordShownBook(next, item.book.id), args.state);
  return { status: "shown", state, items, shownAt: (args.now || (() => new Date().toISOString()))() };
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function objectField(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** Resolves the same production cover shapes used by the main recommendation UI. Open Library
 * candidates commonly retain `cover_i` in `raw` without promoting it to top-level `coverUrl`. */
export function gameRecommendationCoverUrl(candidate: GameRecommendationCandidateLike): string | null {
  const raw = objectField(candidate.raw);
  const imageLinks = objectField(raw.imageLinks);
  const volumeInfoImageLinks = objectField(objectField(raw.volumeInfo).imageLinks);
  const direct = [
    candidate.coverUrl,
    raw.imageUrl,
    raw.coverImageUrl,
    raw.coverUrl,
    raw.cover_url,
    imageLinks.thumbnail,
    imageLinks.smallThumbnail,
    volumeInfoImageLinks.thumbnail,
    volumeInfoImageLinks.smallThumbnail,
  ].map(stringField).find(Boolean);
  if (direct) return direct.replace(/^http:\/\//i, "https://");
  const coverId = String(raw.cover_i || raw.coverId || "").trim();
  return coverId ? `https://covers.openlibrary.org/b/id/${encodeURIComponent(coverId)}-L.jpg` : null;
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
      enabledSources: scopedSources(args.enabledSources, args.library),
      libraryId: args.library?.libraryId,
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
    if ((args.library?.localCollectionOnly || args.enabledSources.localLibrary) && candidate.source !== "localLibrary") return false;
    const isBookFormat = candidate.format !== "anime" && !candidate.formats?.includes("anime");
    return isBookFormat
      && Boolean(gameRecommendationCoverUrl(candidate))
      && !excluded.has(canonicalBookIdentity(candidate));
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
  const coverUrl = gameRecommendationCoverUrl(candidate);
  const description = gameRecommendationDescription(candidate);
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
      coverUrl: coverUrl || "",
      description: description?.text,
      descriptionProvenance: description?.provenance,
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
    coverUrl,
    description: description?.text || null,
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

export function prepareGameRecommendationEvidence(args: {
  state: GameRecommendationIntegrationStateV1;
  nativeEvidenceId: string;
  signals: readonly SwipeSignalV2[];
  evaluateMilestone: (lastMilestoneEvidenceCount: number) => MilestoneEvaluation | null;
}): PreparedGameRecommendationEvidence {
  const state = mergeNativeEvidence(args.state, args.nativeEvidenceId, args.signals);
  return {
    state,
    milestone: state.pendingReward
      ? null
      : args.evaluateMilestone(state.lastMilestoneEvidenceCount),
  };
}

export async function processDurableGameRecommendationEvidence(args: {
  state: GameRecommendationIntegrationStateV1;
  nativeEvidenceId: string;
  signals: readonly SwipeSignalV2[];
  evaluateMilestone: (lastMilestoneEvidenceCount: number) => MilestoneEvaluation | null;
  evidenceMode: GameRecommendationEvidenceMode;
  ageBand: AgeBandV2;
  enabledSources: Partial<Record<SourceIdV2, boolean>>;
  library: { libraryId: string; localCollectionOnly: boolean };
  localLibraryCurationTrusted?: boolean;
  runRecommender: RunGameRecommender;
  persist: (state: GameRecommendationIntegrationStateV1) => Promise<void>;
  now?: () => string;
}): Promise<GameRecommendationEngineOutcome> {
  const prepared = prepareGameRecommendationEvidence(args);
  // Native evidence is durable before any network work begins. The post-generation write below
  // is equally unconditional so navigation can suppress stale UI without losing the outcome.
  await args.persist(prepared.state);
  if (!prepared.milestone) return { status: "not_eligible", state: prepared.state };
  const outcome = await attemptGameRecommendationMilestone({
    state: prepared.state,
    milestone: prepared.milestone,
    evidenceMode: args.evidenceMode,
    ageBand: args.ageBand,
    enabledSources: args.enabledSources,
    library: args.library,
    localLibraryCurationTrusted: args.localLibraryCurationTrusted,
    runRecommender: args.runRecommender,
    now: args.now,
  });
  await args.persist(outcome.state);
  return outcome;
}

/** Shared runtime seam used by the React hook and integration tests: merge one native gameplay
 * event, evaluate its milestone against durable state, and invoke the production engine adapter. */
export async function processGameRecommendationEvidence(args: {
  state: GameRecommendationIntegrationStateV1;
  nativeEvidenceId: string;
  signals: readonly SwipeSignalV2[];
  evaluateMilestone: (lastMilestoneEvidenceCount: number) => MilestoneEvaluation | null;
  evidenceMode: GameRecommendationEvidenceMode;
  ageBand: AgeBandV2;
  enabledSources: Partial<Record<SourceIdV2, boolean>>;
  library: { libraryId: string; localCollectionOnly: boolean };
  localLibraryCurationTrusted?: boolean;
  runRecommender: RunGameRecommender;
  now?: () => string;
}): Promise<GameRecommendationEngineOutcome> {
  const prepared = prepareGameRecommendationEvidence(args);
  if (!prepared.milestone) return { status: "not_eligible", state: prepared.state };
  return attemptGameRecommendationMilestone({
    state: prepared.state,
    milestone: prepared.milestone,
    evidenceMode: args.evidenceMode,
    ageBand: args.ageBand,
    enabledSources: args.enabledSources,
    library: args.library,
    localLibraryCurationTrusted: args.localLibraryCurationTrusted,
    runRecommender: args.runRecommender,
    now: args.now,
  });
}
