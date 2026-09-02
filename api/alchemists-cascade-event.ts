import type { VercelRequest, VercelResponse } from "@vercel/node";
import { get, put } from "@vercel/blob";
import {
  normalizeCascadeEvent,
  normalizeLibraryScope,
  sha256Digest,
  type CascadeEvidenceEvent,
} from "../lib/recommendationGames/alchemistsCascade";
import {
  enforceSharedCascadeQuota,
  postgresCascadeQuotaStore,
} from "../lib/recommendationGames/alchemistsCascadeQuota";

const RATE_WINDOW_MS = 60_000;
export const CASCADE_SOURCE_RATE_LIMIT = 2_400;
export const CASCADE_MAX_RATE_BUCKETS = 5_000;
type RateBucket = { count: number; resetAt: number };
const sourceBuckets = new Map<string, RateBucket>();
let bucketInsertions = 0;

export function alchemistsCascadeEventPath(event: CascadeEvidenceEvent): string {
  const library = normalizeLibraryScope(event.libraryScopeId);
  const player = event.anonymousPlayerId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100);
  const id = event.eventId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100);
  return `recommendation-games/the-alchemists-cascade/v1/${library}/${player}/${id}.json`;
}

async function readExisting(pathname: string, token: string): Promise<string | null> {
  const existing = await get(pathname, { access: "private", token, useCache: false });
  if (!existing || existing.statusCode !== 200 || !existing.stream) return null;
  return new Response(existing.stream).text();
}

function sameOrigin(req: VercelRequest): boolean {
  const origin = String(req.headers.origin || "");
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
  if (!origin || !host) return false;
  try { return new URL(origin).host.toLowerCase() === host.toLowerCase(); } catch { return false; }
}

function pruneAndBound(buckets: Map<string, RateBucket>, now: number): void {
  bucketInsertions += 1;
  if (bucketInsertions % 256 === 0) {
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  }
  while (buckets.size >= CASCADE_MAX_RATE_BUCKETS) {
    const oldest = buckets.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
}

function exceedsBucket(
  buckets: Map<string, RateBucket>,
  key: string,
  limit: number,
  now: number,
): boolean {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    pruneAndBound(buckets, now);
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

function requestSourceKey(req: VercelRequest): string {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const source = forwarded || String(req.socket.remoteAddress || "unknown");
  return sha256Digest(source.slice(0, 256));
}

export function sourceRateLimited(req: VercelRequest): boolean {
  const now = Date.now();
  return exceedsBucket(
    sourceBuckets,
    requestSourceKey(req),
    CASCADE_SOURCE_RATE_LIMIT,
    now,
  );
}

export function resetCascadeRateLimitsForTests(): void {
  sourceBuckets.clear();
  bucketInsertions = 0;
}

export function cascadeRateBucketCountsForTests(): { source: number } {
  return { source: sourceBuckets.size };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!sameOrigin(req)) return res.status(403).json({ error: "cascade_origin_rejected" });
  if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    return res.status(415).json({ error: "content_type_must_be_application_json" });
  }
  if (sourceRateLimited(req)) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "cascade_rate_limited" });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ error: "cascade_storage_unavailable" });
  let serializedBody: string;
  try {
    serializedBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
  } catch {
    return res.status(400).json({ error: "invalid_cascade_event" });
  }
  if (serializedBody.length > 48_000) return res.status(413).json({ error: "cascade_event_too_large" });
  const event = normalizeCascadeEvent(req.body);
  if (!event) return res.status(400).json({ error: "invalid_cascade_event" });
  let quota;
  try {
    quota = await enforceSharedCascadeQuota(postgresCascadeQuotaStore, event);
  } catch (error) {
    console.error("[alchemists-cascade] quota_storage_unavailable", error);
    return res.status(503).json({ error: "cascade_quota_storage_unavailable" });
  }
  if (!quota.allowed) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "cascade_rate_limited" });
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const pathname = alchemistsCascadeEventPath(event);
  const serialized = JSON.stringify(event);
  try {
    const existing = await readExisting(pathname, token);
    if (existing !== null) {
      if (existing !== serialized) return res.status(409).json({ error: "cascade_event_id_conflict" });
      return res.status(200).json({
        status: "accepted", eventId: event.eventId, storageMode: "durable_blob", idempotentReplay: true,
      });
    }
    await put(pathname, serialized, {
      access: "private", addRandomSuffix: false, allowOverwrite: false,
      contentType: "application/json", token,
    });
    return res.status(201).json({ status: "accepted", eventId: event.eventId, storageMode: "durable_blob" });
  } catch (error) {
    try {
      const raced = await readExisting(pathname, token);
      if (raced === serialized) {
        return res.status(200).json({
          status: "accepted", eventId: event.eventId, storageMode: "durable_blob", idempotentReplay: true,
        });
      }
      if (raced !== null) return res.status(409).json({ error: "cascade_event_id_conflict" });
    } catch (readError) {
      console.error("[alchemists-cascade] conflict_check_failed", readError);
    }
    console.error("[alchemists-cascade] event_write_failed", error);
    return res.status(500).json({ error: "cascade_event_write_failed" });
  }
}
