import type { VercelRequest, VercelResponse } from "@vercel/node";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRepository } from "../lib/humanReview/index";
import { humanReviewBlobStorageConfigured } from "../lib/humanReview/BlobHumanReviewRepository";
import {
  deleteHumanReviewDraft,
  saveHumanReviewDraft,
} from "../lib/humanReview/humanReviewDraftStorage";

type CoreModule = {
  loadRubric: (versionOrPath?: string) => { path: string; rubric: any };
};

let cachedCore: CoreModule | null = null;

async function loadCore(): Promise<CoreModule> {
  if (cachedCore) return cachedCore;
  const corePath = resolve(process.cwd(), "scripts", "human-review", "lib", "human-review-core.mjs");
  cachedCore = (await import(pathToFileURL(corePath).toString())) as unknown as CoreModule;
  return cachedCore;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    try {
      const repo = createRepository();
      const durable = repo.storageMode === "durable_postgres" || repo.storageMode === "durable_blob";
      return res.status(durable ? 200 : 503).json({
        status: durable ? "ready" : "unavailable",
        storageMode: repo.storageMode,
      });
    } catch (error: any) {
      return res.status(503).json({
        status: "unavailable",
        error: typeof error?.message === "string" ? error.message : "human_review_storage_unavailable",
      });
    }
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const requestedMode = process.env.HUMAN_REVIEW_STORAGE_MODE;
  if (requestedMode === "durable_postgres" && !process.env.POSTGRES_URL) {
    return res.status(503).json({
      error: "durable_storage_unavailable",
      detail:
        "HUMAN_REVIEW_STORAGE_MODE is set to durable_postgres but POSTGRES_URL is not configured. " +
        "Link a Vercel Postgres store and re-deploy.",
    });
  }
  if (requestedMode === "durable_blob" && !humanReviewBlobStorageConfigured()) {
    return res.status(503).json({
      error: "durable_storage_unavailable",
      detail: "HUMAN_REVIEW_STORAGE_MODE is set to durable_blob but BLOB_READ_WRITE_TOKEN is not configured.",
    });
  }

  try {
    const payload = req.body;
    if (!isObject(payload)) return res.status(400).json({ error: "invalid_payload" });

    if (payload.action === "save_draft") {
      const snapshot = payload.snapshot;
      const draft = payload.draft;
      if (!isObject(snapshot) || !isObject(draft)) {
        return res.status(400).json({ error: "invalid_draft_payload" });
      }
      if (JSON.stringify(payload).length > 128_000) {
        return res.status(413).json({ error: "draft_payload_too_large" });
      }
      const snapshotId = String(snapshot.snapshotId || "").trim();
      const profileId = String(snapshot.profileId || "").trim();
      const reviewerId = String(payload.draftOwnerId || "").trim();
      const updatedAt = String(draft.updatedAt || "").trim();
      const itemReviews = draft?.form?.itemReviews;
      const recommendationItems = snapshot.recommendationItems;
      if (
        snapshot.schemaVersion !== "human_review_snapshot_v1"
        || draft.schemaVersion !== "human_review_draft_v1"
        || draft.snapshotId !== snapshotId
        || !snapshotId
        || snapshotId.length > 160
        || !profileId
        || profileId.length > 160
        || !reviewerId
        || reviewerId.length > 160
        || !Number.isFinite(Date.parse(updatedAt))
      ) {
        return res.status(400).json({ error: "missing_draft_identity" });
      }
      if (
        !Array.isArray(itemReviews)
        || !Array.isArray(recommendationItems)
        || itemReviews.length !== recommendationItems.length
        || itemReviews.length > 20
        || itemReviews.some((item: any, index: number) => (
          !isObject(item)
          || item.rank !== recommendationItems[index]?.rank
          || String(item.title || "") !== String(recommendationItems[index]?.title || "")
        ))
      ) {
        return res.status(400).json({ error: "invalid_draft_items" });
      }
      await saveHumanReviewDraft({
        schemaVersion: "human_review_durable_draft_v1",
        snapshotId,
        profileId,
        reviewerId,
        snapshot,
        draft,
        updatedAt,
      });
      return res.status(200).json({ status: "saved", storageMode: createRepository().storageMode, updatedAt });
    }

    const core = await loadCore();

    const snapshot = payload.snapshot;
    const record = payload.record;
    if (!isObject(snapshot) || !isObject(record)) return res.status(400).json({ error: "missing_snapshot_or_record" });

    const snapshotId = String(snapshot.snapshotId || "").trim();
    const profileId = String(snapshot.profileId || "").trim();
    if (!snapshotId || !profileId) return res.status(400).json({ error: "missing_snapshot_identity" });
    if (String(record.snapshotId || "") !== snapshotId || String(record.profileId || "") !== profileId) {
      return res.status(400).json({ error: "snapshot_record_identity_mismatch" });
    }

    // Load rubric for validation (rubric loading is always local — rubric files are part of the repo).
    const { rubric } = core.loadRubric(String(record.rubricVersion || "v1"));
    if (String(record.rubricId || "") !== String(rubric.rubricId || "")) {
      return res.status(400).json({ error: "rubric_id_mismatch" });
    }

    const repo = createRepository();

    const snapshotResult = await repo.saveSnapshot(snapshot);
    const reviewResult = await repo.appendReview(record, rubric);
    const draftOwnerId = String(payload.draftOwnerId || record.reviewerId || "").trim();
    let draftCleanupPending = false;
    if (repo.storageMode === "durable_blob" || repo.storageMode === "durable_postgres") {
      await deleteHumanReviewDraft(snapshotId, draftOwnerId).catch(() => {
        draftCleanupPending = true;
      });
    }

    return res.status(200).json({
      status: "ok",
      appendedReviewId: reviewResult.appendedReviewId,
      snapshotId: reviewResult.snapshotId,
      profileId: reviewResult.profileId,
      snapshotUnchanged: snapshotResult.status === "unchanged",
      storageMode: repo.storageMode,
      draftCleanupPending,
    });
  } catch (error: any) {
    const code = error?.code || error?.message;

    if (code === "snapshot_content_conflict") {
      return res.status(409).json({
        error: "snapshot_content_conflict",
        snapshotId: error.snapshotId,
        profileId: error.profileId,
      });
    }
    if (code === "duplicate_review_id") {
      return res.status(409).json({ error: "duplicate_review_id", reviewId: error.reviewId });
    }
    if (code === "duplicate_reviewer_snapshot") {
      return res.status(409).json({
        error: "duplicate_reviewer_snapshot",
        reviewerId: error.reviewerId,
        snapshotId: error.snapshotId,
      });
    }

    return res.status(500).json({
      error: typeof error?.message === "string" ? error.message : "human_review_append_failed",
    });
  }
}
