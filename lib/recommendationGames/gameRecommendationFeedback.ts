// Shared, strict, versioned contract for the reward moment shown after a game milestone:
// "would the player choose this book?" This is intentionally separate from native per-game
// evidence contracts (media_mania_event_v2, recommendation_game_event_v1,
// unwritten_map_event_v2, alchemists_cascade_event_v1), from screens/recommenders/taste's
// TasteFeedbackEvent, and from the Human/Librarian Review contracts. Those describe gameplay or
// swipe-deck taste; this describes only the outcome of a single cross-game recommendation
// reward shown at a milestone.
export const GAME_RECOMMENDATION_FEEDBACK_SCHEMA = "game_recommendation_feedback_v1" as const;
export const GAME_RECOMMENDATION_SLATE_FEEDBACK_SCHEMA = "game_recommendation_slate_feedback_v1" as const;

function safeFeedbackPathSegment(value: string, maxLength: number): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, maxLength);
}

export function gameRecommendationFeedbackStoragePath(event: GameRecommendationFeedbackEventV1): string {
  const revision = event.continuedAt
    ? `continued-${safeFeedbackPathSegment(event.continuedAt, 60)}`
    : "response";
  return [
    "recommendation-games/feedback/v1",
    safeFeedbackPathSegment(event.library.libraryId, 100),
    safeFeedbackPathSegment(event.game, 60),
    safeFeedbackPathSegment(event.anonymousPlayerId, 100),
    safeFeedbackPathSegment(event.eventId, 200),
    `${revision}.json`,
  ].join("/");
}

export function gameRecommendationSlateFeedbackStoragePath(event: GameRecommendationSlateFeedbackEventV1): string {
  return [
    "recommendation-games/feedback/slates/v1",
    safeFeedbackPathSegment(event.library.libraryId, 100),
    safeFeedbackPathSegment(event.game, 60),
    safeFeedbackPathSegment(event.anonymousPlayerId, 100),
    `${safeFeedbackPathSegment(event.eventId, 200)}.json`,
  ].join("/");
}

export type RecommendationGameId =
  | "media_mania"
  | "the_last_bookshop"
  | "unwritten_map"
  | "alchemists_cascade"
  | "melanies_game";

export const RECOMMENDATION_GAME_IDS: readonly RecommendationGameId[] = [
  "media_mania",
  "the_last_bookshop",
  "unwritten_map",
  "alchemists_cascade",
  "melanies_game",
];

export type GameRecommendationAgeBand = "kids" | "preteens" | "teens" | "adult";

export const GAME_RECOMMENDATION_AGE_BANDS: readonly GameRecommendationAgeBand[] = [
  "kids",
  "preteens",
  "teens",
  "adult",
];

// "cross_media" evidence carries real cross-media identities (Media Mania catalog items, Last
// Bookshop shelf works). "semantic_only" evidence carries only taste-vector/tag semantics with no
// real-world media identity attached (Unwritten Map narrative choices, Alchemist's Cascade
// catalyst choices).
export type GameRecommendationEvidenceMode = "cross_media" | "semantic_only";

export const GAME_RECOMMENDATION_EVIDENCE_MODES: readonly GameRecommendationEvidenceMode[] = [
  "cross_media",
  "semantic_only",
];

// already_read is familiarity only: it must never be treated as a positive or negative taste
// signal by any downstream consumer of this contract.
export type GameRecommendationResponse = "yes" | "maybe" | "no" | "already_read";
export const GAME_RECOMMENDATION_DETAILS = ['too_young', 'wrong_mood', 'uninteresting_premise', 'liked_it', 'not_for_me'] as const;
export type GameRecommendationDetail = typeof GAME_RECOMMENDATION_DETAILS[number];

export const GAME_RECOMMENDATION_RESPONSES: readonly GameRecommendationResponse[] = [
  "yes",
  "maybe",
  "no",
  "already_read",
];

export type GameRecommendationBookIdentity = {
  id: string;
  source: string;
  sourceId: string | null;
  title: string;
  author: string;
  rank: number;
};

export type GameRecommendationLibraryContext = {
  libraryId: string;
  localCollectionOnly: boolean;
};

export type GameRecommendationEvidenceSnapshot = {
  signalCount: number;
  positiveSignalCount: number;
  negativeSignalCount: number;
  sources: string[];
  semanticTags: string[];
};

export type GameRecommendationFeedbackEventV1 = {
  schemaVersion: typeof GAME_RECOMMENDATION_FEEDBACK_SCHEMA;
  eventId: string;
  game: RecommendationGameId;
  anonymousPlayerId: string;
  gameSessionId: string;
  milestoneId: string;
  milestoneIndex: number;
  evidenceCount: number;
  evidenceSnapshotVersion: string;
  evidenceSnapshot: GameRecommendationEvidenceSnapshot;
  evidenceMode: GameRecommendationEvidenceMode;
  book: GameRecommendationBookIdentity;
  response: GameRecommendationResponse;
  responseDetail?: GameRecommendationDetail;
  ageBand: GameRecommendationAgeBand;
  library: GameRecommendationLibraryContext;
  shownAt: string;
  respondedAt: string;
  continuedAt: string | null;
};

export type GameRecommendationSlateFeedbackEventV1 = {
  schemaVersion: typeof GAME_RECOMMENDATION_SLATE_FEEDBACK_SCHEMA;
  eventId: string;
  game: RecommendationGameId;
  anonymousPlayerId: string;
  gameSessionId: string;
  evidenceSnapshotVersion: string;
  evidenceSnapshot: GameRecommendationEvidenceSnapshot;
  evidenceMode: GameRecommendationEvidenceMode;
  recommendations: GameRecommendationBookIdentity[];
  ranking: string[];
  preferredBookId: string | null;
  ageBand: GameRecommendationAgeBand;
  library: GameRecommendationLibraryContext;
  shownAt: string;
  respondedAt: string;
};

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

const BOOK_KEYS = ["id", "source", "sourceId", "title", "author", "rank"] as const;
const LIBRARY_KEYS = ["libraryId", "localCollectionOnly"] as const;
const EVIDENCE_SNAPSHOT_KEYS = [
  "signalCount", "positiveSignalCount", "negativeSignalCount", "sources", "semanticTags",
] as const;
const EVENT_KEYS = [
  "schemaVersion", "eventId", "game", "anonymousPlayerId", "gameSessionId", "milestoneId",
  "milestoneIndex", "evidenceCount", "evidenceSnapshotVersion", "evidenceSnapshot", "evidenceMode", "book",
  "response", "ageBand", "library", "shownAt", "respondedAt", "continuedAt",
] as const;

function isValidBookIdentity(value: unknown): value is GameRecommendationBookIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const book = value as Record<string, unknown>;
  if (!exactKeys(book, BOOK_KEYS)) return false;
  return isNonEmptyString(book.id, 400)
    && isNonEmptyString(book.source, 120)
    && (book.sourceId === null || isNonEmptyString(book.sourceId, 400))
    && isNonEmptyString(book.title, 500)
    && typeof book.author === "string" && book.author.length <= 500
    && Number.isInteger(book.rank) && (book.rank as number) >= 1 && (book.rank as number) <= 500;
}

function isValidLibraryContext(value: unknown): value is GameRecommendationLibraryContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const library = value as Record<string, unknown>;
  return exactKeys(library, LIBRARY_KEYS)
    && isNonEmptyString(library.libraryId, 160)
    && typeof library.localCollectionOnly === "boolean";
}

function isValidEvidenceSnapshot(value: unknown): value is GameRecommendationEvidenceSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value as Record<string, unknown>;
  return exactKeys(snapshot, EVIDENCE_SNAPSHOT_KEYS)
    && Number.isInteger(snapshot.signalCount) && (snapshot.signalCount as number) >= 0
    && Number.isInteger(snapshot.positiveSignalCount) && (snapshot.positiveSignalCount as number) >= 0
    && Number.isInteger(snapshot.negativeSignalCount) && (snapshot.negativeSignalCount as number) >= 0
    && (snapshot.positiveSignalCount as number) + (snapshot.negativeSignalCount as number) <= (snapshot.signalCount as number)
    && Array.isArray(snapshot.sources) && snapshot.sources.length <= 20
    && snapshot.sources.every((source) => isNonEmptyString(source, 120))
    && Array.isArray(snapshot.semanticTags) && snapshot.semanticTags.length <= 40
    && snapshot.semanticTags.every((tag) => isNonEmptyString(tag, 120));
}

/** Strict runtime validator for the durable, wire, and storage forms of the contract. Rejects any
 * value with extra fields, out-of-range values, or an inconsistent eventId/game pairing so a
 * malformed or tampered payload can never be persisted as a `game_recommendation_feedback_v1`
 * record. */
export function isGameRecommendationFeedbackEventV1(value: unknown): value is GameRecommendationFeedbackEventV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  if (JSON.stringify(event).length > 8_000) return false;
  if (!exactKeys(event, event.responseDetail === undefined ? EVENT_KEYS : [...EVENT_KEYS, 'responseDetail'])) return false;
  if (event.responseDetail !== undefined) {
    if (!GAME_RECOMMENDATION_DETAILS.includes(event.responseDetail as GameRecommendationDetail)) return false;
    if (event.response === 'no' ? !['too_young', 'wrong_mood', 'uninteresting_premise'].includes(String(event.responseDetail))
      : event.response === 'already_read' ? !['liked_it', 'not_for_me'].includes(String(event.responseDetail)) : true) return false;
  }
  if (event.schemaVersion !== GAME_RECOMMENDATION_FEEDBACK_SCHEMA) return false;
  if (!isNonEmptyString(event.eventId, 260)) return false;
  if (!RECOMMENDATION_GAME_IDS.includes(event.game as RecommendationGameId)) return false;
  if (!isNonEmptyString(event.anonymousPlayerId, 160)) return false;
  if (!isNonEmptyString(event.gameSessionId, 160)) return false;
  if (!isNonEmptyString(event.milestoneId, 160)) return false;
  if (event.milestoneId !== `${event.game}:${event.milestoneIndex}`) return false;
  if (!Number.isInteger(event.milestoneIndex) || (event.milestoneIndex as number) < 1) return false;
  if (!Number.isInteger(event.evidenceCount) || (event.evidenceCount as number) < 1) return false;
  if (!isNonEmptyString(event.evidenceSnapshotVersion, 40)) return false;
  if (!isValidEvidenceSnapshot(event.evidenceSnapshot)) return false;
  if (!GAME_RECOMMENDATION_EVIDENCE_MODES.includes(event.evidenceMode as GameRecommendationEvidenceMode)) return false;
  if (!isValidBookIdentity(event.book)) return false;
  if (!GAME_RECOMMENDATION_RESPONSES.includes(event.response as GameRecommendationResponse)) return false;
  if (!GAME_RECOMMENDATION_AGE_BANDS.includes(event.ageBand as GameRecommendationAgeBand)) return false;
  if (!isValidLibraryContext(event.library)) return false;
  if (!isIsoTimestamp(event.shownAt)) return false;
  if (!isIsoTimestamp(event.respondedAt)) return false;
  if (Date.parse(event.respondedAt as string) < Date.parse(event.shownAt as string)) return false;
  if (event.continuedAt !== null) {
    if (!isIsoTimestamp(event.continuedAt)) return false;
    if (Date.parse(event.continuedAt as string) < Date.parse(event.respondedAt as string)) return false;
  }
  if (event.eventId !== `${event.gameSessionId}:${event.milestoneId}`) return false;
  return true;
}

export function normalizeGameRecommendationFeedbackEventV1(value: unknown): GameRecommendationFeedbackEventV1 | null {
  return isGameRecommendationFeedbackEventV1(value) ? value : null;
}

const SLATE_EVENT_KEYS = [
  "schemaVersion", "eventId", "game", "anonymousPlayerId", "gameSessionId",
  "evidenceSnapshotVersion", "evidenceSnapshot", "evidenceMode", "recommendations",
  "ranking", "preferredBookId", "ageBand", "library", "shownAt", "respondedAt",
] as const;

export function isGameRecommendationSlateFeedbackEventV1(
  value: unknown,
): value is GameRecommendationSlateFeedbackEventV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  if (JSON.stringify(event).length > 12_000 || !exactKeys(event, SLATE_EVENT_KEYS)) return false;
  if (event.schemaVersion !== GAME_RECOMMENDATION_SLATE_FEEDBACK_SCHEMA) return false;
  if (!isNonEmptyString(event.eventId, 260)) return false;
  if (!RECOMMENDATION_GAME_IDS.includes(event.game as RecommendationGameId)) return false;
  if (!isNonEmptyString(event.anonymousPlayerId, 160) || !isNonEmptyString(event.gameSessionId, 160)) return false;
  if (!isNonEmptyString(event.evidenceSnapshotVersion, 40) || !isValidEvidenceSnapshot(event.evidenceSnapshot)) return false;
  if (!GAME_RECOMMENDATION_EVIDENCE_MODES.includes(event.evidenceMode as GameRecommendationEvidenceMode)) return false;
  if (!Array.isArray(event.recommendations) || event.recommendations.length < 1 || event.recommendations.length > 5
    || !event.recommendations.every(isValidBookIdentity)) return false;
  const recommendationIds = new Set((event.recommendations as GameRecommendationBookIdentity[]).map((book) => book.id));
  if (!Array.isArray(event.ranking) || event.ranking.length !== recommendationIds.size
    || !event.ranking.every((id) => typeof id === "string" && recommendationIds.has(id))
    || new Set(event.ranking).size !== event.ranking.length) return false;
  if (event.preferredBookId !== null
    && (typeof event.preferredBookId !== "string" || !recommendationIds.has(event.preferredBookId))) return false;
  if (!GAME_RECOMMENDATION_AGE_BANDS.includes(event.ageBand as GameRecommendationAgeBand)) return false;
  if (!isValidLibraryContext(event.library) || !isIsoTimestamp(event.shownAt) || !isIsoTimestamp(event.respondedAt)) return false;
  if (Date.parse(event.respondedAt as string) < Date.parse(event.shownAt as string)) return false;
  return event.eventId === `${event.gameSessionId}:final-slate`;
}

export function normalizeGameRecommendationSlateFeedbackEventV1(
  value: unknown,
): GameRecommendationSlateFeedbackEventV1 | null {
  return isGameRecommendationSlateFeedbackEventV1(value) ? value : null;
}

export function createGameRecommendationSlateFeedbackEvent(args: {
  game: RecommendationGameId;
  anonymousPlayerId: string;
  gameSessionId: string;
  evidenceSnapshotVersion: string;
  evidenceSnapshot: GameRecommendationEvidenceSnapshot;
  evidenceMode: GameRecommendationEvidenceMode;
  recommendations: GameRecommendationBookIdentity[];
  ranking: string[];
  preferredBookId: string | null;
  ageBand: GameRecommendationAgeBand;
  library: GameRecommendationLibraryContext;
  shownAt: string;
  respondedAt?: string;
}): GameRecommendationSlateFeedbackEventV1 {
  const event: GameRecommendationSlateFeedbackEventV1 = {
    schemaVersion: GAME_RECOMMENDATION_SLATE_FEEDBACK_SCHEMA,
    eventId: `${args.gameSessionId}:final-slate`,
    game: args.game,
    anonymousPlayerId: args.anonymousPlayerId,
    gameSessionId: args.gameSessionId,
    evidenceSnapshotVersion: args.evidenceSnapshotVersion,
    evidenceSnapshot: args.evidenceSnapshot,
    evidenceMode: args.evidenceMode,
    recommendations: args.recommendations,
    ranking: args.ranking,
    preferredBookId: args.preferredBookId,
    ageBand: args.ageBand,
    library: args.library,
    shownAt: args.shownAt,
    respondedAt: args.respondedAt || new Date().toISOString(),
  };
  if (!isGameRecommendationSlateFeedbackEventV1(event)) throw new Error("invalid_game_recommendation_slate_feedback_event");
  return event;
}

/** Builds a validated `game_recommendation_feedback_v1` event. `continuedAt` starts unset because
 * play must resume immediately after the response is recorded; callers attach it once the
 * continuation callback has actually fired (see `withContinuedAt`). */
export function createGameRecommendationFeedbackEvent(args: {
  game: RecommendationGameId;
  anonymousPlayerId: string;
  gameSessionId: string;
  milestoneIndex: number;
  evidenceCount: number;
  evidenceSnapshotVersion: string;
  evidenceSnapshot: GameRecommendationEvidenceSnapshot;
  evidenceMode: GameRecommendationEvidenceMode;
  book: GameRecommendationBookIdentity;
  response: GameRecommendationResponse;
  responseDetail?: GameRecommendationDetail;
  ageBand: GameRecommendationAgeBand;
  library: GameRecommendationLibraryContext;
  shownAt: string;
  respondedAt?: string;
}): GameRecommendationFeedbackEventV1 {
  const milestoneId = `${args.game}:${args.milestoneIndex}`;
  const event: GameRecommendationFeedbackEventV1 = {
    schemaVersion: GAME_RECOMMENDATION_FEEDBACK_SCHEMA,
    eventId: `${args.gameSessionId}:${milestoneId}`,
    game: args.game,
    anonymousPlayerId: args.anonymousPlayerId,
    gameSessionId: args.gameSessionId,
    milestoneId,
    milestoneIndex: args.milestoneIndex,
    evidenceCount: args.evidenceCount,
    evidenceSnapshotVersion: args.evidenceSnapshotVersion,
    evidenceSnapshot: args.evidenceSnapshot,
    evidenceMode: args.evidenceMode,
    book: args.book,
    response: args.response,
    ...(args.responseDetail ? { responseDetail: args.responseDetail } : {}),
    ageBand: args.ageBand,
    library: args.library,
    shownAt: args.shownAt,
    respondedAt: args.respondedAt || new Date().toISOString(),
    continuedAt: null,
  };
  if (!isGameRecommendationFeedbackEventV1(event)) throw new Error("invalid_game_recommendation_feedback_event");
  return event;
}

/** Attaches the continuation timestamp after the caller has resumed gameplay. Returns null (never
 * throws) if the resulting event would be invalid, e.g. a `continuedAt` before `respondedAt`. */
export function withContinuedAt(
  event: GameRecommendationFeedbackEventV1,
  continuedAt: string,
): GameRecommendationFeedbackEventV1 | null {
  const next: GameRecommendationFeedbackEventV1 = { ...event, continuedAt };
  return isGameRecommendationFeedbackEventV1(next) ? next : null;
}
