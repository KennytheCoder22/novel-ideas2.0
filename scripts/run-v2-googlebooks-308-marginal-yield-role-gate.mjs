/**
 * #308 marginal decision-worthy yield role/equivalence gate.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(scriptDir, "output");
const sourcePath = resolve(scriptDir, "../app/recommender-v2/sources/googleBooksSource.ts");
const teenAuditPath = resolve(scriptDir, "run-v2-googlebooks-teen-query-marginal-yield-audit.mjs");

const sourceText = readFileSync(sourcePath, "utf8");
const teenAuditText = readFileSync(teenAuditPath, "utf8");

const evidence = {
  adultUsesNarrativeYield: /adultGoogleBooksNarrativeYieldByQuery/.test(sourceText),
  adultUsesNarrativeEfficiency: /adultGoogleBooksNarrativeEfficiencyByQuery/.test(sourceText),
  teenUsesStrongSecondaryLabels: /strong_match|defensible_secondary_match/.test(teenAuditText),
  teenUsesMarginalStrongSecondaryMetric: /marginalStrongSecondary/.test(teenAuditText),
  teenUsesRecurringHeadSuppression: /recurringHead/.test(teenAuditText),
};

let decision = "different_hypothetical_questions";
let rationale = "Adult measures narrative yield/efficiency while Teen measures marginal decision-worthy yield using strong/secondary classifications and recurring-head effects.";
if (
  evidence.adultUsesNarrativeYield
  && evidence.adultUsesNarrativeEfficiency
  && evidence.teenUsesStrongSecondaryLabels
  && evidence.teenUsesMarginalStrongSecondaryMetric
) {
  decision = "different_hypothetical_questions";
  rationale = "Adult and Teen metrics optimize different objectives despite similar query-performance vocabulary.";
}

const result = {
  generatedAt: new Date().toISOString(),
  capability: "#308 Marginal decision-worthy yield",
  evidence,
  decision: {
    decision,
    rationale,
    outcomes: {
      equivalent_duplication: "Treat as parity-capable duplication candidate.",
      shared_mechanism_age_policy_outputs: "Shared measurement mechanism with age-policy interpretation differences.",
      different_hypothetical_questions: "Reclassify as different semantics/pipeline objective.",
    },
  },
};

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "googlebooks-308-marginal-yield-role-gate.json");
const csvOut = resolve(outDir, "googlebooks-308-marginal-yield-role-gate.csv");
writeFileSync(jsonOut, JSON.stringify(result, null, 2));
writeFileSync(csvOut, ["decision,adultUsesNarrativeYield,adultUsesNarrativeEfficiency,teenUsesStrongSecondaryLabels,teenUsesMarginalStrongSecondaryMetric,teenUsesRecurringHeadSuppression", `${decision},${evidence.adultUsesNarrativeYield ? "true" : "false"},${evidence.adultUsesNarrativeEfficiency ? "true" : "false"},${evidence.teenUsesStrongSecondaryLabels ? "true" : "false"},${evidence.teenUsesMarginalStrongSecondaryMetric ? "true" : "false"},${evidence.teenUsesRecurringHeadSuppression ? "true" : "false"}`].join("\n"));

console.log("=== GOOGLE BOOKS #308 MARGINAL YIELD GATE ===");
console.log(`Decision: ${decision}`);
console.log(`Rationale: ${rationale}`);
console.log(`JSON written to: ${jsonOut}`);
console.log(`CSV written to: ${csvOut}`);
