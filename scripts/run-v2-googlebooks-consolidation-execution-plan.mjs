/**
 * Google Books consolidation execution plan (ranked)
 *
 * Builds a prioritized execution plan from the behavioral-equivalence audit.
 *
 * Usage:
 *   node scripts/run-v2-googlebooks-consolidation-execution-plan.mjs
 *
 * Outputs:
 *   scripts/output/googlebooks-consolidation-execution-plan.json
 *   scripts/output/googlebooks-consolidation-execution-plan.csv
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(scriptDir, "output");

const inputPath = resolve(outDir, "googlebooks-behavioral-equivalence-audit.json");
const source = JSON.parse(readFileSync(inputPath, "utf8"));
const rows = Array.isArray(source?.rows) ? source.rows : [];
const noveltyProofPath = resolve(outDir, "googlebooks-101-novelty-proof.json");
const noveltyProof = existsSync(noveltyProofPath)
  ? JSON.parse(readFileSync(noveltyProofPath, "utf8"))
  : null;
const noveltyCloses101 = noveltyProof?.decisionRuleResolution === "noSubstantiveDifference"
  || noveltyProof?.noveltyOutcome === "already_falsified_by_prior_counterfactual";

const classOrder = {
  adult_production_teen_diagnostic: 1,
  behaviorally_equivalent_duplication: 2,
  same_name_different_semantics: 3,
  truly_shared: 4,
  age_specific_by_necessity: 5,
};

const classLabel = {
  adult_production_teen_diagnostic: "Adult production / Teen diagnostic",
  behaviorally_equivalent_duplication: "Behaviorally equivalent duplication",
  same_name_different_semantics: "Same name, different semantics",
  truly_shared: "Truly shared",
  age_specific_by_necessity: "Age-specific by necessity",
};

const classDefaults = {
  adult_production_teen_diagnostic: {
    expectedRecommendationQualityGain: "High",
    maintenanceGain: "Medium",
    regressionRisk: "High",
    acceptanceCriteria: "Counterfactual proves improved marginal decision-worthy yield with no artifact/age regressions and acceptable latency cost.",
  },
  behaviorally_equivalent_duplication: {
    expectedRecommendationQualityGain: "Low",
    maintenanceGain: "High",
    regressionRisk: "Medium",
    acceptanceCriteria: "Adult and Teen outputs are bit-for-bit identical pre/post refactor (decisions, ranking order, diagnostics, reason codes).",
  },
  same_name_different_semantics: {
    expectedRecommendationQualityGain: "Medium",
    maintenanceGain: "Medium",
    regressionRisk: "High",
    acceptanceCriteria: "Shared interface contract adopted with unchanged age-band behavior and explicit semantic differences documented.",
  },
  truly_shared: {
    expectedRecommendationQualityGain: "Low",
    maintenanceGain: "Low",
    regressionRisk: "Low",
    acceptanceCriteria: "No redesign; only regression protection and policy-config boundary checks.",
  },
  age_specific_by_necessity: {
    expectedRecommendationQualityGain: "None",
    maintenanceGain: "Low",
    regressionRisk: "High",
    acceptanceCriteria: "Capability remains separate; policy invariants and tests prevent accidental unification.",
  },
};

const capabilityNoveltyGate = {
  "Evidence-origin reconciliation audit": {
    title: "#101 novelty proof",
    rationale: "Prior Teen trusted-reconciliation counterfactual showed 0 weak-to-secondary promotions and no weak-underfill/slate improvements.",
    requiredBeforeImplementation: true,
    noveltyProofRequirements: [
      "List Adult production inputs/transformations not present in prior Teen trusted-reconciliation counterfactual.",
      "Identify newly available evidence fields and newly accepted provenance types (if any).",
      "Identify changed pipeline stage and whether behavior impacts acquisition/query continuation vs post-hoc reclassification.",
      "Provide candidate-level examples where evidence would differ and why prior 0-promotion result does not already falsify #101.",
    ],
    decisionRule: {
      noSubstantiveDifference: "Mark #101 as already falsified by prior counterfactual; skip production integration and continue with first parity-preserving consolidation.",
      substantiveDifference: "Run diagnostic corpus counterfactual for the new behavior and evaluate existing #101 acceptance criteria.",
      architecturalOnlyDifference: "Reclassify #101 as maintenance work, not recommendation-quality experiment.",
    },
  },
};

const capabilityOverrides = {
  "Evidence-origin reconciliation audit": {
    expectedRecommendationQualityGain: "TBD (novelty proof required)",
    proposedSharedPrimitive: "applyEvidenceOriginReconciliation({ candidate, signals, provenance, policy })",
    prerequisiteTests: [
      "run-v2-googlebooks-teen-evidence-origin-reconciliation-audit.mjs",
      "run-v2-googlebooks-teen-trusted-reconciliation-counterfactual.mjs",
      "run-v2-googlebooks-audience-maturity-separation-regressions.mjs",
      "run-v2-googlebooks-final-eligibility-regressions.mjs",
    ],
    agePolicyConfigurationRequired: "Teen provenance policy: forbid query/route/profile context; allow only candidate-native + verified metadata.",
    implementationOrderHint: 1,
    acceptanceCriteria: "Only if novelty is proven: counterfactual and production shadow mode both show reduced weak-underfill dependence with no publication-identity or maturity regressions.",
  },
  "Semantic phrase extraction": {
    proposedSharedPrimitive: "extractGoogleBooksSignalFieldMatches({ candidate, signalLexicon, policy })",
    prerequisiteTests: [
      "run-v2-googlebooks-short-signal-boundary-regressions.mjs",
      "run-v2-googlebooks-teen-weak-metadata-sufficiency-audit.mjs",
      "run-v2-googlebooks-query-quality-regressions.mjs",
    ],
    agePolicyConfigurationRequired: "Age-band lexicon + generic-context blacklist passed by config.",
    implementationOrderHint: 2,
  },
  "Canonical cue promotion": {
    proposedSharedPrimitive: "promoteCanonicalNarrativeCues({ extractedSignals, profile, policy })",
    prerequisiteTests: [
      "run-v2-googlebooks-narrative-strength-ranking-regressions.mjs",
      "run-v2-googlebooks-final-slate-identity-audit-regressions.mjs",
    ],
    agePolicyConfigurationRequired: "Family vocabulary and cue polarity map per age band.",
    implementationOrderHint: 3,
  },
  "Final slate identity auditing": {
    proposedSharedPrimitive: "auditFinalSlateIdentity({ candidate, eligibilityContext, policy })",
    prerequisiteTests: [
      "run-v2-googlebooks-final-slate-identity-audit-regressions.mjs",
      "run-v2-googlebooks-final-eligibility-regressions.mjs",
    ],
    agePolicyConfigurationRequired: "Identity rejection categories and confidence thresholds per age band.",
    implementationOrderHint: 4,
  },
  "Counterfactual final slate": {
    proposedSharedPrimitive: "simulateTieredFinalSlate({ candidates, tiers, minCleanCount, policy })",
    prerequisiteTests: [
      "run-v2-googlebooks-teen-taste-tier-audit.mjs",
      "run-v2-googlebooks-teen-trusted-reconciliation-counterfactual.mjs",
      "run-v2-googlebooks-teen-query-marginal-yield-audit.mjs",
    ],
    agePolicyConfigurationRequired: "Tier definitions and underfill policy per age band.",
    implementationOrderHint: 5,
  },
  "Query quality comparison": {
    proposedSharedPrimitive: "evaluateQueryQuality({ query, candidates, priorUnion, policy })",
    prerequisiteTests: [
      "run-v2-googlebooks-query-quality-regressions.mjs",
      "run-v2-googlebooks-teen-query-family-overlap-audit.mjs",
      "run-v2-googlebooks-teen-query-marginal-yield-audit.mjs",
    ],
    agePolicyConfigurationRequired: "Definition of decision-worthy candidate by age band.",
    implementationOrderHint: 6,
  },
  "Family-scoped query competition": {
    proposedSharedPrimitive: "rankQueryFamiliesByMarginalYield({ families, union, policy })",
    prerequisiteTests: [
      "run-v2-googlebooks-teen-query-family-overlap-audit.mjs",
      "run-v2-googlebooks-teen-query-marginal-yield-audit.mjs",
      "run-v2-googlebooks-query-quality-regressions.mjs",
    ],
    agePolicyConfigurationRequired: "Family competition objective function and early-stop policy.",
    implementationOrderHint: 7,
  },
  "Marginal decision-worthy yield": {
    proposedSharedPrimitive: "computeMarginalYield({ queryResult, priorUnion, classifications, policy })",
    prerequisiteTests: [
      "run-v2-googlebooks-teen-query-marginal-yield-audit.mjs",
      "run-v2-googlebooks-query-quality-regressions.mjs",
    ],
    agePolicyConfigurationRequired: "Decision-worthy class mapping per age band.",
    implementationOrderHint: 8,
  },
  "Query promotion / replacement": {
    proposedSharedPrimitive: "promoteOrReplaceQuery({ familyStats, cueStats, policy })",
    prerequisiteTests: [
      "run-v2-googlebooks-query-quality-regressions.mjs",
      "run-v2-googlebooks-teen-query-marginal-yield-audit.mjs",
    ],
    agePolicyConfigurationRequired: "Promotion thresholds and replacement policy.",
    implementationOrderHint: 9,
  },
  "Narrative-strength scoring": {
    proposedSharedPrimitive: "computeNarrativeStrengthScore({ candidate, policy })",
    prerequisiteTests: [
      "run-v2-googlebooks-narrative-strength-ranking-regressions.mjs",
      "run-v2-googlebooks-final-eligibility-regressions.mjs",
    ],
    agePolicyConfigurationRequired: "Component weights and minimum confidence per age band.",
    implementationOrderHint: 10,
  },
  "Meaningful taste tiers": {
    proposedSharedPrimitive: "classifyMeaningfulTasteTier({ signals, score, provenance, policy })",
    prerequisiteTests: [
      "run-v2-googlebooks-teen-taste-tier-audit.mjs",
      "run-v2-googlebooks-teen-weak-metadata-sufficiency-audit.mjs",
      "run-v2-googlebooks-final-eligibility-regressions.mjs",
    ],
    agePolicyConfigurationRequired: "Tier thresholds and provenance guardrails per age band.",
    implementationOrderHint: 11,
  },
  "Adult content weighting branch": {
    proposedSharedPrimitive: "applyAgeBandContentPolicy({ candidate, ageBandPolicy })",
    prerequisiteTests: [
      "run-v2-googlebooks-audience-maturity-separation-regressions.mjs",
      "run-v2-googlebooks-final-eligibility-regressions.mjs",
      "run-v2-googlebooks-age-band-infrastructure-audit-regressions.mjs",
    ],
    agePolicyConfigurationRequired: "Explicitly separate adult mature-content policy from teen safety policy.",
    implementationOrderHint: 99,
  },
};

const planRows = rows.map((r) => {
  const base = classDefaults[r.behavioralClassification] || {
    expectedRecommendationQualityGain: "Unknown",
    maintenanceGain: "Unknown",
    regressionRisk: "Unknown",
    acceptanceCriteria: "Define acceptance criteria",
  };
  const ov = capabilityOverrides[r.capability] || {};
  const noveltyGate = capabilityNoveltyGate[r.capability] || null;

  const implementationOrder = (classOrder[r.behavioralClassification] || 999) * 100 + Number(ov.implementationOrderHint || 50);

  const is101 = r.capability === "Evidence-origin reconciliation audit";
  const closedFalsified = is101 && noveltyCloses101;

  return {
    capability: r.capability,
    behavioralClass: r.behavioralClassification,
    behavioralClassLabel: classLabel[r.behavioralClassification] || r.behavioralClassification,
    expectedRecommendationQualityGain: closedFalsified
      ? "None (falsified)"
      : (ov.expectedRecommendationQualityGain || base.expectedRecommendationQualityGain),
    maintenanceGain: ov.maintenanceGain || base.maintenanceGain,
    regressionRisk: ov.regressionRisk || base.regressionRisk,
    productionStatus: `adult=${r.productionStatus?.adult || "unknown"}; teen=${r.productionStatus?.teen || "unknown"}`,
    prerequisiteTests: ov.prerequisiteTests || [
      "run-v2-googlebooks-final-eligibility-regressions.mjs",
      "run-v2-googlebooks-query-quality-regressions.mjs",
    ],
    proposedSharedPrimitive: ov.proposedSharedPrimitive || `unify${r.capability.replace(/[^a-zA-Z0-9]+/g, "")}`,
    agePolicyConfigurationRequired: ov.agePolicyConfigurationRequired || "Age-band policy object for thresholds/vocabulary/provenance rules.",
    implementationOrder,
    acceptanceCriteria: closedFalsified
      ? "Not applicable. Closed by Phase 0 novelty proof (noSubstantiveDifference)."
      : (ov.acceptanceCriteria || base.acceptanceCriteria),
    recommendation: closedFalsified
      ? "Closed/falsified. Skip implementation and proceed to first parity-preserving consolidation."
      : r.recommendation,
    stage: r.stage,
    effectSurface: r.effectSurface,
    preflightCheckpoint: noveltyGate,
    executionStatus: closedFalsified ? "closed_falsified" : "pending",
    active: !closedFalsified,
  };
});

planRows.sort((a, b) => {
  if (a.active !== b.active) return a.active ? -1 : 1;
  return a.implementationOrder - b.implementationOrder || a.capability.localeCompare(b.capability);
});

const activeRows = planRows.filter((row) => row.active);
const closedRows = planRows.filter((row) => !row.active);

const summary = {
  total: planRows.length,
  activeCount: activeRows.length,
  closedFalsifiedCount: closedRows.length,
  noveltyProofApplied: noveltyCloses101,
  noveltyProofDecision: noveltyProof?.decisionRuleResolution || "not_available",
  byBehavioralClass: planRows.reduce((acc, row) => {
    acc[row.behavioralClass] = Number(acc[row.behavioralClass] || 0) + 1;
    return acc;
  }, {}),
  executionPhases: [
    noveltyCloses101
      ? "0. #101 closed/falsified by novelty proof (noSubstantiveDifference)"
      : "0. #101 novelty proof gate (must pass before any Adult-production/Teen-diagnostic integration work)",
    noveltyCloses101
      ? "1. Proceed to first behaviorally equivalent duplication consolidation"
      : "1. Adult production / Teen diagnostic integration experiment (only if #101 novelty gate passes)",
    "2. Behaviorally equivalent duplication consolidations (parity-preserving)",
    "3. Shared interface contracts for same-name/different-semantics capabilities",
    "4. Regression-protect already shared capabilities",
    "5. Preserve age-specific policy branch",
  ],
};

console.log("=== GOOGLE BOOKS CONSOLIDATION EXECUTION PLAN ===");
console.log(`Capabilities planned: ${summary.total}`);
console.log(`Active items: ${summary.activeCount}`);
console.log(`Closed/falsified items: ${summary.closedFalsifiedCount}`);
console.log("Execution phases:");
for (const phase of summary.executionPhases) console.log(`  ${phase}`);
console.log("\nTop-ranked work items:");
for (const row of activeRows.slice(0, 8)) {
  console.log(`  #${row.implementationOrder} ${row.capability} | ${row.behavioralClassLabel} | gain=${row.expectedRecommendationQualityGain} risk=${row.regressionRisk}`);
}

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "googlebooks-consolidation-execution-plan.json");
const csvOut = resolve(outDir, "googlebooks-consolidation-execution-plan.csv");

writeFileSync(jsonOut, JSON.stringify({
  generatedAt: new Date().toISOString(),
  sourceAudit: "googlebooks-behavioral-equivalence-audit.json",
  summary,
  rows: planRows,
}, null, 2));

const csvHeader = [
  "implementationOrder",
  "capability",
  "behavioralClass",
  "behavioralClassLabel",
  "expectedRecommendationQualityGain",
  "maintenanceGain",
  "regressionRisk",
  "productionStatus",
  "stage",
  "effectSurface",
  "proposedSharedPrimitive",
  "agePolicyConfigurationRequired",
  "prerequisiteTests",
  "executionStatus",
  "active",
  "preflightCheckpointRequired",
  "preflightCheckpointTitle",
  "noveltyProofRequirements",
  "preflightDecisionRule",
  "acceptanceCriteria",
  "recommendation",
].join(",");

const csvRows = planRows.map((r) => [
  r.implementationOrder,
  `"${r.capability.replace(/"/g, '""')}"`,
  r.behavioralClass,
  `"${r.behavioralClassLabel.replace(/"/g, '""')}"`,
  r.expectedRecommendationQualityGain,
  r.maintenanceGain,
  r.regressionRisk,
  `"${r.productionStatus.replace(/"/g, '""')}"`,
  `"${r.stage.replace(/"/g, '""')}"`,
  `"${r.effectSurface.replace(/"/g, '""')}"`,
  `"${r.proposedSharedPrimitive.replace(/"/g, '""')}"`,
  `"${r.agePolicyConfigurationRequired.replace(/"/g, '""')}"`,
  `"${r.prerequisiteTests.join(" | ").replace(/"/g, '""')}"`,
  r.executionStatus,
  r.active ? "true" : "false",
  r.preflightCheckpoint ? "yes" : "no",
  `"${(r.preflightCheckpoint?.title || "").replace(/"/g, '""')}"`,
  `"${(r.preflightCheckpoint?.noveltyProofRequirements || []).join(" | ").replace(/"/g, '""')}"`,
  `"${(r.preflightCheckpoint ? Object.entries(r.preflightCheckpoint.decisionRule).map(([k, v]) => `${k}: ${v}`).join(" || ") : "").replace(/"/g, '""')}"`,
  `"${r.acceptanceCriteria.replace(/"/g, '""')}"`,
  `"${r.recommendation.replace(/"/g, '""')}"`,
].join(","));
writeFileSync(csvOut, [csvHeader, ...csvRows].join("\n"));

console.log(`\nJSON written to: ${jsonOut}`);
console.log(`CSV written to: ${csvOut}`);
