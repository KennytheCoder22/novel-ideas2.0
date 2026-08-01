import type { VercelRequest, VercelResponse } from "@vercel/node";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRepository } from "../lib/humanReview/index";

type CoreModule = {
  loadRubric: (versionOrPath?: string) => { path: string; rubric: any };
};

let cachedCore: CoreModule | null = null;

async function loadCore(): Promise<CoreModule> {
  if (cachedCore) return cachedCore;
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const corePath = resolve(currentDir, "..", "scripts", "human-review", "lib", "human-review-core.mjs");
  cachedCore = (await import(pathToFileURL(corePath).toString())) as unknown as CoreModule;
  return cachedCore;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  // Fail fast if durable mode is expected but POSTGRES_URL is missing.
  const requestedMode = process.env.HUMAN_REVIEW_STORAGE_MODE;
  if (requestedMode === "durable_postgres" && !process.env.POSTGRES_URL) {
    return res.status(503).json({
      error: "durable_storage_unavailable",
      detail:
        "HUMAN_REVIEW_STORAGE_MODE is set to durable_postgres but POSTGRES_URL is not configured. " +
        "Link a Vercel Postgres store and re-deploy.",
    });
  }

  try {
    const core = await loadCore();
    const payload = req.body;
    if (!isObject(payload)) return res.status(400).json({ error: "invalid_payload" });

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

    return res.status(200).json({
      status: "ok",
      appendedReviewId: reviewResult.appendedReviewId,
      snapshotId: reviewResult.snapshotId,
      profileId: reviewResult.profileId,
      snapshotUnchanged: snapshotResult.status === "unchanged",
      storageMode: repo.storageMode,
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
