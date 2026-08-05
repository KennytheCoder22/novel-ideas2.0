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

export async function loadSharedLibraryCollection(libraryId: string): Promise<Record<string, unknown> | null> {
  const url = sharedApiUrl("/api/local-collection", libraryId);
  if (!url) return null;
  const payload = await readJson(url);
  return payload && payload.artifact && typeof payload.artifact === "object" && !Array.isArray(payload.artifact)
    ? (payload.artifact as Record<string, unknown>)
    : null;
}

export async function saveSharedLibraryCollection(libraryId: string, artifact: Record<string, unknown>): Promise<boolean> {
  const url = sharedApiUrl("/api/local-collection", libraryId);
  if (!url) return false;
  return postJson(url, { libraryId, artifact });
}
