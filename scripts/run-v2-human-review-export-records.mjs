import { dirname, resolve } from "node:path";
import {
  defaultPaths,
  ensureDir,
  listNdjsonRecords,
  nowIso,
  parseArgs,
  shortHash,
  writeJson,
} from "./human-review/lib/human-review-core.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const recordsPath = args.records ? resolve(args.records) : defaultPaths().recordsPath;
  const outPath = args.out
    ? resolve(args.out)
    : resolve(defaultPaths().exportsDir, `human-review-record-export.v1.${nowIso().replace(/[:.]/g, "-")}.json`);

  const records = listNdjsonRecords(recordsPath);
  const payload = {
    schemaVersion: "human_review_record_export_v1",
    exportedAt: nowIso(),
    sourceRecordsPath: recordsPath,
    recordCount: records.length,
    contentSignature: shortHash(records, 32),
    records,
  };
  ensureDir(dirname(outPath));
  writeJson(outPath, payload);
  console.log(JSON.stringify({
    status: "ok",
    outPath,
    recordCount: records.length,
    contentSignature: payload.contentSignature,
  }, null, 2));
}

main().catch((error) => {
  console.error(`human_review_export_failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
