import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  adminPinProtectionState,
  hasAuthorizedAdminSession,
  removeAdminPinVerifier,
  saveAdminPinVerifier,
} from "../lib/adminAuthorizationServer";
import libraryPwaBranding from "../lib/libraryPwaBranding.js";
import {
  diagnoseSharedLibraryConfig,
  getSharedLibraryConfigStorageTrace,
  loadSharedLibraryConfigPayload,
  saveSharedLibraryConfig,
} from "../lib/librarySharing/storage";
import { MIN_NEW_LIBRARY_ID_LENGTH, normalizeHostedLibraryId } from "../lib/savedLibraries";

const {
  buildHostedLibraryManifest,
  fallbackPwaIconPath,
  libraryPwaIconVersion,
  libraryPwaLogoIsUsable,
  libraryPwaThemeColor,
  readLibraryLogoBuffer,
  renderLibraryPwaIcon,
} = libraryPwaBranding;

function readLibraryId(req: VercelRequest): string {
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  return String(body.libraryId || req.query.libraryId || "").trim();
}

function readFormat(req: VercelRequest): string {
  return String(req.query.format || "").trim().toLowerCase();
}

function readIconSize(req: VercelRequest): 180 | 192 | 512 | null {
  const value = Number(req.query.size);
  return value === 180 || value === 192 || value === 512 ? value : null;
}

function readIconPurpose(req: VercelRequest): "any" | "maskable" {
  return String(req.query.purpose || "") === "maskable" ? "maskable" : "any";
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

function sendPwaManifest(
  res: VercelResponse,
  manifest: object,
  correlationId: string,
): VercelResponse {
  writeConfigHeaders(res, correlationId);
  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).send(JSON.stringify(manifest));
}

function redirectToFallbackIcon(
  res: VercelResponse,
  size: 180 | 192 | 512,
  purpose: "any" | "maskable",
  correlationId: string,
): VercelResponse {
  writeConfigHeaders(res, correlationId);
  res.setHeader("Cache-Control", "private, no-store");
  return res.redirect(307, fallbackPwaIconPath(size, purpose));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const correlationId = correlationIdFromRequest(req);
  const requestedLibraryId = readLibraryId(req);
  const libraryId = normalizeHostedLibraryId(requestedLibraryId);
  const format = readFormat(req);
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
      if (format === "pwa-manifest" || format === "pwa-icon") {
        const hostedLibraryId = normalizeHostedLibraryId(libraryId);
        if (!hostedLibraryId) {
          return sendJson(res, 400, { error: "invalid_library_id", correlationId }, correlationId);
        }
        const config = await loadSharedLibraryConfigPayload(hostedLibraryId, { correlationId });
        if (!config) {
          return sendJson(res, 404, { error: "config_not_found", correlationId }, correlationId);
        }

        const logoBuffer = readLibraryLogoBuffer(config);
        if (format === "pwa-manifest") {
          const hasCustomIcon = await libraryPwaLogoIsUsable(logoBuffer);
          const manifest = buildHostedLibraryManifest(config, hostedLibraryId, {
            hasCustomIcon,
            iconVersion: libraryPwaIconVersion(config, hasCustomIcon ? logoBuffer : null),
          });
          return sendPwaManifest(res, manifest, correlationId);
        }

        const size = readIconSize(req);
        if (!size) {
          return sendJson(res, 400, { error: "invalid_pwa_icon_size", correlationId }, correlationId);
        }
        const purpose = readIconPurpose(req);
        if (!logoBuffer) return redirectToFallbackIcon(res, size, purpose, correlationId);

        try {
          const icon = await renderLibraryPwaIcon(
            logoBuffer,
            size,
            purpose,
            libraryPwaThemeColor(config),
          );
          writeConfigHeaders(res, correlationId);
          res.setHeader("Content-Type", "image/png");
          res.setHeader("Cache-Control", "private, no-store");
          return res.status(200).send(icon);
        } catch (error) {
          console.warn("[api/library-config][GET] pwa_icon_fallback", {
            correlationId,
            libraryId,
            size,
            purpose,
            error: error instanceof Error ? error.message : String(error),
          });
          return redirectToFallbackIcon(res, size, purpose, correlationId);
        }
      }

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
    const existingProtection = await adminPinProtectionState(libraryId);
    const hasAdminSession = hasAuthorizedAdminSession(req, libraryId);
    if (existingProtection.pinEnabled && !hasAdminSession) {
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
    const admin = (config as Record<string, unknown>).admin;
    const nextAdmin = admin && typeof admin === "object" && !Array.isArray(admin)
      ? admin as Record<string, unknown>
      : {};
    const nextPinEnabled = nextAdmin.pinEnabled === true;
    const nextPin = typeof nextAdmin.pin === "string" ? nextAdmin.pin.trim() : "";
    if (nextPinEnabled && !/^\d{6}$/.test(nextPin) && !existingProtection.verifierConfigured) {
      return sendJson(res, 400, { error: "admin_pin_required", correlationId }, correlationId);
    }
    const normalizedLibraryId = libraryId;
    if (normalizedLibraryId.length < MIN_NEW_LIBRARY_ID_LENGTH) {
      const existingConfig = await loadSharedLibraryConfigPayload(normalizedLibraryId, { correlationId });
      if (!existingConfig) {
        return sendJson(
          res,
          400,
          {
            error: "library_id_too_short",
            minimumLength: MIN_NEW_LIBRARY_ID_LENGTH,
            correlationId,
          },
          correlationId,
        );
      }
    }
    const payloadUtf8Bytes = estimateUtf8Bytes(config);
    console.info("[api/library-config][POST] save_start", {
      ...(trace || getSharedLibraryConfigStorageTrace(libraryId)),
      correlationId,
      libraryId,
      requestUrl: req.url || "",
      requestBodyUtf8Bytes: estimateUtf8Bytes(req.body),
      payloadUtf8Bytes,
    });
    await saveSharedLibraryConfig(libraryId, config as Record<string, unknown>, { correlationId });
    if (nextPinEnabled && /^\d{6}$/.test(nextPin)) {
      await saveAdminPinVerifier(libraryId, nextPin);
    } else if (!nextPinEnabled) {
      await removeAdminPinVerifier(libraryId);
    }
    console.info("[api/library-config][POST] save_success", {
      ...(trace || getSharedLibraryConfigStorageTrace(libraryId)),
      correlationId,
      libraryId,
      requestUrl: req.url || "",
      payloadUtf8Bytes,
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
