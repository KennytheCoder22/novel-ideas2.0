import type { AgeBandV2 } from "../../app/recommender-v2";
import {
  MELANIES_GAME_SAVE_SCHEMA,
  restoreMelanieGameState,
  type MelanieGameState,
} from "./melaniesGame";
import { withCrossTabStorageLock } from "./crossTabStorageLock";

export const MELANIES_GAME_STORAGE_PREFIX = "novelideas_melanies_game_v1";

export type MelaniesGameStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

function scope(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "default";
}

export function melaniesGameStorageKey(
  playerId: string,
  libraryId: string,
  ageBand: AgeBandV2,
  storageInstanceId?: string | null,
): string {
  return `${MELANIES_GAME_STORAGE_PREFIX}:${scope(playerId)}:${scope(libraryId)}:${ageBand}${storageInstanceId ? `:${scope(storageInstanceId)}` : ""}`;
}

const STAGE_ORDER: Record<MelanieGameState["stage"], number> = {
  "choose-1": 0,
  "rank-1": 1,
  "choose-2": 2,
  "rank-2": 3,
  final: 4,
  recommendations: 5,
};

function compareProgress(left: MelanieGameState, right: MelanieGameState): number {
  if (left.gameSessionId !== right.gameSessionId) {
    return left.startedAt.localeCompare(right.startedAt) || left.updatedAt.localeCompare(right.updatedAt);
  }
  const comparisons = [
    Number(left.feedbackRecorded) - Number(right.feedbackRecorded),
    left.recommendations.length - right.recommendations.length,
    left.evidence.length - right.evidence.length,
    left.seenConceptIds.length - right.seenConceptIds.length,
    STAGE_ORDER[left.stage] - STAGE_ORDER[right.stage],
    Number(left.finalFeedbackInteracted) - Number(right.finalFeedbackInteracted),
  ];
  return comparisons.find((value) => value !== 0) || left.updatedAt.localeCompare(right.updatedAt);
}

export async function loadMelaniesGameFromStorage(
  storage: MelaniesGameStorage,
  playerId: string,
  libraryId: string,
  ageBand: AgeBandV2,
  storageInstanceId?: string | null,
): Promise<MelanieGameState | null> {
  const context = { anonymousPlayerId: playerId, libraryId, ageBand };
  const instanceRaw = await storage.getItem(melaniesGameStorageKey(playerId, libraryId, ageBand, storageInstanceId));
  const instanceState = restoreMelanieGameState(instanceRaw, context);
  if (!storageInstanceId) return instanceState;
  const durableRaw = await storage.getItem(melaniesGameStorageKey(playerId, libraryId, ageBand));
  const durableState = restoreMelanieGameState(durableRaw, context);
  if (!instanceState) return durableState;
  if (!durableState) return instanceState;
  return compareProgress(durableState, instanceState) > 0 ? durableState : instanceState;
}

export async function saveMelaniesGameToStorage(
  storage: MelaniesGameStorage,
  state: MelanieGameState,
  storageInstanceId?: string | null,
): Promise<void> {
  if (state.schemaVersion !== MELANIES_GAME_SAVE_SCHEMA) throw new Error("melanies_game_save_invalid");
  const contextKey = melaniesGameStorageKey(state.anonymousPlayerId, state.libraryId, state.ageBand);
  const instanceKey = melaniesGameStorageKey(
    state.anonymousPlayerId,
    state.libraryId,
    state.ageBand,
    storageInstanceId,
  );
  const serialized = JSON.stringify(state);
  if (!storageInstanceId) {
    await storage.setItem(contextKey, serialized);
    return;
  }

  await withCrossTabStorageLock(storage, `melanies-game-progress:${contextKey}`, async (assertOwnership) => {
    await assertOwnership();
    await storage.setItem(instanceKey, serialized);
    const current = restoreMelanieGameState(
      await storage.getItem(contextKey),
      {
        anonymousPlayerId: state.anonymousPlayerId,
        libraryId: state.libraryId,
        ageBand: state.ageBand,
      },
    );
    if (current && compareProgress(current, state) > 0) return;
    await assertOwnership();
    await storage.setItem(contextKey, serialized);
  });
}
