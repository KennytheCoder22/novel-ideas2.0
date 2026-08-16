export const PATRON_MY_LIST_STORAGE_PREFIX = "novelideas_patron_my_list_v1";

export type SavedRecommendation = {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  subLocation?: string;
  callNumber?: string;
  source?: string;
  sourceId?: string;
  savedAt: string;
};

type SyncStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

type AsyncStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
};

function normalizedScope(value: unknown, fallback: string): string {
  return encodeURIComponent(String(value || "").trim().toLowerCase() || fallback);
}

function normalizedBookPart(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function patronMyListStorageKey(patronId: string, libraryId?: string): string {
  return `${PATRON_MY_LIST_STORAGE_PREFIX}:${normalizedScope(patronId, "anonymous")}:${normalizedScope(libraryId, "default")}`;
}

function patronMyListStoragePrefix(patronId: string): string {
  return `${PATRON_MY_LIST_STORAGE_PREFIX}:${normalizedScope(patronId, "anonymous")}:`;
}

export function savedRecommendationId(item: Pick<SavedRecommendation, "title" | "author">): string {
  return `book:${normalizedBookPart(item.title)}::${normalizedBookPart(item.author)}`;
}

export function normalizeSavedRecommendation(
  item: Omit<SavedRecommendation, "id" | "savedAt"> & Partial<Pick<SavedRecommendation, "id" | "savedAt">>,
): SavedRecommendation {
  const title = String(item.title || "").trim() || "Untitled";
  const author = String(item.author || "").trim() || "Unknown author";
  return {
    id: savedRecommendationId({ title, author }),
    title,
    author,
    coverUrl: String(item.coverUrl || "").trim() || undefined,
    subLocation: String(item.subLocation || "").trim() || undefined,
    callNumber: String(item.callNumber || "").trim() || undefined,
    source: String(item.source || "").trim() || undefined,
    sourceId: String(item.sourceId || "").trim() || undefined,
    savedAt: String(item.savedAt || "").trim() || new Date().toISOString(),
  };
}

function parseSavedRecommendations(raw: string | null): SavedRecommendation[] {
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Patron My List data must be an array");
  return parsed
    .filter((item) => item && typeof item === "object")
    .map((item) => normalizeSavedRecommendation(item));
}

export function addSavedRecommendation(
  items: readonly SavedRecommendation[],
  item: Omit<SavedRecommendation, "id" | "savedAt"> & Partial<Pick<SavedRecommendation, "id" | "savedAt">>,
): { items: SavedRecommendation[]; added: boolean } {
  const normalized = normalizeSavedRecommendation(item);
  if (items.some((existing) => existing.id === normalized.id)) {
    return { items: [...items], added: false };
  }
  return { items: [...items, normalized], added: true };
}

export function removeSavedRecommendation(
  items: readonly SavedRecommendation[],
  itemId: string,
): SavedRecommendation[] {
  return items.filter((item) => item.id !== itemId);
}

export function readPatronMyList(storage: SyncStorage, patronId: string, libraryId?: string): SavedRecommendation[] {
  return parseSavedRecommendations(storage.getItem(patronMyListStorageKey(patronId, libraryId)));
}

export function writePatronMyList(
  storage: SyncStorage,
  patronId: string,
  libraryId: string | undefined,
  items: readonly SavedRecommendation[],
): void {
  storage.setItem(patronMyListStorageKey(patronId, libraryId), JSON.stringify(items));
}

export function clearPatronMyList(storage: SyncStorage, patronId: string, libraryId?: string): void {
  storage.removeItem(patronMyListStorageKey(patronId, libraryId));
}

export function clearAllPatronMyLists(storage: SyncStorage, patronId: string): void {
  const prefix = patronMyListStoragePrefix(patronId);
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  keys.forEach((key) => storage.removeItem(key));
}

export async function readPatronMyListAsync(
  storage: AsyncStorage,
  patronId: string,
  libraryId?: string,
): Promise<SavedRecommendation[]> {
  return parseSavedRecommendations(await storage.getItem(patronMyListStorageKey(patronId, libraryId)));
}

export async function writePatronMyListAsync(
  storage: AsyncStorage,
  patronId: string,
  libraryId: string | undefined,
  items: readonly SavedRecommendation[],
): Promise<void> {
  await storage.setItem(patronMyListStorageKey(patronId, libraryId), JSON.stringify(items));
}

export async function clearPatronMyListAsync(
  storage: AsyncStorage,
  patronId: string,
  libraryId?: string,
): Promise<void> {
  await storage.removeItem(patronMyListStorageKey(patronId, libraryId));
}

export async function clearAllPatronMyListsAsync(storage: AsyncStorage, patronId: string): Promise<void> {
  const prefix = patronMyListStoragePrefix(patronId);
  const keys = (await storage.getAllKeys()).filter((key) => key.startsWith(prefix));
  await Promise.all(keys.map((key) => storage.removeItem(key)));
}
