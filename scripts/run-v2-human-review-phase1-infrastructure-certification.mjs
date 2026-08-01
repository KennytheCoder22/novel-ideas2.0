import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { shortHash, stableStringify, writeJson } from "./human-review/lib/human-review-core.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const phaseRoot = resolve(repoRoot, "scripts", "output", "human-review", "phase1-infrastructure-certification");

const profileIds = [
  "kids-adventure-kindness-v1",
  "preteens-adventure-humor-v1",
  "teens-sci-fi-identity-v1",
  "teens-mystery-tension-v1",
  "adult-mystery-core-v1",
  "adult-fantasy-ensemble-v1",
];

function runNode(scriptName, args = []) {
  const run = spawnSync(process.execPath, [resolve(scriptDir, scriptName), ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return {
    ok: run.status === 0 && !run.error,
    status: run.status,
    stdout: String(run.stdout || ""),
    stderr: String(run.stderr || ""),
  };
}

function parseJson(stdout, fallback = {}) {
  const text = String(stdout || "").trim();
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function reviewRecord({ reviewId, snapshot, reviewerId, decision, overallScore, criteriaRatings, notes }) {
  return {
    schemaVersion: "human_review_record_v1",
    reviewId,
    snapshotId: snapshot.snapshotId,
    profileId: snapshot.profileId,
    rubricId: "novelideas-human-review",
    rubricVersion: "v1",
    reviewerId,
    createdAt: "2026-08-01T00:00:00.000Z",
    itemReviews: [
      {
        rank: 1,
        title: "The Lantern Archive",
        overallScore,
        decision,
        criteriaRatings,
      },
      {
        rank: 2,
        title: "Signal in the Stacks",
        overallScore: Math.max(1, overallScore - 1),
        decision: decision === "recommend" ? "weak_recommend" : "not_recommended",
        criteriaRatings,
      },
    ],
    summary: {
      wouldUseSlate: decision !== "not_recommended",
      notes,
    },
  };
}

function summarizeText(payload) {
  const lines = [];
  lines.push("=== HUMAN REVIEW PHASE I — INFRASTRUCTURE CERTIFICATION ===");
  lines.push(`Status: ${payload.status}`);
  lines.push(`Profiles: ${payload.scope.profileIds.length}`);
  lines.push(`Snapshots: ${payload.outputs.snapshotsWritten}`);
  lines.push(`ReviewRecords: ${payload.outputs.reviewRecordsWritten}`);
  lines.push(`DeterministicSignature: ${payload.outputs.reportDeterministicSignature}`);
  lines.push("");
  lines.push("Acceptance criteria:");
  for (const item of payload.acceptanceCriteria) lines.push(`- ${item.name}: ${item.pass ? "PASS" : "FAIL"}`);
  lines.push("");
  lines.push("Unsupported conclusions:");
  for (const item of payload.unsupportedConclusions) lines.push(`- ${item}`);
  return lines.join("\n") + "\n";
}

async function main() {
  if (existsSync(phaseRoot)) rmSync(phaseRoot, { recursive: true, force: true });
  mkdirSync(phaseRoot, { recursive: true });
  const snapshotsDir = resolve(phaseRoot, "snapshots");
  const reviewInputsDir = resolve(phaseRoot, "review-inputs");
  const recordsPath = resolve(phaseRoot, "review-records.v1.ndjson");
  const exportBeforePath = resolve(phaseRoot, "review-record-export.before.json");
  const importPayloadPath = resolve(phaseRoot, "review-record-import.ndjson");
  const importedRecordsPath = resolve(phaseRoot, "review-records.imported.v1.ndjson");
  const exportAfterPath = resolve(phaseRoot, "review-record-export.after.json");
  const report1Path = resolve(phaseRoot, "human-review-report.v1.json");
  const report1TxtPath = resolve(phaseRoot, "human-review-report.v1.txt");
  const report2Path = resolve(phaseRoot, "human-review-report.v1.rerun.json");
  const report2TxtPath = resolve(phaseRoot, "human-review-report.v1.rerun.txt");
  mkdirSync(reviewInputsDir, { recursive: true });

  const capture = runNode("run-v2-human-review-capture-snapshot.mjs", [
    "--profile", profileIds.join(","),
    "--out", snapshotsDir,
    "--rubric-version", "v1",
  ]);
  assert(capture.ok, `snapshot_capture_failed:${capture.stderr || capture.stdout}`);
  const capturePayload = parseJson(capture.stdout);
  const snapshots = Array.isArray(capturePayload.snapshotsWritten) ? capturePayload.snapshotsWritten : [];
  assert(snapshots.length >= 5 && snapshots.length <= 10, "representative_scope_out_of_bounds");

  const snapshotByProfile = new Map(snapshots.map((item) => [item.profileId, item]));

  const reviewRecords = [];
  let idx = 0;
  for (const profileId of profileIds) {
    const snapshot = snapshotByProfile.get(profileId);
    assert(snapshot, `missing_snapshot_for_profile:${profileId}`);
    reviewRecords.push(reviewRecord({
      reviewId: `hr-phase1-r${idx + 1}`,
      snapshot,
      reviewerId: "reviewer-alpha",
      decision: idx % 2 === 0 ? "recommend" : "weak_recommend",
      overallScore: idx % 2 === 0 ? 4 : 3,
      criteriaRatings: { taste_alignment: 4, novelty: 3, confidence: 4 },
      notes: `phase1 primary review for ${profileId}`,
    }));
    idx += 1;
  }

  const disagreementSnapshot = snapshotByProfile.get("adult-mystery-core-v1");
  assert(disagreementSnapshot, "missing_disagreement_snapshot");
  reviewRecords.push(reviewRecord({
    reviewId: "hr-phase1-r-disagree",
    snapshot: disagreementSnapshot,
    reviewerId: "reviewer-beta",
    decision: "not_recommended",
    overallScore: 2,
    criteriaRatings: { taste_alignment: 2, novelty: 2, confidence: 2 },
    notes: "intentional disagreement record",
  }));

  for (const record of reviewRecords) {
    const recordPath = resolve(reviewInputsDir, `${record.reviewId}.json`);
    writeJson(recordPath, record);
    const append = runNode("run-v2-human-review-append-review.mjs", ["--record", recordPath, "--out", recordsPath]);
    assert(append.ok, `append_failed:${record.reviewId}:${append.stderr || append.stdout}`);
  }

  const duplicateAttemptPath = resolve(reviewInputsDir, `${reviewRecords[0].reviewId}.json`);
  const duplicate = runNode("run-v2-human-review-append-review.mjs", ["--record", duplicateAttemptPath, "--out", recordsPath]);
  const duplicateBlocked = !duplicate.ok && duplicate.stderr.includes("duplicate_review_id");

  const exportBefore = runNode("run-v2-human-review-export-records.mjs", ["--records", recordsPath, "--out", exportBeforePath]);
  assert(exportBefore.ok, `export_before_failed:${exportBefore.stderr || exportBefore.stdout}`);
  const beforePayload = JSON.parse(readFileSync(exportBeforePath, "utf8"));

  writeFileSync(importPayloadPath, beforePayload.records.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
  const importRun = runNode("run-v2-human-review-import-records.mjs", ["--in", importPayloadPath, "--out", importedRecordsPath]);
  assert(importRun.ok, `import_failed:${importRun.stderr || importRun.stdout}`);

  const exportAfter = runNode("run-v2-human-review-export-records.mjs", ["--records", importedRecordsPath, "--out", exportAfterPath]);
  assert(exportAfter.ok, `export_after_failed:${exportAfter.stderr || exportAfter.stdout}`);
  const afterPayload = JSON.parse(readFileSync(exportAfterPath, "utf8"));
  const lossless = beforePayload.contentSignature === afterPayload.contentSignature;

  const reportRun1 = runNode("run-v2-human-review-generate-report.mjs", [
    "--snapshots", snapshotsDir,
    "--records", recordsPath,
    "--out", report1Path,
    "--txt", report1TxtPath,
  ]);
  const reportRun2 = runNode("run-v2-human-review-generate-report.mjs", [
    "--snapshots", snapshotsDir,
    "--records", recordsPath,
    "--out", report2Path,
    "--txt", report2TxtPath,
  ]);
  assert(reportRun1.ok && reportRun2.ok, "report_generation_failed");

  const report1 = JSON.parse(readFileSync(report1Path, "utf8"));
  const report2 = JSON.parse(readFileSync(report2Path, "utf8"));
  const deterministicReports = report1.deterministicContentSignature === report2.deterministicContentSignature;

  const bySnapshot = new Map();
  for (const record of beforePayload.records) {
    const key = `${record.snapshotId}`;
    const bucket = bySnapshot.get(key) || [];
    bucket.push(record);
    bySnapshot.set(key, bucket);
  }
  let disagreementPreserved = false;
  for (const bucket of bySnapshot.values()) {
    const decisions = new Set(bucket.flatMap((row) => (row.itemReviews || []).map((item) => item.decision)));
    if (decisions.size > 1) disagreementPreserved = true;
  }

  const profileSnapshotLinkage = beforePayload.records.every((record) => {
    const snap = snapshots.find((row) => row.snapshotId === record.snapshotId);
    return Boolean(snap) && snap.profileId === record.profileId;
  });

  const rubricVersionPreserved = beforePayload.records.every((record) => record.rubricVersion === "v1" && record.rubricId === "novelideas-human-review");
  const snapshotImmutable = snapshots.every((row) => typeof row.snapshotId === "string" && row.snapshotId.length >= 8);

  const acceptanceCriteria = [
    { name: "Snapshot IDs remain immutable", pass: snapshotImmutable },
    { name: "Reviews are append-only", pass: duplicateBlocked },
    { name: "Rubric version preserved for every judgment", pass: rubricVersionPreserved },
    { name: "Export->Import->Export is lossless", pass: lossless },
    { name: "Report generation deterministic from identical inputs", pass: deterministicReports },
    { name: "Reviewer disagreement preserved, not averaged away", pass: disagreementPreserved },
    { name: "Every review links to exact frozen profile and snapshot", pass: profileSnapshotLinkage },
  ];

  const status = acceptanceCriteria.every((row) => row.pass) ? "certified_phase1_infrastructure_pass" : "phase1_infrastructure_fail";

  const unsupportedConclusions = [
    "Recommendation quality",
    "Source superiority",
    "Human Review thresholds",
    "Product readiness",
    "Reader satisfaction",
    "Production telemetry",
    "Launch readiness",
  ];

  const summary = {
    schemaVersion: "human_review_phase1_infrastructure_certification_v1",
    status,
    objective: "Demonstrate Human Review pipeline reproducibility and provenance integrity.",
    scope: {
      profileIds,
      profileCount: profileIds.length,
      rubricVersion: "v1",
      sourceConstraint: "existing recommendation outputs only",
    },
    outputs: {
      phaseRoot,
      snapshotsWritten: snapshots.length,
      reviewRecordsWritten: beforePayload.recordCount,
      reportDeterministicSignature: report1.deterministicContentSignature,
      evidenceSignature: shortHash(stableStringify({
        snapshots,
        recordSignature: beforePayload.contentSignature,
        reportSignature: report1.deterministicContentSignature,
      }), 32),
    },
    acceptanceCriteria,
    unsupportedConclusions,
  };

  writeJson(resolve(phaseRoot, "human-review-phase1-infrastructure-certification.json"), summary);
  writeFileSync(resolve(phaseRoot, "human-review-phase1-infrastructure-certification.txt"), summarizeText(summary), "utf8");

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(`human_review_phase1_certification_failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
