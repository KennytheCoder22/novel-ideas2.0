/**
 * #202 hypothesis + parity-baseline design artifact.
 *
 * Purpose:
 * - Define the expected outcome before implementation for #202
 *   (Semantic phrase extraction consolidation).
 * - Encode falsification criteria and a parity baseline protocol.
 *
 * Usage:
 *   node scripts/run-v2-googlebooks-202-hypothesis.mjs
 *
 * Outputs:
 * - scripts/output/googlebooks-202-hypothesis.json
 * - scripts/output/googlebooks-202-hypothesis.csv
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const outDir = resolve(scriptDir, "output");

const planPath = resolve(outDir, "googlebooks-consolidation-execution-plan.json");
const plan = JSON.parse(readFileSync(planPath, "utf8"));
const rows = Array.isArray(plan?.rows) ? plan.rows : [];
const row202 = rows.find((row) => row.capability === "Semantic phrase extraction");
if (!row202) throw new Error("Could not find #202 row (Semantic phrase extraction) in consolidation plan.");

let gitHead = "unknown";
try {
  gitHead = String(execSync("git rev-parse HEAD", { cwd: repoRoot, stdio: ["ignore", "pipe", "ignore"] })).trim();
} catch {
  gitHead = "unknown";
}

const hypothesis = {
  id: "#202",
  capability: "Semantic phrase extraction",
  behavioralClass: row202.behavioralClass,
  confidenceState: "Architectural",
  objectiveType: "behavior-preserving consolidation",
  hypothesisStatement: "Extract one shared semantic phrase extraction primitive for Adult and Teen Google Books with no recommendation, ranking, or diagnostic behavior change.",
  expectedBehavioralChange: {
    recommendationOutputs: "no change",
    candidateRankings: "no change",
    finalEligibilityDecisions: "no change",
    diagnostics: "no change",
  },
  expectedMaintenanceChange: {
    duplicateCode: "decrease",
    sharedPrimitiveCount: "increase by 1",
    ageBandPolicySeparation: "preserved",
    complexityDirection: "decrease",
  },
  successCriteria: [
    "Recommendation parity = 100% (pre/post identical outputs on baseline corpus and regression fixtures).",
    "Diagnostics parity = 100% (all emitted maps/counters/reason codes identical pre/post).",
    "Ranking parity = 100% (ordering unchanged for all compared candidate sets).",
    "Regression parity = 100% for prerequisite script set.",
    "At least one duplicated extraction path removed in favor of one shared primitive.",
  ],
  mustNotMove: [
    "No eligibility threshold changes.",
    "No routing/query/source/polarity behavior changes.",
    "No age-band policy semantics changes.",
  ],
  falsificationCriteria: [
    "Any recommendation output diff (titles, order, inclusion/exclusion reasons).",
    "Any diagnostic key/value diff outside explicit metadata timestamp fields.",
    "Any regression failure in prerequisite script suite.",
    "No measurable duplication reduction despite code changes.",
  ],
  decisionRule: {
    allParityChecksPassAndDuplicationReduced: "Implemented (Proven)",
    parityPassesButDuplicationNotReduced: "Deferred (insufficient maintenance gain)",
    anyParityCheckFails: "Falsified (do not merge as #202)",
  },
  parityBaselineProtocol: {
    baselineCapturedFromCommit: gitHead,
    baselineArtifactRoot: "scripts/output (pre-change snapshots retained for diff)",
    requiredComparators: [
      "recommendation outputs",
      "candidate ranking order",
      "diagnostic maps/counters/reason codes",
      "prerequisite regression script outcomes",
    ],
    prerequisiteScripts: Array.isArray(row202.prerequisiteTests) ? row202.prerequisiteTests : [],
    note: "Capture pre-change outputs for each prerequisite script, then rerun post-change and require parity.",
  },
};

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "googlebooks-202-hypothesis.json");
const csvOut = resolve(outDir, "googlebooks-202-hypothesis.csv");

writeFileSync(jsonOut, JSON.stringify({
  generatedAt: new Date().toISOString(),
  sourceExecutionPlan: "googlebooks-consolidation-execution-plan.json",
  hypothesis,
}, null, 2));

const csvHeader = [
  "id",
  "capability",
  "objectiveType",
  "confidenceState",
  "hypothesisStatement",
  "expectedBehavioralChange",
  "expectedMaintenanceChange",
  "successCriteria",
  "mustNotMove",
  "falsificationCriteria",
  "decisionRule",
  "baselineCommit",
  "prerequisiteScripts",
].join(",");

const csvRow = [
  `"${hypothesis.id}"`,
  `"${hypothesis.capability.replace(/"/g, '""')}"`,
  `"${hypothesis.objectiveType.replace(/"/g, '""')}"`,
  hypothesis.confidenceState,
  `"${hypothesis.hypothesisStatement.replace(/"/g, '""')}"`,
  `"${Object.entries(hypothesis.expectedBehavioralChange).map(([k, v]) => `${k}:${v}`).join(" | ").replace(/"/g, '""')}"`,
  `"${Object.entries(hypothesis.expectedMaintenanceChange).map(([k, v]) => `${k}:${v}`).join(" | ").replace(/"/g, '""')}"`,
  `"${hypothesis.successCriteria.join(" | ").replace(/"/g, '""')}"`,
  `"${hypothesis.mustNotMove.join(" | ").replace(/"/g, '""')}"`,
  `"${hypothesis.falsificationCriteria.join(" | ").replace(/"/g, '""')}"`,
  `"${Object.entries(hypothesis.decisionRule).map(([k, v]) => `${k}:${v}`).join(" || ").replace(/"/g, '""')}"`,
  hypothesis.parityBaselineProtocol.baselineCapturedFromCommit,
  `"${hypothesis.parityBaselineProtocol.prerequisiteScripts.join(" | ").replace(/"/g, '""')}"`,
].join(",");

writeFileSync(csvOut, `${csvHeader}\n${csvRow}`);

console.log("=== GOOGLE BOOKS #202 HYPOTHESIS ===");
console.log(`Capability: ${hypothesis.capability}`);
console.log(`Confidence state: ${hypothesis.confidenceState}`);
console.log(`Objective: ${hypothesis.objectiveType}`);
console.log(`Baseline commit: ${hypothesis.parityBaselineProtocol.baselineCapturedFromCommit}`);
console.log(`JSON written to: ${jsonOut}`);
console.log(`CSV written to: ${csvOut}`);
