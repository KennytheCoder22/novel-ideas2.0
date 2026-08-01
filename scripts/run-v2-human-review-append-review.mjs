import { resolve } from "node:path";
import {
  appendNdjsonRecord,
  defaultPaths,
  dedupeReviewIds,
  listNdjsonRecords,
  loadRubric,
  parseArgs,
  readJson,
  shortHash,
  validateReviewRecord,
} from "./human-review/lib/human-review-core.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const recordPath = args.record ? resolve(args.record) : null;
  if (!recordPath) throw new Error("missing_required_arg:--record");
  const recordsPath = args.out ? resolve(args.out) : defaultPaths().recordsPath;
  const record = readJson(recordPath);
  const rubricRef = args["rubric-version"] || record.rubricVersion || "v1";
  const { rubric } = loadRubric(rubricRef);

  validateReviewRecord(record, rubric);
  if (record.rubricId !== rubric.rubricId) throw new Error("rubric_id_mismatch");
  if (record.rubricVersion !== rubric.version) throw new Error("rubric_version_mismatch");

  const existing = listNdjsonRecords(recordsPath);
  dedupeReviewIds(existing);
  if (existing.some((row) => row.reviewId === record.reviewId)) throw new Error(`duplicate_review_id:${record.reviewId}`);

  appendNdjsonRecord(recordsPath, record);
  const signature = shortHash({ reviewId: record.reviewId, snapshotId: record.snapshotId, reviewerId: record.reviewerId });

  console.log(JSON.stringify({
    status: "ok",
    appendOnly: true,
    recordsPath,
    appendedReviewId: record.reviewId,
    totalRecords: existing.length + 1,
    appendSignature: signature,
  }, null, 2));
}

main().catch((error) => {
  console.error(`human_review_append_failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
