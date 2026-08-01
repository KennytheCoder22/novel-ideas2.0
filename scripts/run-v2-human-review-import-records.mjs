import { resolve } from "node:path";
import {
  appendNdjsonRecord,
  defaultPaths,
  dedupeReviewIds,
  listNdjsonRecords,
  loadRubric,
  parseArgs,
  readImportRecords,
  shortHash,
  validateReviewRecord,
} from "./human-review/lib/human-review-core.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inPath = args.in ? resolve(args.in) : null;
  if (!inPath) throw new Error("missing_required_arg:--in");
  const outPath = args.out ? resolve(args.out) : defaultPaths().recordsPath;

  const incoming = readImportRecords(inPath);
  const existing = listNdjsonRecords(outPath);
  dedupeReviewIds(existing);
  const existingIds = new Set(existing.map((record) => record.reviewId));
  const seenIncoming = new Set();

  for (const record of incoming) {
    if (seenIncoming.has(record.reviewId)) throw new Error(`duplicate_in_import:${record.reviewId}`);
    if (existingIds.has(record.reviewId)) throw new Error(`duplicate_against_existing:${record.reviewId}`);
    seenIncoming.add(record.reviewId);
    const { rubric } = loadRubric(record.rubricVersion || "v1");
    validateReviewRecord(record, rubric);
    if (record.rubricId !== rubric.rubricId) throw new Error(`rubric_id_mismatch:${record.reviewId}`);
  }

  for (const record of incoming) appendNdjsonRecord(outPath, record);
  const signature = shortHash(incoming.map((record) => record.reviewId));

  console.log(JSON.stringify({
    status: "ok",
    imported: incoming.length,
    recordsPath: outPath,
    importSignature: signature,
  }, null, 2));
}

main().catch((error) => {
  console.error(`human_review_import_failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
