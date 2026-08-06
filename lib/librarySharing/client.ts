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

async function readJson(url: string, context: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) {
      console.warn(`[library-sharing][client][${context}] request_failed`, {
        url,
        status: response.status,
      });
      return null;
    }
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return payload as Record<string, unknown>;
  } catch {
    console.warn(`[library-sharing][client][${context}] request_error`, { url });
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

async function postJson(url: string, body: Record<string, unknown>, context: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.warn(`[library-sharing][client][${context}] request_failed`, {
        url,
        status: response.status,
      });
    }
    return response.ok;
  } catch {
    console.warn(`[library-sharing][client][${context}] request_error`, { url });
    return false;
  }
}

export async function loadSharedLibraryConfig(libraryId: string): Promise<Record<string, unknown> | null> {
  const url = sharedApiUrl("/api/library-config", libraryId);
  if (!url) return null;
  const payload = await readJson(url, "loadSharedLibraryConfig");
  return payload && payload.config && typeof payload.config === "object" && !Array.isArray(payload.config)
    ? (payload.config as Record<string, unknown>)
    : null;
}

export async function saveSharedLibraryConfig(libraryId: string, config: Record<string, unknown>): Promise<boolean> {
  const url = sharedApiUrl("/api/library-config", libraryId);
  if (!url) return false;
  return postJson(url, { libraryId, config }, "saveSharedLibraryConfig");
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
  const payload = await readJson(url, "loadSharedLibraryCollection");
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
 * POST the full collection artifact as a request body. The API persists it
 * according to active storage mode (Vercel Blob in production, filesystem in
 * local development).
 */
export async function saveSharedLibraryCollection(libraryId: string, artifact: Record<string, unknown>): Promise<boolean> {
  const url = sharedApiUrl("/api/local-collection", libraryId);
  if (!url) return false;
  return postJson(url, { libraryId, artifact }, "saveSharedLibraryCollection");
}
