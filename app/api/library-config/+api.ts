import { ADMIN_SESSION_COOKIE_NAME } from "../../../lib/adminSession";
import {
  getSharedLibraryConfigStorageTrace,
  loadSharedLibraryConfigPayload,
  saveSharedLibraryConfig,
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

    const trace = getSharedLibraryConfigStorageTrace(String(libraryId));
    console.info("[api/library-config][GET] load_start", trace);
    const config = await loadSharedLibraryConfigPayload(libraryId);
    console.info("[api/library-config][GET] load_result", {
      ...trace,
      found: !!config,
    });
    return Response.json({ config: config ?? null });
  } catch (error) {
    console.error("library-config GET error:", error);
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

    const config = (body as Record<string, unknown>).config;
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      return Response.json({ error: "missing_or_invalid_config" }, { status: 400 });
    }

    const trace = getSharedLibraryConfigStorageTrace(String(libraryId));
    console.info("[api/library-config][POST] save_start", trace);
    await saveSharedLibraryConfig(String(libraryId), config as Record<string, unknown>);
    console.info("[api/library-config][POST] save_success", trace);
    return Response.json({ success: true });
  } catch (error) {
    console.error("library-config POST error:", error);
    return Response.json({ error: "internal_server_error" }, { status: 500 });
  }
}
