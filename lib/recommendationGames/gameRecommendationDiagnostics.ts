// Separate, versioned diagnostic contract for recommendation generation failures encountered
// while trying to show a game-recommendation-milestone reward. This is intentionally distinct
// from `game_recommendation_feedback_v1` (a player response) so operational failure telemetry
// never contaminates player preference data.
import { RECOMMENDATION_GAME_IDS, type RecommendationGameId } from "./gameRecommendationFeedback";

export const GAME_RECOMMENDATION_DIAGNOSTIC_SCHEMA = "game_recommendation_diagnostic_v1" as const;

export type GameRecommendationDiagnosticReason =
  | "recommender_threw"
  | "empty_result"
  | "invalid_session";

export const GAME_RECOMMENDATION_DIAGNOSTIC_REASONS: readonly GameRecommendationDiagnosticReason[] = [
  "recommender_threw",
  "empty_result",
  "invalid_session",
];

export type GameRecommendationDiagnosticEventV1 = {
  schemaVersion: typeof GAME_RECOMMENDATION_DIAGNOSTIC_SCHEMA;
  eventId: string;
  game: RecommendationGameId;
  anonymousPlayerId: string;
  gameSessionId: string;
  milestoneId: string;
  milestoneIndex: number;
  evidenceCount: number;
  reason: GameRecommendationDiagnosticReason;
  detail: string;
  occurredAt: string;
};

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

const EVENT_KEYS = [
  "schemaVersion", "eventId", "game", "anonymousPlayerId", "gameSessionId", "milestoneId",
  "milestoneIndex", "evidenceCount", "reason", "detail", "occurredAt",
] as const;

export function isGameRecommendationDiagnosticEventV1(value: unknown): value is GameRecommendationDiagnosticEventV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  if (JSON.stringify(event).length > 4_000) return false;
  if (!exactKeys(event, EVENT_KEYS)) return false;
  if (event.schemaVersion !== GAME_RECOMMENDATION_DIAGNOSTIC_SCHEMA) return false;
  if (!isNonEmptyString(event.eventId, 260)) return false;
  if (!RECOMMENDATION_GAME_IDS.includes(event.game as RecommendationGameId)) return false;
  if (!isNonEmptyString(event.anonymousPlayerId, 160)) return false;
  if (!isNonEmptyString(event.gameSessionId, 160)) return false;
  if (!isNonEmptyString(event.milestoneId, 160)) return false;
  if (!Number.isInteger(event.milestoneIndex) || (event.milestoneIndex as number) < 1) return false;
  if (!Number.isInteger(event.evidenceCount) || (event.evidenceCount as number) < 1) return false;
  if (!GAME_RECOMMENDATION_DIAGNOSTIC_REASONS.includes(event.reason as GameRecommendationDiagnosticReason)) return false;
  if (typeof event.detail !== "string" || event.detail.length > 500) return false;
  if (!Number.isFinite(Date.parse(String(event.occurredAt || "")))) return false;
  if (event.eventId !== `${event.gameSessionId}:${event.milestoneId}:${event.reason}`) return false;
  return true;
}

export function normalizeGameRecommendationDiagnosticEventV1(value: unknown): GameRecommendationDiagnosticEventV1 | null {
  return isGameRecommendationDiagnosticEventV1(value) ? value : null;
}

export function createGameRecommendationDiagnosticEvent(args: {
  game: RecommendationGameId;
  anonymousPlayerId: string;
  gameSessionId: string;
  milestoneId: string;
  milestoneIndex: number;
  evidenceCount: number;
  reason: GameRecommendationDiagnosticReason;
  detail: string;
  occurredAt?: string;
}): GameRecommendationDiagnosticEventV1 {
  const event: GameRecommendationDiagnosticEventV1 = {
    schemaVersion: GAME_RECOMMENDATION_DIAGNOSTIC_SCHEMA,
    eventId: `${args.gameSessionId}:${args.milestoneId}:${args.reason}`,
    game: args.game,
    anonymousPlayerId: args.anonymousPlayerId,
    gameSessionId: args.gameSessionId,
    milestoneId: args.milestoneId,
    milestoneIndex: args.milestoneIndex,
    evidenceCount: args.evidenceCount,
    reason: args.reason,
    detail: args.detail.slice(0, 500),
    occurredAt: args.occurredAt || new Date().toISOString(),
  };
  if (!isGameRecommendationDiagnosticEventV1(event)) throw new Error("invalid_game_recommendation_diagnostic_event");
  return event;
}
