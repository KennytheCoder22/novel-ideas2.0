import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ADMIN_SESSION_COOKIE_NAME } from "../lib/adminSession";
import {
  loadSharedLibraryCollectionPayload,
  loadSharedLibraryCollectionResult,
  saveSharedLibraryCollection,
} from "../lib/librarySharing/storage";

function hasAdminSessionCookie(req: VercelRequest): boolean {
  const cookie = String(req.headers.cookie || "");
  return cookie.split(";").some((part) => part.trim().startsWith(`${ADMIN_SESSION_COOKIE_NAME}=1`));
}

function readLibraryId(req: VercelRequest): string {
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  return String(body.libraryId || req.query.libraryId || "").trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const libraryId = readLibraryId(req);
  if (!libraryId) {
    return res.status(400).json({ error: "missing_library_id" });
  }

  if (req.method === "GET") {
    try {
      if (String(req.query.inline || "") === "1") {
        const artifact = await loadSharedLibraryCollectionPayload(libraryId);
        return res.status(200).json({ artifact: artifact ?? null, artifactUrl: null });
      }
      const result = await loadSharedLibraryCollectionResult(libraryId);
      return res.status(200).json({
        artifact: result.artifact ?? null,
        artifactUrl: result.artifactUrl ?? null,
      });
    } catch (error) {
      console.error("local-collection GET error:", error);
      return res.status(500).json({ error: "internal_server_error" });
    }
  }

  try {
    if (!hasAdminSessionCookie(req)) {
      return res.status(403).json({ error: "unauthorized" });
    }
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    const artifact = body.artifact;
    if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
      return res.status(400).json({ error: "missing_artifact" });
    }
    await saveSharedLibraryCollection(libraryId, artifact as Record<string, unknown>);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("local-collection POST error:", error);
    return res.status(500).json({ error: "internal_server_error" });
  }
}
