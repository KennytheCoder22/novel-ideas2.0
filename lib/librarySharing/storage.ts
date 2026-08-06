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

function storageMode(): StorageMode {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "vercel_blob";
  return "local_filesystem";
}

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
async function loadBlobJson(pathname: string): Promise<unknown | null> {
  // Fast path: derive URL from token
  const base = blobStoreBaseUrl();
  if (base) {
    const url = `${base}/${pathname}`;
    try {
      const resp = await fetch(url, { cache: "no-store" });
      if (resp.status === 404) return null;
      if (resp.ok) return resp.json().catch(() => null);
    } catch {
      // network error — fall through to list()
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
    if (!found) return null;
    const resp = await fetch(found.url, { cache: "no-store" });
    if (!resp.ok) return null;
    return resp.json().catch(() => null);
  } catch {
    return null;
  }
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

export async function saveSharedLibraryConfig(
  libraryId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const id = String(libraryId || "").trim();
  if (!id) throw new Error("missing_library_id");
  if (storageMode() === "vercel_blob") {
    await saveBlobConfig(id, payload);
  } else {
    await saveFileAsset("config", id, payload);
  }
}

export async function loadSharedLibraryConfigPayload(
  libraryId: string
): Promise<Record<string, unknown> | null> {
  const id = String(libraryId || "").trim();
  if (!id) return null;
  if (storageMode() === "vercel_blob") {
    return loadBlobConfig(id);
  }
  return loadFileAsset("config", id);
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
