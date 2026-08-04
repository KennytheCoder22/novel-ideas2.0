import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  AppendReviewResult,
  HumanReviewRepository,
  ListReviewsFilter,
  SaveSnapshotResult,
} from "./HumanReviewRepository";

// @vercel/postgres is loaded lazily so this module can be imported safely in
// environments where the package is installed but POSTGRES_URL is not set.
// The constructor will throw if POSTGRES_URL is absent.
let sqlClient: ((strings: TemplateStringsArray, ...values: any[]) => Promise<{ rows: any[]; rowCount: number }>) | null = null;

async function getSQL() {
  if (sqlClient) return sqlClient;
  // @vercel/postgres reads POSTGRES_URL automatically at import time.
  const mod = await import("@vercel/postgres");
  sqlClient = mod.sql as any;
  return sqlClient!;
}

type CoreModule = {
  loadRubric: (versionOrPath?: string) => { path: string; rubric: any };
  validateReviewRecord: (record: any, rubric: any) => void;
  stableStringify: (value: any) => string;
};

let cachedCore: CoreModule | null = null;

async function loadCore(): Promise<CoreModule> {
  if (cachedCore) return cachedCore;
  const corePath = resolve(process.cwd(), "scripts", "human-review", "lib", "human-review-core.mjs");
  cachedCore = (await import(pathToFileURL(corePath).toString())) as unknown as CoreModule;
  return cachedCore;
}

function sha256hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export class DurableHumanReviewRepository implements HumanReviewRepository {
  readonly storageMode = "durable_postgres";

  constructor() {
    if (!process.env.POSTGRES_URL) {
      throw new Error(
        "HUMAN_REVIEW_DURABLE_UNAVAILABLE: POSTGRES_URL env var is required for " +
          "durable_postgres storage mode. Link a Vercel Postgres store and re-deploy, " +
          "or set HUMAN_REVIEW_STORAGE_MODE=local_filesystem to use local storage."
      );
    }
  }

  async saveSnapshot(snapshot: Record<string, unknown>): Promise<SaveSnapshotResult> {
    const core = await loadCore();
    const sql = await getSQL();

    const snapshotId = String(snapshot.snapshotId || "").trim();
    const profileId = String(snapshot.profileId || "").trim();
    if (!snapshotId || !profileId) throw new Error("missing_snapshot_identity");

    const schemaVersion = String(snapshot.schemaVersion || "");
    const rubricVersion = String(snapshot.rubricVersion || "");
    const stableJson = core.stableStringify(snapshot);
    const contentSha256 = sha256hex(stableJson);
    const payloadJson = JSON.stringify(snapshot);

    // Attempt insert; ON CONFLICT DO NOTHING if snapshot_id already exists.
    const insertResult = await sql`
      INSERT INTO human_review_snapshots
        (snapshot_id, profile_id, schema_version, rubric_version, content_sha256, payload_json)
      VALUES
        (${snapshotId}, ${profileId}, ${schemaVersion}, ${rubricVersion}, ${contentSha256}, ${payloadJson}::jsonb)
      ON CONFLICT (snapshot_id) DO NOTHING
    `;

    if ((insertResult as any).rowCount === 0) {
      // Snapshot already exists — verify content integrity.
      const existing = await sql`
        SELECT content_sha256 FROM human_review_snapshots WHERE snapshot_id = ${snapshotId}
      `;
      const existingHash = existing.rows[0]?.content_sha256;
      if (existingHash !== contentSha256) {
        const err: any = new Error("snapshot_content_conflict");
        err.code = "snapshot_content_conflict";
        err.snapshotId = snapshotId;
        err.profileId = profileId;
        throw err;
      }
      return { status: "unchanged", snapshotId, profileId, storageMode: this.storageMode };
    }

    return { status: "created", snapshotId, profileId, storageMode: this.storageMode };
  }

  async appendReview(
    record: Record<string, unknown>,
    rubric: Record<string, unknown>
  ): Promise<AppendReviewResult> {
    const core = await loadCore();
    const sql = await getSQL();

    const reviewId = String(record.reviewId || "").trim();
    const snapshotId = String(record.snapshotId || "").trim();
    const profileId = String(record.profileId || "").trim();
    const reviewerId = String(record.reviewerId || "").trim();
    const schemaVersion = String(record.schemaVersion || "");
    const rubricId = String(record.rubricId || "");
    const rubricVersion = String(record.rubricVersion || "");

    // Run full validation before any DB write.
    core.validateReviewRecord(record, rubric);

    // Check duplicate reviewId.
    const dupId = await sql`
      SELECT review_id FROM human_review_reviews WHERE review_id = ${reviewId}
    `;
    if (dupId.rows.length > 0) {
      const err: any = new Error("duplicate_review_id");
      err.code = "duplicate_review_id";
      err.reviewId = reviewId;
      throw err;
    }

    // Check duplicate reviewer/snapshot — the unique index will also catch this,
    // but checking explicitly gives a cleaner error code.
    const dupReviewer = await sql`
      SELECT review_id FROM human_review_reviews
      WHERE snapshot_id = ${snapshotId} AND reviewer_id = ${reviewerId}
    `;
    if (dupReviewer.rows.length > 0) {
      const err: any = new Error("duplicate_reviewer_snapshot");
      err.code = "duplicate_reviewer_snapshot";
      err.reviewerId = reviewerId;
      err.snapshotId = snapshotId;
      throw err;
    }

    const payloadJson = JSON.stringify(record);

    await sql`
      INSERT INTO human_review_reviews
        (review_id, snapshot_id, profile_id, reviewer_id, schema_version, rubric_id, rubric_version, payload_json)
      VALUES
        (${reviewId}, ${snapshotId}, ${profileId}, ${reviewerId}, ${schemaVersion}, ${rubricId}, ${rubricVersion}, ${payloadJson}::jsonb)
    `;

    return { appendedReviewId: reviewId, snapshotId, profileId, storageMode: this.storageMode };
  }

  async listReviews(filter?: ListReviewsFilter): Promise<Record<string, unknown>[]> {
    const sql = await getSQL();

    let rows: any[];
    if (filter?.snapshotId && filter?.reviewerId) {
      const result = await sql`
        SELECT payload_json FROM human_review_reviews
        WHERE snapshot_id = ${filter.snapshotId} AND reviewer_id = ${filter.reviewerId}
        ORDER BY created_at ASC
      `;
      rows = result.rows;
    } else if (filter?.snapshotId) {
      const result = await sql`
        SELECT payload_json FROM human_review_reviews
        WHERE snapshot_id = ${filter.snapshotId}
        ORDER BY created_at ASC
      `;
      rows = result.rows;
    } else if (filter?.reviewerId) {
      const result = await sql`
        SELECT payload_json FROM human_review_reviews
        WHERE reviewer_id = ${filter.reviewerId}
        ORDER BY created_at ASC
      `;
      rows = result.rows;
    } else {
      const result = await sql`
        SELECT payload_json FROM human_review_reviews ORDER BY created_at ASC
      `;
      rows = result.rows;
    }

    return rows.map((row) =>
      typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : row.payload_json
    );
  }

  async listSnapshots(): Promise<Record<string, unknown>[]> {
    const sql = await getSQL();
    const result = await sql`
      SELECT payload_json FROM human_review_snapshots ORDER BY created_at ASC
    `;
    return result.rows.map((row) =>
      typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : row.payload_json
    );
  }
}
