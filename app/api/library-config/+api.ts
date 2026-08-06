import { ADMIN_SESSION_COOKIE_NAME } from "../../../lib/adminSession";
import {
  diagnoseSharedLibraryConfig,
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

function correlationIdFromRequest(request: Request): string {
  const fromHeader = String(request.headers.get("x-correlation-id") || "").trim();
  if (fromHeader) return fromHeader.slice(0, 96);
  return `cfg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function jsonWithHeaders(payload: Record<string, unknown>, status: number, correlationId: string): Response {
  return Response.json(payload, {
    status,
    headers: {
      "x-correlation-id": correlationId,
      "x-library-config-route": "reached",
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const correlationId = correlationIdFromRequest(request);
  try {
    const url = new URL(request.url);
    const libraryId = url.searchParams.get("libraryId");
    const pathname = url.pathname;

    if (!libraryId || !String(libraryId).trim()) {
      return jsonWithHeaders({ error: "missing_library_id", correlationId }, 400, correlationId);
    }

    const trace = getSharedLibraryConfigStorageTrace(String(libraryId));
    console.info("[api/library-config][GET] route_entered", {
      correlationId,
      pathname,
      requestedLibraryId: libraryId,
      ...trace,
    });
    const diagnostics = await diagnoseSharedLibraryConfig(String(libraryId), correlationId);
    if (!diagnostics.validConfig || diagnostics.errorCode) {
      const status = diagnostics.errorCode === "config_not_found" ? 404 : 500;
      console.info("[api/library-config][GET] load_failed", {
        correlationId,
        ...diagnostics,
      });
      return jsonWithHeaders(
        {
          error: diagnostics.errorCode || "config_not_found",
          correlationId,
        },
        status,
        correlationId
      );
    }
    const config = await loadSharedLibraryConfigPayload(String(libraryId), { correlationId });
    console.info("[api/library-config][GET] load_succeeded", {
      correlationId,
      ...trace,
      found: !!config,
    });
    if (!config) {
      return jsonWithHeaders({ error: "config_not_found", correlationId }, 404, correlationId);
    }
    return jsonWithHeaders({ config, correlationId }, 200, correlationId);
  } catch (error) {
    console.error("[api/library-config][GET] internal_error", { correlationId }, error);
    return jsonWithHeaders({ error: "internal_server_error", correlationId }, 500, correlationId);
  }
}

export async function POST(request: Request): Promise<Response> {
  const correlationId = correlationIdFromRequest(request);
  try {
    if (!isAdminSession(request)) {
      return jsonWithHeaders({ error: "unauthorized", correlationId }, 403, correlationId);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonWithHeaders({ error: "invalid_request_body", correlationId }, 400, correlationId);
    }

    const libraryId = (body as Record<string, unknown>).libraryId;
    if (!libraryId || !String(libraryId).trim()) {
      return jsonWithHeaders({ error: "missing_library_id", correlationId }, 400, correlationId);
    }

    const config = (body as Record<string, unknown>).config;
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      return jsonWithHeaders({ error: "missing_or_invalid_config", correlationId }, 400, correlationId);
    }

    const trace = getSharedLibraryConfigStorageTrace(String(libraryId));
    console.info("[api/library-config][POST] save_start", { correlationId, ...trace });
    await saveSharedLibraryConfig(String(libraryId), config as Record<string, unknown>, { correlationId });
    console.info("[api/library-config][POST] save_success", { correlationId, ...trace });
    return jsonWithHeaders({ success: true, correlationId }, 200, correlationId);
  } catch (error) {
    console.error("[api/library-config][POST] internal_error", { correlationId }, error);
    return jsonWithHeaders({ error: "internal_server_error", correlationId }, 500, correlationId);
  }
}
