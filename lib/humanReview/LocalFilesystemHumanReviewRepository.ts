import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  AppendReviewResult,
  HumanReviewRepository,
  ListReviewsFilter,
  SaveSnapshotResult,
} from "./HumanReviewRepository";

type CoreModule = {
  loadRubric: (versionOrPath?: string) => { path: string; rubric: any };
  validateReviewRecord: (record: any, rubric: any) => void;
  listNdjsonRecords: (path: string) => any[];
  dedupeReviewIds: (records: any[]) => void;
  appendNdjsonRecord: (path: string, record: any) => void;
  writeJson: (path: string, value: any) => void;
  stableStringify: (value: any) => string;
  defaultPaths: () => { snapshotsDir: string; recordsPath: string; exportsDir: string; reportsDir: string };
};

let cachedCore: CoreModule | null = null;

async function loadCore(): Promise<CoreModule> {
  if (cachedCore) return cachedCore;
  const corePath = resolve(process.cwd(), "scripts", "human-review", "lib", "human-review-core.mjs");
  cachedCore = (await import(pathToFileURL(corePath).toString())) as unknown as CoreModule;
  return cachedCore;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export class LocalFilesystemHumanReviewRepository implements HumanReviewRepository {
  readonly storageMode = "local_filesystem";

  async saveSnapshot(snapshot: Record<string, unknown>): Promise<SaveSnapshotResult> {
    const core = await loadCore();
    const { snapshotsDir } = core.defaultPaths();

    const snapshotId = String(snapshot.snapshotId || "").trim();
    const profileId = String(snapshot.profileId || "").trim();
    if (!snapshotId || !profileId) throw new Error("missing_snapshot_identity");

    const snapshotPath = resolve(snapshotsDir, `${profileId}__${snapshotId}.json`);

    if (existsSync(snapshotPath)) {
      const existing = JSON.parse(readFileSync(snapshotPath, "utf8"));
      if (core.stableStringify(existing) !== core.stableStringify(snapshot)) {
        const err: any = new Error("snapshot_content_conflict");
        err.code = "snapshot_content_conflict";
        err.snapshotId = snapshotId;
        err.profileId = profileId;
        throw err;
      }
      return { status: "unchanged", snapshotId, profileId, storageMode: this.storageMode };
    }

    core.writeJson(snapshotPath, snapshot);
    return { status: "created", snapshotId, profileId, storageMode: this.storageMode };
  }

  async appendReview(
    record: Record<string, unknown>,
    rubric: Record<string, unknown>
  ): Promise<AppendReviewResult> {
    const core = await loadCore();
    const { recordsPath } = core.defaultPaths();

    const snapshotId = String(record.snapshotId || "").trim();
    const profileId = String(record.profileId || "").trim();
    const reviewId = String(record.reviewId || "").trim();
    const reviewerId = String(record.reviewerId || "").trim();

    core.validateReviewRecord(record, rubric);

    const existingRecords = core.listNdjsonRecords(recordsPath);
    core.dedupeReviewIds(existingRecords);

    if (existingRecords.some((row) => String(row.reviewId || "") === reviewId)) {
      const err: any = new Error("duplicate_review_id");
      err.code = "duplicate_review_id";
      err.reviewId = reviewId;
      throw err;
    }

    if (
      reviewerId &&
      existingRecords.some(
        (row) =>
          String(row.snapshotId || "") === snapshotId &&
          String(row.reviewerId || "") === reviewerId
      )
    ) {
      const err: any = new Error("duplicate_reviewer_snapshot");
      err.code = "duplicate_reviewer_snapshot";
      err.reviewerId = reviewerId;
      err.snapshotId = snapshotId;
      throw err;
    }

    core.appendNdjsonRecord(recordsPath, record);
    return { appendedReviewId: reviewId, snapshotId, profileId, storageMode: this.storageMode };
  }

  async listReviews(filter?: ListReviewsFilter): Promise<Record<string, unknown>[]> {
    const core = await loadCore();
    const { recordsPath } = core.defaultPaths();
    let records = core.listNdjsonRecords(recordsPath);
    if (filter?.snapshotId) {
      records = records.filter((r) => String(r.snapshotId || "") === filter.snapshotId);
    }
    if (filter?.reviewerId) {
      records = records.filter((r) => String(r.reviewerId || "") === filter.reviewerId);
    }
    return records;
  }

  async listSnapshots(): Promise<Record<string, unknown>[]> {
    const core = await loadCore();
    const { snapshotsDir } = core.defaultPaths();
    if (!existsSync(snapshotsDir)) return [];
    return readdirSync(snapshotsDir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => JSON.parse(readFileSync(resolve(snapshotsDir, f), "utf8")));
  }
}
