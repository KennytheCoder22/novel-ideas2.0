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

function estimateUtf8Bytes(value: unknown): number | null {
  try {
    if (value === undefined) return null;
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return null;
  }
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
  const libraryId = readLibraryId(req);
  const trace = libraryId ? getSharedLibraryConfigStorageTrace(libraryId) : null;
  console.info("[api/library-config] route_entered", {
    correlationId,
    method: req.method || "",
    requestUrl: req.url || "",
    libraryId,
    requestBodyUtf8Bytes: estimateUtf8Bytes(req.body),
    ...(trace || {}),
  });

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "method_not_allowed", correlationId }, correlationId);
  }

  if (!libraryId) {
    console.warn("[api/library-config] missing_library_id", {
      correlationId,
      method: req.method || "",
      requestUrl: req.url || "",
    });
    return sendJson(res, 400, { error: "missing_library_id", correlationId }, correlationId);
  }

  if (req.method === "GET") {
    try {
      console.info("[api/library-config][GET] route_entered", {
        correlationId,
        pathname: req.url || "",
        requestedLibraryId: libraryId,
        ...(trace || {}),
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
        ...(trace || {}),
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
    const hasAdminSession = hasAdminSessionCookie(req);
    if (!hasAdminSession) {
      console.warn("[api/library-config][POST] unauthorized", {
        correlationId,
        libraryId,
        requestUrl: req.url || "",
        hasAdminSession,
      });
      return sendJson(res, 403, { error: "unauthorized", correlationId }, correlationId);
    }
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    const config = body.config;
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      console.warn("[api/library-config][POST] missing_or_invalid_config", {
        correlationId,
        libraryId,
        requestUrl: req.url || "",
        requestBodyUtf8Bytes: estimateUtf8Bytes(req.body),
      });
      return sendJson(res, 400, { error: "missing_or_invalid_config", correlationId }, correlationId);
    }
    const payloadUtf8Bytes = estimateUtf8Bytes(config);
    console.info("[api/library-config][POST] save_start", {
      correlationId,
      libraryId,
      requestUrl: req.url || "",
      requestBodyUtf8Bytes: estimateUtf8Bytes(req.body),
      payloadUtf8Bytes,
      ...(trace || getSharedLibraryConfigStorageTrace(libraryId)),
    });
    await saveSharedLibraryConfig(libraryId, config as Record<string, unknown>, { correlationId });
    console.info("[api/library-config][POST] save_success", {
      correlationId,
      libraryId,
      requestUrl: req.url || "",
      payloadUtf8Bytes,
      ...(trace || getSharedLibraryConfigStorageTrace(libraryId)),
    });
    return sendJson(res, 200, { success: true, correlationId }, correlationId);
  } catch (error) {
    const stage = error instanceof Error ? error.message : "";
    const safeStageError =
      stage === "blob_write_failed" ||
      stage === "config_write_verification_probe_failed" ||
      stage === "config_write_verification_failed"
        ? stage
        : "internal_server_error";
    const errObj = error && typeof error === "object" ? (error as Record<string, unknown>) : null;
    const details = errObj && errObj.details && typeof errObj.details === "object"
      ? (errObj.details as Record<string, unknown>)
      : null;
    const exceptionName = typeof details?.exceptionName === "string" ? details.exceptionName : null;
    const exceptionCode = typeof details?.exceptionCode === "string" ? details.exceptionCode : null;
    const exceptionMessage = typeof details?.exceptionMessage === "string" ? details.exceptionMessage : null;
    console.error(
      "[api/library-config][POST] internal_error",
      { correlationId, stage: safeStageError, exceptionName, exceptionCode, exceptionMessage },
      error
    );
    return sendJson(
      res,
      500,
      {
        error: safeStageError,
        correlationId,
        exceptionName,
        exceptionCode,
        exceptionMessage,
      },
      correlationId
    );
  }
}
