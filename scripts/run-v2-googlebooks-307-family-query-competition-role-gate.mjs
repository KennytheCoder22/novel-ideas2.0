/**
 * #307 family-scoped query competition role/equivalence gate.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(scriptDir, "output");
const gate306Path = resolve(outDir, "googlebooks-306-query-quality-role-gate.json");

const gate306 = existsSync(gate306Path) ? JSON.parse(readFileSync(gate306Path, "utf8")) : null;
const aggregate306 = gate306?.aggregate || {};
const decision306 = String(gate306?.decision?.decision || "");

let decision = "different_pipeline_layer";
let rationale = "Insufficient shared query-quality evidence to establish family-competition equivalence.";
if (decision306 === "shared_mechanism_age_policy_outputs") {
  decision = "shared_mechanism_age_policy_outputs";
  rationale = "Family competition depends on shared per-query telemetry, while age-band policy changes comparative family outcomes.";
} else if (decision306 === "equivalent_duplication") {
  decision = "equivalent_duplication";
  rationale = "Per-query metrics and family-level comparisons are equivalent across age bands.";
}

const result = {
  generatedAt: new Date().toISOString(),
  capability: "#307 Family-scoped query competition",
  evidence: {
    upstreamGate: "googlebooks-306-query-quality-role-gate.json",
    upstreamDecision: decision306 || null,
    queryQualityEquivalent: Boolean(aggregate306.queryQualityEquivalent),
    narrativeYieldEquivalent: Boolean(aggregate306.narrativeYieldEquivalent),
    narrativeEfficiencyEquivalent: Boolean(aggregate306.narrativeEfficiencyEquivalent),
  },
  decision: {
    decision,
    rationale,
    outcomes: {
      equivalent_duplication: "Treat as parity-capable duplication candidate.",
      shared_mechanism_age_policy_outputs: "Treat as shared mechanism with age-specific policy interpretation.",
      different_pipeline_layer: "Treat as different query-competition responsibility by layer/policy.",
    },
  },
};

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "googlebooks-307-family-query-competition-role-gate.json");
const csvOut = resolve(outDir, "googlebooks-307-family-query-competition-role-gate.csv");
writeFileSync(jsonOut, JSON.stringify(result, null, 2));
writeFileSync(csvOut, ["decision,upstreamDecision,queryQualityEquivalent,narrativeYieldEquivalent,narrativeEfficiencyEquivalent", `${decision},${decision306 || ""},${aggregate306.queryQualityEquivalent ? "true" : "false"},${aggregate306.narrativeYieldEquivalent ? "true" : "false"},${aggregate306.narrativeEfficiencyEquivalent ? "true" : "false"}`].join("\n"));

console.log("=== GOOGLE BOOKS #307 FAMILY QUERY COMPETITION GATE ===");
console.log(`Decision: ${decision}`);
console.log(`Rationale: ${rationale}`);
console.log(`JSON written to: ${jsonOut}`);
console.log(`CSV written to: ${csvOut}`);
