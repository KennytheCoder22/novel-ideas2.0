import type { VercelRequest, VercelResponse } from "@vercel/node";
import { put } from "@vercel/blob";
import { normalizeRecommendationGameEventV1 } from "../lib/recommendationGames/lastBookshop";

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

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
    for (const [key, bucket] of rateBuckets) {
      if (bucket.resetAt <= now) rateBuckets.delete(key);
    }
  }
  return existing.count > RATE_LIMIT;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: "recommendation_game_storage_unavailable" });
  }
  if (!requestOriginMatchesHost(req)) {
    return res.status(403).json({ error: "recommendation_game_origin_rejected" });
  }
  if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    return res.status(415).json({ error: "content_type_must_be_application_json" });
  }
  if (exceedsRateLimit(req)) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "recommendation_game_rate_limited" });
  }
  if (JSON.stringify(req.body || {}).length > 32_000) {
    return res.status(413).json({ error: "recommendation_game_event_too_large" });
  }
  const event = normalizeRecommendationGameEventV1(req.body);
  if (!event) {
    return res.status(400).json({ error: "invalid_recommendation_game_event" });
  }

  const safePlayer = event.anonymousPlayerId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100);
  const safeEvent = event.eventId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 160);
  try {
    await put(
      `recommendation-games/the-last-bookshop/v1/${safePlayer}/${safeEvent}.json`,
      JSON.stringify(event),
      {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      },
    );
    return res.status(201).json({
      status: "accepted",
      eventId: event.eventId,
      storageMode: "durable_blob",
    });
  } catch (error) {
    console.error("[recommendation-game] event_write_failed", error);
    return res.status(500).json({ error: "recommendation_game_event_write_failed" });
  }
}
