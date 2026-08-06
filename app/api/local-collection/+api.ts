import { ADMIN_SESSION_COOKIE_NAME } from "../../../lib/adminSession";
import {
  loadSharedLibraryCollectionResult,
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
 * API response path.
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
 * Accepted request shape (admin-only):
 *   { libraryId, artifact }
 * Stores the full artifact server-side. In vercel_blob mode this writes to
 * Vercel Blob and updates a pointer blob; in local_filesystem mode this writes
 * to disk for local development.
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

    if (b.artifact && typeof b.artifact === "object" && !Array.isArray(b.artifact)) {
      await saveSharedLibraryCollection(libId, b.artifact as Record<string, unknown>);
      return Response.json({ success: true });
    }

    return Response.json({ error: "missing_artifact" }, { status: 400 });
  } catch (error) {
    console.error("local-collection POST error:", error);
    return Response.json({ error: "internal_server_error" }, { status: 500 });
  }
}
