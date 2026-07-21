/**
 * Adult–Teen Google Books behavioral-equivalence and consolidation audit
 *
 * Purpose:
 * - move from capability presence to capability equivalence
 * - classify shared capabilities by semantic/operational parity
 * - identify safe consolidation candidates
 *
 * Usage:
 *   node scripts/run-v2-googlebooks-behavioral-equivalence-audit.mjs
 *
 * Outputs:
 *   scripts/output/googlebooks-behavioral-equivalence-audit.json
 *   scripts/output/googlebooks-behavioral-equivalence-audit.csv
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const outDir = resolve(scriptDir, "output");

const selectPath = resolve(repoRoot, "app", "recommender-v2", "select.ts");
const typesPath = resolve(repoRoot, "app", "recommender-v2", "types.ts");
const scriptsDir = resolve(repoRoot, "scripts");

const selectText = readFileSync(selectPath, "utf8");
const typesText = readFileSync(typesPath, "utf8");
const scriptNames = readdirSync(scriptsDir).filter((n) => n.startsWith("run-v2-googlebooks-") && n.endsWith(".mjs"));
const scriptCatalog = scriptNames.join("\n");

function hasAny(text, patterns) {
  return patterns.some((p) => {
    if (p instanceof RegExp) return p.test(text);
    return text.includes(p);
  });
}

function findFunctionsContaining(patterns, text) {
  const fns = new Set();
  const fnRegex = /function\s+([a-zA-Z0-9_]+)\s*\(/g;
  const fnMatches = [];
  let m;
  while ((m = fnRegex.exec(text)) !== null) {
    fnMatches.push({ name: m[1], index: m.index });
  }

  for (const p of patterns) {
    const re = p instanceof RegExp ? p : new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    let mm;
    while ((mm = re.exec(text)) !== null) {
      const idx = mm.index;
      let owner = null;
      for (const fn of fnMatches) {
        if (fn.index <= idx) owner = fn;
        else break;
      }
      if (owner) fns.add(owner.name);
    }
  }
  return Array.from(fns).sort();
}

function inferClassification(ctx) {
  if (ctx.ageSpecificByNecessity) return "age_specific_by_necessity";
  if (ctx.sharedPrimitiveLikely) return "truly_shared";

  if (ctx.adultProd && ctx.teenProd) {
    if (ctx.sameOutputs && ctx.sameStage) return "behaviorally_equivalent_duplication";
    return "same_name_different_semantics";
  }
  if (ctx.adultProd && ctx.teenDiag) return "adult_production_teen_diagnostic";
  if (ctx.teenProd && ctx.adultDiag) return "teen_production_adult_diagnostic";
  return "same_name_different_semantics";
}

function consolidationRecommendation(classification) {
  switch (classification) {
    case "truly_shared": return "Keep shared core; move policy to age-band config";
    case "behaviorally_equivalent_duplication": return "Extract shared primitive and parametrize age policy";
    case "same_name_different_semantics": return "Define shared contract before unification";
    case "adult_production_teen_diagnostic": return "Promote Teen path from diagnostic to production integration";
    case "teen_production_adult_diagnostic": return "Evaluate Adult back-port";
    case "age_specific_by_necessity": return "Keep separate policy branch with explicit invariants";
    default: return "Review manually";
  }
}

const capabilities = [
  {
    capability: "Query quality comparison",
    stage: "retrieval planning",
    adultPatterns: ["adultGoogleBooksQueryQualityByQuery", "adultGoogleBooksNarrativeYieldByQuery", "adultGoogleBooksNarrativeEfficiencyByQuery"],
    teenPatterns: ["teen-query-family-overlap-audit", "teen-query-marginal-yield-audit"],
    outputFields: ["adultGoogleBooksQueryQualityByQuery", "adultGoogleBooksNarrativeYieldByQuery", "adultGoogleBooksNarrativeEfficiencyByQuery", "teen-query-marginal-yield-audit"],
    inputs: "query, fetched titles, classification outcomes, prior-query pool",
    provenanceAllowed: "query metadata + candidate classification telemetry",
    effectSurface: "retrieval (currently mixed production+diagnostic)",
    thresholds: "none hard-coded in shared core",
    ageSpecificByNecessity: false,
  },
  {
    capability: "Query promotion / replacement",
    stage: "retrieval planning",
    adultPatterns: ["adultGoogleBooksCanonicalNarrativeFamilyPromotionsByTitle", "canonicalNarrativeFamilyPromotions"],
    teenPatterns: ["teenGoogleBooksTasteTierSelectionDecisionByTitle"],
    outputFields: ["adultGoogleBooksCanonicalNarrativeFamilyPromotionsByTitle", "teenGoogleBooksTasteTierSelectionDecisionByTitle"],
    inputs: "candidate families, narrative cues, ranking context",
    provenanceAllowed: "candidate-derived narrative + policy",
    effectSurface: "retrieval/ranking handoff",
    thresholds: "policy-based",
    ageSpecificByNecessity: false,
  },
  {
    capability: "Family-scoped query competition",
    stage: "retrieval planning",
    adultPatterns: ["adultGoogleBooksNarrativeYieldByQuery", "adultGoogleBooksNarrativeEfficiencyByQuery"],
    teenPatterns: ["teen-query-family-overlap-audit", "teen-query-marginal-yield-audit"],
    outputFields: ["adultGoogleBooksNarrativeYieldByQuery", "adultGoogleBooksNarrativeEfficiencyByQuery"],
    inputs: "query-family, accepted pool, final slate contribution",
    provenanceAllowed: "query-level performance telemetry",
    effectSurface: "retrieval policy",
    thresholds: "family-level yield comparisons",
    ageSpecificByNecessity: false,
  },
  {
    capability: "Narrative-strength scoring",
    stage: "scoring/ranking",
    adultPatterns: ["adultGoogleBooksNarrativeStrength", "adultGoogleBooksApplyNarrativeStrengthRanking"],
    teenPatterns: ["googleBooksNarrativeConfidenceByTitle", "teenGoogleBooksPublicationIdentity"],
    outputFields: ["adultGoogleBooksNarrativeStrengthScore", "googleBooksNarrativeConfidenceByTitle"],
    inputs: "title/subtitle/description/categories + metadata",
    provenanceAllowed: "candidate-native content fields",
    effectSurface: "ranking + eligibility support",
    thresholds: "adult narrative-strength component weights",
    ageSpecificByNecessity: false,
  },
  {
    capability: "Semantic phrase extraction",
    stage: "scoring/diagnostics",
    adultPatterns: ["adultGoogleBooksNarrativeCue", "adultGoogleBooksSignalMatchTraceByTitle"],
    teenPatterns: ["teenGoogleBooksSignalFieldsByTitle"],
    outputFields: ["adultGoogleBooksSignalMatchTraceByTitle", "teenGoogleBooksSignalFieldsByTitle"],
    inputs: "candidate text fields + signal lexicon",
    provenanceAllowed: "candidate-native fields",
    effectSurface: "diagnostic + potential ranking hooks",
    thresholds: "signal lexicon driven",
    ageSpecificByNecessity: false,
  },
  {
    capability: "Canonical cue promotion",
    stage: "scoring/family mapping",
    adultPatterns: ["adultGoogleBooksCanonicalNarrativeFamilyPromotionsByTitle", "canonical_cue"],
    teenPatterns: ["teenGoogleBooksDocumentNativeSpecificSignalsByTitle"],
    outputFields: ["adultGoogleBooksCanonicalNarrativeFamilyPromotionsByTitle", "teenGoogleBooksDocumentNativeSpecificSignalsByTitle"],
    inputs: "semantic cues -> family mapping",
    provenanceAllowed: "candidate-derived cues",
    effectSurface: "family weighting and diagnostics",
    thresholds: "cue confidence and family mapping rules",
    ageSpecificByNecessity: false,
  },
  {
    capability: "Final slate identity auditing",
    stage: "post-selection audit",
    adultPatterns: ["adultGoogleBooksFinalSlateIdentityAudit", "adultGoogleBooksFinalSlateIdentityByTitle"],
    teenPatterns: ["teenGoogleBooksPublicationIdentityDecisionByTitle", "teenGoogleBooksPublicationIdentityEvidenceByTitle"],
    outputFields: ["adultGoogleBooksFinalSlateIdentityByTitle", "teenGoogleBooksPublicationIdentityDecisionByTitle"],
    inputs: "selected candidate + identity evidence",
    provenanceAllowed: "candidate-native identity + policy flags",
    effectSurface: "eligibility + reporting",
    thresholds: "identity confidence and rejection categories",
    ageSpecificByNecessity: false,
  },
  {
    capability: "Meaningful taste tiers",
    stage: "selection quality tiering",
    adultPatterns: ["adultGoogleBooksMeaningfulTasteEligibility"],
    teenPatterns: ["teenGoogleBooksMeaningfulTasteClassificationByTitle", "teenGoogleBooksMeaningfulTasteClassificationHistogram"],
    outputFields: ["teenGoogleBooksMeaningfulTasteClassificationByTitle"],
    inputs: "liked/disliked signals + net score + provenance",
    provenanceAllowed: "policy-dependent",
    effectSurface: "selection/ranking/reporting",
    thresholds: "tier boundaries in Teen classifier",
    ageSpecificByNecessity: false,
  },
  {
    capability: "Counterfactual final slate",
    stage: "selection audit",
    adultPatterns: ["adultGoogleBooksFinalSlateIdentityAuditSummary"],
    teenPatterns: ["teenGoogleBooksCounterfactualFinalTitles", "teenGoogleBooksCounterfactualFinalCount"],
    outputFields: ["teenGoogleBooksCounterfactualFinalTitles", "teenGoogleBooksCounterfactualFinalCount"],
    inputs: "tier outputs + eligibility outputs",
    provenanceAllowed: "same as upstream tiers",
    effectSurface: "diagnostic/reporting",
    thresholds: "min clean slate target=5 (Teen)",
    ageSpecificByNecessity: false,
  },
  {
    capability: "Evidence-origin reconciliation audit",
    stage: "diagnostic audit",
    adultPatterns: ["adultGoogleBooksSignalMatchTraceByTitle"],
    teenPatterns: ["run-v2-googlebooks-teen-evidence-origin-reconciliation-audit.mjs"],
    outputFields: ["adultGoogleBooksSignalMatchTraceByTitle", "teen-evidence-origin-reconciliation-audit"],
    inputs: "signal traces + query context + per-title classifications",
    provenanceAllowed: "audit compares trusted vs untrusted channels",
    effectSurface: "diagnostic/reporting",
    thresholds: "none",
    ageSpecificByNecessity: false,
  },
  {
    capability: "Marginal decision-worthy yield",
    stage: "retrieval audit",
    adultPatterns: ["adultGoogleBooksNarrativeYieldByQuery", "adultGoogleBooksNarrativeEfficiencyByQuery"],
    teenPatterns: ["run-v2-googlebooks-teen-query-marginal-yield-audit.mjs"],
    outputFields: ["adultGoogleBooksNarrativeYieldByQuery", "teen-query-marginal-yield-audit"],
    inputs: "query candidates + strong/secondary classifications",
    provenanceAllowed: "query-level performance metrics",
    effectSurface: "retrieval policy / diagnostic",
    thresholds: "none",
    ageSpecificByNecessity: false,
  },
  {
    capability: "Adult content weighting branch",
    stage: "eligibility/policy",
    adultPatterns: ["adultGoogleBooksFinalEligibility", "adultGoogleBooksIdentityEnforcement"],
    teenPatterns: ["teenGoogleBooksAudienceReconciliationAudit", "teenGoogleBooksPublicationIdentityAudit"],
    outputFields: ["adult_googlebooks_*", "teen_googlebooks_*"],
    inputs: "age-band policy + identity + maturity",
    provenanceAllowed: "age-policy specific",
    effectSurface: "eligibility",
    thresholds: "age-specific by design",
    ageSpecificByNecessity: true,
  },
];

const rows = capabilities.map((c) => {
  const adultInSelect = hasAny(selectText, c.adultPatterns);
  const teenInSelect = hasAny(selectText, c.teenPatterns);
  const adultInTypes = hasAny(typesText, c.adultPatterns);
  const teenInTypes = hasAny(typesText, c.teenPatterns);
  const adultInScripts = hasAny(scriptCatalog, c.adultPatterns);
  const teenInScripts = hasAny(scriptCatalog, c.teenPatterns);

  const adultFunctions = findFunctionsContaining(c.adultPatterns, selectText);
  const teenFunctions = findFunctionsContaining(c.teenPatterns, selectText);

  const adultProd = adultInSelect;
  const teenProd = teenInSelect;
  const adultDiag = adultInScripts || adultInTypes;
  const teenDiag = teenInScripts || teenInTypes;

  const sameStage = adultProd && teenProd;
  const sameOutputs = hasAny(typesText, c.outputFields);
  const sharedPrimitiveLikely = adultFunctions.some((fn) => teenFunctions.includes(fn));

  const classification = inferClassification({
    ageSpecificByNecessity: c.ageSpecificByNecessity,
    sharedPrimitiveLikely,
    adultProd,
    teenProd,
    adultDiag,
    teenDiag,
    sameOutputs,
    sameStage,
  });

  return {
    capability: c.capability,
    implementation: {
      selectFile: "app/recommender-v2/select.ts",
      adultFunctions,
      teenFunctions,
      typesFile: "app/recommender-v2/types.ts",
      adultTypeKeysPresent: adultInTypes,
      teenTypeKeysPresent: teenInTypes,
      scriptsMatched: scriptNames.filter((name) => c.adultPatterns.concat(c.teenPatterns).some((p) => name.includes(String(p).replace(/\.mjs$/i, "")) || String(p).includes(name.replace(/\.mjs$/i, "")))),
    },
    stage: c.stage,
    inputsConsumed: c.inputs,
    evidenceProvenanceAllowed: c.provenanceAllowed,
    outputs: c.outputFields,
    effectSurface: c.effectSurface,
    constantsThresholds: c.thresholds,
    ageBandSpecificBranches: c.ageSpecificByNecessity,
    productionStatus: {
      adult: adultProd ? "production_or_core" : (adultDiag ? "diagnostic_only" : "absent"),
      teen: teenProd ? "production_or_core" : (teenDiag ? "diagnostic_only" : "absent"),
    },
    behavioralClassification: classification,
    recommendation: consolidationRecommendation(classification),
  };
});

const summary = rows.reduce((acc, r) => {
  acc.total += 1;
  acc[r.behavioralClassification] = Number(acc[r.behavioralClassification] || 0) + 1;
  return acc;
}, { total: 0 });

console.log("=== GOOGLE BOOKS BEHAVIORAL-EQUIVALENCE AUDIT ===");
console.log(`Capabilities audited: ${summary.total}`);
for (const k of ["truly_shared", "behaviorally_equivalent_duplication", "same_name_different_semantics", "adult_production_teen_diagnostic", "teen_production_adult_diagnostic", "age_specific_by_necessity"]) {
  if (summary[k]) console.log(`  ${k}: ${summary[k]}`);
}
console.log("\nCapability classifications:");
for (const r of rows) {
  console.log(`  ${r.capability} -> ${r.behavioralClassification} | ${r.recommendation}`);
}

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "googlebooks-behavioral-equivalence-audit.json");
const csvOut = resolve(outDir, "googlebooks-behavioral-equivalence-audit.csv");

writeFileSync(jsonOut, JSON.stringify({
  generatedAt: new Date().toISOString(),
  summary,
  rows,
}, null, 2));

const csvHeader = [
  "capability",
  "stage",
  "adultProductionStatus",
  "teenProductionStatus",
  "behavioralClassification",
  "recommendation",
  "adultFunctions",
  "teenFunctions",
  "effectSurface",
  "constantsThresholds",
].join(",");
const csvRows = rows.map((r) => [
  `"${r.capability.replace(/"/g, '""')}"`,
  `"${r.stage.replace(/"/g, '""')}"`,
  r.productionStatus.adult,
  r.productionStatus.teen,
  r.behavioralClassification,
  `"${r.recommendation.replace(/"/g, '""')}"`,
  `"${r.implementation.adultFunctions.join(" | ").replace(/"/g, '""')}"`,
  `"${r.implementation.teenFunctions.join(" | ").replace(/"/g, '""')}"`,
  `"${r.effectSurface.replace(/"/g, '""')}"`,
  `"${String(r.constantsThresholds).replace(/"/g, '""')}"`,
].join(","));
writeFileSync(csvOut, [csvHeader, ...csvRows].join("\n"));

console.log(`\nJSON written to: ${jsonOut}`);
console.log(`CSV written to: ${csvOut}`);
