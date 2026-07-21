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
const parity202Path = resolve(outDir, "googlebooks-202-parity-compare.json");
const parity202 = existsSync(parity202Path)
  ? JSON.parse(readFileSync(parity202Path, "utf8"))
  : null;
const parityBaselinePath = resolve(outDir, "googlebooks-202-parity-baseline.json");
const parityBaseline = existsSync(parityBaselinePath)
  ? JSON.parse(readFileSync(parityBaselinePath, "utf8"))
  : null;
const parity202Signature = String(parityBaseline?.signatures?.overallBaseline || "");
const parity202Verified = parity202?.verdict === "PARITY_PASSED"
  && Number(parity202?.failedChecks || 0) === 0
  && parityBaseline?.baselineComplete === true
  && parity202Signature === "bcea3ee2e21ffbee";
const cue203GatePath = resolve(outDir, "googlebooks-203-canonical-cue-equivalence-gate.json");
const cue203Gate = existsSync(cue203GatePath)
  ? JSON.parse(readFileSync(cue203GatePath, "utf8"))
  : null;
const cue203Decision = String(cue203Gate?.decision?.decision || "");
const cue203Reclassify = cue203Decision === "materially_different_behavior_reclassify";
const identity204GatePath = resolve(outDir, "googlebooks-204-final-slate-identity-role-gate.json");
const identity204Gate = existsSync(identity204GatePath)
  ? JSON.parse(readFileSync(identity204GatePath, "utf8"))
  : null;
const identity204Decision = String(identity204Gate?.decision?.decision || "");
const identity204AsDifferentSemantics = identity204Decision === "adult_production_audit_teen_eligibility_policy"
  || identity204Decision === "shared_classifier_age_specific_enforcement";
const identity204AsAgeSpecific = identity204Decision === "adult_only_capability_age_specific";

function confidenceStateForRow(row) {
  if (row.executionStatus === "closed_falsified") return "Falsified";
  if (row.executionStatus === "implemented_proven") return "Proven";
  if (row.behavioralClass === "behaviorally_equivalent_duplication") return "Architectural";
  if (row.behavioralClass === "truly_shared") return "Architectural";
  if (row.behavioralClass === "age_specific_by_necessity") return "Architectural";
  if (row.behavioralClass === "same_name_different_semantics") return "Hypothesis";
  if (row.behavioralClass === "adult_production_teen_diagnostic") return "Supported";
  return "Hypothesis";
}

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
  const effectiveBehavioralClass = r.capability === "Canonical cue promotion" && cue203Reclassify
    ? "same_name_different_semantics"
    : r.capability === "Final slate identity auditing" && identity204AsDifferentSemantics
      ? "same_name_different_semantics"
      : r.capability === "Final slate identity auditing" && identity204AsAgeSpecific
        ? "age_specific_by_necessity"
        : r.behavioralClassification;
  const base = classDefaults[r.behavioralClassification] || {
    expectedRecommendationQualityGain: "Unknown",
    maintenanceGain: "Unknown",
    regressionRisk: "Unknown",
    acceptanceCriteria: "Define acceptance criteria",
  };
  const ov = capabilityOverrides[r.capability] || {};
  const noveltyGate = capabilityNoveltyGate[r.capability] || null;

  const effectiveBase = classDefaults[effectiveBehavioralClass] || base;
  const implementationOrderHint = r.capability === "Canonical cue promotion" && cue203Reclassify
    ? 3
    : r.capability === "Final slate identity auditing" && (identity204AsDifferentSemantics || identity204AsAgeSpecific)
      ? 4
    : Number(ov.implementationOrderHint || 50);
  const implementationOrder = (classOrder[effectiveBehavioralClass] || 999) * 100 + implementationOrderHint;

  const is101 = r.capability === "Evidence-origin reconciliation audit";
  const closedFalsified = is101 && noveltyCloses101;
  const is202 = r.capability === "Semantic phrase extraction";
  const completed202 = is202 && parity202Verified;

  return {
    capability: r.capability,
    behavioralClass: effectiveBehavioralClass,
    behavioralClassLabel: classLabel[effectiveBehavioralClass] || effectiveBehavioralClass,
    expectedRecommendationQualityGain: closedFalsified
      ? "None (falsified)"
      : (ov.expectedRecommendationQualityGain || effectiveBase.expectedRecommendationQualityGain),
    maintenanceGain: ov.maintenanceGain || effectiveBase.maintenanceGain,
    regressionRisk: ov.regressionRisk || effectiveBase.regressionRisk,
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
      : (ov.acceptanceCriteria || effectiveBase.acceptanceCriteria),
    recommendation: closedFalsified
      ? "Closed/falsified. Skip implementation and proceed to first parity-preserving consolidation."
      : r.capability === "Canonical cue promotion" && cue203Reclassify
        ? "Reclassified by #203 equivalence gate: define shared interface/mechanism only; do not force parity-preserving consolidation."
        : r.capability === "Final slate identity auditing" && identity204AsDifferentSemantics
          ? "Reclassified by #204 role gate: treat as shared identity-assessment contract with separate age-policy enforcement; do not force parity-preserving consolidation."
          : r.capability === "Final slate identity auditing" && identity204AsAgeSpecific
            ? "Reclassified by #204 role gate: keep age-specific (adult-focused) and remove from active consolidation."
        : r.recommendation,
    stage: r.stage,
    effectSurface: r.effectSurface,
    preflightCheckpoint: noveltyGate,
    executionStatus: closedFalsified
      ? "closed_falsified"
      : completed202
        ? "completed"
        : "pending",
    active: !(closedFalsified || completed202),
    confidenceState: "Hypothesis",
    behaviorChange: completed202 ? "none" : "unknown",
    parityVerified: completed202,
    parityBaselineSignature: is202 ? parity202Signature || null : null,
    implementationCommit: completed202
      ? (String(parity202?.candidateCommit || "").trim() || null)
      : null,
    reclassificationEvidence: r.capability === "Canonical cue promotion"
      ? {
          gateArtifact: existsSync(cue203GatePath) ? "googlebooks-203-canonical-cue-equivalence-gate.json" : null,
          gateDecision: cue203Decision || null,
          rationale: cue203Gate?.decision?.rationale || null,
        }
      : r.capability === "Final slate identity auditing"
        ? {
            gateArtifact: existsSync(identity204GatePath) ? "googlebooks-204-final-slate-identity-role-gate.json" : null,
            gateDecision: identity204Decision || null,
            rationale: identity204Gate?.decision?.rationale || null,
          }
      : null,
  };
});

for (const row of planRows) {
  row.confidenceState = confidenceStateForRow(row);
}

planRows.sort((a, b) => {
  if (a.active !== b.active) return a.active ? -1 : 1;
  return a.implementationOrder - b.implementationOrder || a.capability.localeCompare(b.capability);
});

const activeRows = planRows.filter((row) => row.active);
const closedRows = planRows.filter((row) => !row.active);
const nextActive = activeRows[0] || null;

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
  byConfidenceState: planRows.reduce((acc, row) => {
    acc[row.confidenceState] = Number(acc[row.confidenceState] || 0) + 1;
    return acc;
  }, {}),
  nextActiveCapability: nextActive
    ? {
        capability: nextActive.capability,
        implementationOrder: nextActive.implementationOrder,
        confidenceState: nextActive.confidenceState,
        executionStatus: nextActive.executionStatus,
      }
    : null,
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
console.log(`Next active item: ${summary.nextActiveCapability ? `#${summary.nextActiveCapability.implementationOrder} ${summary.nextActiveCapability.capability}` : "none"}`);
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
  "confidenceState",
  "behaviorChange",
  "parityVerified",
  "parityBaselineSignature",
  "implementationCommit",
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
  r.confidenceState,
  r.behaviorChange,
  r.parityVerified ? "true" : "false",
  `"${String(r.parityBaselineSignature || "").replace(/"/g, '""')}"`,
  `"${String(r.implementationCommit || "").replace(/"/g, '""')}"`,
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
