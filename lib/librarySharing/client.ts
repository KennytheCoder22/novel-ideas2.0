function sharedApiUrl(path: string, libraryId: string): string | null {
  const id = String(libraryId || "").trim();
  if (!id) return null;
  try {
    if (typeof window === "undefined" || !window.location?.origin) return null;
    const url = new URL(path, window.location.origin);
    url.searchParams.set("libraryId", id);
    return url.toString();
  } catch {
    return null;
  }
}

async function readJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function readJsonAny(url: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function postJson(url: string, body: Record<string, unknown>): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function loadSharedLibraryConfig(libraryId: string): Promise<Record<string, unknown> | null> {
  const url = sharedApiUrl("/api/library-config", libraryId);
  if (!url) return null;
  const payload = await readJson(url);
  return payload && payload.config && typeof payload.config === "object" && !Array.isArray(payload.config)
    ? (payload.config as Record<string, unknown>)
    : null;
}

export async function saveSharedLibraryConfig(libraryId: string, config: Record<string, unknown>): Promise<boolean> {
  const url = sharedApiUrl("/api/library-config", libraryId);
  if (!url) return false;
  return postJson(url, { libraryId, config });
}

/**
 * Load the shared library collection.
 *
 * The GET /api/local-collection endpoint returns one of:
 *   { artifact: {...}, artifactUrl: null }   — inline (local dev / filesystem mode)
 *   { artifact: null, artifactUrl: "..." }   — blob URL (Vercel Blob mode)
 *
 * When artifactUrl is present, the artifact is fetched directly from the CDN
 * URL, bypassing the Vercel Function to avoid the 4.5 MB response limit.
 */
export async function loadSharedLibraryCollection(libraryId: string): Promise<Record<string, unknown> | null> {
  const url = sharedApiUrl("/api/local-collection", libraryId);
  if (!url) return null;
  const payload = await readJson(url);
  if (!payload) return null;

  // Inline artifact (local dev / filesystem mode)
  if (payload.artifact && typeof payload.artifact === "object" && !Array.isArray(payload.artifact)) {
    return payload.artifact as Record<string, unknown>;
  }

  // Blob URL (Vercel Blob mode): fetch artifact directly from CDN
  if (typeof payload.artifactUrl === "string" && payload.artifactUrl) {
    const artifact = await readJsonAny(payload.artifactUrl);
    if (artifact && typeof artifact === "object" && !Array.isArray(artifact)) {
      return artifact;
    }
  }

  return null;
}

/**
 * Server-side fallback: POST the full collection artifact as a request body.
 * Works only in local_filesystem mode (local dev). In vercel_blob mode the
 * server will reject this with use_client_upload; callers should use
 * uploadSharedLibraryCollectionClientSide instead.
 */
export async function saveSharedLibraryCollection(libraryId: string, artifact: Record<string, unknown>): Promise<boolean> {
  const url = sharedApiUrl("/api/local-collection", libraryId);
  if (!url) return false;
  return postJson(url, { libraryId, artifact });
}

/**
 * Upload a collection directly to Vercel Blob from the browser, bypassing the
 * Vercel Function body limit. The browser SDK calls /api/local-collection/upload-url
 * twice: once to get a client token and once to confirm completion.
 *
 * Falls back to saveSharedLibraryCollection (server-side POST) if:
 *   - not running in a browser context
 *   - @vercel/blob/client is unavailable
 *   - the upload-url endpoint is unavailable (e.g., BLOB_READ_WRITE_TOKEN not set)
 *
 * Returns true on success, false on failure.
 */
export async function uploadSharedLibraryCollectionClientSide(
  libraryId: string,
  artifact: Record<string, unknown>
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const id = String(libraryId || "").trim();
  if (!id) return false;

  try {
    const { upload } = await import("@vercel/blob/client");
    const json = JSON.stringify(artifact);
    const blob = new Blob([json], { type: "application/json" });
    const handleUploadUrl = new URL("/api/local-collection/upload-url", window.location.origin).toString();
    await upload(`libraries/${id}/collection.json`, blob, {
      access: "public",
      handleUploadUrl,
    });
    return true;
  } catch {
    return false;
  }
}

