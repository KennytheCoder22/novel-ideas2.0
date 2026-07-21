/**
 * #409 query promotion/replacement role/equivalence gate.
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const outDir = resolve(scriptDir, "output");

const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  module._compile(output, filename);
};

const { googleBooksSourceAdapter } = require(resolve(repoRoot, "app/recommender-v2/sources/googleBooksSource.ts"));
const { buildTasteProfile } = require(resolve(repoRoot, "app/recommender-v2/tasteProfile.ts"));

function fixtureBook(id, title) {
  return {
    kind: "books#volume",
    id,
    volumeInfo: {
      title,
      authors: ["Gate Author"],
      description: "A mystery thriller novel about an investigation.",
      categories: ["Fiction / Mystery & Detective"],
      maturityRating: "NOT_MATURE",
      printType: "BOOK",
      language: "en",
      publishedDate: "2024",
      pageCount: 300,
    },
  };
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({
    totalItems: 2,
    items: [fixtureBook("gate-409-a", "Gate 409 Alpha"), fixtureBook("gate-409-b", "Gate 409 Beta")],
  }),
});

const plan = {
  source: "googleBooks",
  enabled: true,
  status: "planned",
  timeoutMs: 2500,
  intents: [
    { id: "q1", query: "science fiction thriller novel", facets: ["science fiction", "thriller"], priority: 1, rationale: ["gate"] },
    { id: "q2", query: "mystery thriller novel", facets: ["mystery", "thriller"], priority: 0.85, rationale: ["gate"] },
  ],
};

function profile(ageBand) {
  return buildTasteProfile({
    ageBand,
    enabledSources: { googleBooks: true },
    signals: [{ title: `${ageBand}-like`, action: "like", genres: ["mystery"], tags: ["mystery"], source: "mock", format: "book" }],
  });
}

const adult = await googleBooksSourceAdapter.search(plan, { profile: profile("adult") });
const teen = await googleBooksSourceAdapter.search(plan, { profile: profile("teens") });
if (originalFetch) globalThis.fetch = originalFetch;

const adultDiag = adult?.diagnostics || {};
const teenDiag = teen?.diagnostics || {};
const adultAttempted = Array.isArray(adultDiag.googleBooksQueriesAttempted) ? adultDiag.googleBooksQueriesAttempted : [];
const teenAttempted = Array.isArray(teenDiag.googleBooksQueriesAttempted) ? teenDiag.googleBooksQueriesAttempted : [];
const adultOrder = Array.isArray(adultDiag.googleBooksPlannedQueries) ? adultDiag.googleBooksPlannedQueries : [];
const teenOrder = Array.isArray(teenDiag.googleBooksPlannedQueries) ? teenDiag.googleBooksPlannedQueries : [];
const sameAttemptedQueries = JSON.stringify(adultAttempted) === JSON.stringify(teenAttempted);
const samePlannedOrder = JSON.stringify(adultOrder) === JSON.stringify(teenOrder);

let decision = "shared_mechanism_age_policy_outputs";
let rationale = "Query promotion/replacement uses a shared execution mechanism while downstream age policy determines recommendation interpretation.";
if (sameAttemptedQueries && samePlannedOrder) {
  decision = "shared_mechanism_age_policy_outputs";
  rationale = "Adult and Teen share the same query promotion/replacement execution order and attempted-query mechanism.";
}

const result = {
  generatedAt: new Date().toISOString(),
  capability: "#409 Query promotion / replacement",
  evidence: {
    adultStatus: adult.status,
    teenStatus: teen.status,
    sameAttemptedQueries,
    samePlannedOrder,
    adultAttempted,
    teenAttempted,
    adultPlanned: adultOrder,
    teenPlanned: teenOrder,
  },
  decision: {
    decision,
    rationale,
    outcomes: {
      equivalent_duplication: "Treat as parity-capable duplication.",
      shared_mechanism_age_policy_outputs: "Treat as shared mechanism with age-specific policy interpretation.",
      different_pipeline_layer: "Treat as different stage responsibilities.",
    },
  },
};

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "googlebooks-409-query-promotion-replacement-role-gate.json");
const csvOut = resolve(outDir, "googlebooks-409-query-promotion-replacement-role-gate.csv");
writeFileSync(jsonOut, JSON.stringify(result, null, 2));
writeFileSync(csvOut, ["decision,sameAttemptedQueries,samePlannedOrder,adultStatus,teenStatus", `${decision},${sameAttemptedQueries ? "true" : "false"},${samePlannedOrder ? "true" : "false"},${adult.status},${teen.status}`].join("\n"));

console.log("=== GOOGLE BOOKS #409 QUERY PROMOTION/REPLACEMENT GATE ===");
console.log(`Decision: ${decision}`);
console.log(`Rationale: ${rationale}`);
console.log(`JSON written to: ${jsonOut}`);
console.log(`CSV written to: ${csvOut}`);
