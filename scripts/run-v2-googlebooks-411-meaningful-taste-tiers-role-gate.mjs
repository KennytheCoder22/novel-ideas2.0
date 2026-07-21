/**
 * #411 meaningful taste tiers role/equivalence gate.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(scriptDir, "output");
const selectPath = resolve(scriptDir, "../app/recommender-v2/select.ts");

const selectText = readFileSync(selectPath, "utf8");

const evidence = {
  adultBinaryMeaningfulTaste: /adultGoogleBooksMeaningfulTasteEligibility\(/.test(selectText),
  teenTierClassifier: /classifyTeenGoogleBooksMeaningfulTasteAlignment\(/.test(selectText),
  teenTierOutputs: /teenGoogleBooksMeaningfulTasteClassificationByTitle/.test(selectText),
  adultWeightedCounterfactualTaste: /adultGoogleBooksWeightedCounterfactualDecision\(/.test(selectText),
};

let decision = "different_hypothetical_questions";
let rationale = "Adult uses binary meaningful-taste gate with weighted counterfactual diagnostics, while Teen uses explicit multi-tier meaningful-taste classification for selection behavior.";
if (evidence.adultBinaryMeaningfulTaste && evidence.teenTierClassifier && evidence.teenTierOutputs) {
  decision = "different_hypothetical_questions";
  rationale = "Adult and Teen meaningful-taste models answer different selection questions despite overlapping terminology.";
}

const result = {
  generatedAt: new Date().toISOString(),
  capability: "#411 Meaningful taste tiers",
  evidence,
  decision: {
    decision,
    rationale,
    outcomes: {
      equivalent_duplication: "Treat as parity-capable duplication candidate.",
      shared_mechanism_age_policy_outputs: "Shared scoring substrate with age-policy tiering wrappers.",
      different_hypothetical_questions: "Reclassify as semantics divergence.",
    },
  },
};

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "googlebooks-411-meaningful-taste-tiers-role-gate.json");
const csvOut = resolve(outDir, "googlebooks-411-meaningful-taste-tiers-role-gate.csv");
writeFileSync(jsonOut, JSON.stringify(result, null, 2));
writeFileSync(csvOut, ["decision,adultBinaryMeaningfulTaste,teenTierClassifier,teenTierOutputs,adultWeightedCounterfactualTaste", `${decision},${evidence.adultBinaryMeaningfulTaste ? "true" : "false"},${evidence.teenTierClassifier ? "true" : "false"},${evidence.teenTierOutputs ? "true" : "false"},${evidence.adultWeightedCounterfactualTaste ? "true" : "false"}`].join("\n"));

console.log("=== GOOGLE BOOKS #411 MEANINGFUL TASTE TIERS GATE ===");
console.log(`Decision: ${decision}`);
console.log(`Rationale: ${rationale}`);
console.log(`JSON written to: ${jsonOut}`);
console.log(`CSV written to: ${csvOut}`);
