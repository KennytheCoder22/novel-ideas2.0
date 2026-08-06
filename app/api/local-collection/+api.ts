import { ADMIN_SESSION_COOKIE_NAME } from "../../../lib/adminSession";
import {
  loadSharedLibraryCollectionPayload,
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

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const libraryId = url.searchParams.get("libraryId");

    if (!libraryId || !String(libraryId).trim()) {
      return Response.json({ error: "missing_library_id" }, { status: 400 });
    }

    const artifact = await loadSharedLibraryCollectionPayload(libraryId);
    return Response.json({ artifact: artifact ?? null });
  } catch (error) {
    console.error("local-collection GET error:", error);
    return Response.json({ error: "internal_server_error" }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    if (!isAdminSession(request)) {
      return Response.json({ error: "unauthorized" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "invalid_request_body" }, { status: 400 });
    }

    const libraryId = (body as Record<string, unknown>).libraryId;
    if (!libraryId || !String(libraryId).trim()) {
      return Response.json({ error: "missing_library_id" }, { status: 400 });
    }

    const artifact = (body as Record<string, unknown>).artifact;
    if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
      return Response.json({ error: "missing_or_invalid_artifact" }, { status: 400 });
    }

    await saveSharedLibraryCollection(String(libraryId), artifact as Record<string, unknown>);
    return Response.json({ success: true });
  } catch (error) {
    console.error("local-collection POST error:", error);
    return Response.json({ error: "internal_server_error" }, { status: 500 });
  }
}
