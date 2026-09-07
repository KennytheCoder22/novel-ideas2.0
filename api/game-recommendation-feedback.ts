import type { VercelRequest, VercelResponse } from "@vercel/node";
import { get, put } from "@vercel/blob";
import {
  gameRecommendationFeedbackStoragePath,
  normalizeGameRecommendationFeedbackEventV1,
} from "../lib/recommendationGames/gameRecommendationFeedback";

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

async function readExisting(pathname: string, token: string): Promise<string | null> {
  const existing = await get(pathname, { access: "private", token, useCache: false });
  if (!existing || existing.statusCode !== 200 || !existing.stream) return null;
  return new Response(existing.stream).text();
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
    return res.status(503).json({ error: "game_recommendation_feedback_storage_unavailable" });
  }
  if (!requestOriginMatchesHost(req)) {
    return res.status(403).json({ error: "game_recommendation_feedback_origin_rejected" });
  }
  if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    return res.status(415).json({ error: "content_type_must_be_application_json" });
  }
  if (exceedsRateLimit(req)) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "game_recommendation_feedback_rate_limited" });
  }
  if (JSON.stringify(req.body || {}).length > 8_000) {
    return res.status(413).json({ error: "game_recommendation_feedback_event_too_large" });
  }
  const event = normalizeGameRecommendationFeedbackEventV1(req.body);
  if (!event) {
    return res.status(400).json({ error: "invalid_game_recommendation_feedback_event" });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const pathname = gameRecommendationFeedbackStoragePath(event);
  const serialized = JSON.stringify(event);
  try {
    const existing = await readExisting(pathname, token);
    if (existing !== null) {
      if (existing !== serialized) {
        return res.status(409).json({ error: "game_recommendation_feedback_revision_conflict" });
      }
      return res.status(200).json({ status: "accepted", eventId: event.eventId, idempotentReplay: true });
    }
    await put(
      pathname,
      serialized,
      {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: "application/json",
        token,
      },
    );
    return res.status(201).json({
      status: "accepted",
      eventId: event.eventId,
      storageMode: "durable_blob",
    });
  } catch (error) {
    const existing = await readExisting(pathname, token).catch(() => null);
    if (existing === serialized) {
      return res.status(200).json({ status: "accepted", eventId: event.eventId, idempotentReplay: true });
    }
    console.error("[game-recommendation-feedback] event_write_failed", error);
    return res.status(500).json({ error: "game_recommendation_feedback_event_write_failed" });
  }
}
