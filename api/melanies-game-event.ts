import type { VercelRequest, VercelResponse } from "@vercel/node";
import { get, put } from "@vercel/blob";
import { isMelanieEvidenceEvent } from "../lib/recommendationGames/melaniesGame";

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function safe(value: string, maxLength: number): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, maxLength);
}

function requestOriginMatchesHost(req: VercelRequest): boolean {
  const origin = String(req.headers.origin || "");
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

function exceedsRateLimit(req: VercelRequest): boolean {
  const now = Date.now();
  const forwarded = String(req.headers["x-forwarded-for"] || "");
  const client = forwarded.split(",")[0].trim() || String(req.socket.remoteAddress || "unknown");
  const existing = rateBuckets.get(client);
  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(client, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  existing.count += 1;
  if (rateBuckets.size > 5_000) {
    for (const [key, bucket] of rateBuckets) if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
  return existing.count > RATE_LIMIT;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return res.status(503).json({ error: "melanies_game_storage_unavailable" });
  if (!requestOriginMatchesHost(req)) return res.status(403).json({ error: "melanies_game_origin_rejected" });
  if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    return res.status(415).json({ error: "content_type_must_be_application_json" });
  }
  if (exceedsRateLimit(req)) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "melanies_game_rate_limited" });
  }
  if (JSON.stringify(req.body || {}).length > 48_000 || !isMelanieEvidenceEvent(req.body)) {
    return res.status(400).json({ error: "invalid_melanies_game_event" });
  }
  const event = req.body;
  const pathname = [
    "recommendation-games/melanies-game/v2",
    safe(event.context.libraryId, 100),
    safe(event.context.anonymousPlayerId, 100),
    `${safe(event.presentationId, 180)}.json`,
  ].join("/");
  const serialized = JSON.stringify(event);
  try {
    const existing = await get(pathname, { access: "private", token, useCache: false });
    if (existing?.statusCode === 200 && existing.stream) {
      const current = await new Response(existing.stream).text();
      if (current !== serialized) return res.status(409).json({ error: "melanies_game_event_conflict" });
      return res.status(200).json({ status: "accepted", presentationId: event.presentationId, idempotentReplay: true });
    }
    await put(pathname, serialized, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/json",
      token,
    });
    return res.status(201).json({ status: "accepted", presentationId: event.presentationId });
  } catch (error) {
    console.error("[melanies-game] event_write_failed", error);
    return res.status(500).json({ error: "melanies_game_event_write_failed" });
  }
}
