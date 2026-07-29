/**
 * Google Books Adult->Teen knowledge transfer audit
 *
 * Produces a capability matrix with status and recommendation:
 * - Adult capability present?
 * - Teen equivalent present?
 * - Bucket: A (universal), B (same algorithm diff vocab), C (adult-only), D (teen-surpassed)
 * - Recommendation: port / unify / keep adult-only / consider back-port
 *
 * Usage:
 *   node scripts/run-v2-googlebooks-knowledge-transfer-audit.mjs
 *
 * Output:
 *   scripts/output/googlebooks-knowledge-transfer-audit.json
 *   scripts/output/googlebooks-knowledge-transfer-audit.csv
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
const scriptText = scriptNames.join("\n");
const corpus = `${selectText}\n${typesText}\n${scriptText}`;

function hasAny(patterns) {
  return patterns.some((p) => {
    if (p instanceof RegExp) return p.test(corpus);
    return corpus.includes(p);
  });
}

function status(adultPresent, teenPresent) {
  if (adultPresent && teenPresent) return "Both";
  if (adultPresent && !teenPresent) return "Adult only";
  if (!adultPresent && teenPresent) return "Teen only";
  return "Missing";
}

const capabilities = [
  {
    capability: "Query quality comparison",
    bucket: "A",
    adultPatterns: ["adultGoogleBooksQueryQualityByQuery", "run-v2-googlebooks-query-quality-regressions.mjs"],
    teenPatterns: ["teen-query-family-overlap-audit", "teen-query-marginal-yield-audit"],
    recommendation: { both: "Unify", adultOnly: "Port", teenOnly: "Back-port", missing: "Build shared" },
  },
  {
    capability: "Query promotion / replacement",
    bucket: "A",
    adultPatterns: ["adultGoogleBooksCanonicalNarrativeFamilyPromotion", "adultGoogleBooksCanonicalNarrativeFamilyPromotionsByTitle"],
    teenPatterns: ["teenGoogleBooksTasteTierSelectionDecisionByTitle"],
    recommendation: { both: "Unify", adultOnly: "Port", teenOnly: "Back-port", missing: "Build shared" },
  },
  {
    capability: "Family-scoped query competition",
    bucket: "A",
    adultPatterns: ["adultGoogleBooksNarrativeYieldByQuery", "adultGoogleBooksNarrativeEfficiencyByQuery"],
    teenPatterns: ["teen-query-family-overlap-audit", "teen-query-marginal-yield-audit"],
    recommendation: { both: "Unify", adultOnly: "Port", teenOnly: "Back-port", missing: "Build shared" },
  },
  {
    capability: "Narrative-strength scoring",
    bucket: "A",
    adultPatterns: ["adultGoogleBooksNarrativeStrength", "run-v2-googlebooks-narrative-strength-ranking-regressions.mjs"],
    teenPatterns: ["googleBooksNarrativeConfidenceByTitle", "teenGoogleBooksPublicationIdentity"],
    recommendation: { both: "Unify", adultOnly: "Port", teenOnly: "Back-port", missing: "Build shared" },
  },
  {
    capability: "Semantic phrase extraction",
    bucket: "A",
    adultPatterns: ["adultGoogleBooksNarrativeCue", "adultGoogleBooksCanonicalCue", "adultGoogleBooksSignalMatchTraceByTitle"],
    teenPatterns: ["teenGoogleBooksSignalFieldsByTitle"],
    recommendation: { both: "Unify", adultOnly: "Port", teenOnly: "Back-port", missing: "Build shared" },
  },
  {
    capability: "Canonical cue promotion",
    bucket: "A",
    adultPatterns: ["adultGoogleBooksCanonicalNarrativeFamilyPromotionsByTitle", "adultGoogleBooksCanonicalCue"],
    teenPatterns: ["teenGoogleBooksDocumentNativeSpecificSignalsByTitle"],
    recommendation: { both: "Unify", adultOnly: "Port", teenOnly: "Back-port", missing: "Build shared" },
  },
  {
    capability: "Parser confidence diagnostics",
    bucket: "A",
    adultPatterns: ["adultGoogleBooksNarrativeExtractionParserConfidenceByTitle"],
    teenPatterns: ["teenGoogleBooksWouldPassWithoutQueryDerivedEvidenceByTitle"],
    recommendation: { both: "Unify", adultOnly: "Port", teenOnly: "Back-port", missing: "Build shared" },
  },
  {
    capability: "Final slate identity auditing",
    bucket: "A",
    adultPatterns: ["adultGoogleBooksFinalSlateIdentityAudit", "run-v2-googlebooks-final-slate-identity-audit-regressions.mjs"],
    teenPatterns: ["teenGoogleBooksPublicationIdentityDecisionByTitle"],
    recommendation: { both: "Unify", adultOnly: "Port", teenOnly: "Back-port", missing: "Build shared" },
  },
  {
    capability: "Meaningful taste tiers",
    bucket: "D",
    adultPatterns: ["adultGoogleBooksMeaningfulTasteEligibility"],
    teenPatterns: ["teenGoogleBooksMeaningfulTasteClassificationByTitle", "teenGoogleBooksMeaningfulTasteClassificationHistogram"],
    recommendation: { both: "Unify", adultOnly: "Port", teenOnly: "Consider back-port", missing: "Build shared" },
  },
  {
    capability: "Counterfactual final slate",
    bucket: "D",
    adultPatterns: ["adultGoogleBooksFinalSlateIdentityAuditSummary"],
    teenPatterns: ["teenGoogleBooksCounterfactualFinalTitles", "teenGoogleBooksCounterfactualFinalCount"],
    recommendation: { both: "Unify", adultOnly: "Port", teenOnly: "Consider back-port", missing: "Build shared" },
  },
  {
    capability: "Weak-underfill dependency audit",
    bucket: "D",
    adultPatterns: [],
    teenPatterns: ["teenGoogleBooksWeakCandidateUsedForUnderfillByTitle", "run-v2-googlebooks-teen-taste-tier-audit.mjs", "run-v2-googlebooks-teen-weak-metadata-sufficiency-audit.mjs"],
    recommendation: { both: "Unify", adultOnly: "Port", teenOnly: "Consider back-port", missing: "Build shared" },
  },
  {
    capability: "Evidence-origin reconciliation audit",
    bucket: "D",
    adultPatterns: ["adultGoogleBooksSignalMatchTraceByTitle"],
    teenPatterns: ["run-v2-googlebooks-teen-evidence-origin-reconciliation-audit.mjs"],
    recommendation: { both: "Unify", adultOnly: "Port", teenOnly: "Consider back-port", missing: "Build shared" },
  },
  {
    capability: "Query-family overlap matrix",
    bucket: "D",
    adultPatterns: [],
    teenPatterns: ["run-v2-googlebooks-teen-query-family-overlap-audit.mjs"],
    recommendation: { both: "Unify", adultOnly: "Port", teenOnly: "Consider back-port", missing: "Build shared" },
  },
  {
    capability: "Marginal decision-worthy yield",
    bucket: "D",
    adultPatterns: ["adultGoogleBooksNarrativeYieldByQuery", "adultGoogleBooksNarrativeEfficiencyByQuery"],
    teenPatterns: ["run-v2-googlebooks-teen-query-marginal-yield-audit.mjs"],
    recommendation: { both: "Unify", adultOnly: "Port", teenOnly: "Consider back-port", missing: "Build shared" },
  },
  {
    capability: "Adult content weighting",
    bucket: "C",
    adultPatterns: ["adultGoogleBooksFinalEligibility", "adultGoogleBooksIdentityEnforcement"],
    teenPatterns: ["teenGoogleBooksAudienceReconciliation"],
    recommendation: { both: "Keep adult-only policy branch", adultOnly: "Keep adult-only", teenOnly: "N/A", missing: "N/A" },
  },
];

const rows = capabilities.map((c) => {
  const adultPresent = c.adultPatterns.length ? hasAny(c.adultPatterns) : false;
  const teenPresent = c.teenPatterns.length ? hasAny(c.teenPatterns) : false;
  const st = status(adultPresent, teenPresent);
  let rec = c.recommendation.missing;
  if (st === "Both") rec = c.recommendation.both;
  else if (st === "Adult only") rec = c.recommendation.adultOnly;
  else if (st === "Teen only") rec = c.recommendation.teenOnly;

  return {
    capability: c.capability,
    bucket: c.bucket,
    adultCapabilityPresent: adultPresent,
    teenEquivalentPresent: teenPresent,
    status: st,
    recommendation: rec,
  };
});

const summary = {
  both: rows.filter((r) => r.status === "Both").length,
  adultOnly: rows.filter((r) => r.status === "Adult only").length,
  teenOnly: rows.filter((r) => r.status === "Teen only").length,
  missing: rows.filter((r) => r.status === "Missing").length,
};

console.log("=== GOOGLE BOOKS KNOWLEDGE TRANSFER AUDIT ===");
console.log(`Capabilities evaluated: ${rows.length}`);
console.log(`Both: ${summary.both} | Adult only: ${summary.adultOnly} | Teen only: ${summary.teenOnly} | Missing: ${summary.missing}`);
console.log("\nCapability matrix:");
for (const r of rows) {
  console.log(`  [${r.bucket}] ${r.capability} | ${r.status} | ${r.recommendation}`);
}

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "googlebooks-knowledge-transfer-audit.json");
const csvOut = resolve(outDir, "googlebooks-knowledge-transfer-audit.csv");

writeFileSync(jsonOut, JSON.stringify({
  generatedAt: new Date().toISOString(),
  summary,
  rows,
}, null, 2));

const csvHeader = [
  "capability",
  "bucket",
  "adultCapabilityPresent",
  "teenEquivalentPresent",
  "status",
  "recommendation",
].join(",");
const csvRows = rows.map((r) => [
  `"${r.capability.replace(/"/g, '""')}"`,
  r.bucket,
  r.adultCapabilityPresent ? "true" : "false",
  r.teenEquivalentPresent ? "true" : "false",
  `"${r.status}"`,
  `"${r.recommendation.replace(/"/g, '""')}"`,
].join(","));
writeFileSync(csvOut, [csvHeader, ...csvRows].join("\n"));

console.log(`\nJSON written to: ${jsonOut}`);
console.log(`CSV written to: ${csvOut}`);
