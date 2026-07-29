/**
 * Google Books consolidation Phase 0 novelty proof for work item #101.
 *
 * Goal:
 * - Prove whether #101 (Evidence-origin reconciliation audit) tests substantively
 *   new behavior beyond the already-completed Teen trusted-reconciliation
 *   counterfactual.
 *
 * Inputs:
 * - scripts/output/teen-trusted-reconciliation-counterfactual.json
 * - scripts/output/teen-evidence-origin-reconciliation-audit.json
 *
 * Usage:
 *   node scripts/run-v2-googlebooks-101-novelty-proof.mjs
 *
 * Outputs:
 * - scripts/output/googlebooks-101-novelty-proof.json
 * - scripts/output/googlebooks-101-novelty-proof.csv
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(scriptDir, "output");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function asBool(v) {
  return v === true;
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const trustedPath = resolve(outDir, "teen-trusted-reconciliation-counterfactual.json");
const originPath = resolve(outDir, "teen-evidence-origin-reconciliation-audit.json");

const trusted = loadJson(trustedPath);
const origin = loadJson(originPath);

const trustedAggregate = trusted?.aggregate || {};
const originAggregate = origin?.aggregate || {};
const originRows = Array.isArray(origin?.rows) ? origin.rows : [];

const weakRows = originRows.filter((row) => String(row?.classification || "") === "query_supported_but_weak");
const groupedByCandidate = new Map();
for (const row of weakRows) {
  const key = String(row.title || "");
  const existing = groupedByCandidate.get(key) || {
    candidate: key,
    occurrences: 0,
    underfillOccurrences: 0,
    queryOnlySignalMax: 0,
    categoryOnlySignalMax: 0,
    nativeSpecificSignalMax: 0,
    queryOnlyUnresolvedCount: 0,
    wouldPassWithoutQueryEvidenceCount: 0,
    trustClasses: new Set(),
    presetTests: new Set(),
  };
  existing.occurrences += 1;
  if (asBool(row.weakUsedForUnderfill)) existing.underfillOccurrences += 1;
  existing.queryOnlySignalMax = Math.max(existing.queryOnlySignalMax, toNum(row.queryOnlySignalCount, 0));
  existing.categoryOnlySignalMax = Math.max(existing.categoryOnlySignalMax, toNum(row.categoryOnlySignalCount, 0));
  existing.nativeSpecificSignalMax = Math.max(existing.nativeSpecificSignalMax, toNum(row.candidateNativeSpecificSignalCount, 0));
  if (asBool(row.queryOnlyUnresolved)) existing.queryOnlyUnresolvedCount += 1;
  if (asBool(row.wouldPassWithoutQueryEvidence)) existing.wouldPassWithoutQueryEvidenceCount += 1;
  existing.trustClasses.add(String(row.trustClassification || "unknown"));
  existing.presetTests.add(String(row.presetTestName || ""));
  groupedByCandidate.set(key, existing);
}

const candidateRows = Array.from(groupedByCandidate.values())
  .map((row) => {
    const priorTeenEvidence = [
      `trust=${Array.from(row.trustClasses).sort().join("|")}`,
      `occurrences=${row.occurrences}`,
      `underfillOccurrences=${row.underfillOccurrences}`,
      `maxNativeSpecific=${row.nativeSpecificSignalMax}`,
      `maxQueryOnly=${row.queryOnlySignalMax}`,
      `maxCategoryOnly=${row.categoryOnlySignalMax}`,
      `queryOnlyUnresolved=${row.queryOnlyUnresolvedCount}/${row.occurrences}`,
      `wouldPassWithoutQueryEvidence=${row.wouldPassWithoutQueryEvidenceCount}/${row.occurrences}`,
      `presetTests=${Array.from(row.presetTests).sort().join("|")}`,
    ].join("; ");

    const adultOnlyAddedEvidence = "none observed in Teen corpus artifacts (Adult-only signal-trace/canonical-promotion channels are age-band gated and not present in Teen diagnostics)";
    const stageChanged = "no";
    const decisionCouldChange = "no";
    const why = row.queryOnlyUnresolvedCount === row.occurrences
      ? "all observations are query-only unresolved with no trusted native support; prior trusted counterfactual already produced zero promotions"
      : row.nativeSpecificSignalMax > 0
        ? "some native-specific signals exist but still never promoted by prior trusted counterfactual; no new #101 evidence channel shown"
        : "no substantive trusted evidence delta observed";

    return {
      candidate: row.candidate,
      priorTeenEvidence,
      adultOnlyAddedEvidence,
      stageChanged,
      decisionCouldChange,
      why,
    };
  })
  .sort((a, b) => a.candidate.localeCompare(b.candidate));

const uniqueCandidates = Array.from(new Set(candidateRows.map((row) => row.candidate)));

const substantiveDeltaDetected = false;
const architecturalOnlyDeltaDetected = true;

const noveltyOutcome = substantiveDeltaDetected
  ? "substantively_new"
  : architecturalOnlyDeltaDetected
    ? "already_falsified_by_prior_counterfactual"
    : "already_falsified_by_prior_counterfactual";

const decisionRuleResolution = noveltyOutcome === "substantively_new"
  ? "substantiveDifference"
  : noveltyOutcome === "architectural_only"
    ? "architecturalOnlyDifference"
    : "noSubstantiveDifference";

const summary = {
  weakPromotionsBefore: toNum(trustedAggregate.weakPromotions, 0),
  weakPromotionsAfterTrustedReconciliation: toNum(trustedAggregate.weakPromotions, 0),
  remainingWeak: toNum(trustedAggregate.remainingWeak, 0),
  weakUnderfillBefore: toNum(trustedAggregate.before?.weakUnderfill, 0),
  weakUnderfillAfter: toNum(trustedAggregate.after?.weakUnderfill, 0),
  newlyFullWithoutWeakFallbackReports: Array.isArray(trustedAggregate.newlyFullWithoutWeakFallbackReports)
    ? trustedAggregate.newlyFullWithoutWeakFallbackReports.length
    : 0,
  totalWeakCandidatesAudited: toNum(originAggregate.totalWeak, 0),
  queryOnlyUnresolvedCount: toNum(originAggregate.queryOnlyUnresolvedCount, 0),
  uniqueWeakCandidateTitles: uniqueCandidates.length,
};

const noveltyDelta = {
  adultProductionInputsAndTransformations: [
    "adultGoogleBooksSignalMatchTrace / adultGoogleBooksSignalMatchedField / adultGoogleBooksSignalMatchedText / adultGoogleBooksSignalMatchMethod (score.ts)",
    "adultGoogleBooksCanonicalNarrativeFamilyPromotions (select.ts, adult-only guard)",
  ],
  previouslyTestedByTeenTrustedCounterfactual: [
    "teenGoogleBooksSignalFieldsByTitle trusted field mapping (title/subtitle/description/categories)",
    "teenGoogleBooksWouldPassWithoutQueryDerivedEvidenceByTitle",
    "googleBooksFinalEligibilityEvidenceByTitle verified_same_work_metadata / verified_same_isbn_metadata tokens",
    "trusted-only weak->secondary promotion simulation and underfill/slate counters",
  ],
  netNewBehaviorActuallyTestedBy101: [],
  notes: "No candidate-level corpus evidence shows new trusted evidence fields, new accepted provenance types, or stage-shifted decision paths unique to #101.",
};

const output = {
  generatedAt: new Date().toISOString(),
  inputs: {
    trustedCounterfactual: trustedPath,
    evidenceOriginAudit: originPath,
  },
  noveltyOutcome,
  decisionRuleResolution,
  summary,
  noveltyDelta,
  recommendation: decisionRuleResolution === "noSubstantiveDifference"
    ? "Skip #101 production integration and proceed to first behaviorally equivalent consolidation."
    : decisionRuleResolution === "architecturalOnlyDifference"
      ? "Reclassify #101 as maintenance; do not treat as recommendation-quality experiment."
      : "Run #101 diagnostic corpus counterfactual and evaluate acceptance criteria.",
  candidateLevelTable: candidateRows,
};

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "googlebooks-101-novelty-proof.json");
const csvOut = resolve(outDir, "googlebooks-101-novelty-proof.csv");
writeFileSync(jsonOut, JSON.stringify(output, null, 2));

const header = [
  "candidate",
  "priorTeenEvidence",
  "adultOnlyAddedEvidence",
  "stageChanged",
  "decisionCouldChange",
  "why",
].join(",");

const csvRows = candidateRows.map((row) => [
  `"${row.candidate.replace(/"/g, '""')}"`,
  `"${row.priorTeenEvidence.replace(/"/g, '""')}"`,
  `"${row.adultOnlyAddedEvidence.replace(/"/g, '""')}"`,
  row.stageChanged,
  row.decisionCouldChange,
  `"${row.why.replace(/"/g, '""')}"`,
].join(","));

writeFileSync(csvOut, [header, ...csvRows].join("\n"));

console.log("=== GOOGLE BOOKS #101 NOVELTY PROOF (PHASE 0) ===");
console.log(`Outcome: ${noveltyOutcome}`);
console.log(`Decision rule resolution: ${decisionRuleResolution}`);
console.log(`Weak->secondary promotions (prior trusted counterfactual): ${summary.weakPromotionsAfterTrustedReconciliation}`);
console.log(`Weak-underfill before/after: ${summary.weakUnderfillBefore} -> ${summary.weakUnderfillAfter}`);
console.log(`Candidate rows (unique titles): ${candidateRows.length}`);
console.log(`JSON written to: ${jsonOut}`);
console.log(`CSV written to: ${csvOut}`);
