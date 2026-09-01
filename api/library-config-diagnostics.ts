import type { VercelRequest, VercelResponse } from "@vercel/node";
import { hasAuthorizedAdminSession } from "../lib/adminAuthorizationServer";
import { diagnoseSharedLibraryConfig } from "../lib/librarySharing/storage";
import { isPreviewAcceptanceEnvironmentEnabled } from "../lib/previewAcceptanceHarness";

function correlationIdFromRequest(req: VercelRequest): string {
  const fromHeader = String(req.headers["x-correlation-id"] || "").trim();
  if (fromHeader) return fromHeader.slice(0, 96);
  return `diag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sendJson(
  res: VercelResponse,
  status: number,
  payload: Record<string, unknown>,
  correlationId: string
): VercelResponse {
  res.setHeader("x-correlation-id", correlationId);
  return res.status(status).json(payload);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const correlationId = correlationIdFromRequest(req);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "method_not_allowed", correlationId }, correlationId);
  }

  try {
    const libraryId = String(req.query.libraryId || "").trim();
    if (!libraryId) {
      return sendJson(res, 400, { error: "missing_library_id", correlationId }, correlationId);
    }
    if (!hasAuthorizedAdminSession(req, libraryId) && !isPreviewAcceptanceEnvironmentEnabled()) {
      return sendJson(res, 403, { error: "unauthorized", correlationId }, correlationId);
    }
    console.info("[api/library-config-diagnostics][GET] route_entered", {
      correlationId,
      pathname: req.url || "",
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
    return sendJson(res, 200, response, correlationId);
  } catch (error) {
    console.error("[api/library-config-diagnostics][GET] internal_error", { correlationId }, error);
    return sendJson(res, 500, { error: "internal_server_error", correlationId }, correlationId);
  }
}
