/**
 * lib/librarySharing/storage.ts — Server-side shared library storage.
 *
 * Storage modes:
 *   vercel_blob       — Primary: Vercel Blob (requires BLOB_READ_WRITE_TOKEN).
 *                       Config and collection are PUT by the server.
 *   local_filesystem  — Local development only. Both config and collection are
 *                       written to disk under scripts/output/library-sharing/.
 *                       This mode is NOT suitable for Vercel serverless (read-
 *                       only filesystem after deployment).
 *
 * Admin PIN policy: admin.pin is stripped from every config before it is
 * written to any public storage backend.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// ── Storage mode ──────────────────────────────────────────────────────────────

type StorageMode = "vercel_blob" | "local_filesystem";
type BlobReadStatus = "ok" | "not_found" | "non_ok_http" | "network_error" | "json_parse_failed" | "list_failed";
type SharedConfigErrorCode =
  | null
  | "config_not_found"
  | "blob_read_failed"
  | "malformed_json"
  | "invalid_config_schema";

function storageMode(): StorageMode {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "vercel_blob";
  return "local_filesystem";
}

function normalizeLibraryId(libraryId: string): string {
  return String(libraryId || "").trim();
}

function logConfigEvent(
  event: string,
  payload: Record<string, unknown>,
  correlationId?: string
): void {
  const base = correlationId ? { correlationId, ...payload } : payload;
  console.info(`[library-sharing][config][${event}]`, base);
}

export function getSharedLibraryConfigStorageTrace(libraryId: string): {
  backend: StorageMode;
  libraryId: string;
  normalizedLibraryId: string;
  configBlobPath: string;
  configFilePath: string;
} {
  const id = normalizeLibraryId(libraryId);
  return {
    backend: storageMode(),
    libraryId,
    normalizedLibraryId: id,
    configBlobPath: configBlobPathname(id || "unknown"),
    configFilePath: filePath("config", id || "unknown"),
  };
}

export type SharedLibraryConfigDiagnostics = {
  backend: StorageMode;
  libraryId: string;
  normalizedLibraryId: string;
  configPath: string;
  exists: boolean;
  readable: boolean;
  validJson: boolean;
  validConfig: boolean;
  updatedAt: string | null;
  blobReadStatus: BlobReadStatus | "n/a";
  errorCode: SharedConfigErrorCode;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Deterministic JSON serialization: object keys sorted recursively. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.keys(val as object)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (val as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return val as unknown;
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Strip admin.pin from a config before writing to any public storage.
 * pinEnabled flag is preserved so the feature state is visible to the admin
 * but the actual PIN is never in a public blob.
 */
export function sanitizeConfigForPublicStorage(config: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
  if (clone.admin && typeof clone.admin === "object" && !Array.isArray(clone.admin)) {
    delete (clone.admin as Record<string, unknown>).pin;
  }
  return clone;
}

// ── Vercel Blob helpers ───────────────────────────────────────────────────────

/**
 * Sanitize a library ID into a safe URL path segment.
 * Keeps only [a-z0-9-_] and truncates to 128 chars to avoid excessively long paths.
 */
function safePathSegment(id: string): string {
  return String(id || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 128) || "unknown";
}

/** Vercel Blob pathname for library config. */
function configBlobPathname(libraryId: string): string {
  return `libraries/${safePathSegment(libraryId)}/config.json`;
}

/** Vercel Blob pathname for the collection pointer (small pointer to the actual collection blob). */
function collectionPtrBlobPathname(libraryId: string): string {
  return `libraries/${safePathSegment(libraryId)}/collection-ptr.json`;
}

/** Vercel Blob pathname for the collection artifact. */
export function collectionBlobPathname(libraryId: string): string {
  return `libraries/${safePathSegment(libraryId)}/collection.json`;
}

/**
 * Derive the public Vercel Blob base URL from the BLOB_READ_WRITE_TOKEN.
 * Token format: vercel_blob_rw_{storeId}_{randomSuffix}
 * This is documented at https://vercel.com/docs/storage/vercel-blob/using-blob-sdk
 */
function blobStoreBaseUrl(): string | null {
  const token = process.env.BLOB_READ_WRITE_TOKEN || "";
  // Expected format: vercel_blob_rw_{storeId}_{rest}
  const parts = token.split("_");
  if (parts[0] !== "vercel" || parts[1] !== "blob" || parts[2] !== "rw" || !parts[3]) return null;
  return `https://${parts[3]}.public.blob.vercel-storage.com`;
}

/**
 * Fetch a blob by pathname and return parsed JSON, or null if absent/malformed.
 * Uses the deterministically derived public URL when possible (1 network call).
 * Falls back to list() if the token format is unexpected (2 network calls).
 */
async function readBlobJsonDetailed(pathname: string): Promise<{
  status: BlobReadStatus;
  exists: boolean;
  readable: boolean;
  validJson: boolean;
  data: unknown | null;
}> {
  // Fast path: derive URL from token
  const base = blobStoreBaseUrl();
  if (base) {
    const url = `${base}/${pathname}`;
    try {
      const resp = await fetch(url, { cache: "no-store" });
      if (resp.status === 404) {
        return { status: "not_found", exists: false, readable: false, validJson: false, data: null };
      }
      if (resp.ok) {
        const text = await resp.text();
        try {
          const parsed = JSON.parse(text);
          return { status: "ok", exists: true, readable: true, validJson: true, data: parsed };
        } catch {
          return { status: "json_parse_failed", exists: true, readable: true, validJson: false, data: null };
        }
      }
      console.warn("[library-sharing][blob] direct_fetch_non_ok", {
        pathname,
        status: resp.status,
      });
      return { status: "non_ok_http", exists: false, readable: false, validJson: false, data: null };
    } catch {
      console.warn("[library-sharing][blob] direct_fetch_failed", { pathname });
      // fall through to list fallback
    }
  }

  // Fallback: list() to resolve URL
  try {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({
      prefix: pathname,
      limit: 1,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const found = blobs.find((b) => b.pathname === pathname);
    if (!found) {
      return { status: "not_found", exists: false, readable: false, validJson: false, data: null };
    }
    const resp = await fetch(found.url, { cache: "no-store" });
    if (!resp.ok) {
      return { status: "non_ok_http", exists: true, readable: false, validJson: false, data: null };
    }
    const text = await resp.text();
    try {
      const parsed = JSON.parse(text);
      return { status: "ok", exists: true, readable: true, validJson: true, data: parsed };
    } catch {
      return { status: "json_parse_failed", exists: true, readable: true, validJson: false, data: null };
    }
  } catch {
    console.warn("[library-sharing][blob] list_fallback_failed", { pathname });
    return { status: "list_failed", exists: false, readable: false, validJson: false, data: null };
  }
}

async function loadBlobJson(pathname: string): Promise<unknown | null> {
  const result = await readBlobJsonDetailed(pathname);
  return result.validJson ? result.data : null;
}

/** Write a JSON value to a Vercel Blob pathname (server-side, overwrites). */
async function putBlobJson(pathname: string, value: unknown): Promise<string> {
  const { put } = await import("@vercel/blob");
  const blob = await put(pathname, JSON.stringify(value), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return blob.url;
}

// ── Vercel Blob: config ───────────────────────────────────────────────────────

async function saveBlobConfig(libraryId: string, payload: Record<string, unknown>): Promise<void> {
  const sanitized = sanitizeConfigForPublicStorage(payload);
  await putBlobJson(configBlobPathname(libraryId), {
    schemaVersion: "library_config_v1",
    libraryId,
    updatedAt: new Date().toISOString(),
    contentHash: sha256(stableStringify(sanitized)),
    config: sanitized,
  });
}

async function loadBlobConfig(libraryId: string): Promise<Record<string, unknown> | null> {
  const data = await loadBlobJson(configBlobPathname(libraryId));
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const wrapper = data as Record<string, unknown>;
  if (!wrapper.config || typeof wrapper.config !== "object" || Array.isArray(wrapper.config)) return null;
  return wrapper.config as Record<string, unknown>;
}

function validateConfigEnvelope(data: unknown): {
  validConfig: boolean;
  config: Record<string, unknown> | null;
  updatedAt: string | null;
  errorCode: SharedConfigErrorCode;
} {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { validConfig: false, config: null, updatedAt: null, errorCode: "invalid_config_schema" };
  }
  const wrapper = data as Record<string, unknown>;
  const updatedAt = typeof wrapper.updatedAt === "string" ? wrapper.updatedAt : null;
  if (!wrapper.config || typeof wrapper.config !== "object" || Array.isArray(wrapper.config)) {
    return { validConfig: false, config: null, updatedAt, errorCode: "invalid_config_schema" };
  }
  return {
    validConfig: true,
    config: wrapper.config as Record<string, unknown>,
    updatedAt,
    errorCode: null,
  };
}

// ── Vercel Blob: collection pointer ──────────────────────────────────────────

/** Store a pointer to the collection blob URL. */
async function saveBlobCollectionPtr(libraryId: string, blobUrl: string): Promise<void> {
  await putBlobJson(collectionPtrBlobPathname(libraryId), {
    schemaVersion: "collection_ptr_v1",
    libraryId,
    blobUrl,
    updatedAt: new Date().toISOString(),
  });
}

async function loadBlobCollectionUrl(libraryId: string): Promise<string | null> {
  const data = await loadBlobJson(collectionPtrBlobPathname(libraryId));
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const ptr = data as Record<string, unknown>;
  return typeof ptr.blobUrl === "string" ? ptr.blobUrl : null;
}

// ── Local filesystem fallback (local dev only) ────────────────────────────────

function fileRoot(): string {
  return resolve(process.cwd(), "scripts", "output", "library-sharing");
}

function ensureDir(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function safeLibraryFileName(libraryId: string): string {
  return encodeURIComponent(String(libraryId || "").trim());
}

function writeJson(path: string, value: unknown): void {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function readJson<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function filePath(kind: "config" | "collection", libraryId: string): string {
  return resolve(
    fileRoot(),
    kind === "config" ? "configs" : "collections",
    `${safeLibraryFileName(libraryId)}.json`
  );
}

async function saveFileAsset(
  kind: "config" | "collection",
  libraryId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const stored = kind === "config" ? sanitizeConfigForPublicStorage(payload) : payload;
  writeJson(filePath(kind, libraryId), { libraryId, updatedAt: new Date().toISOString(), payload: stored });
}

function loadFileAsset(kind: "config" | "collection", libraryId: string): Record<string, unknown> | null {
  const value = readJson<{ payload?: Record<string, unknown> }>(filePath(kind, libraryId));
  if (!value || !value.payload || typeof value.payload !== "object" || Array.isArray(value.payload)) return null;
  return value.payload;
}

// ── Public API ────────────────────────────────────────────────────────────────

// ── Config ────────────────────────────────────────────────────────────────────

export async function diagnoseSharedLibraryConfig(
  libraryId: string,
  correlationId?: string
): Promise<SharedLibraryConfigDiagnostics> {
  const trace = getSharedLibraryConfigStorageTrace(libraryId);
  const id = trace.normalizedLibraryId;
  if (!id) {
    return {
      backend: trace.backend,
      libraryId,
      normalizedLibraryId: "",
      configPath: trace.backend === "vercel_blob" ? trace.configBlobPath : trace.configFilePath,
      exists: false,
      readable: false,
      validJson: false,
      validConfig: false,
      updatedAt: null,
      blobReadStatus: trace.backend === "vercel_blob" ? "not_found" : "n/a",
      errorCode: "config_not_found",
    };
  }

  if (trace.backend === "vercel_blob") {
    const configPath = configBlobPathname(id);
    logConfigEvent("lookup_started", { backend: trace.backend, normalizedLibraryId: id, configPath }, correlationId);
    const blob = await readBlobJsonDetailed(configPath);
    if (!blob.exists) {
      logConfigEvent("not_found", { backend: trace.backend, normalizedLibraryId: id, configPath, blobReadStatus: blob.status }, correlationId);
      return {
        backend: trace.backend,
        libraryId,
        normalizedLibraryId: id,
        configPath,
        exists: false,
        readable: false,
        validJson: false,
        validConfig: false,
        updatedAt: null,
        blobReadStatus: blob.status,
        errorCode: "config_not_found",
      };
    }
    if (!blob.readable) {
      logConfigEvent("read_failed", { backend: trace.backend, normalizedLibraryId: id, configPath, blobReadStatus: blob.status }, correlationId);
      return {
        backend: trace.backend,
        libraryId,
        normalizedLibraryId: id,
        configPath,
        exists: true,
        readable: false,
        validJson: false,
        validConfig: false,
        updatedAt: null,
        blobReadStatus: blob.status,
        errorCode: "blob_read_failed",
      };
    }
    if (!blob.validJson) {
      logConfigEvent("json_parse_failed", { backend: trace.backend, normalizedLibraryId: id, configPath, blobReadStatus: blob.status }, correlationId);
      return {
        backend: trace.backend,
        libraryId,
        normalizedLibraryId: id,
        configPath,
        exists: true,
        readable: true,
        validJson: false,
        validConfig: false,
        updatedAt: null,
        blobReadStatus: blob.status,
        errorCode: "malformed_json",
      };
    }
    const envelope = validateConfigEnvelope(blob.data);
    if (!envelope.validConfig) {
      logConfigEvent("validation_failed", { backend: trace.backend, normalizedLibraryId: id, configPath }, correlationId);
      return {
        backend: trace.backend,
        libraryId,
        normalizedLibraryId: id,
        configPath,
        exists: true,
        readable: true,
        validJson: true,
        validConfig: false,
        updatedAt: envelope.updatedAt,
        blobReadStatus: blob.status,
        errorCode: envelope.errorCode,
      };
    }
    logConfigEvent("lookup_succeeded", { backend: trace.backend, normalizedLibraryId: id, configPath }, correlationId);
    return {
      backend: trace.backend,
      libraryId,
      normalizedLibraryId: id,
      configPath,
      exists: true,
      readable: true,
      validJson: true,
      validConfig: true,
      updatedAt: envelope.updatedAt,
      blobReadStatus: blob.status,
      errorCode: null,
    };
  }

  const configPath = filePath("config", id);
  logConfigEvent("lookup_started", { backend: trace.backend, normalizedLibraryId: id, configPath }, correlationId);
  if (!existsSync(configPath)) {
    logConfigEvent("not_found", { backend: trace.backend, normalizedLibraryId: id, configPath }, correlationId);
    return {
      backend: trace.backend,
      libraryId,
      normalizedLibraryId: id,
      configPath,
      exists: false,
      readable: false,
      validJson: false,
      validConfig: false,
      updatedAt: null,
      blobReadStatus: "n/a",
      errorCode: "config_not_found",
    };
  }
  try {
    const raw = readFileSync(configPath, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      logConfigEvent("json_parse_failed", { backend: trace.backend, normalizedLibraryId: id, configPath }, correlationId);
      return {
        backend: trace.backend,
        libraryId,
        normalizedLibraryId: id,
        configPath,
        exists: true,
        readable: true,
        validJson: false,
        validConfig: false,
        updatedAt: null,
        blobReadStatus: "n/a",
        errorCode: "malformed_json",
      };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        backend: trace.backend,
        libraryId,
        normalizedLibraryId: id,
        configPath,
        exists: true,
        readable: true,
        validJson: true,
        validConfig: false,
        updatedAt: null,
        blobReadStatus: "n/a",
        errorCode: "invalid_config_schema",
      };
    }
    const payload = parsed as Record<string, unknown>;
    const config = payload.payload;
    const validConfig = !!config && typeof config === "object" && !Array.isArray(config);
    if (!validConfig) {
      logConfigEvent("validation_failed", { backend: trace.backend, normalizedLibraryId: id, configPath }, correlationId);
    } else {
      logConfigEvent("lookup_succeeded", { backend: trace.backend, normalizedLibraryId: id, configPath }, correlationId);
    }
    return {
      backend: trace.backend,
      libraryId,
      normalizedLibraryId: id,
      configPath,
      exists: true,
      readable: true,
      validJson: true,
      validConfig,
      updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : null,
      blobReadStatus: "n/a",
      errorCode: validConfig ? null : "invalid_config_schema",
    };
  } catch {
    logConfigEvent("read_failed", { backend: trace.backend, normalizedLibraryId: id, configPath }, correlationId);
    return {
      backend: trace.backend,
      libraryId,
      normalizedLibraryId: id,
      configPath,
      exists: true,
      readable: false,
      validJson: false,
      validConfig: false,
      updatedAt: null,
      blobReadStatus: "n/a",
      errorCode: "blob_read_failed",
    };
  }
}

export async function saveSharedLibraryConfig(
  libraryId: string,
  payload: Record<string, unknown>,
  options?: { correlationId?: string }
): Promise<void> {
  const id = normalizeLibraryId(libraryId);
  if (!id) throw new Error("missing_library_id");
  const trace = getSharedLibraryConfigStorageTrace(id);
  const correlationId = options?.correlationId;
  logConfigEvent("save_started", trace, correlationId);
  try {
    if (trace.backend === "vercel_blob") {
      await saveBlobConfig(id, payload);
    } else {
      await saveFileAsset("config", id, payload);
    }
    logConfigEvent("save_succeeded", trace, correlationId);
  } catch (error) {
    console.error("[library-sharing][config][save_failed]", { correlationId, ...trace }, error);
    throw error;
  }
}

export async function loadSharedLibraryConfigPayload(
  libraryId: string,
  options?: { correlationId?: string }
): Promise<Record<string, unknown> | null> {
  const id = normalizeLibraryId(libraryId);
  if (!id) return null;
  const correlationId = options?.correlationId;
  try {
    const diagnostics = await diagnoseSharedLibraryConfig(id, correlationId);
    if (!diagnostics.validConfig || diagnostics.errorCode) return null;
    if (diagnostics.backend === "vercel_blob") {
      return loadBlobConfig(id);
    }
    return loadFileAsset("config", id);
  } catch (error) {
    const trace = getSharedLibraryConfigStorageTrace(id);
    console.error("[library-sharing][config][load_failed]", { correlationId, ...trace }, error);
    throw error;
  }
}

// ── Collection ────────────────────────────────────────────────────────────────

/**
 * Record the Vercel Blob URL of a collection blob.
 * No-op in local_filesystem mode (collection is written directly by
 * saveSharedLibraryCollection).
 */
export async function recordSharedLibraryCollectionUrl(
  libraryId: string,
  blobUrl: string
): Promise<void> {
  const id = String(libraryId || "").trim();
  if (!id) throw new Error("missing_library_id");
  if (!blobUrl || typeof blobUrl !== "string") throw new Error("missing_blob_url");
  if (storageMode() === "vercel_blob") {
    await saveBlobCollectionPtr(id, blobUrl);
  }
  // local_filesystem: collection is stored inline; no pointer needed
}

/**
 * Load the collection for a library.
 * Returns { artifact, artifactUrl } — exactly one will be non-null:
 *   - vercel_blob mode: artifact=null, artifactUrl=<CDN URL for client to fetch>
 *   - local_filesystem mode: artifact=<inline data>, artifactUrl=null
 *
 * In blob mode we return the URL and let the client fetch directly from the CDN.
 */
export async function loadSharedLibraryCollectionResult(libraryId: string): Promise<{
  artifact: Record<string, unknown> | null;
  artifactUrl: string | null;
}> {
  const id = String(libraryId || "").trim();
  if (!id) return { artifact: null, artifactUrl: null };

  if (storageMode() === "vercel_blob") {
    const artifactUrl = await loadBlobCollectionUrl(id);
    return { artifact: null, artifactUrl: artifactUrl ?? null };
  }

  const artifact = loadFileAsset("collection", id);
  return { artifact, artifactUrl: null };
}

/**
 * Convenience wrapper: returns inline artifact data, or fetches from blob URL
 * if the artifact is stored as a blob. May return null for very large blobs
 * that time out or if the blob is absent.
 *
 * Prefer loadSharedLibraryCollectionResult when you need the URL directly
 * (e.g. in the GET API endpoint to avoid proxying large payloads).
 */
export async function loadSharedLibraryCollectionPayload(
  libraryId: string
): Promise<Record<string, unknown> | null> {
  const result = await loadSharedLibraryCollectionResult(libraryId);
  if (result.artifact) return result.artifact;
  if (result.artifactUrl) {
    const data = await loadBlobJson(result.artifactUrl);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data as Record<string, unknown>;
    }
  }
  return null;
}

/**
 * Server-side collection save.
 * In vercel_blob mode, writes the collection artifact to a deterministic blob
 * path and updates the collection pointer.
 */
export async function saveSharedLibraryCollection(
  libraryId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const id = String(libraryId || "").trim();
  if (!id) throw new Error("missing_library_id");
  if (storageMode() === "vercel_blob") {
    const url = await putBlobJson(collectionBlobPathname(id), payload);
    await saveBlobCollectionPtr(id, url);
    return;
  }
  await saveFileAsset("collection", id, payload);
}
