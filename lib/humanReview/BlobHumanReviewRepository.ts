import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  AppendReviewResult,
  HumanReviewRepository,
  ListReviewsFilter,
  SaveSnapshotResult,
} from "./HumanReviewRepository";

type CoreModule = {
  validateReviewRecord: (record: any, rubric: any) => void;
  stableStringify: (value: any) => string;
};

type BlobMetadata = {
  pathname: string;
  uploadedAt: string;
};

export interface HumanReviewBlobStore {
  putJson(pathname: string, value: unknown, allowOverwrite: boolean): Promise<void>;
  list(prefix: string): Promise<BlobMetadata[]>;
  readJson(pathname: string): Promise<unknown | null>;
  delete(pathname: string): Promise<void>;
}

const SNAPSHOT_PREFIX = "human-review/evidence/v1/snapshots/";
const REVIEW_PREFIX = "human-review/evidence/v1/reviews/";
const REVIEWER_SNAPSHOT_PREFIX = "human-review/evidence/v1/reviewer-snapshots/";

let cachedCore: CoreModule | null = null;

async function loadCore(): Promise<CoreModule> {
  if (cachedCore) return cachedCore;
  const corePath = resolve(process.cwd(), "scripts", "human-review", "lib", "human-review-core.mjs");
  cachedCore = (await import(pathToFileURL(corePath).toString())) as unknown as CoreModule;
  return cachedCore;
}

export function humanReviewBlobStorageConfigured(): boolean {
  const raw = String(process.env.BLOB_READ_WRITE_TOKEN || "").replace(/\r?\n/g, "").trim();
  if (!raw) return false;
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return Boolean(raw.slice(1, -1).trim());
  }
  return true;
}

function readBlobToken(): string {
  if (!humanReviewBlobStorageConfigured()) return "";
  const raw = String(process.env.BLOB_READ_WRITE_TOKEN || "").replace(/\r?\n/g, "").trim();
  return ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))
    ? raw.slice(1, -1).trim()
    : raw;
}

async function readBlobText(result: unknown): Promise<string | null> {
  if (!result || typeof result !== "object") return null;
  const body = (result as any).stream ?? (result as any).body;
  if (!body) return null;
  return new Response(body as BodyInit).text();
}

export function createHumanReviewBlobStore(): HumanReviewBlobStore {
  const token = readBlobToken();
  if (!token) throw new Error("HUMAN_REVIEW_BLOB_UNAVAILABLE");
  return {
    async putJson(pathname, value, allowOverwrite) {
      const { put } = await import("@vercel/blob");
      await put(pathname, JSON.stringify(value), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite,
        contentType: "application/json",
        token,
      });
    },
    async list(prefix) {
      const { list } = await import("@vercel/blob");
      const blobs: BlobMetadata[] = [];
      let cursor: string | undefined;
      do {
        const page = await list({ prefix, limit: 1000, cursor, token });
        blobs.push(...page.blobs.map((blob) => ({
          pathname: blob.pathname,
          uploadedAt: new Date(blob.uploadedAt).toISOString(),
        })));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return blobs;
    },
    async readJson(pathname) {
      const { get } = await import("@vercel/blob");
      const result = await get(pathname, { access: "private", token });
      if (!result) return null;
      const text = await readBlobText(result);
      return text == null ? null : JSON.parse(text);
    },
    async delete(pathname) {
      const { del } = await import("@vercel/blob");
      await del(pathname, { token });
    },
  };
}

function safeSegment(value: string): string {
  return value.toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function privateSegment(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function snapshotPath(snapshotId: string): string {
  return `${SNAPSHOT_PREFIX}${safeSegment(snapshotId)}.json`;
}

function reviewPath(reviewId: string): string {
  return `${REVIEW_PREFIX}${safeSegment(reviewId)}.json`;
}

function reviewerSnapshotPath(snapshotId: string, reviewerId: string): string {
  return `${REVIEWER_SNAPSHOT_PREFIX}${safeSegment(snapshotId)}/${privateSegment(reviewerId)}.json`;
}

function storageError(code: string, details: Record<string, string> = {}): Error {
  const error: any = new Error(code);
  error.code = code;
  Object.assign(error, details);
  return error;
}

async function listJsonRecords(store: HumanReviewBlobStore, prefix: string): Promise<Record<string, unknown>[]> {
  const metadata = await store.list(prefix);
  const records: Record<string, unknown>[] = [];
  for (let offset = 0; offset < metadata.length; offset += 50) {
    const batch = await Promise.allSettled(metadata.slice(offset, offset + 50).map((blob) => store.readJson(blob.pathname)));
    for (const result of batch) {
      if (result.status === "fulfilled" && result.value && typeof result.value === "object" && !Array.isArray(result.value)) {
        records.push(result.value as Record<string, unknown>);
      }
    }
  }
  return records;
}

export class BlobHumanReviewRepository implements HumanReviewRepository {
  readonly storageMode = "durable_blob";

  constructor(
    private readonly store: HumanReviewBlobStore = createHumanReviewBlobStore(),
    private readonly coreModule?: CoreModule,
  ) {}

  private getCore(): Promise<CoreModule> {
    return this.coreModule ? Promise.resolve(this.coreModule) : loadCore();
  }

  async saveSnapshot(snapshot: Record<string, unknown>): Promise<SaveSnapshotResult> {
    const core = await this.getCore();
    const snapshotId = String(snapshot.snapshotId || "").trim();
    const profileId = String(snapshot.profileId || "").trim();
    if (!snapshotId || !profileId) throw new Error("missing_snapshot_identity");
    const pathname = snapshotPath(snapshotId);
    const existing = await this.store.readJson(pathname);
    if (existing) {
      if (core.stableStringify(existing) !== core.stableStringify(snapshot)) {
        throw storageError("snapshot_content_conflict", { snapshotId, profileId });
      }
      return { status: "unchanged", snapshotId, profileId, storageMode: this.storageMode };
    }
    try {
      await this.store.putJson(pathname, snapshot, false);
      return { status: "created", snapshotId, profileId, storageMode: this.storageMode };
    } catch (writeError) {
      const concurrent = await this.store.readJson(pathname).catch(() => null);
      if (!concurrent) throw writeError;
      if (core.stableStringify(concurrent) !== core.stableStringify(snapshot)) {
        throw storageError("snapshot_content_conflict", { snapshotId, profileId });
      }
      return { status: "unchanged", snapshotId, profileId, storageMode: this.storageMode };
    }
  }

  async appendReview(
    record: Record<string, unknown>,
    rubric: Record<string, unknown>,
  ): Promise<AppendReviewResult> {
    const core = await this.getCore();
    core.validateReviewRecord(record, rubric);
    const reviewId = String(record.reviewId || "").trim();
    const snapshotId = String(record.snapshotId || "").trim();
    const profileId = String(record.profileId || "").trim();
    const reviewerId = String(record.reviewerId || "").trim();
    const recordPath = reviewPath(reviewId);
    const claimPath = reviewerSnapshotPath(snapshotId, reviewerId);

    if (await this.store.readJson(recordPath)) {
      throw storageError("duplicate_review_id", { reviewId });
    }

    let claimCreated = false;
    try {
      await this.store.putJson(claimPath, { reviewId, snapshotId }, false);
      claimCreated = true;
    } catch (claimError) {
      const claim = await this.store.readJson(claimPath).catch(() => null) as Record<string, unknown> | null;
      if (!claim) throw claimError;
      if (String(claim.reviewId || "") !== reviewId) {
        throw storageError("duplicate_reviewer_snapshot", { reviewerId, snapshotId });
      }
    }

    try {
      await this.store.putJson(recordPath, record, false);
    } catch (writeError) {
      const existing = await this.store.readJson(recordPath).catch(() => null);
      if (existing) {
        if (claimCreated) await this.store.delete(claimPath).catch(() => undefined);
        throw storageError("duplicate_review_id", { reviewId });
      }
      if (claimCreated) await this.store.delete(claimPath).catch(() => undefined);
      throw writeError;
    }

    return { appendedReviewId: reviewId, snapshotId, profileId, storageMode: this.storageMode };
  }

  async listReviews(filter?: ListReviewsFilter): Promise<Record<string, unknown>[]> {
    let records = await listJsonRecords(this.store, REVIEW_PREFIX);
    if (filter?.snapshotId) records = records.filter((record) => String(record.snapshotId || "") === filter.snapshotId);
    if (filter?.reviewerId) records = records.filter((record) => String(record.reviewerId || "") === filter.reviewerId);
    return records.sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")));
  }

  async listSnapshots(): Promise<Record<string, unknown>[]> {
    const snapshots = await listJsonRecords(this.store, SNAPSHOT_PREFIX);
    return snapshots.sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")));
  }
}
