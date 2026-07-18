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

function assertTruthy(value, message) {
  if (!value) throw new Error(`${message}: expected truthy, got ${JSON.stringify(value)}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertGreater(actual, expected, message) {
  if (!(actual > expected)) throw new Error(`${message}: expected ${actual} > ${expected}`);
}

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../app/recommender-v2");
const { googleBooksSourceAdapter } = require(resolve(dir, "sources/googleBooksSource.ts"));

function googleBook(id, title, description, categories, publisher = "Regression House") {
  return {
    kind: "books#volume",
    id,
    volumeInfo: {
      title,
      authors: ["Regression Author"],
      description,
      categories,
      publisher,
      publishedDate: "2024",
      pageCount: 320,
      printType: "BOOK",
      language: "en",
      maturityRating: "NOT_MATURE",
      industryIdentifiers: [{ type: "ISBN_13", identifier: `978100000${id.replace(/[^0-9]/g, "").padStart(4, "0").slice(-4)}` }],
    },
  };
}

function improvedFixtures(prefix) {
  return [
    googleBook(
      `${prefix}-novel-1`,
      `${prefix} Signal Novel`,
      "A detective follows a dangerous conspiracy through a near-future city and must uncover the truth before the killer strikes again.",
      ["Fiction / Science Fiction / Crime & Mystery", "Fiction / Thrillers / Suspense"],
      "Tor Books",
    ),
    googleBook(
      `${prefix}-novel-2`,
      `${prefix} Midnight Case`,
      "A former investigator must survive a layered mystery involving artificial intelligence, betrayal, and a missing witness.",
      ["Fiction / Mystery & Detective", "Fiction / Science Fiction / Action & Adventure"],
      "Orbit",
    ),
    googleBook(
      `${prefix}-category`,
      "Thriller Novels",
      "A catalog-style overview of thriller novels and suspense books for readers browsing the genre.",
      ["Fiction / Thrillers", "Reference / Bibliographies & Indexes"],
      "Catalog Press",
    ),
    googleBook(
      `${prefix}-study`,
      "Studies in Science Fiction Thrillers",
      "A scholarly study of science fiction thrillers, criticism, genre history, and cultural analysis.",
      ["Literary Criticism / Science Fiction & Fantasy", "Language Arts & Disciplines"],
      "Academic Press",
    ),
    googleBook(
      `${prefix}-guide`,
      "The Guide to Suspense Books",
      "A readers advisory guide to suspense books, with recommendations, lists, and reference notes.",
      ["Reference / Bibliographies & Indexes", "Literary Criticism"],
      "Readers Advisory Press",
    ),
    googleBook(
      `${prefix}-anthology`,
      "Great Short Stories of Detection, Mystery and Horror",
      "A collected anthology of mystery and horror stories by multiple authors.",
      ["Fiction / Anthologies", "Fiction / Mystery & Detective"],
      "Collection House",
    ),
  ];
}

const requestedQueries = [];
globalThis.fetch = async (url) => {
  const parsed = new URL(String(url));
  const query = parsed.searchParams.get("q") || "";
  requestedQueries.push(query);
  const prefix = query.includes("\"science fiction\"") ? "Science Fiction" : "Mystery";
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ totalItems: 6, items: improvedFixtures(prefix) }),
  };
};

const profile = {
  ageBand: "adult",
  maturityBand: "adult",
  genreFamily: [
    { value: "science fiction", weight: 2, evidence: ["like:Project Hail Mary"] },
    { value: "thriller", weight: 2, evidence: ["like:Gone Girl"] },
  ],
  tone: [],
  pacing: [],
  themes: [],
  characterDynamics: [],
  formatPreference: [],
  avoidSignals: [],
  sourceHints: ["googleBooks"],
  diagnostics: {},
};

const plan = {
  source: "googleBooks",
  enabled: true,
  status: "planned",
  timeoutMs: 2500,
  intents: [
    {
      id: "family-fiction-primary",
      query: "science fiction thriller novel",
      facets: ["science fiction", "thriller"],
      priority: 1,
      rationale: ["regression_baseline_query"],
    },
    {
      id: "adjacent-or-tone-fiction",
      query: "mystery thriller novel",
      facets: ["mystery", "thriller"],
      priority: 0.85,
      rationale: ["regression_baseline_query"],
    },
  ],
};

const expectedExclusions = [
  "-study",
  "-studies",
  "-guide",
  "-reference",
  "-criticism",
  "-companion",
  "-teaching",
  "-bibliography",
  "-anthology",
  "-magazine",
  "-journal",
  "-catalog",
];

const result = await googleBooksSourceAdapter.search(plan, { profile });
const diagnostics = result.diagnostics;
const quality = diagnostics.adultGoogleBooksQueryQualityByQuery || {};
const baseline = {
  "science fiction thriller novel": {
    totalResults: 6,
    narrativeCandidateCount: 1,
    narrativeEfficiency: 0.167,
    publicationShapeHistogram: {
      novel: 1,
      generic_category_catalog: 2,
      critical_study: 2,
      reference: 1,
    },
  },
  "mystery thriller novel": {
    totalResults: 6,
    narrativeCandidateCount: 1,
    narrativeEfficiency: 0.167,
    publicationShapeHistogram: {
      novel: 1,
      generic_category_catalog: 2,
      critical_study: 1,
      reference: 2,
    },
  },
};

assertEqual(result.status, "succeeded", "Google Books source should succeed with fixture data");
assertEqual(requestedQueries.length, 2, "Two Google Books queries should be attempted");
for (const query of requestedQueries) {
  assertTruthy(query.includes("subject:fiction"), "fetch query should scope to fiction subject");
  assertTruthy(query.includes("novel"), "fetch query should keep novel intent");
  for (const exclusion of expectedExclusions) {
    assertTruthy(query.includes(exclusion), `fetch query should include ${exclusion}`);
  }
}
assertTruthy(requestedQueries.some((query) => query.includes("\"science fiction\"")), "science fiction should be preserved as a quoted phrase");

for (const plannedQuery of Object.keys(baseline)) {
  const row = quality[plannedQuery];
  assertTruthy(row, `${plannedQuery} should have query quality diagnostics`);
  assertEqual(row.totalResults, 6, `${plannedQuery} should report total results`);
  assertEqual(row.narrativeCandidateCount, 2, `${plannedQuery} should report narrative yield`);
  assertEqual(row.acceptedCandidateCount, 2, `${plannedQuery} should report accepted source candidates`);
  assertEqual(row.publicationShapeHistogram.novel, 2, `${plannedQuery} should count novel shapes`);
  assertEqual(row.publicationShapeHistogram.generic_category_catalog, 1, `${plannedQuery} should count catalog shapes`);
  assertEqual(row.publicationShapeHistogram.critical_study, 1, `${plannedQuery} should count criticism shapes`);
  assertEqual(row.rejectedShapeHistogram.generic_category_catalog, 1, `${plannedQuery} should count rejected catalog shapes`);
  assertGreater(row.narrativeEfficiency, baseline[plannedQuery].narrativeEfficiency, `${plannedQuery} should improve over bare-query baseline efficiency`);
}

assertEqual(diagnostics.adultGoogleBooksNarrativeYieldByQuery["science fiction thriller novel"], 2, "narrative yield map should be populated");
assertEqual(diagnostics.adultGoogleBooksPublicationShapeHistogramByQuery["science fiction thriller novel"].novel, 2, "shape histogram map should be populated");
assertEqual(diagnostics.adultGoogleBooksRejectedShapeHistogramByQuery["science fiction thriller novel"].critical_study, 1, "rejected shape histogram map should be populated");

console.log(JSON.stringify({
  name: "adult google books query quality regressions",
  pass: true,
  requestedQueries,
  before: baseline,
  after: Object.fromEntries(Object.entries(quality).map(([query, row]) => [query, {
    totalResults: row.totalResults,
    narrativeCandidateCount: row.narrativeCandidateCount,
    narrativeEfficiency: row.narrativeEfficiency,
    acceptedCandidateCount: row.acceptedCandidateCount,
    publicationShapeHistogram: row.publicationShapeHistogram,
    rejectedShapeHistogram: row.rejectedShapeHistogram,
    rejectionReasons: row.rejectionReasons,
  }])),
}, null, 2));
