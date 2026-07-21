/**
 * #306 query quality comparison role/equivalence gate.
 *
 * Purpose:
 * - Determine whether Adult and Teen query-quality comparison are equivalent
 *   diagnostics over the same retrieval stage or materially different.
 *
 * Usage:
 *   node scripts/run-v2-googlebooks-306-query-quality-role-gate.mjs
 *
 * Outputs:
 *   scripts/output/googlebooks-306-query-quality-role-gate.json
 *   scripts/output/googlebooks-306-query-quality-role-gate.csv
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

function mapObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortDeep(value[key])]));
  }
  return value;
}

function deepEqual(a, b) {
  return JSON.stringify(sortDeep(a)) === JSON.stringify(sortDeep(b));
}

function googleBook(id, title, description, categories, publisher = "Gate House", maturityRating = "NOT_MATURE") {
  return {
    kind: "books#volume",
    id,
    volumeInfo: {
      title,
      authors: ["Gate Author"],
      description,
      categories,
      publisher,
      publishedDate: "2024",
      pageCount: 320,
      printType: "BOOK",
      language: "en",
      maturityRating,
      industryIdentifiers: [{ type: "ISBN_13", identifier: `978100000${id.replace(/[^0-9]/g, "").padStart(4, "0").slice(-4)}` }],
    },
  };
}

function fixturePool(prefix) {
  return [
    googleBook(
      `${prefix}-novel-1`,
      `${prefix} Signal Novel`,
      "A detective follows a dangerous conspiracy through a near-future city and must uncover the truth.",
      ["Fiction / Science Fiction / Crime & Mystery", "Fiction / Thrillers / Suspense"],
      "Tor Books",
    ),
    googleBook(
      `${prefix}-novel-2`,
      `${prefix} Midnight Case`,
      "A former investigator must survive a layered mystery involving artificial intelligence and betrayal.",
      ["Fiction / Mystery & Detective", "Fiction / Science Fiction / Action & Adventure"],
      "Orbit",
    ),
    googleBook(
      `${prefix}-catalog`,
      "Thriller Novels",
      "A catalog-style overview of thriller novels and suspense books for browsing.",
      ["Fiction / Thrillers", "Reference / Bibliographies & Indexes"],
      "Catalog Press",
    ),
    googleBook(
      `${prefix}-study`,
      "Studies in Science Fiction Thrillers",
      "A scholarly study of science fiction thrillers, criticism, genre history, and analysis.",
      ["Literary Criticism / Science Fiction & Fantasy", "Language Arts & Disciplines"],
      "Academic Press",
    ),
    googleBook(
      `${prefix}-guide`,
      "The Guide to Suspense Books",
      "A readers advisory guide to suspense books with recommendation lists and references.",
      ["Reference / Bibliographies & Indexes", "Literary Criticism"],
      "Readers Advisory Press",
    ),
    googleBook(
      `${prefix}-ya-novel`,
      "Moonline Academy",
      "A young adult mystery novel where teens investigate disappearances at boarding school.",
      ["Young Adult Fiction / Mysteries & Detective Stories", "Fiction / Mystery & Detective"],
      "YA House",
      "NOT_MATURE",
    ),
  ];
}

function makeProfile(ageBand) {
  return buildTasteProfile({
    ageBand,
    enabledSources: { googleBooks: true },
    signals: [
      { title: `${ageBand}-like-1`, action: "like", genres: ["science fiction"], tags: ["science fiction"], source: "mock", format: "book" },
      { title: `${ageBand}-like-2`, action: "like", genres: ["thriller"], tags: ["thriller"], source: "mock", format: "book" },
      { title: `${ageBand}-like-3`, action: "like", genres: ["mystery"], tags: ["mystery"], source: "mock", format: "book" },
    ],
  });
}

function normalizeQueryQualityMap(input) {
  const map = mapObject(input);
  const normalized = {};
  for (const [query, row] of Object.entries(map)) {
    const entry = mapObject(row);
    normalized[query] = {
      totalResults: Number(entry.totalResults || 0),
      narrativeCandidateCount: Number(entry.narrativeCandidateCount || 0),
      acceptedCandidateCount: Number(entry.acceptedCandidateCount || 0),
      narrativeEfficiency: Number(entry.narrativeEfficiency || 0),
      publicationShapeHistogram: mapObject(entry.publicationShapeHistogram),
      rejectedShapeHistogram: mapObject(entry.rejectedShapeHistogram),
      rejectionReasons: mapObject(entry.rejectionReasons),
    };
  }
  return normalized;
}

function diffByQuery(left, right) {
  const out = {};
  const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
  for (const key of keys) {
    const l = left[key];
    const r = right[key];
    if (deepEqual(l, r)) continue;
    out[key] = { adult: l || null, teen: r || null };
  }
  return out;
}

const originalFetch = globalThis.fetch;
const requestedQueries = [];
globalThis.fetch = async (url) => {
  const parsed = new URL(String(url));
  const query = parsed.searchParams.get("q") || "";
  requestedQueries.push(query);
  const queryLower = query.toLowerCase();
  const pool = queryLower.includes("mystery thriller novel")
    ? fixturePool("Mystery")
    : queryLower.includes("science fiction thriller novel")
      ? fixturePool("Science Fiction")
      : fixturePool("Mystery");
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ totalItems: pool.length, items: pool }),
  };
};

const plan = {
  source: "googleBooks",
  enabled: true,
  status: "planned",
  timeoutMs: 2500,
  intents: [
    { id: "family-fiction-primary", query: "science fiction thriller novel", facets: ["science fiction", "thriller"], priority: 1, rationale: ["gate_fixture"] },
    { id: "adjacent-or-tone-fiction", query: "mystery thriller novel", facets: ["mystery", "thriller"], priority: 0.85, rationale: ["gate_fixture"] },
  ],
};

const cases = [
  { caseId: "adult-baseline", ageBand: "adult" },
  { caseId: "teen-baseline", ageBand: "teens" },
];

const resultsByBand = {};
for (const row of cases) {
  const profile = makeProfile(row.ageBand);
  const result = await googleBooksSourceAdapter.search(plan, { profile });
  const diagnostics = mapObject(result.diagnostics);
  resultsByBand[row.ageBand] = {
    status: String(result.status || ""),
    queryQuality: normalizeQueryQualityMap(diagnostics.googleBooksQueryResultQualityByQuery),
    adultAliasQuality: normalizeQueryQualityMap(diagnostics.adultGoogleBooksQueryQualityByQuery),
    narrativeYieldByQuery: mapObject(diagnostics.adultGoogleBooksNarrativeYieldByQuery),
    narrativeEfficiencyByQuery: mapObject(diagnostics.adultGoogleBooksNarrativeEfficiencyByQuery),
  };
}

if (originalFetch) globalThis.fetch = originalFetch;

const adult = resultsByBand.adult;
const teen = resultsByBand.teens;
const queryQualityEquivalent = deepEqual(adult.queryQuality, teen.queryQuality);
const adultAliasEquivalent = deepEqual(adult.adultAliasQuality, teen.adultAliasQuality);
const narrativeYieldEquivalent = deepEqual(adult.narrativeYieldByQuery, teen.narrativeYieldByQuery);
const narrativeEfficiencyEquivalent = deepEqual(adult.narrativeEfficiencyByQuery, teen.narrativeEfficiencyByQuery);

const aggregate = {
  requestedQueryCount: requestedQueries.length,
  adultStatus: adult.status,
  teenStatus: teen.status,
  queryQualityEquivalent,
  adultAliasEquivalent,
  narrativeYieldEquivalent,
  narrativeEfficiencyEquivalent,
  queryQualityDiffByQuery: diffByQuery(adult.queryQuality, teen.queryQuality),
  adultAliasDiffByQuery: diffByQuery(adult.adultAliasQuality, teen.adultAliasQuality),
};

const inventory = {
  sourcePath: resolve(repoRoot, "app/recommender-v2/sources/googleBooksSource.ts"),
  enginePath: resolve(repoRoot, "app/recommender-v2/engine.ts"),
  sharedCoreMapKey: "googleBooksQueryResultQualityByQuery",
  adultAliasMapKey: "adultGoogleBooksQueryQualityByQuery",
  sharedYieldMapKey: "adultGoogleBooksNarrativeYieldByQuery",
  sharedEfficiencyMapKey: "adultGoogleBooksNarrativeEfficiencyByQuery",
  teenOfflineAuditScripts: [
    "run-v2-googlebooks-teen-query-family-overlap-audit.mjs",
    "run-v2-googlebooks-teen-query-marginal-yield-audit.mjs",
  ],
};

let decision = "equivalent_duplication";
let rationale = "Adult and Teen emit equivalent query-quality diagnostics from the same retrieval-stage telemetry.";
if (!queryQualityEquivalent || !adultAliasEquivalent || !narrativeYieldEquivalent || !narrativeEfficiencyEquivalent) {
  decision = "shared_mechanism_age_policy_outputs";
  rationale = "Query-quality core appears shared, but age-band policy changes resulting per-query quality outputs.";
}
if (adult.status !== "succeeded" || teen.status !== "succeeded") {
  decision = "different_pipeline_layer";
  rationale = "Unable to establish equivalent retrieval-stage query-quality outputs for both age bands.";
}

const result = {
  generatedAt: new Date().toISOString(),
  capability: "#306 Query quality comparison",
  inventory,
  aggregate,
  adult,
  teen,
  decision: {
    decision,
    rationale,
    outcomes: {
      equivalent_duplication: "Keep as equivalent duplication / shared primitive candidate.",
      shared_mechanism_age_policy_outputs: "Treat as shared mechanism with age-specific policy wrappers.",
      different_pipeline_layer: "Reclassify as different pipeline layer or diagnostic-only asymmetry.",
    },
  },
};

mkdirSync(outDir, { recursive: true });
const jsonOut = resolve(outDir, "googlebooks-306-query-quality-role-gate.json");
const csvOut = resolve(outDir, "googlebooks-306-query-quality-role-gate.csv");
writeFileSync(jsonOut, JSON.stringify(result, null, 2));

const csvHeader = [
  "decision",
  "adultStatus",
  "teenStatus",
  "queryQualityEquivalent",
  "adultAliasEquivalent",
  "narrativeYieldEquivalent",
  "narrativeEfficiencyEquivalent",
  "queryDiffCount",
  "adultAliasDiffCount",
].join(",");
const csvRow = [
  decision,
  adult.status,
  teen.status,
  queryQualityEquivalent ? "true" : "false",
  adultAliasEquivalent ? "true" : "false",
  narrativeYieldEquivalent ? "true" : "false",
  narrativeEfficiencyEquivalent ? "true" : "false",
  Object.keys(aggregate.queryQualityDiffByQuery).length,
  Object.keys(aggregate.adultAliasDiffByQuery).length,
].join(",");
writeFileSync(csvOut, [csvHeader, csvRow].join("\n"));

console.log("=== GOOGLE BOOKS #306 QUERY QUALITY ROLE GATE ===");
console.log(`Decision: ${decision}`);
console.log(`Rationale: ${rationale}`);
console.log(`queryQualityEquivalent: ${queryQualityEquivalent}`);
console.log(`adultAliasEquivalent: ${adultAliasEquivalent}`);
console.log(`narrativeYieldEquivalent: ${narrativeYieldEquivalent}`);
console.log(`narrativeEfficiencyEquivalent: ${narrativeEfficiencyEquivalent}`);
console.log(`JSON written to: ${jsonOut}`);
console.log(`CSV written to: ${csvOut}`);
