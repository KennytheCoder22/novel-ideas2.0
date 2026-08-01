import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { shortHash } from "./human-review/lib/human-review-core.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

function runNode(scriptPath, args = []) {
  const run = spawnSync(process.execPath, [resolve(scriptDir, scriptPath), ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return {
    ok: run.status === 0 && !run.error,
    status: run.status,
    stdout: String(run.stdout || ""),
    stderr: String(run.stderr || ""),
    error: run.error ? String(run.error.message || run.error) : "",
  };
}

function parseJsonFromStdout(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  const start = text.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return null;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildRecord({ reviewId, snapshotId, profileId, reviewerId, title }) {
  return {
    schemaVersion: "human_review_record_v1",
    reviewId,
    snapshotId,
    profileId,
    rubricId: "novelideas-human-review",
    rubricVersion: "v1",
    reviewerId,
    createdAt: "2026-08-01T00:00:00.000Z",
    itemReviews: [
      {
        rank: 1,
        title,
        overallScore: 4,
        decision: "recommend",
        criteriaRatings: {
          taste_alignment: 4,
          novelty: 3,
          confidence: 4,
        },
      },
    ],
    summary: {
      wouldUseSlate: true,
      notes: "deterministic regression fixture",
    },
  };
}

async function main() {
  const tmpRoot = mkdtempSync(resolve(tmpdir(), "novelideas-human-review-"));
  const snapshotsDir = resolve(tmpRoot, "snapshots");
  const recordsPath = resolve(tmpRoot, "records.ndjson");
  const exportPath = resolve(tmpRoot, "records.export.json");
  const importPath = resolve(tmpRoot, "records.import.ndjson");
  const importedPath = resolve(tmpRoot, "records.imported.ndjson");
  const reportJson = resolve(tmpRoot, "report.json");
  const reportTxt = resolve(tmpRoot, "report.txt");
  const reportJsonSecond = resolve(tmpRoot, "report.second.json");
  const reportTxtSecond = resolve(tmpRoot, "report.second.txt");

  const checks = [];

  const capture = runNode("run-v2-human-review-capture-snapshot.mjs", ["--out", snapshotsDir]);
  assert(capture.ok, `capture_failed:${capture.stderr || capture.stdout}`);
  const capturePayload = parseJsonFromStdout(capture.stdout);
  const snapshots = capturePayload?.snapshotsWritten || [];
  assert(snapshots.length >= 2, "capture_insufficient_snapshots");
  checks.push({ name: "capture_snapshots", pass: true, count: snapshots.length });

  const captureAgain = runNode("run-v2-human-review-capture-snapshot.mjs", ["--out", snapshotsDir, "--profile", snapshots[0].profileId]);
  assert(!captureAgain.ok && captureAgain.stderr.includes("immutable_snapshot_exists"), "immutable_snapshot_not_enforced");
  checks.push({ name: "immutable_snapshot", pass: true });

  const reviewAPath = resolve(tmpRoot, "review-a.json");
  const reviewBPath = resolve(tmpRoot, "review-b.json");
  writeFileSync(reviewAPath, JSON.stringify(buildRecord({
    reviewId: "hr-r1",
    snapshotId: snapshots[0].snapshotId,
    profileId: snapshots[0].profileId,
    reviewerId: "reviewer-alpha",
    title: "The Lantern Archive",
  }), null, 2), "utf8");
  writeFileSync(reviewBPath, JSON.stringify(buildRecord({
    reviewId: "hr-r2",
    snapshotId: snapshots[1].snapshotId,
    profileId: snapshots[1].profileId,
    reviewerId: "reviewer-beta",
    title: "Signal in the Stacks",
  }), null, 2), "utf8");

  const appendA = runNode("run-v2-human-review-append-review.mjs", ["--record", reviewAPath, "--out", recordsPath]);
  const appendB = runNode("run-v2-human-review-append-review.mjs", ["--record", reviewBPath, "--out", recordsPath]);
  assert(appendA.ok && appendB.ok, "append_review_failed");
  checks.push({ name: "append_records", pass: true });

  const appendDup = runNode("run-v2-human-review-append-review.mjs", ["--record", reviewAPath, "--out", recordsPath]);
  assert(!appendDup.ok && appendDup.stderr.includes("duplicate_review_id"), "append_only_duplicate_not_blocked");
  checks.push({ name: "append_only_duplicate_guard", pass: true });

  const exported = runNode("run-v2-human-review-export-records.mjs", ["--records", recordsPath, "--out", exportPath]);
  assert(exported.ok, "export_failed");
  const exportedPayload = JSON.parse(readFileSync(exportPath, "utf8"));
  assert(exportedPayload.recordCount === 2, "export_record_count_mismatch");
  checks.push({ name: "export_records", pass: true });

  writeFileSync(importPath, exportedPayload.records.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
  const imported = runNode("run-v2-human-review-import-records.mjs", ["--in", importPath, "--out", importedPath]);
  assert(imported.ok, "import_failed");
  checks.push({ name: "import_records", pass: true });

  const report1 = runNode("run-v2-human-review-generate-report.mjs", [
    "--snapshots", snapshotsDir,
    "--records", recordsPath,
    "--out", reportJson,
    "--txt", reportTxt,
  ]);
  const report2 = runNode("run-v2-human-review-generate-report.mjs", [
    "--snapshots", snapshotsDir,
    "--records", recordsPath,
    "--out", reportJsonSecond,
    "--txt", reportTxtSecond,
  ]);
  assert(report1.ok && report2.ok, "report_generation_failed");
  const first = JSON.parse(readFileSync(reportJson, "utf8"));
  const second = JSON.parse(readFileSync(reportJsonSecond, "utf8"));
  assert(first.summary.records === second.summary.records, "report_record_count_drift");
  assert(first.summary.avgOverallScore === second.summary.avgOverallScore, "report_score_drift");
  checks.push({ name: "deterministic_report_shape", pass: true });

  const signature = shortHash(checks);
  console.log(JSON.stringify({
    name: "human-review-artifact-infrastructure-regressions",
    status: "pass",
    checks,
    runSignature: signature,
    tempWorkspace: tmpRoot,
  }, null, 2));
}

main().catch((error) => {
  console.error(`human_review_regressions_failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
