import {
  normalizeAvailableAgeBands,
  normalizePatronAgeBands,
  type AgeBandSelection,
} from "./patronAgePreferences";
import { canonicalLibraryId, libraryIdReadCandidates } from "./libraryIdMigration.mjs";

export const PATRON_CUSTOMIZATION_STORAGE_PREFIX = "novelideas_patron_customization_v1";
export const SWIPE_CATEGORY_KEYS = ["books", "movies", "tv", "games", "youtube", "anime", "podcasts"] as const;

export type SwipeCategoryKey = (typeof SWIPE_CATEGORY_KEYS)[number];
export type SwipeCategorySelection = Record<SwipeCategoryKey, boolean>;

export type PatronAppearanceOverrides = {
  name?: string;
  logoDataUrl?: string;
  mainColorHex?: string;
  highlightColorHex?: string;
  fontColorHex?: string;
};

export type PatronCustomization = {
  appearance?: PatronAppearanceOverrides;
  ageBands?: AgeBandSelection;
  swipeCategories?: SwipeCategorySelection;
};

export type InheritedAppearance = {
  name: string;
  logoDataUrl: string | null;
  mainColorHex: string;
  highlightColorHex: string;
  fontColorHex: string;
};

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

export function patronCustomizationStorageKey(patronId: string, libraryId?: string): string {
  return patronCustomizationStorageKeyExact(patronId, canonicalLibraryId(libraryId) || "default");
}

function patronCustomizationStorageKeyExact(patronId: string, libraryId: string): string {
  return `${PATRON_CUSTOMIZATION_STORAGE_PREFIX}:${scopePart(patronId, "anonymous")}:${scopePart(libraryId, "default")}`;
}

function patronCustomizationPrefix(patronId: string): string {
  return `${PATRON_CUSTOMIZATION_STORAGE_PREFIX}:${scopePart(patronId, "anonymous")}:`;
}

export function normalizeAvailableSwipeCategories(
  input: Partial<Record<SwipeCategoryKey, boolean>>,
): SwipeCategorySelection {
  return Object.fromEntries(
    SWIPE_CATEGORY_KEYS.map((key) => [key, input[key] !== false]),
  ) as SwipeCategorySelection;
}

export function effectivePatronSwipeCategories(
  available: Partial<Record<SwipeCategoryKey, boolean>>,
  preference?: SwipeCategorySelection,
): SwipeCategorySelection {
  const normalizedAvailable = normalizeAvailableSwipeCategories(available);
  if (!preference) return normalizedAvailable;
  return Object.fromEntries(
    SWIPE_CATEGORY_KEYS.map((key) => [key, normalizedAvailable[key] && preference[key] === true]),
  ) as SwipeCategorySelection;
}

function cleanOptionalString(value: unknown): string | undefined {
  const cleaned = String(value || "").trim();
  return cleaned || undefined;
}

export function normalizePatronCustomization(input: unknown): PatronCustomization {
  if (!input || typeof input !== "object") return {};
  const source = input as PatronCustomization;
  const appearanceSource = source.appearance && typeof source.appearance === "object" ? source.appearance : {};
  const appearance: PatronAppearanceOverrides = {
    name: cleanOptionalString(appearanceSource.name),
    logoDataUrl: cleanOptionalString(appearanceSource.logoDataUrl),
    mainColorHex: cleanOptionalString(appearanceSource.mainColorHex),
    highlightColorHex: cleanOptionalString(appearanceSource.highlightColorHex),
    fontColorHex: cleanOptionalString(appearanceSource.fontColorHex),
  };
  Object.keys(appearance).forEach((key) => {
    if (appearance[key as keyof PatronAppearanceOverrides] === undefined) {
      delete appearance[key as keyof PatronAppearanceOverrides];
    }
  });

  const ageBands = normalizePatronAgeBands(source.ageBands, normalizeAvailableAgeBands({})) ?? undefined;
  const swipeCategories = source.swipeCategories && typeof source.swipeCategories === "object"
    ? Object.fromEntries(
        SWIPE_CATEGORY_KEYS.map((key) => [key, source.swipeCategories?.[key] === true]),
      ) as SwipeCategorySelection
    : undefined;

  return {
    ...(Object.keys(appearance).length ? { appearance } : {}),
    ...(ageBands ? { ageBands } : {}),
    ...(swipeCategories ? { swipeCategories } : {}),
  };
}

function parseCustomization(raw: string | null, legacyAgeBands?: AgeBandSelection | null): PatronCustomization {
  if (!raw) return legacyAgeBands ? { ageBands: legacyAgeBands } : {};
  const customization = normalizePatronCustomization(JSON.parse(raw));
  if (!customization.ageBands && legacyAgeBands) customization.ageBands = legacyAgeBands;
  return customization;
}

export function readPatronCustomization(
  storage: SyncStorage,
  patronId: string,
  libraryId?: string,
  legacyAgeBands?: AgeBandSelection | null,
): PatronCustomization {
  const canonicalKey = patronCustomizationStorageKey(patronId, libraryId);
  for (const candidateId of libraryIdReadCandidates(canonicalLibraryId(libraryId) || "default")) {
    const candidateKey = patronCustomizationStorageKeyExact(patronId, candidateId);
    const raw = storage.getItem(candidateKey);
    if (raw) {
      if (candidateKey !== canonicalKey) storage.setItem(canonicalKey, raw);
      return parseCustomization(raw, legacyAgeBands);
    }
  }
  return parseCustomization(null, legacyAgeBands);
}

export function writePatronCustomization(
  storage: SyncStorage,
  patronId: string,
  libraryId: string | undefined,
  customization: PatronCustomization,
): void {
  const normalized = normalizePatronCustomization(customization);
  if (Object.keys(normalized).length === 0) {
    storage.removeItem(patronCustomizationStorageKey(patronId, libraryId));
    return;
  }
  storage.setItem(patronCustomizationStorageKey(patronId, libraryId), JSON.stringify(normalized));
}

export function clearPatronCustomization(storage: SyncStorage, patronId: string, libraryId?: string): void {
  for (const candidateId of libraryIdReadCandidates(canonicalLibraryId(libraryId) || "default")) {
    storage.removeItem(patronCustomizationStorageKeyExact(patronId, candidateId));
  }
}

export function clearAllPatronCustomizations(storage: SyncStorage, patronId: string): void {
  const prefix = patronCustomizationPrefix(patronId);
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  keys.forEach((key) => storage.removeItem(key));
}

export async function readPatronCustomizationAsync(
  storage: AsyncStorage,
  patronId: string,
  libraryId?: string,
  legacyAgeBands?: AgeBandSelection | null,
): Promise<PatronCustomization> {
  const canonicalKey = patronCustomizationStorageKey(patronId, libraryId);
  for (const candidateId of libraryIdReadCandidates(canonicalLibraryId(libraryId) || "default")) {
    const candidateKey = patronCustomizationStorageKeyExact(patronId, candidateId);
    const raw = await storage.getItem(candidateKey);
    if (raw) {
      if (candidateKey !== canonicalKey) await storage.setItem(canonicalKey, raw);
      return parseCustomization(raw, legacyAgeBands);
    }
  }
  return parseCustomization(null, legacyAgeBands);
}

export async function writePatronCustomizationAsync(
  storage: AsyncStorage,
  patronId: string,
  libraryId: string | undefined,
  customization: PatronCustomization,
): Promise<void> {
  const normalized = normalizePatronCustomization(customization);
  if (Object.keys(normalized).length === 0) {
    await storage.removeItem(patronCustomizationStorageKey(patronId, libraryId));
    return;
  }
  await storage.setItem(patronCustomizationStorageKey(patronId, libraryId), JSON.stringify(normalized));
}

export async function clearPatronCustomizationAsync(
  storage: AsyncStorage,
  patronId: string,
  libraryId?: string,
): Promise<void> {
  await Promise.all(
    libraryIdReadCandidates(canonicalLibraryId(libraryId) || "default")
      .map((candidateId) => storage.removeItem(patronCustomizationStorageKeyExact(patronId, candidateId)))
  );
}

export async function clearAllPatronCustomizationsAsync(storage: AsyncStorage, patronId: string): Promise<void> {
  const prefix = patronCustomizationPrefix(patronId);
  const keys = (await storage.getAllKeys()).filter((key) => key.startsWith(prefix));
  await Promise.all(keys.map((key) => storage.removeItem(key)));
}

export function resolvePatronAppearance(
  inherited: InheritedAppearance,
  overrides?: PatronAppearanceOverrides,
): InheritedAppearance {
  return {
    name: overrides?.name ?? inherited.name,
    logoDataUrl: overrides?.logoDataUrl ?? inherited.logoDataUrl,
    mainColorHex: overrides?.mainColorHex ?? inherited.mainColorHex,
    highlightColorHex: overrides?.highlightColorHex ?? inherited.highlightColorHex,
    fontColorHex: overrides?.fontColorHex ?? inherited.fontColorHex,
  };
}
