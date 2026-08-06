import type { LocalCollectionArtifact } from "./types";
import { loadSharedLibraryCollection, saveSharedLibraryCollection } from "../librarySharing/client";

const LOCAL_COLLECTION_DB_NAME = "novelideas_local_collection";
const LOCAL_COLLECTION_DB_STORE = "artifacts";
const LOCAL_COLLECTION_DB_VERSION = 1;

export const LOCAL_COLLECTION_RECOMMENDATION_STORAGE_KEY = "novelideas_local_collection_recommendation_v1";
export const LOCAL_COLLECTION_SUMMARY_STORAGE_KEY = "novelideas_local_collection_artifact_v1";

export type LocalCollectionRecommendationRecord = {
  localId: string;
  title: string;
  author: string;
  publicationYear?: number;
  audience?: string;
  readingLevel?: string;
  shelvingLocation?: string;
  localPlacement?: string;
  callNumber?: string;
  availability?: string;
  coverUrl?: string;
  copies: number;
  isbn10?: string;
  isbn13?: string;
};

export type LocalCollectionRecommendationArtifact = {
  schemaVersion: "local_collection_recommendation_v1";
  createdAt: string;
  metadata: LocalCollectionArtifact["metadata"];
  deterministicContentHash: string;
  summary: LocalCollectionArtifact["summary"];
  records: LocalCollectionRecommendationRecord[];
};

type LocalCollectionSummarySnapshot = {
  schemaVersion: "local_collection_summary_v1";
  deterministicContentHash: string;
  metadata: LocalCollectionArtifact["metadata"];
  summary: LocalCollectionArtifact["summary"];
  acceptedRecordsCount: number;
};

function canUseLocalStorage(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function canUseIndexedDb(): boolean {
  try {
    return typeof (globalThis as any)?.indexedDB !== "undefined";
  } catch {
    return false;
  }
}

function isQuotaExceededError(error: unknown): boolean {
  const err = error as { name?: unknown; code?: unknown; message?: unknown } | null;
  const name = String(err?.name || "").toLowerCase();
  const message = String(err?.message || "").toLowerCase();
  const code = Number(err?.code || 0);
  return (
    name.includes("quota")
    || message.includes("quota")
    || code === 22
    || code === 1014
  );
}

function toRecommendationRecord(record: LocalCollectionArtifact["acceptedRecords"][number]): LocalCollectionRecommendationRecord {
  return {
    localId: String(record.localId || ""),
    title: String(record.title || ""),
    author: String(record.author || ""),
    publicationYear: Number.isFinite(Number(record.publicationYear)) ? Number(record.publicationYear) : undefined,
    audience: String(record.audience || "").trim() || undefined,
    readingLevel: String(record.readingLevel || "").trim() || undefined,
    shelvingLocation: String(record.shelvingLocation || "").trim() || undefined,
    localPlacement: String(record.localPlacement || "").trim() || undefined,
    callNumber: String(record.callNumber || "").trim() || undefined,
    availability: String(record.availability || "").trim() || undefined,
    coverUrl: String(record.coverUrl || "").trim() || undefined,
    copies: Math.max(1, Number(record.copies || 1) || 1),
    isbn10: String(record.isbn10 || "").trim() || undefined,
    isbn13: String(record.isbn13 || "").trim() || undefined,
  };
}

export function buildRecommendationArtifact(artifact: LocalCollectionArtifact): LocalCollectionRecommendationArtifact {
  return {
    schemaVersion: "local_collection_recommendation_v1",
    createdAt: new Date().toISOString(),
    metadata: artifact.metadata,
    deterministicContentHash: artifact.deterministicContentHash,
    summary: artifact.summary,
    records: (artifact.acceptedRecords || [])
      .map(toRecommendationRecord)
      .filter((record) => record.localId && record.title && record.author),
  };
}

function buildSummarySnapshot(artifact: LocalCollectionArtifact): LocalCollectionSummarySnapshot {
  return {
    schemaVersion: "local_collection_summary_v1",
    deterministicContentHash: artifact.deterministicContentHash,
    metadata: artifact.metadata,
    summary: artifact.summary,
    acceptedRecordsCount: Number(artifact.summary?.acceptedTitles || 0),
  };
}

function openLocalCollectionDb(): Promise<any | null> {
  return new Promise((resolve) => {
    if (!canUseIndexedDb()) return resolve(null);
    let request: any;
    try {
      request = (globalThis as any).indexedDB.open(LOCAL_COLLECTION_DB_NAME, LOCAL_COLLECTION_DB_VERSION);
    } catch {
      return resolve(null);
    }
    request.onupgradeneeded = () => {
      try {
        const db = request.result;
        if (!db.objectStoreNames.contains(LOCAL_COLLECTION_DB_STORE)) db.createObjectStore(LOCAL_COLLECTION_DB_STORE);
      } catch {
        // Ignore upgrade errors; caller will fallback.
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function writeIndexedDbValue(key: string, value: unknown): Promise<boolean> {
  const db = await openLocalCollectionDb();
  if (!db) return false;
  return await new Promise((resolve) => {
    try {
      const tx = db.transaction(LOCAL_COLLECTION_DB_STORE, "readwrite");
      tx.objectStore(LOCAL_COLLECTION_DB_STORE).put(value, key);
      tx.oncomplete = () => {
        try { db.close(); } catch {}
        resolve(true);
      };
      tx.onerror = () => {
        try { db.close(); } catch {}
        resolve(false);
      };
      tx.onabort = () => {
        try { db.close(); } catch {}
        resolve(false);
      };
    } catch {
      try { db.close(); } catch {}
      resolve(false);
    }
  });
}

async function readIndexedDbValue<T>(key: string): Promise<T | null> {
  const db = await openLocalCollectionDb();
  if (!db) return null;
  return await new Promise((resolve) => {
    try {
      const tx = db.transaction(LOCAL_COLLECTION_DB_STORE, "readonly");
      const request = tx.objectStore(LOCAL_COLLECTION_DB_STORE).get(key);
      request.onsuccess = () => {
        try { db.close(); } catch {}
        resolve((request.result as T) || null);
      };
      request.onerror = () => {
        try { db.close(); } catch {}
        resolve(null);
      };
    } catch {
      try { db.close(); } catch {}
      resolve(null);
    }
  });
}

function localStorageGetJson<T>(key: string): T | null {
  if (!canUseLocalStorage()) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function localStorageSetJson(key: string, value: unknown): void {
  if (!canUseLocalStorage()) return;
  localStorage.setItem(key, JSON.stringify(value));
}

function fromLegacyArtifact(raw: any): LocalCollectionRecommendationArtifact | null {
  if (!raw || !Array.isArray(raw.acceptedRecords)) return null;
  const records = raw.acceptedRecords
    .map((record: any) => ({
      localId: String(record?.localId || ""),
      title: String(record?.title || ""),
      author: String(record?.author || ""),
      publicationYear: Number.isFinite(Number(record?.publicationYear)) ? Number(record.publicationYear) : undefined,
      audience: String(record?.audience || "").trim() || undefined,
      readingLevel: String(record?.readingLevel || "").trim() || undefined,
      shelvingLocation: String(record?.shelvingLocation || "").trim() || undefined,
      localPlacement: String(record?.localPlacement || "").trim() || undefined,
      callNumber: String(record?.callNumber || "").trim() || undefined,
      availability: String(record?.availability || "").trim() || undefined,
      coverUrl: String(record?.coverUrl || "").trim() || undefined,
      copies: Math.max(1, Number(record?.copies || 1) || 1),
      isbn10: String(record?.isbn10 || "").trim() || undefined,
      isbn13: String(record?.isbn13 || "").trim() || undefined,
    }))
    .filter((record: LocalCollectionRecommendationRecord) => record.localId && record.title && record.author);

  return {
    schemaVersion: "local_collection_recommendation_v1",
    createdAt: new Date().toISOString(),
    metadata: raw.metadata || { schemaVersion: "local_collection_import_v1" },
    deterministicContentHash: String(raw?.deterministicContentHash || ""),
    summary: raw.summary || {
      totalRows: records.length,
      acceptedTitles: records.length,
      mergedDuplicatesOrCopies: 0,
      rejectedRows: 0,
      warnings: 0,
      titlesMissingCovers: 0,
      titlesMissingIsbns: 0,
      titlesMissingAudienceOrShelfMetadata: 0,
    },
    records,
  };
}

export async function persistLocalCollectionRecommendationArtifact(artifact: LocalCollectionArtifact): Promise<{
  recordCount: number;
  storage: "indexeddb" | "localstorage";
}> {
  const recommendationArtifact = buildRecommendationArtifact(artifact);
  const summarySnapshot = buildSummarySnapshot(artifact);

  let indexedDbStored = false;
  if (canUseIndexedDb()) {
    indexedDbStored = await writeIndexedDbValue(LOCAL_COLLECTION_RECOMMENDATION_STORAGE_KEY, recommendationArtifact);
  }

  if (indexedDbStored) {
    try {
      localStorageSetJson(LOCAL_COLLECTION_SUMMARY_STORAGE_KEY, summarySnapshot);
      if (canUseLocalStorage()) localStorage.removeItem(LOCAL_COLLECTION_RECOMMENDATION_STORAGE_KEY);
    } catch {
      // Keep import successful even if summary snapshot cannot be written.
    }
    return { recordCount: recommendationArtifact.records.length, storage: "indexeddb" };
  }

  try {
    localStorageSetJson(LOCAL_COLLECTION_RECOMMENDATION_STORAGE_KEY, recommendationArtifact);
    localStorageSetJson(LOCAL_COLLECTION_SUMMARY_STORAGE_KEY, summarySnapshot);
    return { recordCount: recommendationArtifact.records.length, storage: "localstorage" };
  } catch (error) {
    if (isQuotaExceededError(error)) {
      throw new Error("collection_storage_quota_exceeded");
    }
    throw error;
  }
}

export async function publishSharedLocalCollectionRecommendationArtifact(libraryId: string, artifact: LocalCollectionArtifact): Promise<boolean> {
  const id = String(libraryId || "").trim();
  if (!id) return false;
  const recommendationArtifact = buildRecommendationArtifact(artifact);
  // Persist through the shared API. In vercel_blob mode the API writes to
  // Vercel Blob server-side; in local_filesystem mode it writes to disk.
  return saveSharedLibraryCollection(id, recommendationArtifact as Record<string, unknown>);
}

export async function loadLocalCollectionRecommendationArtifact(libraryId?: string): Promise<LocalCollectionRecommendationArtifact | null> {
  const indexed = await readIndexedDbValue<LocalCollectionRecommendationArtifact>(LOCAL_COLLECTION_RECOMMENDATION_STORAGE_KEY);
  if (indexed && indexed.schemaVersion === "local_collection_recommendation_v1" && Array.isArray(indexed.records)) {
    return indexed;
  }

  const recommended = localStorageGetJson<LocalCollectionRecommendationArtifact>(LOCAL_COLLECTION_RECOMMENDATION_STORAGE_KEY);
  if (recommended && recommended.schemaVersion === "local_collection_recommendation_v1" && Array.isArray(recommended.records)) {
    return recommended;
  }

  const legacy = localStorageGetJson<any>(LOCAL_COLLECTION_SUMMARY_STORAGE_KEY);
  const convertedLegacy = fromLegacyArtifact(legacy);
  if (convertedLegacy) return convertedLegacy;

  const sharedLibraryId = String(libraryId || "").trim();
  if (sharedLibraryId) {
    const shared = await loadSharedLibraryCollection(sharedLibraryId);
    if (shared && shared.schemaVersion === "local_collection_recommendation_v1" && Array.isArray(shared.records)) {
      return shared as LocalCollectionRecommendationArtifact;
    }
  }

  return null;
}

export function readLocalCollectionAcceptedCountFromLocalStorage(): number {
  const summary = localStorageGetJson<any>(LOCAL_COLLECTION_SUMMARY_STORAGE_KEY);
  if (summary) {
    if (Number.isFinite(Number(summary.acceptedRecordsCount))) {
      return Math.max(0, Number(summary.acceptedRecordsCount));
    }
    if (Number.isFinite(Number(summary?.summary?.acceptedTitles))) {
      return Math.max(0, Number(summary.summary.acceptedTitles));
    }
    if (Array.isArray(summary.acceptedRecords)) {
      return summary.acceptedRecords.length;
    }
  }

  const recommendation = localStorageGetJson<LocalCollectionRecommendationArtifact>(LOCAL_COLLECTION_RECOMMENDATION_STORAGE_KEY);
  if (recommendation && Array.isArray(recommendation.records)) return recommendation.records.length;
  return 0;
}
