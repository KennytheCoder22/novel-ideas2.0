import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { AgeBandV2 } from "../../app/recommender-v2";
import {
  MELANIES_GAME_SAVE_SCHEMA,
  restoreMelanieGameState,
  type MelanieGameState,
} from "./melaniesGame";

const KEY_PREFIX = "novelideas_melanies_game_v1";
const runtimeInstances = new Map<string, string>();

function scope(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "default";
}

export function melaniesGameStorageKey(
  playerId: string,
  libraryId: string,
  ageBand: AgeBandV2,
  storageInstanceId?: string | null,
): string {
  return `${KEY_PREFIX}:${scope(playerId)}:${scope(libraryId)}:${ageBand}${storageInstanceId ? `:${scope(storageInstanceId)}` : ""}`;
}

export function createMelaniesGameStorageInstanceId(playerId: string, libraryId: string, ageBand: AgeBandV2): string | null {
  if (Platform.OS !== "web" || typeof sessionStorage === "undefined") return null;
  try {
    const key = `${KEY_PREFIX}:tab:${scope(playerId)}:${scope(libraryId)}:${ageBand}`;
    const runtime = runtimeInstances.get(key);
    if (runtime) return runtime;
    const existing = sessionStorage.getItem(key);
    const navigation = typeof performance !== "undefined"
      ? performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
      : undefined;
    if (existing && navigation?.type === "reload") {
      runtimeInstances.set(key, existing);
      return existing;
    }
    const created = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(key, created);
    runtimeInstances.set(key, created);
    return created;
  } catch {
    return null;
  }
}

async function read(key: string): Promise<string | null> {
  if (Platform.OS === "web" && typeof localStorage !== "undefined") return localStorage.getItem(key);
  return AsyncStorage.getItem(key);
}

async function write(key: string, value: string): Promise<void> {
  if (Platform.OS === "web" && typeof localStorage !== "undefined") {
    localStorage.setItem(key, value);
    return;
  }
  await AsyncStorage.setItem(key, value);
}

export async function loadMelaniesGame(
  playerId: string,
  libraryId: string,
  ageBand: AgeBandV2,
  storageInstanceId?: string | null,
): Promise<MelanieGameState | null> {
  const raw = await read(melaniesGameStorageKey(playerId, libraryId, ageBand, storageInstanceId));
  return restoreMelanieGameState(raw, { anonymousPlayerId: playerId, libraryId, ageBand });
}

export async function saveMelaniesGame(state: MelanieGameState, storageInstanceId?: string | null): Promise<void> {
  if (state.schemaVersion !== MELANIES_GAME_SAVE_SCHEMA) throw new Error("melanies_game_save_invalid");
  await write(
    melaniesGameStorageKey(state.anonymousPlayerId, state.libraryId, state.ageBand, storageInstanceId),
    JSON.stringify(state),
  );
}

