/**
 * #599 adult content weighting branch role gate.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(scriptDir, "output");
const selectPath = resolve(scriptDir, "../app/recommender-v2/select.ts");

const selectText = readFileSync(selectPath, "utf8");

const evidence = {
  adultGuardPresent: /profile\?\.ageBand\s*!==\s*"adult"/.test(selectText) || /profile\.ageBand\s*!==\s*"adult"/.test(selectText),
  adultWeightedPolarityFunction: /adultGoogleBooksWeightedCounterfactualDecision\(/.test(selectText),
  adultProductionPolarityFunction: /adultTasteProductionPolarity\(/.test(selectText),
  teenWeightedCounterfactualEquivalent: /teenGoogleBooksWeightedCounterfactual/.test(selectText),
};

let decision = "adult_only_capability_age_specific";
let rationale = "Adult content weighting and weighted counterfactual branches are explicitly adult-scoped and have no Teen production equivalent.";
if (evidence.adultGuardPresent && evidence.adultWeightedPolarityFunction && !evidence.teenWeightedCounterfactualEquivalent) {
  decision = "adult_only_capability_age_specific";
  rationale = "Age-band guard + adult-only weighted polarity logic indicate intentional age-specific policy branch.";
}

const result = {
  generatedAt: new Date().toISOString(),
  capability: "#599 Adult content weighting branch",
  evidence,
  decision: {
    decision,
    rationale,
    outcomes: {
      equivalent_duplication: "Treat as shared branch candidate.",
      shared_mechanism_age_policy_outputs: "Shared mechanism with age-specialized policy output.",
      adult_only_capability_age_specific: "Keep age-specific branch and exclude from consolidation.",
    },
  },
};

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "googlebooks-599-adult-content-weighting-branch-role-gate.json");
const csvOut = resolve(outDir, "googlebooks-599-adult-content-weighting-branch-role-gate.csv");
writeFileSync(jsonOut, JSON.stringify(result, null, 2));
writeFileSync(csvOut, ["decision,adultGuardPresent,adultWeightedPolarityFunction,adultProductionPolarityFunction,teenWeightedCounterfactualEquivalent", `${decision},${evidence.adultGuardPresent ? "true" : "false"},${evidence.adultWeightedPolarityFunction ? "true" : "false"},${evidence.adultProductionPolarityFunction ? "true" : "false"},${evidence.teenWeightedCounterfactualEquivalent ? "true" : "false"}`].join("\n"));

console.log("=== GOOGLE BOOKS #599 ADULT CONTENT WEIGHTING BRANCH GATE ===");
console.log(`Decision: ${decision}`);
console.log(`Rationale: ${rationale}`);
console.log(`JSON written to: ${jsonOut}`);
console.log(`CSV written to: ${csvOut}`);
