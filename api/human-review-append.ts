import type { VercelRequest, VercelResponse } from "@vercel/node";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync, readFileSync } from "node:fs";

type CoreModule = {
  loadRubric: (versionOrPath?: string) => { path: string; rubric: any };
  validateReviewRecord: (record: any, rubric: any) => void;
  listNdjsonRecords: (path: string) => any[];
  dedupeReviewIds: (records: any[]) => void;
  appendNdjsonRecord: (path: string, record: any) => void;
  writeJson: (path: string, value: any) => void;
  stableStringify: (value: any) => string;
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

    const snapshotsDir = resolve(process.cwd(), "scripts", "output", "human-review", "snapshots");
    const snapshotPath = resolve(snapshotsDir, `${profileId}__${snapshotId}.json`);
    let snapshotUnchanged = false;
    if (existsSync(snapshotPath)) {
      const existing = JSON.parse(readFileSync(snapshotPath, "utf8"));
      if (core.stableStringify(existing) !== core.stableStringify(snapshot)) {
        return res.status(409).json({ error: "snapshot_content_conflict", snapshotId, profileId });
      }
      snapshotUnchanged = true;
    } else {
      core.writeJson(snapshotPath, snapshot);
    }

    const { rubric } = core.loadRubric(String(record.rubricVersion || "v1"));
    if (String(record.rubricId || "") !== String(rubric.rubricId || "")) {
      return res.status(400).json({ error: "rubric_id_mismatch" });
    }
    core.validateReviewRecord(record, rubric);

    const recordsPath = resolve(process.cwd(), "scripts", "output", "human-review", "review-records.v1.ndjson");
    const existingRecords = core.listNdjsonRecords(recordsPath);
    core.dedupeReviewIds(existingRecords);
    if (existingRecords.some((row) => String(row.reviewId || "") === String(record.reviewId || ""))) {
      return res.status(409).json({ error: "duplicate_review_id", reviewId: record.reviewId });
    }

    core.appendNdjsonRecord(recordsPath, record);
    return res.status(200).json({
      status: "ok",
      appendedReviewId: record.reviewId,
      snapshotId,
      profileId,
      snapshotUnchanged,
      recordsPath,
      storageMode: "local_filesystem",
      storageModeNote:
        "Records are written to the local filesystem. This is suitable for Admin/local review only. " +
        "Filesystem writes do not persist on Vercel serverless deployments. " +
        "Durable storage (database, object storage, or GitHub commit) is required before remote reviewer use.",
    });
  } catch (error: any) {
    return res.status(500).json({
      error: typeof error?.message === "string" ? error.message : "human_review_append_failed",
    });
  }
}
