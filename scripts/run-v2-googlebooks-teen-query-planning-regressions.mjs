import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertDeepEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(values, expected, message) {
  if (!Array.isArray(values) || !values.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(values)} to include ${JSON.stringify(expected)}`);
  }
}

function assertNotIncludes(values, unexpected, message) {
  if (Array.isArray(values) && values.includes(unexpected)) {
    throw new Error(`${message}: did not expect ${JSON.stringify(unexpected)} in ${JSON.stringify(values)}`);
  }
}

function assertTruthy(value, message) {
  if (!value) throw new Error(`${message}: expected truthy, got ${JSON.stringify(value)}`);
}

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../app/recommender-v2");
const { buildSearchPlan } = require(resolve(dir, "searchPlan.ts"));

function profile(ageBand, genreFamilyValues) {
  return {
    ageBand,
    maturityBand: ageBand,
    genreFamily: genreFamilyValues.map((value, index) => ({ value, weight: Math.max(1, 2 - index), evidence: [`like:${ageBand}:${value}`] })),
    tone: [],
    pacing: [],
    themes: [{ value: "friendship", weight: 1, evidence: [`like:${ageBand}:friendship`] }],
    characterDynamics: [],
    formatPreference: [{ value: "book", weight: 1, evidence: [`like:${ageBand}:book`] }],
    avoidSignals: [],
    sourceHints: ["googleBooks"],
    diagnostics: {},
  };
}

function googleBooksPlan(ageBand, genreFamilyValues) {
  const plan = buildSearchPlan(profile(ageBand, genreFamilyValues), { googleBooks: true });
  const googleBooks = plan.sourcePlans.find((sourcePlan) => sourcePlan.source === "googleBooks");
  return {
    queries: googleBooks?.intents.map((intent) => intent.query) || [],
    rationales: Object.fromEntries((googleBooks?.intents || []).map((intent) => [intent.query, intent.rationale])),
    diagnostics: plan.diagnostics || {},
  };
}

// Teen: science fiction + contemporary
{
  const result = googleBooksPlan("teens", ["science fiction", "contemporary"]);
  assertDeepEqual(
    result.queries,
    ["young adult sci fi", "YA dystopian", "YA speculative fiction"],
    "teens science fiction + contemporary final query list",
  );
  assertEqual(result.diagnostics.teenGoogleBooksQueryFamilyByQuery["young adult sci fi"], "science_fiction", "science fiction primary family should be recorded");
  assertEqual(result.diagnostics.teenGoogleBooksQueryRungByQuery["young adult sci fi"], "primary", "science fiction primary rung should be recorded");
  assertEqual(result.diagnostics.teenGoogleBooksQueryFamilyByQuery["YA dystopian"], "dystopian", "dystopian family should be recorded");
  assertEqual(result.diagnostics.teenGoogleBooksQueryRungByQuery["YA dystopian"], "adjacent", "dystopian rung should be recorded");
  assertEqual(result.diagnostics.teenGoogleBooksQueryFamilyByQuery["YA speculative fiction"], "speculative", "speculative family should be recorded");
  assertEqual(result.diagnostics.teenGoogleBooksQueryRungByQuery["YA speculative fiction"], "third", "speculative rung should be recorded");
  assertEqual(result.diagnostics.teenGoogleBooksOmittedThirdQueryReason, "replaced_with_scifi_production_composite_family", "science fiction route should record composite-family replacement reason");
}

// Teen: romance + contemporary
{
  const result = googleBooksPlan("teens", ["romance", "contemporary"]);
  assertDeepEqual(
    result.queries,
    ["young adult romance fiction novel", "young adult contemporary fiction novel"],
    "teens romance + contemporary final query list",
  );
  assertNotIncludes(result.queries, "young adult romance contemporary fiction", "romance third query must be omitted when no safe alternative exists");
  assertEqual(result.diagnostics.teenGoogleBooksQueryRungByQuery["young adult romance fiction novel"], "primary", "romance primary rung should be recorded");
  assertEqual(result.diagnostics.teenGoogleBooksQueryRungByQuery["young adult contemporary fiction novel"], "adjacent", "romance adjacency rung should be recorded");
  assertEqual(result.diagnostics.teenGoogleBooksOmittedThirdQueryReason, "omitted_third_query:no_safe_distinct_template:romance+contemporary", "romance + contemporary should record omitted-third-query reason");
}

// Teen: historical + mystery
{
  const result = googleBooksPlan("teens", ["historical", "mystery"]);
  assertDeepEqual(
    result.queries,
    ["young adult historical fiction novel", "teen mystery thriller novel", "young adult historical mystery novel"],
    "teens historical + mystery final query list",
  );
  assertNotIncludes(result.queries, "young adult historical contemporary fiction", "historical + mystery must not use broad contemporary third query");
  assertEqual(result.diagnostics.teenGoogleBooksQueryFamilyByQuery["young adult historical fiction novel"], "historical", "historical family should be recorded");
  assertEqual(result.diagnostics.teenGoogleBooksQueryFamilyByQuery["teen mystery thriller novel"], "mystery", "mystery family should be recorded");
  assertEqual(result.diagnostics.teenGoogleBooksQueryFamilyByQuery["young adult historical mystery novel"], "historical_mystery", "historical mystery family should be recorded");
  assertEqual(result.diagnostics.teenGoogleBooksQueryRungByQuery["young adult historical mystery novel"], "third", "historical mystery third rung should be recorded");
  assertEqual(result.diagnostics.teenGoogleBooksOmittedThirdQueryReason, "replaced_third_query:historical_mystery_template", "historical + mystery should record replacement reason");
}

// Teen fantasy baseline: preserve the healthier primary/adjacency queries while making the third query distinct.
{
  const result = googleBooksPlan("teens", ["fantasy", "adventure"]);
  assertDeepEqual(
    result.queries,
    ["young adult fantasy fiction novel", "young adult adventure fiction novel", "young adult fantasy adventure novel"],
    "teens fantasy + adventure final query list",
  );
  assertEqual(result.diagnostics.teenGoogleBooksQueryRungByQuery["young adult fantasy fiction novel"], "primary", "fantasy primary rung should be preserved");
  assertEqual(result.diagnostics.teenGoogleBooksQueryRungByQuery["young adult adventure fiction novel"], "adjacent", "fantasy adjacency rung should be preserved");
  assertEqual(result.diagnostics.teenGoogleBooksQueryRungByQuery["young adult fantasy adventure novel"], "third", "fantasy third rung should be recorded");
}

// Duplicate suppression: unmapped Teen genre falls back to the same broad query twice, so adjacency is suppressed with an explicit reason.
{
  const result = googleBooksPlan("teens", ["slice of life"]);
  assertDeepEqual(result.queries, ["young adult fiction novel"], "unmapped Teen genre should deduplicate identical fallback queries");
  assertIncludes(
    result.diagnostics.teenGoogleBooksDuplicateSuppressionReasons,
    "adjacent:young adult fiction novel=>duplicate_of_primary",
    "duplicate suppression reason should be recorded when adjacency collapses to primary",
  );
  assertTruthy(
    String(result.rationales["young adult fiction novel"] || []).includes("teen_googlebooks_query_rung:primary"),
    "primary rationale should include Teen query rung metadata",
  );
}

// Cross-band protection: adult and preteen query strings must remain byte-for-byte unchanged for the science fiction + contemporary fixture.
{
  assertDeepEqual(
    googleBooksPlan("adult", ["science fiction", "contemporary"]).queries,
    ["science fiction novel", "science fiction contemporary novel", "science fiction mystery novel"],
    "adult query planning must remain unchanged",
  );
  assertDeepEqual(
    googleBooksPlan("preteens", ["science fiction", "contemporary"]).queries,
    ["middle grade science fiction novel", "middle grade contemporary fiction novel", "middle grade science fiction contemporary novel"],
    "preteens query planning must remain unchanged",
  );
}

// Teen science-fiction experiment hook: override only changes the Teen primary science-fiction query.
{
  process.env.V2_TEEN_GB_SCIFI_PRIMARY_QUERY_OVERRIDE = "\"young adult\" dystopian novel";
  const result = googleBooksPlan("teens", ["science fiction", "contemporary"]);
  assertDeepEqual(
    result.queries,
    ["\"young adult\" dystopian novel", "YA dystopian", "YA speculative fiction"],
    "teens science fiction override should replace the primary query within the composite family",
  );
  assertEqual(
    result.diagnostics.teenGoogleBooksScienceFictionPrimaryQueryOverrideApplied,
    true,
    "override diagnostics flag should be true",
  );
  delete process.env.V2_TEEN_GB_SCIFI_PRIMARY_QUERY_OVERRIDE;
}

// Teen science-fiction composite override hook: replacing the full query family should be supported for safe rollback/experiments.
{
  process.env.V2_TEEN_GB_SCIFI_COMPOSITE_QUERIES_OVERRIDE = "young adult sci fi|YA space opera|YA dystopian";
  const result = googleBooksPlan("teens", ["science fiction", "contemporary"]);
  assertDeepEqual(
    result.queries,
    ["young adult sci fi", "YA space opera", "YA dystopian"],
    "teens science fiction composite override should replace the entire route-defined query family",
  );
  assertEqual(
    result.diagnostics.teenGoogleBooksScienceFictionCompositeOverrideApplied,
    true,
    "composite override diagnostics flag should be true",
  );
  delete process.env.V2_TEEN_GB_SCIFI_COMPOSITE_QUERIES_OVERRIDE;
}

console.log(JSON.stringify({
  name: "teen google books query planning regressions",
  pass: true,
  teenScienceFictionContemporary: googleBooksPlan("teens", ["science fiction", "contemporary"]).queries,
  teenRomanceContemporary: googleBooksPlan("teens", ["romance", "contemporary"]).queries,
  teenHistoricalMystery: googleBooksPlan("teens", ["historical", "mystery"]).queries,
}, null, 2));
