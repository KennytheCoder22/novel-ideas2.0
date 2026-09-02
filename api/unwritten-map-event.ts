import type { VercelRequest, VercelResponse } from "@vercel/node";
import { get, put } from "@vercel/blob";
import {
  normalizeLibraryScope,
  normalizeUnwrittenMapChoiceEventV1,
  normalizeUnwrittenMapEventV2,
  type UnwrittenMapEvent,
  type UnwrittenMapChoiceEventV1,
  type UnwrittenMapEventV2,
} from "../lib/recommendationGames/unwrittenMap";

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function unwrittenMapEventPath(event: UnwrittenMapEvent): string {
  const player = event.anonymousPlayerId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100);
  const eventId = event.eventId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 160);
  if (event.schemaVersion === "unwritten_map_choice_event_v1") {
    return `recommendation-games/the-unwritten-map/v1/${player}/${eventId}.json`;
  }
  const library = normalizeLibraryScope(event.libraryScopeId);
  return `recommendation-games/the-unwritten-map/v2/${library}/${player}/${eventId}.json`;
}

function normalizeEvent(value: unknown): UnwrittenMapChoiceEventV1 | UnwrittenMapEventV2 | null {
  return normalizeUnwrittenMapChoiceEventV1(value) || normalizeUnwrittenMapEventV2(value);
}

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
    return res.status(503).json({ error: "unwritten_map_storage_unavailable" });
  }
  if (!requestOriginMatchesHost(req)) {
    return res.status(403).json({ error: "unwritten_map_origin_rejected" });
  }
  if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    return res.status(415).json({ error: "content_type_must_be_application_json" });
  }
  if (exceedsRateLimit(req)) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "unwritten_map_rate_limited" });
  }
  if (JSON.stringify(req.body || {}).length > 32_000) {
    return res.status(413).json({ error: "unwritten_map_event_too_large" });
  }
  const event = normalizeEvent(req.body);
  if (!event) return res.status(400).json({ error: "invalid_unwritten_map_event" });

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const pathname = unwrittenMapEventPath(event);
  const serialized = JSON.stringify(event);
  try {
    const existing = await readExisting(pathname, token);
    if (existing !== null) {
      if (existing !== serialized) return res.status(409).json({ error: "unwritten_map_event_id_conflict" });
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
    try {
      const racedExisting = await readExisting(pathname, token);
      if (racedExisting === serialized) {
        return res.status(200).json({ status: "accepted", eventId: event.eventId, idempotentReplay: true });
      }
      if (racedExisting !== null) return res.status(409).json({ error: "unwritten_map_event_id_conflict" });
    } catch (readError) {
      console.error("[unwritten-map] event_conflict_check_failed", readError);
    }
    console.error("[unwritten-map] event_write_failed", error);
    return res.status(500).json({ error: "unwritten_map_event_write_failed" });
  }
}
