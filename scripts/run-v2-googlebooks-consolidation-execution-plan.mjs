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
const cue303GatePath = resolve(outDir, "googlebooks-303-canonical-cue-semantic-boundary-gate.json");
const cue303Gate = existsSync(cue303GatePath)
  ? JSON.parse(readFileSync(cue303GatePath, "utf8"))
  : null;
const cue303Decision = String(cue303Gate?.decision?.decision || "");
const cue303AsParityCandidate = cue303Decision === "parity_candidate";
const cue303AsAgeSpecific = cue303Decision === "adult_only_canonicalization_capability";
const cue303AsSemanticSplit = cue303Decision === "policy_contaminated_transform_split";
const cue303AsSharedTransform = cue303Decision === "shared_semantic_transform_with_age_specific_policy_wrappers";
const identity204GatePath = resolve(outDir, "googlebooks-204-final-slate-identity-role-gate.json");
const identity204Gate = existsSync(identity204GatePath)
  ? JSON.parse(readFileSync(identity204GatePath, "utf8"))
  : null;
const identity204Decision = String(identity204Gate?.decision?.decision || "");
const identity204AsDifferentSemantics = identity204Decision === "adult_production_audit_teen_eligibility_policy"
  || identity204Decision === "shared_classifier_age_specific_enforcement";
const identity204AsAgeSpecific = identity204Decision === "adult_only_capability_age_specific";
const counterfactual205GatePath = resolve(outDir, "googlebooks-205-counterfactual-final-slate-role-gate.json");
const counterfactual205Gate = existsSync(counterfactual205GatePath)
  ? JSON.parse(readFileSync(counterfactual205GatePath, "utf8"))
  : null;
const counterfactual205Decision = String(counterfactual205Gate?.decision?.decision || "");
const counterfactual205AsDifferentSemantics = counterfactual205Decision === "different_hypothetical_questions"
  || counterfactual205Decision === "same_counterfactual_engine_different_policy_parameters";
const counterfactual205AsAdultProductionTeenDiagnostic = counterfactual205Decision === "adult_production_teen_diagnostic_only";
const queryQuality306GatePath = resolve(outDir, "googlebooks-306-query-quality-role-gate.json");
const queryQuality306Gate = existsSync(queryQuality306GatePath)
  ? JSON.parse(readFileSync(queryQuality306GatePath, "utf8"))
  : null;
const queryQuality306Decision = String(queryQuality306Gate?.decision?.decision || "");
const queryQuality306AsEquivalent = queryQuality306Decision === "equivalent_duplication";
const queryQuality306AsDifferent = queryQuality306Decision === "different_pipeline_layer";
const queryQuality306AsSharedMechanismDifferentPolicy = queryQuality306Decision === "shared_mechanism_age_policy_outputs";
const familyCompetition307GatePath = resolve(outDir, "googlebooks-307-family-query-competition-role-gate.json");
const familyCompetition307Gate = existsSync(familyCompetition307GatePath)
  ? JSON.parse(readFileSync(familyCompetition307GatePath, "utf8"))
  : null;
const familyCompetition307Decision = String(familyCompetition307Gate?.decision?.decision || "");
const familyCompetition307AsEquivalent = familyCompetition307Decision === "equivalent_duplication";
const familyCompetition307AsSharedMechanism = familyCompetition307Decision === "shared_mechanism_age_policy_outputs";
const familyCompetition307AsDifferent = familyCompetition307Decision === "different_pipeline_layer";
const marginal308GatePath = resolve(outDir, "googlebooks-308-marginal-yield-role-gate.json");
const marginal308Gate = existsSync(marginal308GatePath)
  ? JSON.parse(readFileSync(marginal308GatePath, "utf8"))
  : null;
const marginal308Decision = String(marginal308Gate?.decision?.decision || "");
const marginal308AsEquivalent = marginal308Decision === "equivalent_duplication";
const marginal308AsSharedMechanism = marginal308Decision === "shared_mechanism_age_policy_outputs";
const marginal308AsDifferentQuestions = marginal308Decision === "different_hypothetical_questions";
const queryPromotion409GatePath = resolve(outDir, "googlebooks-409-query-promotion-replacement-role-gate.json");
const queryPromotion409Gate = existsSync(queryPromotion409GatePath)
  ? JSON.parse(readFileSync(queryPromotion409GatePath, "utf8"))
  : null;
const queryPromotion409Decision = String(queryPromotion409Gate?.decision?.decision || "");
const queryPromotion409AsEquivalent = queryPromotion409Decision === "equivalent_duplication";
const queryPromotion409AsSharedMechanism = queryPromotion409Decision === "shared_mechanism_age_policy_outputs";
const narrative410GatePath = resolve(outDir, "googlebooks-410-narrative-strength-role-gate.json");
const narrative410Gate = existsSync(narrative410GatePath)
  ? JSON.parse(readFileSync(narrative410GatePath, "utf8"))
  : null;
const narrative410Decision = String(narrative410Gate?.decision?.decision || "");
const narrative410AsEquivalent = narrative410Decision === "equivalent_duplication";
const narrative410AsSharedMechanism = narrative410Decision === "shared_mechanism_age_policy_outputs";
const narrative410AsDifferent = narrative410Decision === "different_pipeline_layer";
const taste411GatePath = resolve(outDir, "googlebooks-411-meaningful-taste-tiers-role-gate.json");
const taste411Gate = existsSync(taste411GatePath)
  ? JSON.parse(readFileSync(taste411GatePath, "utf8"))
  : null;
const taste411Decision = String(taste411Gate?.decision?.decision || "");
const taste411AsEquivalent = taste411Decision === "equivalent_duplication";
const taste411AsSharedMechanism = taste411Decision === "shared_mechanism_age_policy_outputs";
const taste411AsDifferentQuestions = taste411Decision === "different_hypothetical_questions";
const content599GatePath = resolve(outDir, "googlebooks-599-adult-content-weighting-branch-role-gate.json");
const content599Gate = existsSync(content599GatePath)
  ? JSON.parse(readFileSync(content599GatePath, "utf8"))
  : null;
const content599Decision = String(content599Gate?.decision?.decision || "");
const content599AsAgeSpecific = content599Decision === "adult_only_capability_age_specific";

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

function architectureClassificationForRow(row) {
  if (row.executionStatus === "closed_falsified") return "Falsified";
  if (row.reclassificationEvidence?.gateDecision === "shared_mechanism_age_policy_outputs") return "Mechanism";
  if (row.behavioralClass === "behaviorally_equivalent_duplication") return "Primitive";
  if (row.behavioralClass === "truly_shared") return "Primitive";
  if (row.behavioralClass === "adult_production_teen_diagnostic") return "Interface";
  if (row.behavioralClass === "same_name_different_semantics") return "Divergence";
  if (row.behavioralClass === "age_specific_by_necessity") return "Pipeline";
  return "Divergence";
}

function architectureEvidenceForRow(row) {
  if (row.executionStatus === "closed_falsified") return "googlebooks-101-novelty-proof.json";
  if (row.capability === "Semantic phrase extraction" && row.parityVerified) {
    return "googlebooks-202-parity-baseline.json + googlebooks-202-parity-compare.json";
  }
  if (row.reclassificationEvidence?.gateArtifact) return String(row.reclassificationEvidence.gateArtifact);
  return "googlebooks-behavioral-equivalence-audit.json";
}

function architectureStabilityForRow(row) {
  if (row.reclassificationEvidence?.gateDecision === "shared_mechanism_age_policy_outputs") {
    return "Query-quality telemetry collection and core metrics are shared, while age-band policy interpretation diverges downstream.";
  }
  if (row.capability === "Canonical cue promotion") {
    return "Adult and Teen currently derive different canonical evidence records from the same documents before policy (validated by #303 semantic-boundary and semantic-core-only gates).";
  }
  if (row.executionStatus === "closed_falsified") {
    return "Prior counterfactual and novelty-proof outcomes show no substantive untested behavior difference.";
  }
  if (row.capability === "Semantic phrase extraction" && row.parityVerified) {
    return "Parity signature is locked and comparator enforces zero-drift behavior.";
  }
  if (row.behavioralClass === "same_name_different_semantics") {
    return "Role/equivalence gates show similar naming but materially different semantics or decision boundaries.";
  }
  if (row.behavioralClass === "adult_production_teen_diagnostic") {
    return "Shared concept exists but operational responsibilities differ between age bands.";
  }
  if (row.behavioralClass === "age_specific_by_necessity") {
    return "Capability is intentionally age-specific and tied to policy constraints.";
  }
  return "Current evidence indicates stable shared behavior under existing policy boundaries.";
}

function architectureFutureTriggerForRow(row) {
  if (row.reclassificationEvidence?.gateDecision === "shared_mechanism_age_policy_outputs") {
    return "Reopen if age-band quality interpretation is unified or query-quality policy moves into a single cross-band decision model.";
  }
  if (row.executionStatus === "closed_falsified") {
    return "Reopen only if upstream architecture introduces new evidence channels or stage placement that invalidates novelty assumptions.";
  }
  if (row.capability === "Canonical cue promotion") {
    return "Reopen only if recommendation philosophy is unified or a new shared semantic ontology replaces age-specific cue models.";
  }
  if (row.capability === "Semantic phrase extraction" && row.parityVerified) {
    return "Reopen if lexicon/token-boundary architecture changes or parity signature drift is intentionally introduced.";
  }
  if (row.behavioralClass === "same_name_different_semantics") {
    return "Reopen if policy wrappers are redesigned around a shared semantic contract with deterministic parity evidence.";
  }
  if (row.behavioralClass === "adult_production_teen_diagnostic") {
    return "Reopen if both age bands adopt the same production responsibility at the same pipeline stage.";
  }
  if (row.behavioralClass === "age_specific_by_necessity") {
    return "Reopen only if age-band policy separation is intentionally removed.";
  }
  return "Reopen when new deterministic evidence indicates changed semantic or behavioral boundaries.";
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
  const effectiveBehavioralClass = r.capability === "Canonical cue promotion" && cue303AsParityCandidate
    ? "behaviorally_equivalent_duplication"
    : r.capability === "Canonical cue promotion" && cue303AsAgeSpecific
      ? "age_specific_by_necessity"
      : r.capability === "Canonical cue promotion" && (cue303AsSemanticSplit || cue303AsSharedTransform || cue203Reclassify)
        ? "same_name_different_semantics"
      : r.capability === "Final slate identity auditing" && identity204AsDifferentSemantics
      ? "same_name_different_semantics"
      : r.capability === "Final slate identity auditing" && identity204AsAgeSpecific
        ? "age_specific_by_necessity"
        : r.capability === "Counterfactual final slate" && counterfactual205AsDifferentSemantics
          ? "same_name_different_semantics"
          : r.capability === "Counterfactual final slate" && counterfactual205AsAdultProductionTeenDiagnostic
            ? "adult_production_teen_diagnostic"
              : r.capability === "Query quality comparison" && queryQuality306AsEquivalent
                ? "behaviorally_equivalent_duplication"
                : r.capability === "Query quality comparison" && queryQuality306AsDifferent
                  ? "same_name_different_semantics"
                  : r.capability === "Query quality comparison" && queryQuality306AsSharedMechanismDifferentPolicy
                    ? "same_name_different_semantics"
                    : r.capability === "Family-scoped query competition" && familyCompetition307AsEquivalent
                      ? "behaviorally_equivalent_duplication"
                      : r.capability === "Family-scoped query competition" && (familyCompetition307AsSharedMechanism || familyCompetition307AsDifferent)
                        ? "same_name_different_semantics"
                        : r.capability === "Marginal decision-worthy yield" && marginal308AsEquivalent
                          ? "behaviorally_equivalent_duplication"
                          : r.capability === "Marginal decision-worthy yield" && (marginal308AsSharedMechanism || marginal308AsDifferentQuestions)
                            ? "same_name_different_semantics"
                            : r.capability === "Query promotion / replacement" && queryPromotion409AsEquivalent
                              ? "behaviorally_equivalent_duplication"
                              : r.capability === "Query promotion / replacement" && queryPromotion409AsSharedMechanism
                                ? "same_name_different_semantics"
                                : r.capability === "Narrative-strength scoring" && narrative410AsEquivalent
                                  ? "behaviorally_equivalent_duplication"
                                  : r.capability === "Narrative-strength scoring" && (narrative410AsSharedMechanism || narrative410AsDifferent)
                                    ? "same_name_different_semantics"
                                    : r.capability === "Meaningful taste tiers" && taste411AsEquivalent
                                      ? "behaviorally_equivalent_duplication"
                                      : r.capability === "Meaningful taste tiers" && (taste411AsSharedMechanism || taste411AsDifferentQuestions)
                                        ? "same_name_different_semantics"
                                        : r.capability === "Adult content weighting branch" && content599AsAgeSpecific
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
  const implementationOrderHint = r.capability === "Canonical cue promotion" && (cue303AsSemanticSplit || cue303AsSharedTransform || cue303AsAgeSpecific || cue303AsParityCandidate || cue203Reclassify)
    ? 3
    : r.capability === "Final slate identity auditing" && (identity204AsDifferentSemantics || identity204AsAgeSpecific)
      ? 4
      : r.capability === "Counterfactual final slate" && (counterfactual205AsDifferentSemantics || counterfactual205AsAdultProductionTeenDiagnostic)
        ? 5
      : r.capability === "Query quality comparison" && (queryQuality306AsEquivalent || queryQuality306AsDifferent || queryQuality306AsSharedMechanismDifferentPolicy)
        ? 6
      : r.capability === "Family-scoped query competition" && (familyCompetition307AsEquivalent || familyCompetition307AsSharedMechanism || familyCompetition307AsDifferent)
        ? 7
      : r.capability === "Marginal decision-worthy yield" && (marginal308AsEquivalent || marginal308AsSharedMechanism || marginal308AsDifferentQuestions)
        ? 8
      : r.capability === "Query promotion / replacement" && (queryPromotion409AsEquivalent || queryPromotion409AsSharedMechanism)
        ? 9
      : r.capability === "Narrative-strength scoring" && (narrative410AsEquivalent || narrative410AsSharedMechanism || narrative410AsDifferent)
        ? 10
      : r.capability === "Meaningful taste tiers" && (taste411AsEquivalent || taste411AsSharedMechanism || taste411AsDifferentQuestions)
        ? 11
      : r.capability === "Adult content weighting branch" && content599AsAgeSpecific
        ? 99
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
      : r.capability === "Canonical cue promotion" && cue303AsParityCandidate
        ? "Reclassified by #303 semantic-boundary gate: detection+normalization are parity-compatible; proceed only with narrow shared transform extraction."
        : r.capability === "Canonical cue promotion" && cue303AsAgeSpecific
          ? "Reclassified by #303 semantic-boundary gate: canonicalization remains age-specific and should not be consolidated."
          : r.capability === "Canonical cue promotion" && cue303AsSharedTransform
            ? "Reclassified by #303 semantic-boundary gate: extract only shared detection/normalization transform with separate age-policy wrappers."
            : r.capability === "Canonical cue promotion" && (cue303AsSemanticSplit || cue203Reclassify)
              ? "Reclassified by #303 semantic-boundary gate: policy-contaminated semantic split; do not force parity-preserving consolidation."
        : r.capability === "Final slate identity auditing" && identity204AsDifferentSemantics
          ? "Reclassified by #204 role gate: treat as shared identity-assessment contract with separate age-policy enforcement; do not force parity-preserving consolidation."
          : r.capability === "Final slate identity auditing" && identity204AsAgeSpecific
            ? "Reclassified by #204 role gate: keep age-specific (adult-focused) and remove from active consolidation."
            : r.capability === "Counterfactual final slate" && counterfactual205AsDifferentSemantics
              ? "Reclassified by #205 role gate: Adult and Teen counterfactuals answer different hypothetical questions; define contract only and avoid parity-preserving consolidation."
              : r.capability === "Counterfactual final slate" && counterfactual205AsAdultProductionTeenDiagnostic
                ? "Reclassified by #205 role gate: treat as adult-production/teen-diagnostic asymmetry."
                : r.capability === "Query quality comparison" && queryQuality306AsEquivalent
                  ? "Reclassified by #306 role gate: Adult and Teen query-quality diagnostics are equivalent retrieval-stage outputs and can be treated as a shared primitive candidate."
                  : r.capability === "Query quality comparison" && queryQuality306AsSharedMechanismDifferentPolicy
                    ? "Reclassified by #306 role gate: shared query-quality mechanism with age-specific policy output differences; keep separate wrappers."
                    : r.capability === "Query quality comparison" && queryQuality306AsDifferent
                      ? "Reclassified by #306 role gate: different query-quality responsibilities/pipeline layer; do not force consolidation."
                      : r.capability === "Family-scoped query competition" && familyCompetition307AsEquivalent
                        ? "Reclassified by #307 role gate: family-competition outputs are equivalent and can be treated as shared primitive candidate."
                        : r.capability === "Family-scoped query competition" && familyCompetition307AsSharedMechanism
                          ? "Reclassified by #307 role gate: family competition uses shared mechanism with age-specific interpretation."
                          : r.capability === "Family-scoped query competition" && familyCompetition307AsDifferent
                            ? "Reclassified by #307 role gate: family competition is not equivalent across bands; keep separate semantics."
                            : r.capability === "Marginal decision-worthy yield" && marginal308AsEquivalent
                              ? "Reclassified by #308 role gate: marginal-yield outputs are equivalent and parity-consolidation is plausible."
                              : r.capability === "Marginal decision-worthy yield" && marginal308AsSharedMechanism
                                ? "Reclassified by #308 role gate: shared marginal-yield mechanism with age-specific policy interpretation."
                                : r.capability === "Marginal decision-worthy yield" && marginal308AsDifferentQuestions
                                  ? "Reclassified by #308 role gate: Adult and Teen marginal-yield analyses answer different questions; keep separate."
                                  : r.capability === "Query promotion / replacement" && queryPromotion409AsEquivalent
                                    ? "Reclassified by #409 role gate: query promotion/replacement is parity-equivalent and can be shared."
                                    : r.capability === "Query promotion / replacement" && queryPromotion409AsSharedMechanism
                                      ? "Reclassified by #409 role gate: query promotion/replacement runs on a shared mechanism with age-specific policy interpretation."
                                      : r.capability === "Narrative-strength scoring" && narrative410AsEquivalent
                                        ? "Reclassified by #410 role gate: narrative-strength scoring is parity-equivalent and can be shared."
                                        : r.capability === "Narrative-strength scoring" && narrative410AsSharedMechanism
                                          ? "Reclassified by #410 role gate: narrative-strength mechanism is shared but policy usage differs."
                                          : r.capability === "Narrative-strength scoring" && narrative410AsDifferent
                                            ? "Reclassified by #410 role gate: narrative-strength responsibilities are in different pipeline layers."
                                            : r.capability === "Meaningful taste tiers" && taste411AsEquivalent
                                              ? "Reclassified by #411 role gate: meaningful taste tiers are equivalent and parity-consolidation is plausible."
                                              : r.capability === "Meaningful taste tiers" && taste411AsSharedMechanism
                                                ? "Reclassified by #411 role gate: shared meaningful-taste mechanism with age-specific tier policy."
                                                : r.capability === "Meaningful taste tiers" && taste411AsDifferentQuestions
                                                  ? "Reclassified by #411 role gate: meaningful taste tiers answer different age-band questions."
                                                  : r.capability === "Adult content weighting branch" && content599AsAgeSpecific
                                                    ? "Reclassified by #599 role gate: keep adult content weighting as explicit age-specific policy branch."
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
          gateArtifact: existsSync(cue303GatePath)
            ? "googlebooks-303-canonical-cue-semantic-boundary-gate.json"
            : existsSync(cue203GatePath)
              ? "googlebooks-203-canonical-cue-equivalence-gate.json"
              : null,
          gateDecision: (cue303Decision || cue203Decision || null),
          rationale: cue303Gate?.decision?.rationale || cue203Gate?.decision?.rationale || null,
        }
      : r.capability === "Final slate identity auditing"
        ? {
            gateArtifact: existsSync(identity204GatePath) ? "googlebooks-204-final-slate-identity-role-gate.json" : null,
            gateDecision: identity204Decision || null,
            rationale: identity204Gate?.decision?.rationale || null,
          }
        : r.capability === "Counterfactual final slate"
          ? {
              gateArtifact: existsSync(counterfactual205GatePath) ? "googlebooks-205-counterfactual-final-slate-role-gate.json" : null,
              gateDecision: counterfactual205Decision || null,
              rationale: counterfactual205Gate?.decision?.rationale || null,
            }
          : r.capability === "Query quality comparison"
            ? {
                gateArtifact: existsSync(queryQuality306GatePath) ? "googlebooks-306-query-quality-role-gate.json" : null,
                gateDecision: queryQuality306Decision || null,
                rationale: queryQuality306Gate?.decision?.rationale || null,
              }
            : r.capability === "Family-scoped query competition"
              ? {
                  gateArtifact: existsSync(familyCompetition307GatePath) ? "googlebooks-307-family-query-competition-role-gate.json" : null,
                  gateDecision: familyCompetition307Decision || null,
                  rationale: familyCompetition307Gate?.decision?.rationale || null,
                }
              : r.capability === "Marginal decision-worthy yield"
                ? {
                    gateArtifact: existsSync(marginal308GatePath) ? "googlebooks-308-marginal-yield-role-gate.json" : null,
                    gateDecision: marginal308Decision || null,
                    rationale: marginal308Gate?.decision?.rationale || null,
                  }
                : r.capability === "Query promotion / replacement"
                  ? {
                      gateArtifact: existsSync(queryPromotion409GatePath) ? "googlebooks-409-query-promotion-replacement-role-gate.json" : null,
                      gateDecision: queryPromotion409Decision || null,
                      rationale: queryPromotion409Gate?.decision?.rationale || null,
                    }
                  : r.capability === "Narrative-strength scoring"
                    ? {
                        gateArtifact: existsSync(narrative410GatePath) ? "googlebooks-410-narrative-strength-role-gate.json" : null,
                        gateDecision: narrative410Decision || null,
                        rationale: narrative410Gate?.decision?.rationale || null,
                      }
                    : r.capability === "Meaningful taste tiers"
                      ? {
                          gateArtifact: existsSync(taste411GatePath) ? "googlebooks-411-meaningful-taste-tiers-role-gate.json" : null,
                          gateDecision: taste411Decision || null,
                          rationale: taste411Gate?.decision?.rationale || null,
                        }
                      : r.capability === "Adult content weighting branch"
                        ? {
                            gateArtifact: existsSync(content599GatePath) ? "googlebooks-599-adult-content-weighting-branch-role-gate.json" : null,
                            gateDecision: content599Decision || null,
                            rationale: content599Gate?.decision?.rationale || null,
                          }
      : null,
  };
});

for (const row of planRows) {
  row.confidenceState = confidenceStateForRow(row);
  row.architectureClassification = architectureClassificationForRow(row);
  row.architectureEvidence = architectureEvidenceForRow(row);
  row.architectureStability = architectureStabilityForRow(row);
  row.architectureFutureTrigger = architectureFutureTriggerForRow(row);
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
  byArchitectureClassification: planRows.reduce((acc, row) => {
    acc[row.architectureClassification] = Number(acc[row.architectureClassification] || 0) + 1;
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
  "architectureClassification",
  "architectureEvidence",
  "architectureStability",
  "architectureFutureTrigger",
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
  `"${String(r.architectureClassification || "").replace(/"/g, '""')}"`,
  `"${String(r.architectureEvidence || "").replace(/"/g, '""')}"`,
  `"${String(r.architectureStability || "").replace(/"/g, '""')}"`,
  `"${String(r.architectureFutureTrigger || "").replace(/"/g, '""')}"`,
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
