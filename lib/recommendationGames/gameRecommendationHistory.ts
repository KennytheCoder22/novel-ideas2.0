import type { AgeBandV2 } from "../../app/recommender-v2";
import type { GameRecommendationIntegrationStateV1 } from "./gameRecommendationIntegrationState";

export const GAME_RECOMMENDATION_HISTORY_SCHEMA = "game_recommendation_history_v1" as const;

export type GameRecommendationHistoryScope = {
  anonymousPlayerId: string;
  libraryId: string;
  ageBand: AgeBandV2;
};

export type GameRecommendationHistoryV1 = GameRecommendationHistoryScope & {
  schemaVersion: typeof GAME_RECOMMENDATION_HISTORY_SCHEMA;
  shownBookIdentityIds: string[];
  familiarBookIdentityIds: string[];
};

function scopeKeyPart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "default";
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

export function gameRecommendationHistoryStorageKey(scope: GameRecommendationHistoryScope): string {
  return [
    "novelideas_game_recommendation_history_v1",
    scopeKeyPart(scope.anonymousPlayerId),
    scopeKeyPart(scope.libraryId),
    scope.ageBand,
  ].join(":");
}

export function createGameRecommendationHistory(
  scope: GameRecommendationHistoryScope,
): GameRecommendationHistoryV1 {
  return {
    schemaVersion: GAME_RECOMMENDATION_HISTORY_SCHEMA,
    ...scope,
    shownBookIdentityIds: [],
    familiarBookIdentityIds: [],
  };
}

export function restoreGameRecommendationHistory(
  raw: string | null,
  expected: GameRecommendationHistoryScope,
): GameRecommendationHistoryV1 {
  const fallback = () => createGameRecommendationHistory(expected);
  if (!raw) return fallback();
  try {
    const value = JSON.parse(raw) as Partial<GameRecommendationHistoryV1>;
    if (
      value.schemaVersion !== GAME_RECOMMENDATION_HISTORY_SCHEMA
      || value.anonymousPlayerId !== expected.anonymousPlayerId
      || value.libraryId !== expected.libraryId
      || value.ageBand !== expected.ageBand
      || !Array.isArray(value.shownBookIdentityIds)
      || !value.shownBookIdentityIds.every((item) => typeof item === "string")
      || !Array.isArray(value.familiarBookIdentityIds)
      || !value.familiarBookIdentityIds.every((item) => typeof item === "string")
    ) return fallback();
    return {
      schemaVersion: GAME_RECOMMENDATION_HISTORY_SCHEMA,
      ...expected,
      shownBookIdentityIds: unique(value.shownBookIdentityIds),
      familiarBookIdentityIds: unique(value.familiarBookIdentityIds),
    };
  } catch {
    return fallback();
  }
}

export function synchronizeGameRecommendationHistory(
  history: GameRecommendationHistoryV1,
  state: GameRecommendationIntegrationStateV1,
): { history: GameRecommendationHistoryV1; state: GameRecommendationIntegrationStateV1 } {
  if (history.anonymousPlayerId !== state.anonymousPlayerId) return { history, state };
  const shownBookIdentityIds = unique([...history.shownBookIdentityIds, ...state.shownBookIdentityIds]);
  const familiarBookIdentityIds = unique([...history.familiarBookIdentityIds, ...state.familiarBookIdentityIds]);
  return {
    history: { ...history, shownBookIdentityIds, familiarBookIdentityIds },
    state: { ...state, shownBookIdentityIds, familiarBookIdentityIds },
  };
}

export function recordGameRecommendationFamiliarBook(
  history: GameRecommendationHistoryV1,
  bookIdentityId: string,
): GameRecommendationHistoryV1 {
  return {
    ...history,
    familiarBookIdentityIds: unique([...history.familiarBookIdentityIds, bookIdentityId]),
  };
}

