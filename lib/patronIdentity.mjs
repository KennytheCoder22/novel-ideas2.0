import { canonicalLibraryId } from "./libraryIdMigration.js";

export const PATRON_ID_STORAGE_KEY = "novelideas_patron_id_v1";

function normalizedId(value) {
  return String(value || "").trim();
}

export function createPatronId() {
  const runtimeCrypto = globalThis?.crypto;
  if (typeof runtimeCrypto?.randomUUID === "function") {
    return `patron-${runtimeCrypto.randomUUID()}`;
  }
  return `patron-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function hostedLibraryScope(libraryId) {
  const normalized = canonicalLibraryId(normalizedId(libraryId));
  return normalized ? `:${normalized}` : "";
}

export function pipelineUserIdForPatron(patronId, deckKey, libraryId) {
  return `novelideas:${normalizedId(patronId)}${hostedLibraryScope(libraryId)}:${normalizedId(deckKey)}`;
}

export function pipelineSessionIdForPatron(patronId, deckKey, sessionNonce, libraryId) {
  return `swipe-session:${normalizedId(patronId)}${hostedLibraryScope(libraryId)}:${normalizedId(deckKey)}:${Number(sessionNonce) || 0}`;
}

export function recommendationHistoryKeyForPatron(patronId, deckKey, libraryId) {
  return `${normalizedId(patronId)}${hostedLibraryScope(libraryId)}:${normalizedId(deckKey)}`;
}

export function redactedPatronId(patronId) {
  const value = normalizedId(patronId);
  if (!value) return "(none)";
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function clearPatronRecordStores(...stores) {
  for (const store of stores) {
    if (!store || typeof store !== "object") continue;
    for (const key of Object.keys(store)) {
      delete store[key];
    }
  }
}

export function readOrCreatePatronId(storage, createId = createPatronId) {
  const existing = normalizedId(storage?.getItem?.(PATRON_ID_STORAGE_KEY));
  if (existing) return existing;
  const created = createId();
  storage?.setItem?.(PATRON_ID_STORAGE_KEY, created);
  return created;
}

export function resetPatronIdentity(storage, createId = createPatronId) {
  const previousId = normalizedId(storage?.getItem?.(PATRON_ID_STORAGE_KEY));
  const nextId = createId();
  storage?.setItem?.(PATRON_ID_STORAGE_KEY, nextId);
  return { previousId, nextId };
}

export async function readOrCreatePatronIdAsync(storage, createId = createPatronId) {
  const existing = normalizedId(await storage?.getItem?.(PATRON_ID_STORAGE_KEY));
  if (existing) return existing;
  const created = createId();
  await storage?.setItem?.(PATRON_ID_STORAGE_KEY, created);
  return created;
}

export async function resetPatronIdentityAsync(storage, createId = createPatronId) {
  const previousId = normalizedId(await storage?.getItem?.(PATRON_ID_STORAGE_KEY));
  const nextId = createId();
  await storage?.setItem?.(PATRON_ID_STORAGE_KEY, nextId);
  return { previousId, nextId };
}
