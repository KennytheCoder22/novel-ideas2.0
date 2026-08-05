import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ADMIN_SESSION_COOKIE_NAME } from "../lib/adminSession";
import { loadSharedLibraryConfigPayload, saveSharedLibraryConfig } from "../lib/librarySharing/storage";

function hasAdminSessionCookie(req: VercelRequest): boolean {
  const cookie = String(req.headers.cookie || "");
  return cookie.split(";").some((part) => part.trim().startsWith(`${ADMIN_SESSION_COOKIE_NAME}=1`));
}

function readLibraryId(req: VercelRequest): string {
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  return String(body.libraryId || req.query.libraryId || "").trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const libraryId = readLibraryId(req);
  if (!libraryId) {
    return res.status(400).json({ error: "missing_library_id" });
  }

  if (req.method === "GET") {
    const config = await loadSharedLibraryConfigPayload(libraryId);
    if (!config) return res.status(404).json({ error: "library_config_not_found" });
    return res.status(200).json({ status: "ok", libraryId, config });
  }

  if (req.method === "POST") {
    if (!hasAdminSessionCookie(req)) {
      return res.status(401).json({ error: "admin_session_required" });
    }
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    const config = body.config;
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      return res.status(400).json({ error: "missing_config" });
    }
    await saveSharedLibraryConfig(libraryId, config as Record<string, unknown>);
    return res.status(200).json({ status: "ok", libraryId });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "method_not_allowed" });
}
