import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { AgeBandV2 } from "../../app/recommender-v2";
import {
  type MelanieGameState,
} from "./melaniesGame";
import {
  loadMelaniesGameFromStorage,
  melaniesGameStorageKey,
  saveMelaniesGameToStorage,
  type MelaniesGameStorage,
} from "./melaniesGameProgressStorage";

export { melaniesGameStorageKey, type MelaniesGameStorage } from "./melaniesGameProgressStorage";

const runtimeInstances = new Map<string, string>();

export function createMelaniesGameStorageInstanceId(playerId: string, libraryId: string, ageBand: AgeBandV2): string | null {
  if (Platform.OS !== "web" || typeof sessionStorage === "undefined") return null;
  try {
    const key = `${melaniesGameStorageKey(playerId, libraryId, ageBand)}:tab`;
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

const defaultStorage: MelaniesGameStorage = {
  async getItem(key) {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") return localStorage.getItem(key);
    return AsyncStorage.getItem(key);
  },
  async setItem(key, value) {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
      return;
    }
    await AsyncStorage.setItem(key, value);
  },
};

export async function loadMelaniesGame(
  playerId: string,
  libraryId: string,
  ageBand: AgeBandV2,
  storageInstanceId?: string | null,
  storage: MelaniesGameStorage = defaultStorage,
): Promise<MelanieGameState | null> {
  return loadMelaniesGameFromStorage(storage, playerId, libraryId, ageBand, storageInstanceId);
}

export async function saveMelaniesGame(
  state: MelanieGameState,
  storageInstanceId?: string | null,
  storage: MelaniesGameStorage = defaultStorage,
): Promise<void> {
  return saveMelaniesGameToStorage(storage, state, storageInstanceId);
}
