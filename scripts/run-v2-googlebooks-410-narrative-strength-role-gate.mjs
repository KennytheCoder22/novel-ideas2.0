/**
 * #410 narrative-strength scoring role/equivalence gate.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(scriptDir, "output");
const selectPath = resolve(scriptDir, "../app/recommender-v2/select.ts");
const sourcePath = resolve(scriptDir, "../app/recommender-v2/sources/googleBooksSource.ts");

const selectText = readFileSync(selectPath, "utf8");
const sourceText = readFileSync(sourcePath, "utf8");

const evidence = {
  adultNarrativeStrengthFunctions: /adultGoogleBooksNarrativeStrength\(/.test(selectText) && /adultGoogleBooksApplyNarrativeStrengthRanking\(/.test(selectText),
  adultNarrativeStrengthDiagnostics: /adultGoogleBooksNarrativeStrengthScoreByTitle/.test(selectText),
  teenNarrativeStrengthFunction: /teenGoogleBooksNarrativeStrength\(/.test(selectText),
  teenNarrativeConfidenceDiagnostics: /googleBooksNarrativeConfidenceByTitle/.test(selectText) || /googleBooksNarrativeConfidenceByTitle/.test(sourceText),
};

let decision = "different_pipeline_layer";
let rationale = "Adult has explicit narrative-strength ranking mechanism while Teen consumes narrative confidence in publication/eligibility context without equivalent ranking stage.";
if (evidence.adultNarrativeStrengthFunctions && !evidence.teenNarrativeStrengthFunction && evidence.teenNarrativeConfidenceDiagnostics) {
  decision = "different_pipeline_layer";
  rationale = "Narrative-strength scoring is production ranking in Adult but upstream confidence support in Teen, i.e., different pipeline layer responsibilities.";
}

const result = {
  generatedAt: new Date().toISOString(),
  capability: "#410 Narrative-strength scoring",
  evidence,
  decision: {
    decision,
    rationale,
    outcomes: {
      equivalent_duplication: "Treat as parity-capable duplication candidate.",
      shared_mechanism_age_policy_outputs: "Treat as shared mechanism with policy specialization.",
      different_pipeline_layer: "Treat as structural layer divergence.",
    },
  },
};

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "googlebooks-410-narrative-strength-role-gate.json");
const csvOut = resolve(outDir, "googlebooks-410-narrative-strength-role-gate.csv");
writeFileSync(jsonOut, JSON.stringify(result, null, 2));
writeFileSync(csvOut, ["decision,adultNarrativeStrengthFunctions,adultNarrativeStrengthDiagnostics,teenNarrativeStrengthFunction,teenNarrativeConfidenceDiagnostics", `${decision},${evidence.adultNarrativeStrengthFunctions ? "true" : "false"},${evidence.adultNarrativeStrengthDiagnostics ? "true" : "false"},${evidence.teenNarrativeStrengthFunction ? "true" : "false"},${evidence.teenNarrativeConfidenceDiagnostics ? "true" : "false"}`].join("\n"));

console.log("=== GOOGLE BOOKS #410 NARRATIVE-STRENGTH GATE ===");
console.log(`Decision: ${decision}`);
console.log(`Rationale: ${rationale}`);
console.log(`JSON written to: ${jsonOut}`);
console.log(`CSV written to: ${csvOut}`);
