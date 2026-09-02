import { sql } from "@vercel/postgres";
import {
  normalizeLibraryScope,
  type CascadeEvidenceEvent,
} from "./alchemistsCascade";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const CASCADE_IDENTITY_MINUTE_LIMIT = 240;
export const CASCADE_GLOBAL_MINUTE_LIMIT = 12_000;
export const CASCADE_GLOBAL_HOUR_LIMIT = 250_000;

export type CascadeQuotaBucket = {
  key: string;
  windowStartMs: number;
  expiresAtMs: number;
  limit: number;
};

export type CascadeQuotaCount = {
  key: string;
  windowStartMs: number;
  count: number;
};

export type CascadeQuotaStore = {
  increment(buckets: readonly CascadeQuotaBucket[], nowMs: number): Promise<readonly CascadeQuotaCount[]>;
};

const CREATE_QUOTA_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS alchemists_cascade_quota (
    bucket_key VARCHAR(180) NOT NULL,
    window_start_ms BIGINT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    request_count INTEGER NOT NULL,
    PRIMARY KEY (bucket_key, window_start_ms)
  )
`;

const INCREMENT_QUOTA_SQL = `
  WITH requested(bucket_key, window_start_ms, expires_at, quota_limit) AS (
    VALUES
      ($1::text, $2::bigint, to_timestamp($3::double precision / 1000.0), $4::integer),
      ($5::text, $6::bigint, to_timestamp($7::double precision / 1000.0), $8::integer),
      ($9::text, $10::bigint, to_timestamp($11::double precision / 1000.0), $12::integer)
  ),
  upserted AS (
    INSERT INTO alchemists_cascade_quota (
      bucket_key, window_start_ms, expires_at, request_count
    )
    SELECT bucket_key, window_start_ms, expires_at, 1
    FROM requested
    ON CONFLICT (bucket_key, window_start_ms) DO UPDATE
      SET request_count = alchemists_cascade_quota.request_count + 1,
          expires_at = GREATEST(alchemists_cascade_quota.expires_at, EXCLUDED.expires_at)
    RETURNING bucket_key, window_start_ms, request_count
  ),
  cleanup AS (
    DELETE FROM alchemists_cascade_quota
    WHERE ctid IN (
      SELECT ctid
      FROM alchemists_cascade_quota
      WHERE expires_at < to_timestamp($13::double precision / 1000.0)
      ORDER BY expires_at
      LIMIT 100
    )
    RETURNING 1
  )
  SELECT u.bucket_key, u.window_start_ms, u.request_count
  FROM upserted u
  CROSS JOIN (SELECT COUNT(*) FROM cleanup) cleanup_observed
  ORDER BY u.bucket_key
`;

let quotaTableReady: Promise<void> | null = null;

async function ensureQuotaTable(): Promise<void> {
  if (!quotaTableReady) {
    quotaTableReady = sql.query(CREATE_QUOTA_TABLE_SQL)
      .then(() => undefined)
      .catch((error) => {
        quotaTableReady = null;
        throw error;
      });
  }
  return quotaTableReady;
}

export const postgresCascadeQuotaStore: CascadeQuotaStore = {
  async increment(buckets, nowMs) {
    if (buckets.length !== 3) throw new Error("invalid_cascade_quota_bucket_count");
    await ensureQuotaTable();
    const values = buckets.flatMap((bucket) => [
      bucket.key,
      bucket.windowStartMs,
      bucket.expiresAtMs,
      bucket.limit,
    ]);
    const result = await sql.query(INCREMENT_QUOTA_SQL, [...values, nowMs]);
    return result.rows.map((row) => ({
      key: String(row.bucket_key),
      windowStartMs: Number(row.window_start_ms),
      count: Number(row.request_count),
    }));
  },
};

export function buildCascadeQuotaBuckets(
  event: Pick<CascadeEvidenceEvent, "libraryScopeId" | "anonymousPlayerId">,
  nowMs: number,
): CascadeQuotaBucket[] {
  const minuteStart = Math.floor(nowMs / MINUTE_MS) * MINUTE_MS;
  const hourStart = Math.floor(nowMs / HOUR_MS) * HOUR_MS;
  const library = normalizeLibraryScope(event.libraryScopeId);
  const player = event.anonymousPlayerId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100);
  return [
    {
      key: "global:minute",
      windowStartMs: minuteStart,
      expiresAtMs: minuteStart + 2 * MINUTE_MS,
      limit: CASCADE_GLOBAL_MINUTE_LIMIT,
    },
    {
      key: "global:hour",
      windowStartMs: hourStart,
      expiresAtMs: hourStart + 2 * HOUR_MS,
      limit: CASCADE_GLOBAL_HOUR_LIMIT,
    },
    {
      key: `identity:${library}:${player}`,
      windowStartMs: minuteStart,
      expiresAtMs: minuteStart + 2 * MINUTE_MS,
      limit: CASCADE_IDENTITY_MINUTE_LIMIT,
    },
  ];
}

export async function enforceSharedCascadeQuota(
  store: CascadeQuotaStore,
  event: Pick<CascadeEvidenceEvent, "libraryScopeId" | "anonymousPlayerId">,
  nowMs = Date.now(),
): Promise<{ allowed: boolean; exceededBucketKeys: string[] }> {
  const buckets = buildCascadeQuotaBuckets(event, nowMs);
  const counts = await store.increment(buckets, nowMs);
  const byKey = new Map(counts.map((count) => [
    `${count.key}:${count.windowStartMs}`,
    count.count,
  ]));
  const exceededBucketKeys: string[] = [];
  for (const bucket of buckets) {
    const count = byKey.get(`${bucket.key}:${bucket.windowStartMs}`);
    if (!Number.isSafeInteger(count) || (count as number) < 1) {
      throw new Error("invalid_cascade_quota_store_response");
    }
    if ((count as number) > bucket.limit) exceededBucketKeys.push(bucket.key);
  }
  return { allowed: exceededBucketKeys.length === 0, exceededBucketKeys };
}

export function resetCascadeQuotaInitializationForTests(): void {
  quotaTableReady = null;
}
