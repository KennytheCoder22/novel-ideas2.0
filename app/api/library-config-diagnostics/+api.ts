import { ADMIN_SESSION_COOKIE_NAME } from "../../../lib/adminSession";
import { isPreviewAcceptanceEnvironmentEnabled } from "../../../lib/previewAcceptanceHarness";
import { diagnoseSharedLibraryConfig } from "../../../lib/librarySharing/storage";

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
  return `diag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function GET(request: Request): Promise<Response> {
  const correlationId = correlationIdFromRequest(request);
  try {
    const url = new URL(request.url);
    const libraryId = String(url.searchParams.get("libraryId") || "").trim();
    if (!libraryId) {
      return Response.json(
        { error: "missing_library_id", correlationId },
        { status: 400, headers: { "x-correlation-id": correlationId } }
      );
    }
    if (!isAdminSession(request) && !isPreviewAcceptanceEnvironmentEnabled()) {
      return Response.json(
        { error: "unauthorized", correlationId },
        { status: 403, headers: { "x-correlation-id": correlationId } }
      );
    }

    console.info("[api/library-config-diagnostics][GET] route_entered", {
      correlationId,
      pathname: url.pathname,
      requestedLibraryId: libraryId,
    });
    const diagnostics = await diagnoseSharedLibraryConfig(libraryId, correlationId);
    const response = {
      routeReachable: true,
      correlationId,
      timestamp: new Date().toISOString(),
      libraryId: diagnostics.libraryId,
      normalizedLibraryId: diagnostics.normalizedLibraryId,
      backend: diagnostics.backend,
      configPath: diagnostics.configPath,
      exists: diagnostics.exists,
      readable: diagnostics.readable,
      validJson: diagnostics.validJson,
      validConfig: diagnostics.validConfig,
      updatedAt: diagnostics.updatedAt,
      blobReadStatus: diagnostics.blobReadStatus,
      errorCode: diagnostics.errorCode,
    };
    console.info("[api/library-config-diagnostics][GET] response_ready", {
      correlationId,
      backend: diagnostics.backend,
      normalizedLibraryId: diagnostics.normalizedLibraryId,
      configPath: diagnostics.configPath,
      exists: diagnostics.exists,
      readable: diagnostics.readable,
      validJson: diagnostics.validJson,
      validConfig: diagnostics.validConfig,
      errorCode: diagnostics.errorCode,
    });
    return Response.json(response, { headers: { "x-correlation-id": correlationId } });
  } catch (error) {
    console.error("[api/library-config-diagnostics][GET] internal_error", { correlationId }, error);
    return Response.json(
      { error: "internal_server_error", correlationId },
      { status: 500, headers: { "x-correlation-id": correlationId } }
    );
  }
}
