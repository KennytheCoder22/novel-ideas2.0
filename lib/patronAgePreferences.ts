import { canonicalLibraryId, libraryIdReadCandidates } from "./libraryIdMigration.js";

export const PATRON_AGE_PREFERENCES_STORAGE_PREFIX = "novelideas_patron_age_preferences_v1";

export const AGE_BAND_KEYS = ["k2", "36", "ms_hs", "adult"] as const;
export type AgeBandKey = (typeof AGE_BAND_KEYS)[number];
export type AgeBandSelection = Record<AgeBandKey, boolean>;

type SyncStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
type AsyncStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
};

function scopePart(value: unknown, fallback: string): string {
  return encodeURIComponent(String(value || "").trim().toLowerCase() || fallback);
}

export function patronAgePreferencesStorageKey(patronId: string, libraryId?: string): string {
  return patronAgePreferencesStorageKeyExact(patronId, canonicalLibraryId(libraryId) || "default");
}

function patronAgePreferencesStorageKeyExact(patronId: string, libraryId: string): string {
  return `${PATRON_AGE_PREFERENCES_STORAGE_PREFIX}:${scopePart(patronId, "anonymous")}:${scopePart(libraryId, "default")}`;
}

function patronAgePreferencesPrefix(patronId: string): string {
  return `${PATRON_AGE_PREFERENCES_STORAGE_PREFIX}:${scopePart(patronId, "anonymous")}:`;
}

export function normalizeAvailableAgeBands(input: Partial<Record<AgeBandKey, boolean>>): AgeBandSelection {
  return Object.fromEntries(AGE_BAND_KEYS.map((key) => [key, input[key] !== false])) as AgeBandSelection;
}

export function normalizePatronAgeBands(
  input: unknown,
  available: Partial<Record<AgeBandKey, boolean>>,
): AgeBandSelection | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Partial<Record<AgeBandKey, unknown>>;
  const normalizedAvailable = normalizeAvailableAgeBands(available);
  const selected = Object.fromEntries(
    AGE_BAND_KEYS.map((key) => [key, normalizedAvailable[key] && record[key] === true]),
  ) as AgeBandSelection;
  return AGE_BAND_KEYS.some((key) => selected[key]) ? selected : null;
}

export function effectivePatronAgeBands(
  available: Partial<Record<AgeBandKey, boolean>>,
  preference: AgeBandSelection | null,
): AgeBandSelection {
  const normalizedAvailable = normalizeAvailableAgeBands(available);
  if (!preference) return normalizedAvailable;
  return Object.fromEntries(
    AGE_BAND_KEYS.map((key) => [key, normalizedAvailable[key] && preference[key] === true]),
  ) as AgeBandSelection;
}

function parsePreference(raw: string | null, available: Partial<Record<AgeBandKey, boolean>>): AgeBandSelection | null {
  if (!raw) return null;
  return normalizePatronAgeBands(JSON.parse(raw), available);
}

export function readPatronAgePreferences(
  storage: SyncStorage,
  patronId: string,
  libraryId: string | undefined,
  available: Partial<Record<AgeBandKey, boolean>>,
): AgeBandSelection | null {
  const canonicalKey = patronAgePreferencesStorageKey(patronId, libraryId);
  for (const candidateId of libraryIdReadCandidates(canonicalLibraryId(libraryId) || "default")) {
    const candidateKey = patronAgePreferencesStorageKeyExact(patronId, candidateId);
    const raw = storage.getItem(candidateKey);
    if (raw) {
      if (candidateKey !== canonicalKey) storage.setItem(canonicalKey, raw);
      return parsePreference(raw, available);
    }
  }
  return null;
}

export function writePatronAgePreferences(
  storage: SyncStorage,
  patronId: string,
  libraryId: string | undefined,
  preference: AgeBandSelection,
): void {
  storage.setItem(patronAgePreferencesStorageKey(patronId, libraryId), JSON.stringify(preference));
}

export async function readPatronAgePreferencesAsync(
  storage: AsyncStorage,
  patronId: string,
  libraryId: string | undefined,
  available: Partial<Record<AgeBandKey, boolean>>,
): Promise<AgeBandSelection | null> {
  const canonicalKey = patronAgePreferencesStorageKey(patronId, libraryId);
  for (const candidateId of libraryIdReadCandidates(canonicalLibraryId(libraryId) || "default")) {
    const candidateKey = patronAgePreferencesStorageKeyExact(patronId, candidateId);
    const raw = await storage.getItem(candidateKey);
    if (raw) {
      if (candidateKey !== canonicalKey) await storage.setItem(canonicalKey, raw);
      return parsePreference(raw, available);
    }
  }
  return null;
}

export async function writePatronAgePreferencesAsync(
  storage: AsyncStorage,
  patronId: string,
  libraryId: string | undefined,
  preference: AgeBandSelection,
): Promise<void> {
  await storage.setItem(patronAgePreferencesStorageKey(patronId, libraryId), JSON.stringify(preference));
}

export function clearAllPatronAgePreferences(storage: SyncStorage, patronId: string): void {
  const prefix = patronAgePreferencesPrefix(patronId);
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) keys.push(key);
  }

  keys.forEach((key) => storage.removeItem(key));
}

export function clearPatronAgePreferences(storage: SyncStorage, patronId: string, libraryId?: string): void {
  for (const candidateId of libraryIdReadCandidates(canonicalLibraryId(libraryId) || "default")) {
    storage.removeItem(patronAgePreferencesStorageKeyExact(patronId, candidateId));
  }
}

export async function clearAllPatronAgePreferencesAsync(storage: AsyncStorage, patronId: string): Promise<void> {
  const prefix = patronAgePreferencesPrefix(patronId);
  const keys = (await storage.getAllKeys()).filter((key) => key.startsWith(prefix));
  await Promise.all(keys.map((key) => storage.removeItem(key)));
}

export async function clearPatronAgePreferencesAsync(
  storage: AsyncStorage,
  patronId: string,
  libraryId?: string,
): Promise<void> {
  await Promise.all(
    libraryIdReadCandidates(canonicalLibraryId(libraryId) || "default")
      .map((candidateId) => storage.removeItem(patronAgePreferencesStorageKeyExact(patronId, candidateId)))
  );
}
