import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { restoreMediaManiaState, type MediaManiaEvent, type MediaManiaState } from "./mediaManiaCore.mjs";
import { syncMediaManiaEvents } from "./mediaManiaEvidenceClient";

export const MEDIA_MANIA_SAVE_SCHEMA_VERSION = "media_mania_save_v1";
const KEY_PREFIX = "novelideas_media_mania_v1";
const runtimeStorageInstances = new Map<string, string>();
export type MediaManiaSave = { schemaVersion: typeof MEDIA_MANIA_SAVE_SCHEMA_VERSION; state: MediaManiaState; events: MediaManiaEvent[] };

const scope = (value?: string | null) => String(value || "default").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "default";
export const mediaManiaStorageKey = (
  playerId: string,
  libraryId?: string | null,
  storageInstanceId?: string | null,
) => `${KEY_PREFIX}:${scope(playerId)}:${scope(libraryId)}${storageInstanceId ? `:${scope(storageInstanceId)}` : ""}`;
export const createMediaManiaSessionId = () => `mm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export function createMediaManiaStorageInstanceId(playerId: string, libraryId?: string | null): string | null {
  if (Platform.OS !== "web" || typeof sessionStorage === "undefined") return null;
  try {
    const key = `${KEY_PREFIX}:tab:${scope(playerId)}:${scope(libraryId)}`;
    const runtimeInstance = runtimeStorageInstances.get(key);
    if (runtimeInstance) return runtimeInstance;
    const existing = sessionStorage.getItem(key);
    const navigation = typeof performance !== "undefined"
      ? performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
      : undefined;
    if (existing && navigation?.type === "reload") {
      runtimeStorageInstances.set(key, existing);
      return existing;
    }
    const created = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(key, created);
    runtimeStorageInstances.set(key, created);
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

async function migrateLegacyMediaManiaSave(
  playerId: string,
  libraryId: string | null | undefined,
  storageInstanceId: string,
): Promise<string | null> {
  if (
    Platform.OS !== "web" ||
    typeof localStorage === "undefined" ||
    typeof navigator === "undefined" ||
    !navigator.locks
  ) return null;
  const claimKey = `${KEY_PREFIX}:legacy-claim:${scope(playerId)}:${scope(libraryId)}`;
  const instanceKey = mediaManiaStorageKey(playerId, libraryId, storageInstanceId);
  return navigator.locks.request(`${claimKey}:migration`, async () => {
    if (localStorage.getItem(claimKey)) return null;
    const legacy = localStorage.getItem(mediaManiaStorageKey(playerId, libraryId));
    if (!legacy) return null;
    localStorage.setItem(instanceKey, legacy);
    localStorage.setItem(claimKey, storageInstanceId);
    return legacy;
  });
}

export async function loadMediaManiaSave(
  playerId: string,
  libraryId?: string | null,
  storageInstanceId?: string | null,
): Promise<MediaManiaSave | null> {
  let raw = await read(mediaManiaStorageKey(playerId, libraryId, storageInstanceId));
  if (
    !raw &&
    storageInstanceId
  ) {
    raw = await migrateLegacyMediaManiaSave(playerId, libraryId, storageInstanceId);
  }
  if (!raw) return null;
  const parsed = JSON.parse(raw) as MediaManiaSave;
  const state = restoreMediaManiaState({ ...parsed?.state, libraryId: scope(libraryId) });
  if (parsed?.schemaVersion !== MEDIA_MANIA_SAVE_SCHEMA_VERSION || !state || !Array.isArray(parsed.events)) {
    throw new Error("media_mania_save_invalid");
  }
  return { schemaVersion: MEDIA_MANIA_SAVE_SCHEMA_VERSION, state, events: parsed.events };
}

export async function saveMediaMania(
  playerId: string,
  libraryId: string | null | undefined,
  state: MediaManiaState,
  events: MediaManiaEvent[],
  storageInstanceId?: string | null,
): Promise<{ durableSynced: boolean; durableError: string | null }> {
  const payload: MediaManiaSave = { schemaVersion: MEDIA_MANIA_SAVE_SCHEMA_VERSION, state, events };
  await write(mediaManiaStorageKey(playerId, libraryId, storageInstanceId), JSON.stringify(payload));
  const durable = await syncMediaManiaEvents(scope(libraryId), events);
  return { durableSynced: durable.synced, durableError: durable.error };
}
