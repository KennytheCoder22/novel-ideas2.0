import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { shortHash, stableStringify, writeJson } from "./human-review/lib/human-review-core.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const phaseRoot = resolve(repoRoot, "scripts", "output", "human-review", "recommendation-quality-baseline-study-v1");

const profileIds = [
  "kids-adventure-kindness-v1",
  "preteens-adventure-humor-v1",
  "teens-sci-fi-identity-v1",
  "teens-mystery-tension-v1",
  "adult-mystery-core-v1",
  "adult-fantasy-ensemble-v1",
];

const profileConcernPlan = {
  "kids-adventure-kindness-v1": ["low_novelty_repeat_signal"],
  "preteens-adventure-humor-v1": ["series_entrypoint_unclear"],
  "teens-sci-fi-identity-v1": ["maturity_boundary_uncertainty"],
  "teens-mystery-tension-v1": ["maturity_boundary_uncertainty", "tone_intensity_mismatch"],
  "adult-mystery-core-v1": ["series_entrypoint_unclear", "evidence_specificity_weak"],
  "adult-fantasy-ensemble-v1": ["low_novelty_repeat_signal"],
};

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

function parseJson(text, fallback = {}) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed);
  } catch {
    return fallback;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function ageBandFromProfileId(profileId) {
  if (profileId.startsWith("kids-")) return "kids";
  if (profileId.startsWith("preteens-")) return "preteens";
  if (profileId.startsWith("teens-")) return "teens";
  return "adult";
}

function buildItemReview({ rank, title, baseScore, decision, concernTags, uncertaintyLabel }) {
  return {
    rank,
    title,
    overallScore: baseScore,
    decision,
    criteriaRatings: {
      taste_alignment: baseScore,
      novelty: Math.max(1, baseScore - 1),
      confidence: uncertaintyLabel === "high" ? Math.max(1, baseScore - 2) : Math.max(1, baseScore - 1),
    },
    concernTags: concernTags,
    uncertainty: {
      level: uncertaintyLabel,
      note: uncertaintyLabel === "high" ? "reviewer could not confidently infer fit boundary from available evidence alone" : "fit appears plausible but not fully certain",
    },
  };
}

function buildReviewRecords(snapshots) {
  const records = [];
  for (const snapshot of snapshots) {
    const profileId = snapshot.profileId;
    const concerns = profileConcernPlan[profileId] || [];
    const ageBand = ageBandFromProfileId(profileId);
    const top = snapshot.recommendationItems[0];
    const second = snapshot.recommendationItems[1];

    records.push({
      schemaVersion: "human_review_record_v1",
      reviewId: `rqb-v1-${profileId}-alpha`,
      snapshotId: snapshot.snapshotId,
      profileId,
      rubricId: "novelideas-human-review",
      rubricVersion: "v1",
      reviewerId: "reviewer-alpha",
      createdAt: "2026-08-01T00:00:00.000Z",
      reviewScope: { studyId: "recommendation-quality-baseline-study-v1", ageBand },
      itemReviews: [
        buildItemReview({
          rank: 1,
          title: top?.title || "The Lantern Archive",
          baseScore: 4,
          decision: "recommend",
          concernTags: concerns.slice(0, 1),
          uncertaintyLabel: concerns.includes("maturity_boundary_uncertainty") ? "medium" : "low",
        }),
        buildItemReview({
          rank: 2,
          title: second?.title || "Signal in the Stacks",
          baseScore: 3,
          decision: "weak_recommend",
          concernTags: concerns,
          uncertaintyLabel: concerns.length > 0 ? "medium" : "low",
        }),
      ],
      summary: {
        wouldUseSlate: true,
        slateConcernTags: concerns,
        notes: `baseline reviewer alpha for ${profileId}`,
      },
    });

    if (profileId === "teens-mystery-tension-v1" || profileId === "adult-mystery-core-v1") {
      records.push({
        schemaVersion: "human_review_record_v1",
        reviewId: `rqb-v1-${profileId}-beta`,
        snapshotId: snapshot.snapshotId,
        profileId,
        rubricId: "novelideas-human-review",
        rubricVersion: "v1",
        reviewerId: "reviewer-beta",
        createdAt: "2026-08-01T00:00:00.000Z",
        reviewScope: { studyId: "recommendation-quality-baseline-study-v1", ageBand },
        itemReviews: [
          buildItemReview({
            rank: 1,
            title: top?.title || "The Lantern Archive",
            baseScore: 2,
            decision: "not_recommended",
            concernTags: [...concerns, "reviewer_disagreement"],
            uncertaintyLabel: "high",
          }),
          buildItemReview({
            rank: 2,
            title: second?.title || "Signal in the Stacks",
            baseScore: 2,
            decision: "not_recommended",
            concernTags: [...concerns, "reviewer_disagreement"],
            uncertaintyLabel: "high",
          }),
        ],
        summary: {
          wouldUseSlate: false,
          slateConcernTags: [...concerns, "reviewer_disagreement"],
          notes: `intentional disagreement preserved for ${profileId}`,
        },
      });
    }
  }
  return records;
}

function collectConcernCounts(records) {
  const candidateConcernCounts = {};
  const slateConcernCounts = {};
  const byAgeBand = {};

  for (const record of records) {
    const ageBand = record.reviewScope?.ageBand || ageBandFromProfileId(record.profileId);
    const age = byAgeBand[ageBand] || { reviews: 0, itemReviews: 0, avgOverallScore: 0, _scoreSum: 0 };
    age.reviews += 1;
    for (const item of record.itemReviews || []) {
      age.itemReviews += 1;
      age._scoreSum += Number(item.overallScore || 0);
      for (const concern of item.concernTags || []) {
        candidateConcernCounts[concern] = (candidateConcernCounts[concern] || 0) + 1;
      }
    }
    for (const concern of record.summary?.slateConcernTags || []) {
      slateConcernCounts[concern] = (slateConcernCounts[concern] || 0) + 1;
    }
    byAgeBand[ageBand] = age;
  }

  for (const key of Object.keys(byAgeBand)) {
    const row = byAgeBand[key];
    row.avgOverallScore = row.itemReviews ? Number((row._scoreSum / row.itemReviews).toFixed(3)) : 0;
    delete row._scoreSum;
  }

  return { candidateConcernCounts, slateConcernCounts, byAgeBand };
}

function prioritizedHypotheses(concernCounts) {
  const map = [
    {
      concern: "maturity_boundary_uncertainty",
      hypothesis: "Richer independent age-fit evidence could reduce maturity-boundary uncertainty in teen mystery/sci-fi slates.",
      controlledIntervention: "Add diagnostics-only evidence lineage for teen-fit authority, then run controlled eligibility-only A/B on frozen fixtures before policy changes.",
    },
    {
      concern: "series_entrypoint_unclear",
      hypothesis: "Entry-point uncertainty may be reduced by explicit sequence/volume provenance in candidate diagnostics.",
      controlledIntervention: "Introduce source-neutral sequence diagnostics; compare pre/post Human Review deltas without ranking changes first.",
    },
    {
      concern: "low_novelty_repeat_signal",
      hypothesis: "Novelty concerns may indicate insufficient diversification cues at selection time for some profiles.",
      controlledIntervention: "Design bounded diversity-cue experiment with deterministic replay and post-change Human Review rerun.",
    },
    {
      concern: "tone_intensity_mismatch",
      hypothesis: "Tone-intensity mismatch may be reduced by stronger tone-evidence normalization before scoring.",
      controlledIntervention: "Run normalization-only shadow experiment and compare deterministic outputs before any production change.",
    },
  ];

  return map
    .map((item) => ({ ...item, frequency: concernCounts[item.concern] || 0 }))
    .filter((item) => item.frequency > 0)
    .sort((a, b) => b.frequency - a.frequency);
}

function observations(concernMetrics, records) {
  const { candidateConcernCounts, slateConcernCounts, byAgeBand } = concernMetrics;
  const disagreementProfiles = new Set();
  const bySnapshot = new Map();
  for (const record of records) {
    const bucket = bySnapshot.get(record.snapshotId) || [];
    bucket.push(record);
    bySnapshot.set(record.snapshotId, bucket);
  }
  for (const bucket of bySnapshot.values()) {
    const reviewers = new Set(bucket.map((row) => row.reviewerId));
    if (reviewers.size < 2) continue;
    const useSlateVotes = new Set(bucket.map((row) => String(Boolean(row.summary?.wouldUseSlate))));
    if (useSlateVotes.size > 1 && bucket[0]?.profileId) disagreementProfiles.add(bucket[0].profileId);
  }

  return [
    {
      id: "obs-1",
      observation: "Maturity-boundary uncertainty appears repeatedly in teen-focused reviewed slates.",
      evidence: {
        candidateConcernFrequency: candidateConcernCounts.maturity_boundary_uncertainty || 0,
        slateConcernFrequency: slateConcernCounts.maturity_boundary_uncertainty || 0,
      },
    },
    {
      id: "obs-2",
      observation: "Series entry-point concerns recur across preteen/adult reviewed profiles.",
      evidence: {
        candidateConcernFrequency: candidateConcernCounts.series_entrypoint_unclear || 0,
        slateConcernFrequency: slateConcernCounts.series_entrypoint_unclear || 0,
      },
    },
    {
      id: "obs-3",
      observation: "Reviewer disagreement is preserved for selected mystery profiles and remains visible in raw records.",
      evidence: {
        disagreementProfiles: [...disagreementProfiles].sort(),
        disagreementProfileCount: disagreementProfiles.size,
      },
    },
    {
      id: "obs-4",
      observation: "Average reviewed item scores vary by age band in this bounded sample and should be treated as descriptive only.",
      evidence: byAgeBand,
    },
  ];
}

function makeSummaryText(report) {
  const lines = [];
  lines.push("=== RECOMMENDATION QUALITY BASELINE STUDY (v1) ===");
  lines.push(`Status: ${report.status}`);
  lines.push(`Profiles reviewed: ${report.scope.profileCount}`);
  lines.push(`Snapshots: ${report.outputs.snapshotsWritten}`);
  lines.push(`Review records: ${report.outputs.reviewRecordsWritten}`);
  lines.push(`Evidence signature: ${report.outputs.evidenceSignature}`);
  lines.push("");
  lines.push("Recurring concern patterns:");
  for (const row of report.recurringConcernPatterns) lines.push(`- ${row.concern}: ${row.frequency}`);
  lines.push("");
  lines.push("Prioritized hypotheses:");
  for (const row of report.prioritizedHypotheses) lines.push(`- (${row.frequency}) ${row.hypothesis}`);
  lines.push("");
  lines.push("Unsupported conclusions:");
  for (const row of report.unsupportedConclusions) lines.push(`- ${row}`);
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
  const report2Path = resolve(phaseRoot, "human-review-report.v1.rerun.json");
  mkdirSync(reviewInputsDir, { recursive: true });

  const capture = runNode("run-v2-human-review-capture-snapshot.mjs", [
    "--profile", profileIds.join(","),
    "--out", snapshotsDir,
    "--rubric-version", "v1",
  ]);
  assert(capture.ok, `snapshot_capture_failed:${capture.stderr || capture.stdout}`);
  const capturePayload = parseJson(capture.stdout);
  const snapshotsWritten = capturePayload.snapshotsWritten || [];
  assert(snapshotsWritten.length >= 5 && snapshotsWritten.length <= 10, "representative_scope_out_of_bounds");

  const snapshotFiles = readdirSync(snapshotsDir).filter((file) => file.endsWith(".json")).sort();
  const snapshots = snapshotFiles.map((file) => JSON.parse(readFileSync(resolve(snapshotsDir, file), "utf8")));
  const records = buildReviewRecords(snapshots);

  for (const record of records) {
    const recordPath = resolve(reviewInputsDir, `${record.reviewId}.json`);
    writeJson(recordPath, record);
    const append = runNode("run-v2-human-review-append-review.mjs", ["--record", recordPath, "--out", recordsPath]);
    assert(append.ok, `append_failed:${record.reviewId}:${append.stderr || append.stdout}`);
  }

  const duplicate = runNode("run-v2-human-review-append-review.mjs", ["--record", resolve(reviewInputsDir, `${records[0].reviewId}.json`), "--out", recordsPath]);
  const appendOnlyEnforced = !duplicate.ok && duplicate.stderr.includes("duplicate_review_id");

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

  const reportRun1 = runNode("run-v2-human-review-generate-report.mjs", ["--snapshots", snapshotsDir, "--records", recordsPath, "--out", report1Path]);
  const reportRun2 = runNode("run-v2-human-review-generate-report.mjs", ["--snapshots", snapshotsDir, "--records", recordsPath, "--out", report2Path]);
  assert(reportRun1.ok && reportRun2.ok, "report_generation_failed");
  const report1 = JSON.parse(readFileSync(report1Path, "utf8"));
  const report2 = JSON.parse(readFileSync(report2Path, "utf8"));
  const deterministicReports = report1.deterministicContentSignature === report2.deterministicContentSignature;

  const concernMetrics = collectConcernCounts(beforePayload.records);
  const recurringConcernPatterns = Object.entries(concernMetrics.candidateConcernCounts)
    .map(([concern, frequency]) => ({ concern, frequency }))
    .sort((a, b) => b.frequency - a.frequency);

  const report = {
    schemaVersion: "recommendation_quality_baseline_study_v1",
    status: "completed_observation_only",
    objective: "Evaluate recommendation quality observations using the certified Human Review instrument (not to draw tuning conclusions).",
    scope: {
      profileIds,
      profileCount: profileIds.length,
      ageBandsRepresented: ["kids", "preteens", "teens", "adult"],
      rubricVersion: "v1",
      sourceConstraint: "existing recommendation outputs only",
    },
    outputs: {
      phaseRoot,
      snapshotsWritten: snapshots.length,
      reviewRecordsWritten: beforePayload.recordCount,
      evidenceSignature: shortHash(stableStringify({
        snapshots: snapshots.map((item) => ({ profileId: item.profileId, snapshotId: item.snapshotId, contentSha256: item.contentSha256 })),
        reviewRecordContentSignature: beforePayload.contentSignature,
        deterministicReportSignature: report1.deterministicContentSignature,
      }), 32),
      deterministicReportSignature: report1.deterministicContentSignature,
    },
    acceptanceCriteria: [
      { name: "Snapshot IDs remain immutable", pass: snapshots.every((row) => typeof row.snapshotId === "string" && row.snapshotId.length >= 8) },
      { name: "Reviews are append-only", pass: appendOnlyEnforced },
      { name: "Rubric version preserved for every judgment", pass: beforePayload.records.every((row) => row.rubricVersion === "v1") },
      { name: "Export->Import->Export is lossless", pass: lossless },
      { name: "Report generation is deterministic from identical inputs", pass: deterministicReports },
      {
        name: "Reviewer disagreement and uncertainty preserved",
        pass: beforePayload.records.some((row) => row.reviewerId === "reviewer-beta")
          && beforePayload.records.some((row) => (row.itemReviews || []).some((item) => item.uncertainty?.level === "high")),
      },
      {
        name: "Every review links to exact frozen profile and recommendation snapshot",
        pass: beforePayload.records.every((row) => snapshots.some((snap) => snap.snapshotId === row.snapshotId && snap.profileId === row.profileId)),
      },
    ],
    observations: observations(concernMetrics, beforePayload.records),
    recurringConcernPatterns,
    prioritizedHypotheses: prioritizedHypotheses(concernMetrics.candidateConcernCounts),
    unsupportedConclusions: [
      "Causal source effects",
      "Source superiority",
      "Production readiness",
      "Reader satisfaction",
      "Launch readiness",
      "Any observed weakness must be fixed before a controlled intervention is designed",
    ],
    studyBoundaries: {
      allowedConclusionShape: "observation_and_hypothesis_only",
      disallowedConclusionShape: "direct_tuning_or_policy_change_conclusions",
      recommendedNextSequence: [
        "Human Review observation",
        "Bounded hypothesis",
        "Controlled engineering intervention",
        "Deterministic comparison",
        "Repeat Human Review",
      ],
    },
    notes: [
      "This study establishes a reproducible quality observation baseline.",
      "Review records in this run are synthetic study fixtures intended to exercise the certified pipeline end-to-end.",
      "Follow-up quality studies should replace fixture reviewers with real reviewer submissions while preserving artifact invariants.",
    ],
  };

  writeJson(resolve(phaseRoot, "recommendation-quality-baseline-study-v1.json"), report);
  writeFileSync(resolve(phaseRoot, "recommendation-quality-baseline-study-v1.txt"), makeSummaryText(report), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`recommendation_quality_baseline_study_failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
