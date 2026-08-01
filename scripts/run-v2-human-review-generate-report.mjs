import { readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  defaultPaths,
  ensureDir,
  listNdjsonRecords,
  nowIso,
  parseArgs,
  readJson,
  shortHash,
  summarizeReviews,
  writeJson,
} from "./human-review/lib/human-review-core.mjs";

function loadSnapshots(dir) {
  try {
    const files = readdirSync(dir)
      .filter((file) => file.toLowerCase().endsWith(".json"))
      .sort();
    return files.map((file) => {
      const path = resolve(dir, file);
      const value = readJson(path);
      return {
        snapshotId: value.snapshotId,
        profileId: value.profileId,
        profileVersion: value.profileVersion,
        path,
        titleCount: Array.isArray(value.recommendationItems) ? value.recommendationItems.length : 0,
      };
    });
  } catch {
    return [];
  }
}

function reportText(report) {
  const lines = [];
  lines.push("=== HUMAN REVIEW REPORT (v1) ===");
  lines.push(`GeneratedAt: ${report.generatedAt}`);
  lines.push(`SnapshotCount: ${report.snapshotCount}`);
  lines.push(`RecordCount: ${report.summary.records}`);
  lines.push(`ItemReviews: ${report.summary.itemReviews}`);
  lines.push(`AverageOverallScore: ${report.summary.avgOverallScore}`);
  lines.push(`RecommendRate: ${report.summary.recommendRate}`);
  lines.push(`ProfilesWithoutReviews: ${report.profilesWithoutReviews.length}`);
  for (const row of report.summary.profiles) {
    lines.push(`  - ${row.profileId}: reviews=${row.reviewCount}, itemReviews=${row.itemReviews}, avg=${row.avgOverallScore}, recommendRate=${row.recommendRate}`);
  }
  return lines.join("\n") + "\n";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const snapshotsDir = args.snapshots ? resolve(args.snapshots) : defaultPaths().snapshotsDir;
  const recordsPath = args.records ? resolve(args.records) : defaultPaths().recordsPath;
  const outJson = args.out
    ? resolve(args.out)
    : resolve(defaultPaths().reportsDir, "human-review-report.v1.json");
  const outTxt = args.txt
    ? resolve(args.txt)
    : resolve(defaultPaths().reportsDir, "human-review-report.v1.txt");

  const snapshots = loadSnapshots(snapshotsDir);
  const records = listNdjsonRecords(recordsPath);
  const summary = summarizeReviews(records);
  const reviewedProfiles = new Set(records.map((record) => String(record.profileId)));
  const profilesWithoutReviews = [...new Set(snapshots.map((item) => item.profileId))]
    .filter((profileId) => !reviewedProfiles.has(profileId))
    .sort();

  const report = {
    schemaVersion: "human_review_report_v1",
    generatedAt: nowIso(),
    snapshotsDir,
    recordsPath,
    snapshotCount: snapshots.length,
    snapshots,
    summary,
    profilesWithoutReviews,
  };
  report.deterministicContentSignature = shortHash({
    snapshotCount: report.snapshotCount,
    snapshots: report.snapshots,
    summary: report.summary,
    profilesWithoutReviews: report.profilesWithoutReviews,
  }, 32);
  report.reportSignature = shortHash(report, 32);

  ensureDir(dirname(outJson));
  writeJson(outJson, report);
  ensureDir(dirname(outTxt));
  const text = reportText(report);
  writeFileSync(outTxt, text, "utf8");

  console.log(JSON.stringify({
    status: "ok",
    outJson,
    outTxt,
    reportSignature: report.reportSignature,
    records: summary.records,
  }, null, 2));
}

main().catch((error) => {
  console.error(`human_review_report_failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
