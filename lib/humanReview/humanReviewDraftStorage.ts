import { createHash } from "node:crypto";
import {
  createHumanReviewBlobStore,
  type HumanReviewBlobStore,
} from "./BlobHumanReviewRepository";

const DRAFT_PREFIX = "human-review/evidence/v1/drafts/";

export type DurableHumanReviewDraft = {
  schemaVersion: "human_review_durable_draft_v1";
  snapshotId: string;
  profileId: string;
  reviewerId: string;
  snapshot: Record<string, unknown>;
  draft: Record<string, any>;
  updatedAt: string;
};

function safeSegment(value: string): string {
  return value.toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function reviewerSegment(reviewerId: string): string {
  return createHash("sha256").update(reviewerId).digest("hex").slice(0, 24);
}

function draftPath(snapshotId: string, reviewerId: string): string {
  return `${DRAFT_PREFIX}${safeSegment(snapshotId)}/${reviewerSegment(reviewerId)}.json`;
}

let draftTableReady: Promise<void> | null = null;

async function getSql() {
  const { sql } = await import("@vercel/postgres");
  return sql;
}

async function ensureDraftTable(): Promise<void> {
  if (!draftTableReady) {
    draftTableReady = (async () => {
      const sql = await getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS human_review_drafts (
          snapshot_id TEXT NOT NULL,
          reviewer_id TEXT NOT NULL,
          profile_id TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL,
          payload_json JSONB NOT NULL,
          PRIMARY KEY (snapshot_id, reviewer_id)
        )
      `;
    })().catch((error) => {
      draftTableReady = null;
      throw error;
    });
  }
  return draftTableReady;
}

export async function saveHumanReviewDraft(
  value: DurableHumanReviewDraft,
  store?: HumanReviewBlobStore,
): Promise<void> {
  if (!store && process.env.POSTGRES_URL) {
    await ensureDraftTable();
    const sql = await getSql();
    await sql`
      INSERT INTO human_review_drafts
        (snapshot_id, reviewer_id, profile_id, updated_at, payload_json)
      VALUES
        (${value.snapshotId}, ${value.reviewerId}, ${value.profileId}, ${value.updatedAt}, ${JSON.stringify(value)}::jsonb)
      ON CONFLICT (snapshot_id, reviewer_id) DO UPDATE SET
        profile_id = EXCLUDED.profile_id,
        updated_at = EXCLUDED.updated_at,
        payload_json = EXCLUDED.payload_json
      WHERE human_review_drafts.updated_at <= EXCLUDED.updated_at
    `;
    return;
  }
  const blobStore = store || createHumanReviewBlobStore();
  const pathname = draftPath(value.snapshotId, value.reviewerId);
  const existing = await blobStore.readJson(pathname).catch(() => null) as DurableHumanReviewDraft | null;
  if (existing && Date.parse(existing.updatedAt) > Date.parse(value.updatedAt)) return;
  await blobStore.putJson(pathname, value, true);
}

export async function deleteHumanReviewDraft(
  snapshotId: string,
  reviewerId: string,
  store?: HumanReviewBlobStore,
): Promise<void> {
  if (!store && process.env.POSTGRES_URL) {
    await ensureDraftTable();
    const sql = await getSql();
    await sql`DELETE FROM human_review_drafts WHERE snapshot_id = ${snapshotId} AND reviewer_id = ${reviewerId}`;
    return;
  }
  await (store || createHumanReviewBlobStore()).delete(draftPath(snapshotId, reviewerId));
}

export async function listHumanReviewDrafts(
  store?: HumanReviewBlobStore,
): Promise<DurableHumanReviewDraft[]> {
  if (!store && process.env.POSTGRES_URL) {
    await ensureDraftTable();
    const sql = await getSql();
    const result = await sql`SELECT payload_json FROM human_review_drafts ORDER BY updated_at DESC`;
    return result.rows.map((row) => row.payload_json as DurableHumanReviewDraft);
  }
  const blobStore = store || createHumanReviewBlobStore();
  const metadata = await blobStore.list(DRAFT_PREFIX);
  const rows = await Promise.allSettled(metadata.map((blob) => blobStore.readJson(blob.pathname)));
  return rows
    .filter((row): row is PromiseFulfilledResult<unknown> => row.status === "fulfilled")
    .map((row) => row.value)
    .filter((row): row is DurableHumanReviewDraft => (
      Boolean(row)
      && typeof row === "object"
      && !Array.isArray(row)
      && (row as any).schemaVersion === "human_review_durable_draft_v1"
    ))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function summarizeHumanReviewDraft(value: DurableHumanReviewDraft) {
  const itemReviews = Array.isArray(value.draft?.form?.itemReviews) ? value.draft.form.itemReviews : [];
  const completedItems = itemReviews.filter((item: any) => (
    typeof item?.expectedEnjoyment === "number"
    && item.expectedEnjoyment >= 1
    && item.expectedEnjoyment <= 5
  )).length;
  return {
    snapshotId: value.snapshotId,
    ageBand: String(value.snapshot?.ageBand || ""),
    updatedAt: value.updatedAt,
    completedItems,
    totalItems: itemReviews.length,
  };
}
