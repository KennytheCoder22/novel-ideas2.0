import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ADMIN_SESSION_COOKIE_NAME } from "../lib/adminSession";
import {
  diagnoseSharedLibraryConfig,
  getSharedLibraryConfigStorageTrace,
  loadSharedLibraryConfigPayload,
  saveSharedLibraryConfig,
} from "../lib/librarySharing/storage";

function hasAdminSessionCookie(req: VercelRequest): boolean {
  const cookie = String(req.headers.cookie || "");
  return cookie.split(";").some((part) => part.trim().startsWith(`${ADMIN_SESSION_COOKIE_NAME}=1`));
}

function readLibraryId(req: VercelRequest): string {
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  return String(body.libraryId || req.query.libraryId || "").trim();
}

function correlationIdFromRequest(req: VercelRequest): string {
  const fromHeader = String(req.headers["x-correlation-id"] || "").trim();
  if (fromHeader) return fromHeader.slice(0, 96);
  return `cfg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function writeConfigHeaders(res: VercelResponse, correlationId: string): void {
  res.setHeader("x-correlation-id", correlationId);
  res.setHeader("x-library-config-route", "reached");
}

function sendJson(
  res: VercelResponse,
  status: number,
  payload: Record<string, unknown>,
  correlationId: string
): VercelResponse {
  writeConfigHeaders(res, correlationId);
  return res.status(status).json(payload);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const correlationId = correlationIdFromRequest(req);
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "method_not_allowed", correlationId }, correlationId);
  }

  const libraryId = readLibraryId(req);
  if (!libraryId) {
    return sendJson(res, 400, { error: "missing_library_id", correlationId }, correlationId);
  }

  if (req.method === "GET") {
    try {
      const trace = getSharedLibraryConfigStorageTrace(libraryId);
      console.info("[api/library-config][GET] route_entered", {
        correlationId,
        pathname: req.url || "",
        requestedLibraryId: libraryId,
        ...trace,
      });
      const diagnostics = await diagnoseSharedLibraryConfig(libraryId, correlationId);
      if (!diagnostics.validConfig || diagnostics.errorCode) {
        const status = diagnostics.errorCode === "config_not_found" ? 404 : 500;
        console.info("[api/library-config][GET] load_failed", {
          correlationId,
          ...diagnostics,
        });
        return sendJson(
          res,
          status,
          { error: diagnostics.errorCode || "config_not_found", correlationId },
          correlationId
        );
      }
      const config = await loadSharedLibraryConfigPayload(libraryId, { correlationId });
      console.info("[api/library-config][GET] load_succeeded", {
        correlationId,
        ...trace,
        found: !!config,
      });
      if (!config) {
        return sendJson(res, 404, { error: "config_not_found", correlationId }, correlationId);
      }
      return sendJson(res, 200, { config, correlationId }, correlationId);
    } catch (error) {
      console.error("[api/library-config][GET] internal_error", { correlationId }, error);
      return sendJson(res, 500, { error: "internal_server_error", correlationId }, correlationId);
    }
  }

  try {
    if (!hasAdminSessionCookie(req)) {
      return sendJson(res, 403, { error: "unauthorized", correlationId }, correlationId);
    }
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    const config = body.config;
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      return sendJson(res, 400, { error: "missing_or_invalid_config", correlationId }, correlationId);
    }
    const trace = getSharedLibraryConfigStorageTrace(libraryId);
    console.info("[api/library-config][POST] save_start", { correlationId, ...trace });
    await saveSharedLibraryConfig(libraryId, config as Record<string, unknown>, { correlationId });
    console.info("[api/library-config][POST] save_success", { correlationId, ...trace });
    return sendJson(res, 200, { success: true, correlationId }, correlationId);
  } catch (error) {
    console.error("[api/library-config][POST] internal_error", { correlationId }, error);
    return sendJson(res, 500, { error: "internal_server_error", correlationId }, correlationId);
  }
}
