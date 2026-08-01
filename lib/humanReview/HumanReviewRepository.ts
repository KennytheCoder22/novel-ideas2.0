/**
 * HumanReviewRepository — storage boundary for Human Review evidence.
 *
 * Two implementations:
 *   LocalFilesystemHumanReviewRepository  — local/Admin use; writes to repo filesystem
 *   DurableHumanReviewRepository          — public /testing use; writes to Vercel Postgres
 *
 * All callers obtain an instance via createRepository() from ./index.ts.
 */

export interface SaveSnapshotResult {
  /** "created" if the snapshot was newly written; "unchanged" if it already existed with identical content. */
  status: "created" | "unchanged";
  snapshotId: string;
  profileId: string;
  storageMode: string;
}

export interface AppendReviewResult {
  appendedReviewId: string;
  snapshotId: string;
  profileId: string;
  storageMode: string;
}

export interface ListReviewsFilter {
  snapshotId?: string;
  reviewerId?: string;
}

export interface HumanReviewRepository {
  /**
   * Identifies the storage backend in API responses.
   * "local_filesystem" | "durable_postgres"
   */
  readonly storageMode: string;

  /**
   * Persist a snapshot.  Snapshots are immutable once written.
   * If a snapshot with the same snapshotId already exists and its content
   * differs from the supplied snapshot, throws with code "snapshot_content_conflict".
   */
  saveSnapshot(snapshot: Record<string, unknown>): Promise<SaveSnapshotResult>;

  /**
   * Append a review record.
   * Throws "duplicate_review_id" if the reviewId is already present.
   * Throws "duplicate_reviewer_snapshot" if the same reviewerId has already
   * reviewed the same snapshotId.
   * Runs validateReviewRecord before writing; throws validation errors unchanged.
   */
  appendReview(
    record: Record<string, unknown>,
    rubric: Record<string, unknown>
  ): Promise<AppendReviewResult>;

  /**
   * Return all review records, optionally filtered.
   * Results are in insertion / created_at order.
   */
  listReviews(filter?: ListReviewsFilter): Promise<Record<string, unknown>[]>;

  /**
   * Return all snapshot records in insertion / created_at order.
   */
  listSnapshots(): Promise<Record<string, unknown>[]>;
}
