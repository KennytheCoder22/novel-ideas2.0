import type { LocalCollectionArtifact } from "./types";
import {
  buildCollectionHealth,
  collectionContentChecksum,
  runCollectionSmokeTest,
} from "./health";
import type {
  LocalCollectionHealth,
  LocalCollectionPublishStatus,
  LocalCollectionSmokeTest,
  LocalCollectionVersionMetadata,
} from "./types";
import { deterministicHash } from "./hash";
import {
  buildRejectedRecordsReport,
  type LocalCollectionRejectedRecordsReport,
} from "./rejectedRecords";
import {
  encodeGzipBase64Json,
  loadSharedLibraryCollection,
  saveCompressedSharedLibraryCollectionWithDiagnostics,
  saveSharedLibraryCollectionWithDiagnostics,
} from "../librarySharing/client";
import { ADMIN_CONFIG_DEFAULT_SCOPE, normalizeAdminDraftScopeId } from "../../constants/brandTheme";
import { libraryIdReadCandidates, YVHS_LIBRARY_ID } from "../libraryIdMigration.js";

const LOCAL_COLLECTION_DB_NAME = "novelideas_local_collection";
const LOCAL_COLLECTION_DB_STORE = "artifacts";
const LOCAL_COLLECTION_DB_VERSION = 1;

export const LOCAL_COLLECTION_RECOMMENDATION_STORAGE_KEY = "novelideas_local_collection_recommendation_v1";
export const LOCAL_COLLECTION_SUMMARY_STORAGE_KEY = "novelideas_local_collection_artifact_v1";
export const SHARED_COLLECTION_POST_MAX_BYTES = 4 * 1024 * 1024;

export function normalizeLocalCollectionScopeId(raw?: string): string {
  return normalizeAdminDraftScopeId(String(raw || ""));
}

export function localCollectionRecommendationStorageKeyForScope(scopeId?: string): string {
  return localCollectionRecommendationStorageKeyForExactScope(normalizeLocalCollectionScopeId(scopeId));
}

export function localCollectionSummaryStorageKeyForScope(scopeId?: string): string {
  return localCollectionSummaryStorageKeyForExactScope(normalizeLocalCollectionScopeId(scopeId));
}

function localCollectionRecommendationStorageKeyForExactScope(scopeId: string): string {
  return `${LOCAL_COLLECTION_RECOMMENDATION_STORAGE_KEY}:${scopeId}`;
}

function localCollectionSummaryStorageKeyForExactScope(scopeId: string): string {
  return `${LOCAL_COLLECTION_SUMMARY_STORAGE_KEY}:${scopeId}`;
}

export type LocalCollectionRecommendationRecord = {
  localId: string;
  title: string;
  author: string;
  description?: string;
  publicationYear?: number;
  audience?: string;
  readingLevel?: string;
  subjects?: string[];
  genres?: string[];
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
  collectionVersion?: LocalCollectionVersionMetadata;
  health?: LocalCollectionHealth;
  adminRejectedRecordsReport?: LocalCollectionRejectedRecordsReport;
};

type LocalCollectionSummarySnapshot = {
  schemaVersion: "local_collection_summary_v1";
  deterministicContentHash: string;
  metadata: LocalCollectionArtifact["metadata"];
  summary: LocalCollectionArtifact["summary"];
  acceptedRecordsCount: number;
  collectionVersion?: LocalCollectionVersionMetadata;
  health?: LocalCollectionHealth;
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

function utf8ByteLength(value: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).byteLength;
  }
  try {
    return new Blob([value]).size;
  } catch {
    return value.length;
  }
}

function sanitizeSharedCoverUrl(input: unknown): string | undefined {
  const raw = String(input || "").trim();
  if (!raw) return undefined;
  if (/^data:/i.test(raw)) return undefined;
  if (raw.length > 2048) return undefined;
  return raw;
}

function toRecommendationRecord(record: LocalCollectionArtifact["acceptedRecords"][number]): LocalCollectionRecommendationRecord {
  return {
    localId: String(record.localId || ""),
    title: String(record.title || ""),
    author: String(record.author || ""),
    description: String(record.description || "").trim() || undefined,
    publicationYear: Number.isFinite(Number(record.publicationYear)) ? Number(record.publicationYear) : undefined,
    audience: String(record.audience || "").trim() || undefined,
    readingLevel: String(record.readingLevel || "").trim() || undefined,
    subjects: Array.isArray(record.subjects) ? record.subjects.map(String).map((value) => value.trim()).filter(Boolean) : undefined,
    genres: Array.isArray(record.genres) ? record.genres.map(String).map((value) => value.trim()).filter(Boolean) : undefined,
    shelvingLocation: String(record.shelvingLocation || "").trim() || undefined,
    localPlacement: String(record.localPlacement || "").trim() || undefined,
    callNumber: String(record.callNumber || "").trim() || undefined,
    availability: String(record.availability || "").trim() || undefined,
    coverUrl: sanitizeSharedCoverUrl(record.coverUrl),
    copies: Math.max(1, Number(record.copies || 1) || 1),
    isbn10: String(record.isbn10 || "").trim() || undefined,
    isbn13: String(record.isbn13 || "").trim() || undefined,
  };
}

function safeSourceFilename(value: string): string {
  return String(value || "collection")
    .replace(/[^\w.\- ()]/g, "_")
    .slice(0, 160) || "collection";
}

function publicArtifactMetadata(
  metadata: LocalCollectionArtifact["metadata"],
): LocalCollectionArtifact["metadata"] {
  return {
    ...metadata,
    sourceFilename: safeSourceFilename(metadata.sourceFilename),
    provenance: metadata.provenance ? {
      unmappedCsvHeaders: metadata.provenance.unmappedCsvHeaders,
      marcTags: metadata.provenance.marcTags,
      unrecognizedMarcTags: metadata.provenance.unrecognizedMarcTags,
    } : undefined,
  };
}

export function buildRecommendationArtifact(
  artifact: LocalCollectionArtifact,
  options: {
    publishStatus?: LocalCollectionPublishStatus;
    compressedArtifactBytes?: number;
    smokeTest?: LocalCollectionSmokeTest;
    previousArtifact?: LocalCollectionVersionMetadata["previousArtifact"];
  } = {},
): LocalCollectionRecommendationArtifact {
  const records = (artifact.acceptedRecords || [])
    .map(toRecommendationRecord)
    .filter((record) => record.localId && record.title && record.author);
  const libraryId = normalizeLocalCollectionScopeId(artifact.metadata.libraryId || "");
  const createdAt = artifact.metadata.importTimestamp || new Date().toISOString();
  const contentChecksum = collectionContentChecksum({ libraryId, records });
  const build = (artifactBytes: number): LocalCollectionRecommendationArtifact => {
    const health = buildCollectionHealth(artifact, {
      artifactBytes,
      compressedArtifactBytes: options.compressedArtifactBytes,
      publishStatus: options.publishStatus,
      smokeTest: options.smokeTest,
    });
    const collectionVersion: LocalCollectionVersionMetadata = {
      schemaVersion: "local_collection_artifact_v2",
      artifactId: `lca_${deterministicHash({ libraryId, createdAt, contentChecksum })}`,
      libraryId,
      uploadedAt: createdAt,
      importerVersion: "local_collection_import_v2",
      sourceFormat: artifact.metadata.sourceFormat || "csv",
      sourceFilename: safeSourceFilename(artifact.metadata.sourceFilename),
      recordCount: Number(artifact.summary.totalRows || 0),
      importedCount: records.length,
      contentChecksum,
      originalUploadBytes: health.originalUploadBytes,
      artifactBytes: health.artifactBytes,
      compressedArtifactBytes: health.compressedArtifactBytes,
      publishStatus: health.publishStatus,
      healthStatus: health.status,
      rejectedRecordCount: artifact.rejectedRecords.filter((record) => record.reason !== "duplicate_merged").length,
      duplicatesMerged: Number(artifact.summary.mergedDuplicatesOrCopies || 0),
      previousArtifact: options.previousArtifact,
    };
    return {
      schemaVersion: "local_collection_recommendation_v1",
      createdAt,
      metadata: publicArtifactMetadata(artifact.metadata),
      deterministicContentHash: artifact.deterministicContentHash,
      summary: artifact.summary,
      records,
      collectionVersion,
      health,
      adminRejectedRecordsReport: buildRejectedRecordsReport(artifact, libraryId, collectionVersion.artifactId),
    };
  };
  let result = build(0);
  for (let pass = 0; pass < 2; pass += 1) {
    const measuredBytes = utf8ByteLength(JSON.stringify(result));
    if (result.health?.artifactBytes === measuredBytes) break;
    result = build(measuredBytes);
  }
  return result;
}

function artifactWithHealth(
  artifact: LocalCollectionRecommendationArtifact,
  health: LocalCollectionHealth,
): LocalCollectionRecommendationArtifact {
  return {
    ...artifact,
    health,
    collectionVersion: artifact.collectionVersion ? {
      ...artifact.collectionVersion,
      originalUploadBytes: health.originalUploadBytes,
      artifactBytes: health.artifactBytes,
      compressedArtifactBytes: health.compressedArtifactBytes,
      publishStatus: health.publishStatus,
      healthStatus: health.status,
    } : undefined,
  };
}

export function measureSharedLocalCollectionPublishBytes(
  libraryId: string,
  artifact: LocalCollectionArtifact
): {
  artifactUtf8Bytes: number;
  requestUtf8Bytes: number;
  exceedsFunctionLimit: boolean;
} {
  const id = normalizeLocalCollectionScopeId(libraryId);
  const recommendationArtifact = buildRecommendationArtifact(artifact);
  const artifactJson = JSON.stringify(recommendationArtifact);
  const requestJson = JSON.stringify({ libraryId: id, artifact: recommendationArtifact });
  const artifactUtf8Bytes = utf8ByteLength(artifactJson);
  const requestUtf8Bytes = utf8ByteLength(requestJson);
  return {
    artifactUtf8Bytes,
    requestUtf8Bytes,
    exceedsFunctionLimit: requestUtf8Bytes >= SHARED_COLLECTION_POST_MAX_BYTES,
  };
}

function buildSummarySnapshot(
  artifact: LocalCollectionArtifact,
  recommendationArtifact?: LocalCollectionRecommendationArtifact,
): LocalCollectionSummarySnapshot {
  return {
    schemaVersion: "local_collection_summary_v1",
    deterministicContentHash: artifact.deterministicContentHash,
    metadata: artifact.metadata,
    summary: artifact.summary,
    acceptedRecordsCount: Number(artifact.summary?.acceptedTitles || 0),
    collectionVersion: recommendationArtifact?.collectionVersion,
    health: recommendationArtifact?.health,
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

function localCollectionScopeIdFromLibraryId(libraryId?: string): string {
  return normalizeLocalCollectionScopeId(libraryId || ADMIN_CONFIG_DEFAULT_SCOPE);
}

function scopedLibraryIdForSharedFallback(scopeId: string): string {
  return scopeId === ADMIN_CONFIG_DEFAULT_SCOPE ? "" : scopeId;
}

function artifactBelongsToScope(artifact: LocalCollectionRecommendationArtifact | null, scopeId: string): boolean {
  if (!artifact) return false;
  const artifactScope = normalizeLocalCollectionScopeId(artifact.metadata?.libraryId || "");
  return artifactScope === scopeId;
}

function canonicalizeRecommendationArtifact(
  artifact: LocalCollectionRecommendationArtifact,
  scopeId: string,
): LocalCollectionRecommendationArtifact {
  if (scopeId !== YVHS_LIBRARY_ID) return artifact;
  return {
    ...artifact,
    metadata: { ...artifact.metadata, libraryId: YVHS_LIBRARY_ID },
  };
}

function summarySnapshotForArtifact(
  artifact: LocalCollectionRecommendationArtifact,
): LocalCollectionSummarySnapshot {
  return {
    schemaVersion: "local_collection_summary_v1",
    deterministicContentHash: artifact.deterministicContentHash,
    metadata: artifact.metadata,
    summary: artifact.summary,
    acceptedRecordsCount: Array.isArray(artifact.records) ? artifact.records.length : 0,
    collectionVersion: artifact.collectionVersion,
    health: artifact.health,
  };
}

async function persistRecommendationArtifactForScope(
  recommendationArtifact: LocalCollectionRecommendationArtifact,
  summarySnapshot: LocalCollectionSummarySnapshot,
  scopeId: string
): Promise<{
  recordCount: number;
  storage: "indexeddb" | "localstorage";
}> {
  const recommendationKey = localCollectionRecommendationStorageKeyForScope(scopeId);
  const summaryKey = localCollectionSummaryStorageKeyForScope(scopeId);

  let indexedDbStored = false;
  if (canUseIndexedDb()) {
    indexedDbStored = await writeIndexedDbValue(recommendationKey, recommendationArtifact);
  }

  if (indexedDbStored) {
    try {
      localStorageSetJson(summaryKey, summarySnapshot);
      if (canUseLocalStorage()) localStorage.removeItem(recommendationKey);
    } catch {
      // Keep import successful even if summary snapshot cannot be written.
    }
    return { recordCount: recommendationArtifact.records.length, storage: "indexeddb" };
  }

  try {
    localStorageSetJson(recommendationKey, recommendationArtifact);
    localStorageSetJson(summaryKey, summarySnapshot);
    return { recordCount: recommendationArtifact.records.length, storage: "localstorage" };
  } catch (error) {
    if (isQuotaExceededError(error)) {
      throw new Error("collection_storage_quota_exceeded");
    }
    throw error;
  }
}

async function loadLegacyGlobalLocalCollectionRecommendationArtifact(): Promise<LocalCollectionRecommendationArtifact | null> {
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

  return null;
}

function fromLegacyArtifact(raw: any): LocalCollectionRecommendationArtifact | null {
  if (!raw || !Array.isArray(raw.acceptedRecords)) return null;
  const records = raw.acceptedRecords
    .map((record: any) => ({
      localId: String(record?.localId || ""),
      title: String(record?.title || ""),
      author: String(record?.author || ""),
      description: String(record?.description || "").trim() || undefined,
      publicationYear: Number.isFinite(Number(record?.publicationYear)) ? Number(record.publicationYear) : undefined,
      audience: String(record?.audience || "").trim() || undefined,
      readingLevel: String(record?.readingLevel || "").trim() || undefined,
      subjects: Array.isArray(record?.subjects) ? record.subjects.map(String).map((value: string) => value.trim()).filter(Boolean) : undefined,
      genres: Array.isArray(record?.genres) ? record.genres.map(String).map((value: string) => value.trim()).filter(Boolean) : undefined,
      shelvingLocation: String(record?.shelvingLocation || "").trim() || undefined,
      localPlacement: String(record?.localPlacement || "").trim() || undefined,
      callNumber: String(record?.callNumber || "").trim() || undefined,
      availability: String(record?.availability || "").trim() || undefined,
      coverUrl: sanitizeSharedCoverUrl(record?.coverUrl),
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

export async function persistLocalCollectionRecommendationArtifact(
  artifact: LocalCollectionArtifact,
  options?: { recommendationArtifact?: LocalCollectionRecommendationArtifact },
): Promise<{
  recordCount: number;
  storage: "indexeddb" | "localstorage";
}> {
  const adaptedRecords = buildRecommendationArtifact(artifact).records;
  const recommendationArtifact = options?.recommendationArtifact || buildRecommendationArtifact(artifact, {
      publishStatus: "local_only",
      smokeTest: runCollectionSmokeTest(artifact.acceptedRecords, adaptedRecords, adaptedRecords),
    });
  const summarySnapshot = buildSummarySnapshot(artifact, recommendationArtifact);
  const scopeId = localCollectionScopeIdFromLibraryId(artifact.metadata?.libraryId || "");
  return persistRecommendationArtifactForScope(recommendationArtifact, summarySnapshot, scopeId);
}

export async function publishSharedLocalCollectionRecommendationArtifact(libraryId: string, artifact: LocalCollectionArtifact): Promise<boolean> {
  return (await publishAndVerifySharedLocalCollectionRecommendationArtifact(libraryId, artifact)).success;
}

export type LocalCollectionPublishVerificationResult = {
  success: boolean;
  artifact: LocalCollectionRecommendationArtifact;
  health: LocalCollectionHealth;
  error: string | null;
  previousArtifact: LocalCollectionVersionMetadata["previousArtifact"] | null;
  previousArtifactRetained: boolean;
};

function priorVersionSummary(
  artifact: Record<string, unknown> | null,
): LocalCollectionVersionMetadata["previousArtifact"] | undefined {
  const version = artifact?.collectionVersion;
  if (!version || typeof version !== "object" || Array.isArray(version)) {
    if (!artifact || !Array.isArray(artifact.records)) return undefined;
    const metadata = artifact.metadata && typeof artifact.metadata === "object" && !Array.isArray(artifact.metadata)
      ? artifact.metadata as Record<string, unknown>
      : {};
    const uploadedAt = String(metadata.importTimestamp || artifact.createdAt || "");
    const contentChecksum = String(artifact.deterministicContentHash || "");
    if (!uploadedAt || !contentChecksum) return undefined;
    return {
      artifactId: `legacy_${contentChecksum}`,
      uploadedAt,
      importedCount: artifact.records.length,
      contentChecksum,
    };
  }
  const value = version as Record<string, unknown>;
  const artifactId = String(value.artifactId || "");
  const uploadedAt = String(value.uploadedAt || "");
  const contentChecksum = String(value.contentChecksum || "");
  if (!artifactId || !uploadedAt || !contentChecksum) return undefined;
  return {
    artifactId,
    uploadedAt,
    importedCount: Math.max(0, Number(value.importedCount || 0)),
    contentChecksum,
  };
}

function compressedByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(base64.length * 3 / 4) - padding);
}

export async function publishAndVerifySharedLocalCollectionRecommendationArtifact(
  libraryId: string,
  artifact: LocalCollectionArtifact,
): Promise<LocalCollectionPublishVerificationResult> {
  const id = normalizeLocalCollectionScopeId(libraryId);
  const previousShared = id ? await loadSharedLibraryCollection(id) : null;
  const previousArtifact = priorVersionSummary(previousShared);
  let recommendationArtifact = buildRecommendationArtifact(artifact, {
    publishStatus: "verified",
    previousArtifact,
  });
  const prePublishSmoke = runCollectionSmokeTest(
    artifact.acceptedRecords,
    recommendationArtifact.records,
    recommendationArtifact.records,
  );
  const encoded = await encodeGzipBase64Json(recommendationArtifact as unknown as Record<string, unknown>);
  recommendationArtifact = buildRecommendationArtifact(artifact, {
    publishStatus: "verified",
    compressedArtifactBytes: encoded ? compressedByteLength(encoded) : 0,
    previousArtifact,
    smokeTest: prePublishSmoke,
  });
  if (!id || !prePublishSmoke.passed || recommendationArtifact.health?.status === "failed") {
    const health = buildCollectionHealth(artifact, {
      artifactBytes: utf8ByteLength(JSON.stringify(recommendationArtifact)),
      compressedArtifactBytes: encoded ? compressedByteLength(encoded) : 0,
      publishStatus: "failed",
      smokeTest: prePublishSmoke,
    });
    return {
      success: false,
      artifact: artifactWithHealth(recommendationArtifact, health),
      health,
      error: !id
        ? "missing_library_id"
        : !prePublishSmoke.passed
          ? "pre_publish_smoke_test_failed"
          : "import_health_failed",
      previousArtifact: previousArtifact || null,
      previousArtifactRetained: true,
    };
  }
  const artifactJsonBytes = utf8ByteLength(JSON.stringify(recommendationArtifact));
  const requestBytes = utf8ByteLength(JSON.stringify({ libraryId: id, artifact: recommendationArtifact }));
  const useCompression = requestBytes >= SHARED_COLLECTION_POST_MAX_BYTES;
  const saveResult = useCompression
    ? await saveCompressedSharedLibraryCollectionWithDiagnostics(
        id,
        recommendationArtifact as unknown as Record<string, unknown>,
      )
    : await saveSharedLibraryCollectionWithDiagnostics(
        id,
        recommendationArtifact as unknown as Record<string, unknown>,
      );
  if (!saveResult.success) {
    const health = buildCollectionHealth(artifact, {
      artifactBytes: artifactJsonBytes,
      compressedArtifactBytes: recommendationArtifact.health?.compressedArtifactBytes,
      publishStatus: "failed",
      smokeTest: prePublishSmoke,
    });
    return {
      success: false,
      artifact: artifactWithHealth(recommendationArtifact, health),
      health,
      error: saveResult.error || "shared_publish_failed",
      previousArtifact: previousArtifact || null,
      previousArtifactRetained: saveResult.activeArtifactState === "previous_retained",
    };
  }

  const readBack = await loadSharedLibraryCollection(id);
  const readBackArtifact = readBack as LocalCollectionRecommendationArtifact | null;
  const expectedVersion = recommendationArtifact.collectionVersion;
  const actualVersion = readBackArtifact?.collectionVersion;
  const identityMatches = Boolean(
    expectedVersion &&
    actualVersion &&
    actualVersion.libraryId === expectedVersion.libraryId &&
    actualVersion.artifactId === expectedVersion.artifactId &&
    actualVersion.contentChecksum === expectedVersion.contentChecksum &&
    actualVersion.importedCount === expectedVersion.importedCount &&
    Array.isArray(readBackArtifact?.records) &&
    collectionContentChecksum({ libraryId: id, records: readBackArtifact.records }) === expectedVersion.contentChecksum
  );
  const smokeTest = runCollectionSmokeTest(
    artifact.acceptedRecords,
    recommendationArtifact.records,
    readBackArtifact?.records || [],
  );
  const success = identityMatches && smokeTest.passed;
  const health = buildCollectionHealth(artifact, {
    artifactBytes: artifactJsonBytes,
    compressedArtifactBytes: recommendationArtifact.health?.compressedArtifactBytes,
    publishStatus: success ? "verified" : "failed",
    smokeTest,
  });
  return {
    success,
    artifact: artifactWithHealth(recommendationArtifact, health),
    health,
    error: success ? null : identityMatches ? "post_publish_smoke_test_failed" : "published_readback_mismatch",
    previousArtifact: previousArtifact || null,
    previousArtifactRetained: false,
  };
}

export async function loadLocalCollectionRecommendationArtifact(libraryId?: string): Promise<LocalCollectionRecommendationArtifact | null> {
  const scopeId = localCollectionScopeIdFromLibraryId(libraryId);
  for (const candidateScopeId of libraryIdReadCandidates(scopeId)) {
    const recommendationKey = localCollectionRecommendationStorageKeyForExactScope(candidateScopeId);
    const indexed = await readIndexedDbValue<LocalCollectionRecommendationArtifact>(recommendationKey);
    if (indexed && indexed.schemaVersion === "local_collection_recommendation_v1" && Array.isArray(indexed.records)) {
      const artifact = canonicalizeRecommendationArtifact(indexed, scopeId);
      if (candidateScopeId !== scopeId) {
        await persistRecommendationArtifactForScope(artifact, summarySnapshotForArtifact(artifact), scopeId);
      }
      return artifact;
    }

    const recommended = localStorageGetJson<LocalCollectionRecommendationArtifact>(recommendationKey);
    if (recommended && recommended.schemaVersion === "local_collection_recommendation_v1" && Array.isArray(recommended.records)) {
      const artifact = canonicalizeRecommendationArtifact(recommended, scopeId);
      if (candidateScopeId !== scopeId) {
        await persistRecommendationArtifactForScope(artifact, summarySnapshotForArtifact(artifact), scopeId);
      }
      return artifact;
    }
  }

  if (scopeId !== ADMIN_CONFIG_DEFAULT_SCOPE) {
    const legacy = await loadLegacyGlobalLocalCollectionRecommendationArtifact();
    if (legacy && artifactBelongsToScope(legacy, scopeId)) {
      const artifact = canonicalizeRecommendationArtifact(legacy, scopeId);
      await persistRecommendationArtifactForScope(artifact, summarySnapshotForArtifact(artifact), scopeId);
      return artifact;
    }
  }

  const sharedLibraryId = scopedLibraryIdForSharedFallback(scopeId);
  if (sharedLibraryId) {
    const shared = await loadSharedLibraryCollection(sharedLibraryId);
    if (shared && shared.schemaVersion === "local_collection_recommendation_v1" && Array.isArray(shared.records)) {
      return canonicalizeRecommendationArtifact(shared as LocalCollectionRecommendationArtifact, scopeId);
    }
  }

  return null;
}

export function readLocalCollectionAcceptedCountFromLocalStorage(libraryIdOrScopeId?: string): number {
  const scopeId = localCollectionScopeIdFromLibraryId(libraryIdOrScopeId);
  for (const candidateScopeId of libraryIdReadCandidates(scopeId)) {
    const summary = localStorageGetJson<any>(localCollectionSummaryStorageKeyForExactScope(candidateScopeId));
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

    const recommendation = localStorageGetJson<LocalCollectionRecommendationArtifact>(
      localCollectionRecommendationStorageKeyForExactScope(candidateScopeId)
    );
    if (recommendation && Array.isArray(recommendation.records)) return recommendation.records.length;
  }
  return 0;
}

export function readLocalCollectionHealthFromLocalStorage(
  libraryIdOrScopeId?: string,
): { health: LocalCollectionHealth; version?: LocalCollectionVersionMetadata } | null {
  const scopeId = localCollectionScopeIdFromLibraryId(libraryIdOrScopeId);
  for (const candidateScopeId of libraryIdReadCandidates(scopeId)) {
    const summary = localStorageGetJson<LocalCollectionSummarySnapshot>(
      localCollectionSummaryStorageKeyForExactScope(candidateScopeId),
    );
    if (summary?.health) return { health: summary.health, version: summary.collectionVersion };
  }
  return null;
}
