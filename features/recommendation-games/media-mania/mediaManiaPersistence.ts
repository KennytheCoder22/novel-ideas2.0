import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { restoreMediaManiaState, type MediaManiaEvent, type MediaManiaState } from "./mediaManiaCore.mjs";

export const MEDIA_MANIA_SAVE_SCHEMA_VERSION = "media_mania_save_v1";
const KEY_PREFIX = "novelideas_media_mania_v1";
export type MediaManiaSave = { schemaVersion: typeof MEDIA_MANIA_SAVE_SCHEMA_VERSION; state: MediaManiaState; events: MediaManiaEvent[] };

const scope = (value?: string | null) => String(value || "default").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "default";
export const mediaManiaStorageKey = (playerId: string, libraryId?: string | null) => `${KEY_PREFIX}:${scope(playerId)}:${scope(libraryId)}`;
export const createMediaManiaSessionId = () => `mm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

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

export async function loadMediaManiaSave(playerId: string, libraryId?: string | null): Promise<MediaManiaSave | null> {
  try {
    const raw = await read(mediaManiaStorageKey(playerId, libraryId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MediaManiaSave;
    const state = restoreMediaManiaState(parsed?.state);
    if (parsed?.schemaVersion !== MEDIA_MANIA_SAVE_SCHEMA_VERSION || !state || !Array.isArray(parsed.events)) return null;
    return { schemaVersion: MEDIA_MANIA_SAVE_SCHEMA_VERSION, state, events: parsed.events };
  } catch {
    return null;
  }
}

export async function saveMediaMania(playerId: string, libraryId: string | null | undefined, state: MediaManiaState, events: MediaManiaEvent[]): Promise<void> {
  const payload: MediaManiaSave = { schemaVersion: MEDIA_MANIA_SAVE_SCHEMA_VERSION, state, events };
  await write(mediaManiaStorageKey(playerId, libraryId), JSON.stringify(payload));
}
