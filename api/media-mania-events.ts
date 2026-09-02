import type { VercelRequest, VercelResponse } from "@vercel/node";
import { appendMediaManiaEvidence } from "../lib/mediaMania/evidenceStorage";
import { loadSharedLibraryConfigPayload } from "../lib/librarySharing/storage";

function isTrustedRequestOrigin(req: VercelRequest): boolean {
  if (!process.env.VERCEL) return true;
  const origin = String(req.headers.origin || "");
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (!origin) {
    return req.headers["x-media-mania-client"] === "novelideas-native-v1" &&
      !req.headers["sec-fetch-site"];
  }
  if (!host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  try {
    if (!isTrustedRequestOrigin(req)) {
      return res.status(403).json({ error: "untrusted_request_origin" });
    }
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ error: "invalid_payload" });
    }
    if (JSON.stringify(req.body).length > 512_000) {
      return res.status(413).json({ error: "payload_too_large" });
    }
    const body = req.body as Record<string, unknown>;
    const libraryId = String(body.libraryId || "").trim();
    const events = body.events;
    if (!libraryId || libraryId.length > 160 || !Array.isArray(events) || !events.length || events.length > 50) {
      return res.status(400).json({ error: "invalid_event_batch" });
    }
    if (libraryId !== "default" && !await loadSharedLibraryConfigPayload(libraryId)) {
      return res.status(404).json({ error: "library_not_found" });
    }
    const result = await appendMediaManiaEvidence(libraryId, events);
    return res.status(200).json({ status: "stored", ...result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "media_mania_evidence_write_failed";
    if (code === "invalid_media_mania_event") {
      return res.status(400).json({ error: code });
    }
    if (code === "media_mania_event_identity_conflict") {
      return res.status(409).json({ error: code });
    }
    if (code === "media_mania_durable_storage_unavailable") {
      return res.status(503).json({ error: code });
    }
    console.error("[media-mania][evidence][write_failed]", { code });
    return res.status(500).json({ error: "media_mania_evidence_write_failed" });
  }
}
