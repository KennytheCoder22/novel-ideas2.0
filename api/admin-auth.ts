import type { VercelRequest, VercelResponse } from "@vercel/node";
import { timingSafeEqual } from "node:crypto";
import {
  adminPinProtectionState,
  enrollAdminPinVerifier,
  hasAuthorizedAdminSession,
  issueAdminSession,
  verifyAdminPin,
} from "../lib/adminAuthorizationServer";
import { normalizeHostedLibraryId } from "../lib/savedLibraries";

function readLibraryId(req: VercelRequest): string {
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  return String(body.libraryId || req.query.libraryId || "").trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  const libraryId = normalizeHostedLibraryId(readLibraryId(req));
  if (!libraryId) return res.status(400).json({ error: "missing_library_id" });

  const protection = await adminPinProtectionState(libraryId);
  if (req.method === "GET") {
    return res.status(200).json({
      ...protection,
      authorized: !protection.pinEnabled || hasAuthorizedAdminSession(req, libraryId),
    });
  }
  if (!protection.pinEnabled) return res.status(200).json({ authorized: true, pinEnabled: false });
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  if (body.action === "reenroll" && !protection.verifierConfigured) {
    const expectedSecret = String(process.env.ADMIN_PIN_RECOVERY_SECRET || "");
    const suppliedSecret = String(body.recoverySecret || "");
    const expected = Buffer.from(expectedSecret);
    const supplied = Buffer.from(suppliedSecret);
    const recoveryAuthorized =
      expected.length >= 24 &&
      supplied.length === expected.length &&
      timingSafeEqual(supplied, expected);
    if (!recoveryAuthorized) {
      return res.status(403).json({ error: "admin_pin_reenrollment_unauthorized", authorized: false });
    }
    const pin = String(body.pin || "");
    if (!/^\d{6}$/.test(pin)) {
      return res.status(400).json({ error: "invalid_admin_pin", authorized: false });
    }
    if (!(await enrollAdminPinVerifier(libraryId, pin))) {
      return res.status(409).json({ error: "admin_pin_already_enrolled", authorized: false });
    }
    issueAdminSession(res, libraryId);
    return res.status(200).json({ authorized: true, pinEnabled: true, reenrolled: true });
  }
  if (!protection.verifierConfigured) {
    return res.status(503).json({ error: "admin_pin_reenrollment_required", authorized: false });
  }
  const pin = String(body.pin || "");
  if (!(await verifyAdminPin(libraryId, pin))) {
    return res.status(401).json({ error: "incorrect_pin", authorized: false });
  }
  issueAdminSession(res, libraryId);
  return res.status(200).json({ authorized: true, pinEnabled: true });
}
