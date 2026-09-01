import { canonicalLibraryId } from "../libraryIdMigration.js";

function sharedApiUrl(path: string, libraryId: string): string | null {
  const id = canonicalLibraryId(libraryId);
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

function normalizeLibraryId(libraryId: string): string {
  return canonicalLibraryId(String(libraryId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 64));
}

function canonicalizeCollectionArtifact(
  artifact: Record<string, unknown>,
  libraryId: string,
): Record<string, unknown> {
  if (normalizeLibraryId(libraryId) !== "yvhs") return artifact;
  const metadata = artifact.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return artifact;
  return {
    ...artifact,
    metadata: { ...(metadata as Record<string, unknown>), libraryId: "yvhs" },
  };
}

function newCorrelationId(): string {
  return `cfg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function utf8ByteLength(value: string): number {
  try {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(value).length;
  } catch {}
  return value.length;
}

async function fetchJsonWithMeta(
  url: string,
  context: string,
  headers?: Record<string, string>
): Promise<{
  payload: Record<string, unknown> | null;
  status: number | null;
  contentType: string | null;
  routeReached: boolean;
}> {
  try {
    const response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      headers,
    });
    const status = response.status;
    const contentType = response.headers.get("content-type");
    const routeReached = response.headers.get("x-library-config-route") === "reached";
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      console.warn(`[library-sharing][client][${context}] request_failed`, {
        url,
        status,
        contentType,
      });
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { payload: null, status, contentType, routeReached };
    }
    return { payload: payload as Record<string, unknown>, status, contentType, routeReached };
  } catch {
    console.warn(`[library-sharing][client][${context}] request_error`, { url });
    return { payload: null, status: null, contentType: null, routeReached: false };
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

export async function encodeGzipBase64Json(value: Record<string, unknown>): Promise<string | null> {
  if (typeof CompressionStream === "undefined" || typeof btoa === "undefined") return null;
  try {
    const compressedStream = new Blob([JSON.stringify(value)], { type: "application/json" })
      .stream()
      .pipeThrough(new CompressionStream("gzip"));
    const bytes = new Uint8Array(await new Response(compressedStream).arrayBuffer());
    const chunks: string[] = [];
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
    }
    return btoa(chunks.join(""));
  } catch {
    return null;
  }
}

export type SharedLibraryConfigSaveDiagnostics = {
  timestamp: string;
  requestUrl: string;
  libraryId: string;
  correlationId: string;
  payloadUtf8Bytes: number;
  requestUtf8Bytes: number;
  httpStatus: number | null;
  responseContentType: string | null;
  requestReachedApiRoute: boolean;
  appErrorCode: string | null;
  responseBodySnippet: string | null;
  success: boolean;
};

export async function saveSharedLibraryConfigWithDiagnostics(
  libraryId: string,
  config: Record<string, unknown>
): Promise<SharedLibraryConfigSaveDiagnostics> {
  const requestUrl = sharedApiUrl("/api/library-config", libraryId) || "";
  const correlationId = newCorrelationId();
  const requestBody = JSON.stringify({ libraryId, config });
  const payloadUtf8Bytes = utf8ByteLength(JSON.stringify(config));
  const requestUtf8Bytes = utf8ByteLength(requestBody);
  const diagnostics: SharedLibraryConfigSaveDiagnostics = {
    timestamp: new Date().toISOString(),
    requestUrl,
    libraryId: String(libraryId || ""),
    correlationId,
    payloadUtf8Bytes,
    requestUtf8Bytes,
    httpStatus: null,
    responseContentType: null,
    requestReachedApiRoute: false,
    appErrorCode: null,
    responseBodySnippet: null,
    success: false,
  };
  if (!requestUrl) {
    return { ...diagnostics, appErrorCode: "invalid_request_url" };
  }

  try {
    console.info("[library-sharing][client][saveSharedLibraryConfigWithDiagnostics] request_start", {
      correlationId,
      libraryId: String(libraryId || ""),
      requestUrl,
      payloadUtf8Bytes,
      requestUtf8Bytes,
    });
    const response = await fetch(requestUrl, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "x-correlation-id": correlationId,
      },
      body: requestBody,
    });
    const responseText = await response.text().catch(() => "");
    let payload: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(responseText);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = parsed as Record<string, unknown>;
      }
    } catch {}
    const responseCorrelation = String(response.headers.get("x-correlation-id") || correlationId);
    const responseContentType = response.headers.get("content-type");
    const routeReached = response.headers.get("x-library-config-route") === "reached";
    const appErrorCode = typeof payload?.error === "string" ? payload.error : null;
    const snippet = responseText ? responseText.slice(0, 240) : null;
    const result: SharedLibraryConfigSaveDiagnostics = {
      ...diagnostics,
      correlationId: responseCorrelation,
      httpStatus: response.status,
      responseContentType,
      requestReachedApiRoute: routeReached,
      appErrorCode,
      responseBodySnippet: snippet,
      success: response.ok,
    };
    if (!response.ok) {
      console.warn("[library-sharing][client][saveSharedLibraryConfigWithDiagnostics] request_failed", result);
    } else {
      console.info("[library-sharing][client][saveSharedLibraryConfigWithDiagnostics] request_succeeded", result);
    }
    return result;
  } catch {
    console.error("[library-sharing][client][saveSharedLibraryConfigWithDiagnostics] request_error", {
      correlationId,
      libraryId: String(libraryId || ""),
      requestUrl,
      payloadUtf8Bytes,
      requestUtf8Bytes,
    });
    return { ...diagnostics, appErrorCode: "request_failed" };
  }
}

export async function loadSharedLibraryConfig(libraryId: string): Promise<Record<string, unknown> | null> {
  const result = await loadSharedLibraryConfigWithDiagnostics(libraryId, false);
  return result.config;
}

export type SharedLibraryConfigLoadDiagnostics = {
  timestamp: string;
  pathname: string;
  libraryId: string;
  normalizedLibraryId: string;
  requestUrl: string;
  correlationId: string;
  httpStatus: number | null;
  responseContentType: string | null;
  requestReachedApiRoute: boolean;
  appErrorCode: string | null;
  routeReachable: boolean | null;
  backend: "vercel_blob" | "local_filesystem" | null;
  configPath: string | null;
  exists: boolean | null;
  readable: boolean | null;
  validJson: boolean | null;
  validConfig: boolean | null;
  blobReadStatus: string | null;
  defaultsConsidered: boolean;
  defaultsRejected: boolean;
};

export async function loadSharedLibraryConfigWithDiagnostics(
  libraryId: string,
  includeServerDiagnostics: boolean
): Promise<{
  config: Record<string, unknown> | null;
  diagnostics: SharedLibraryConfigLoadDiagnostics;
}> {
  const url = sharedApiUrl("/api/library-config", libraryId);
  const correlationId = newCorrelationId();
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const baseDiagnostics: SharedLibraryConfigLoadDiagnostics = {
    timestamp: new Date().toISOString(),
    pathname,
    libraryId: String(libraryId || ""),
    normalizedLibraryId: normalizeLibraryId(libraryId),
    requestUrl: url || "",
    correlationId,
    httpStatus: null,
    responseContentType: null,
    requestReachedApiRoute: false,
    appErrorCode: null,
    routeReachable: null,
    backend: null,
    configPath: null,
    exists: null,
    readable: null,
    validJson: null,
    validConfig: null,
    blobReadStatus: null,
    defaultsConsidered: true,
    defaultsRejected: true,
  };
  if (!url) {
    return { config: null, diagnostics: { ...baseDiagnostics, appErrorCode: "invalid_request_url" } };
  }
  const response = await fetchJsonWithMeta(url, "loadSharedLibraryConfigWithDiagnostics", {
    "x-correlation-id": correlationId,
  });
  const payload = response.payload;
  const diagnostics: SharedLibraryConfigLoadDiagnostics = {
    ...baseDiagnostics,
    httpStatus: response.status,
    responseContentType: response.contentType,
    requestReachedApiRoute: response.routeReached,
    appErrorCode: typeof payload?.error === "string" ? payload.error : null,
  };
  const config =
    payload && payload.config && typeof payload.config === "object" && !Array.isArray(payload.config)
      ? (payload.config as Record<string, unknown>)
      : null;

  if (!includeServerDiagnostics) {
    return { config, diagnostics };
  }

  const diagUrl = sharedApiUrl("/api/library-config-diagnostics", libraryId);
  if (!diagUrl) return { config, diagnostics };
  const diagResp = await fetchJsonWithMeta(diagUrl, "loadSharedLibraryConfigDiagnostics", {
    "x-correlation-id": correlationId,
  });
  const d = diagResp.payload;
  if (!d) return { config, diagnostics };
  return {
    config,
    diagnostics: {
      ...diagnostics,
      routeReachable: typeof d.routeReachable === "boolean" ? d.routeReachable : null,
      backend: d.backend === "vercel_blob" || d.backend === "local_filesystem" ? d.backend : null,
      configPath: typeof d.configPath === "string" ? d.configPath : null,
      exists: typeof d.exists === "boolean" ? d.exists : null,
      readable: typeof d.readable === "boolean" ? d.readable : null,
      validJson: typeof d.validJson === "boolean" ? d.validJson : null,
      validConfig: typeof d.validConfig === "boolean" ? d.validConfig : null,
      blobReadStatus: typeof d.blobReadStatus === "string" ? d.blobReadStatus : null,
      appErrorCode:
        typeof d.errorCode === "string"
          ? d.errorCode
          : diagnostics.appErrorCode,
    },
  };
}

export async function saveSharedLibraryConfig(libraryId: string, config: Record<string, unknown>): Promise<boolean> {
  const result = await saveSharedLibraryConfigWithDiagnostics(libraryId, config);
  return result.success;
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
    return canonicalizeCollectionArtifact(payload.artifact as Record<string, unknown>, libraryId);
  }

  // Blob URL (Vercel Blob mode): fetch artifact directly from CDN
  if (typeof payload.artifactUrl === "string" && payload.artifactUrl) {
    const artifact = await readJsonAny(payload.artifactUrl);
    if (artifact && typeof artifact === "object" && !Array.isArray(artifact)) {
      return canonicalizeCollectionArtifact(artifact, libraryId);
    }

    // Private Blob stores reject browser requests to the CDN URL. Use a compressed
    // same-origin response so description-rich collections stay below function limits.
    const compressedUrl = new URL(url);
    compressedUrl.searchParams.set("compressed", "1");
    const compressedPayload = await readJson(compressedUrl.toString(), "loadSharedLibraryCollectionCompressedFallback");
    if (compressedPayload?.artifact && typeof compressedPayload.artifact === "object" && !Array.isArray(compressedPayload.artifact)) {
      return canonicalizeCollectionArtifact(compressedPayload.artifact as Record<string, unknown>, libraryId);
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
  return (await saveSharedLibraryCollectionWithDiagnostics(libraryId, artifact)).success;
}

export type SharedLibraryCollectionSaveResult = {
  success: boolean;
  httpStatus: number | null;
  error: string | null;
  activeArtifactState: "activated_verified" | "previous_retained" | "unknown" | null;
};

async function postCollection(
  url: string,
  body: Record<string, unknown>,
  context: string,
): Promise<SharedLibraryCollectionSaveResult> {
  try {
    const response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    return {
      success: response.ok && payload?.success === true,
      httpStatus: response.status,
      error: typeof payload?.error === "string" ? payload.error : null,
      activeArtifactState:
        payload?.activeArtifactState === "activated_verified" ||
        payload?.activeArtifactState === "previous_retained" ||
        payload?.activeArtifactState === "unknown"
          ? payload.activeArtifactState
          : null,
    };
  } catch {
    console.warn(`[library-sharing][client][${context}] request_error`, { url });
    return { success: false, httpStatus: null, error: "request_failed", activeArtifactState: "unknown" };
  }
}

export async function saveSharedLibraryCollectionWithDiagnostics(
  libraryId: string,
  artifact: Record<string, unknown>,
): Promise<SharedLibraryCollectionSaveResult> {
  const url = sharedApiUrl("/api/local-collection", libraryId);
  if (!url) return { success: false, httpStatus: null, error: "invalid_request_url", activeArtifactState: "previous_retained" };
  return postCollection(url, { libraryId, artifact }, "saveSharedLibraryCollection");
}

export async function saveCompressedSharedLibraryCollection(
  libraryId: string,
  artifact: Record<string, unknown>,
): Promise<boolean> {
  return (await saveCompressedSharedLibraryCollectionWithDiagnostics(libraryId, artifact)).success;
}

export async function saveCompressedSharedLibraryCollectionWithDiagnostics(
  libraryId: string,
  artifact: Record<string, unknown>,
): Promise<SharedLibraryCollectionSaveResult> {
  const url = sharedApiUrl("/api/local-collection", libraryId);
  if (!url) return { success: false, httpStatus: null, error: "invalid_request_url", activeArtifactState: "previous_retained" };
  const artifactGzipBase64 = await encodeGzipBase64Json(artifact);
  if (!artifactGzipBase64) {
    return { success: false, httpStatus: null, error: "compression_failed", activeArtifactState: "previous_retained" };
  }
  const body = { libraryId, artifactEncoding: "gzip-base64", artifactGzipBase64 };
  if (utf8ByteLength(JSON.stringify(body)) >= 4 * 1024 * 1024) {
    return { success: false, httpStatus: 413, error: "compressed_request_too_large", activeArtifactState: "previous_retained" };
  }
  return postCollection(url, body, "saveCompressedSharedLibraryCollection");
}
