import { ADMIN_SESSION_COOKIE_NAME } from "../../../lib/adminSession";
import {
  loadSharedLibraryCollectionResult,
  recordSharedLibraryCollectionUrl,
  saveSharedLibraryCollection,
} from "../../../lib/librarySharing/storage";

function isAdminSession(request: Request): boolean {
  try {
    const cookies = request.headers.get("cookie") || "";
    return cookies.includes(`${ADMIN_SESSION_COOKIE_NAME}=1`);
  } catch {
    return false;
  }
}

/**
 * GET /api/local-collection?libraryId={id}
 *
 * In vercel_blob mode returns:
 *   { artifact: null, artifactUrl: "https://..." }
 * where artifactUrl is the direct CDN URL for the client to fetch.
 * This avoids proxying potentially large collection payloads through the
 * Vercel Function (4.5 MB response body limit).
 *
 * In local_filesystem mode returns:
 *   { artifact: {...} }
 * with the full inline data.
 *
 * When no collection has been published yet, returns:
 *   { artifact: null, artifactUrl: null }
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const libraryId = url.searchParams.get("libraryId");
    if (!libraryId || !String(libraryId).trim()) {
      return Response.json({ error: "missing_library_id" }, { status: 400 });
    }
    const result = await loadSharedLibraryCollectionResult(libraryId);
    return Response.json({
      artifact: result.artifact ?? null,
      artifactUrl: result.artifactUrl ?? null,
    });
  } catch (error) {
    console.error("local-collection GET error:", error);
    return Response.json({ error: "internal_server_error" }, { status: 500 });
  }
}

/**
 * POST /api/local-collection
 *
 * Two accepted request shapes (admin-only):
 *
 *   1. { libraryId, blobUrl }
 *      Records the Vercel Blob URL of a collection uploaded by the browser client.
 *      Used after a client-side upload via /api/local-collection/upload-url.
 *
 *   2. { libraryId, artifact }
 *      Stores the full artifact server-side. Only works in local_filesystem
 *      mode (local dev); in vercel_blob mode this is rejected because the
 *      payload may exceed the 4.5 MB request body limit.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    if (!isAdminSession(request)) {
      return Response.json({ error: "unauthorized" }, { status: 403 });
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "invalid_request_body" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;
    const libraryId = b.libraryId;
    if (!libraryId || !String(libraryId).trim()) {
      return Response.json({ error: "missing_library_id" }, { status: 400 });
    }
    const libId = String(libraryId).trim();

    // Shape 1: blobUrl from client upload
    if (typeof b.blobUrl === "string" && b.blobUrl) {
      await recordSharedLibraryCollectionUrl(libId, b.blobUrl);
      return Response.json({ success: true });
    }

    // Shape 2: inline artifact (local dev / filesystem mode)
    if (b.artifact && typeof b.artifact === "object" && !Array.isArray(b.artifact)) {
      await saveSharedLibraryCollection(libId, b.artifact as Record<string, unknown>);
      return Response.json({ success: true });
    }

    return Response.json({ error: "missing_blob_url_or_artifact" }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.startsWith("vercel_blob_mode:")) {
      return Response.json({ error: "use_client_upload", detail: msg }, { status: 400 });
    }
    console.error("local-collection POST error:", error);
    return Response.json({ error: "internal_server_error" }, { status: 500 });
  }
}
