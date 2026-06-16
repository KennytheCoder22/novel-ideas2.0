import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const OUT_DIR = ".tmp/v2-openlibrary-routing-regressions";
const TS_FILES = [
  "app/recommender-v2/tasteProfile.ts",
  "app/recommender-v2/types.ts",
  "app/recommender-v2/sources/openLibrarySource.ts",
  "app/recommender-v2/sources/openLibraryProfiles.ts",
];

const sourcePlan = {
  source: "openLibrary",
  enabled: true,
  status: "planned",
  timeoutMs: 2_000,
  intents: [
    {
      id: "routing-regression",
      query: "fiction",
      facets: [],
      priority: 1,
      rationale: ["offline routing regression"],
    },
  ],
};

function compileHarnessDependencies() {
  execFileSync("node", [
    "node_modules/typescript/bin/tsc",
    "--target", "es2020",
    "--module", "commonjs",
    "--moduleResolution", "node",
    "--skipLibCheck",
    "--esModuleInterop",
    "--outDir", OUT_DIR,
    ...TS_FILES,
  ], { stdio: "pipe" });
}

function summarizePlans(plans) {
  const first = plans[0] || {};
  return {
    reason: String(first.routingReason || "missing"),
    queries: plans.map((plan) => plan.query),
    dominance: first.routingDominance || {},
  };
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
}

function fakeDoc(query, index) {
  const label = index === 1 ? "Alpha" : "Beta";
  return {
    key: `/works/${query.replace(/\s+/g, "-")}-${label.toLowerCase()}`,
    title: `${query} ${label}`,
    author_name: [`Author ${query} ${label}`],
    subject: ["Fiction", "Novel", "Mystery", "Thriller", "Fantasy", "Science fiction", "Drama"],
    language: ["eng"],
    first_publish_year: 2010 + index,
  };
}

async function main() {
  compileHarnessDependencies();
  const { buildTasteProfile } = await import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/tasteProfile.js`).href);
  const { buildOpenLibraryQueryPlansForRegression, openLibrarySourceAdapter } = await import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/sources/openLibrarySource.js`).href);
  const { openLibraryProfileForAgeBand } = await import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/sources/openLibraryProfiles.js`).href);
  const adultProfile = openLibraryProfileForAgeBand("adult");

  const cases = [
    {
      name: "weak dystopian uses broad mixed-speculative queries",
      signals: [
        { action: "like", title: "Sci-Fi Thriller", genres: ["science fiction"], themes: ["thriller", "suspense"], format: "book" },
        { action: "like", title: "Fantasy Romance", genres: ["fantasy", "romance"], themes: ["mystery drama"], format: "book" },
        { action: "like", title: "Mystery Drama", genres: ["mystery"], themes: ["drama"], format: "book" },
        { action: "skip", title: "Skipped Dystopia", genres: ["dystopian"], themes: ["post-apocalyptic"], format: "book" },
      ],
      expectedReason: "adult_mixed_speculative",
      expectedQueries: ["speculative thriller", "science fiction thriller", "fantasy romance", "mystery drama"],
      extra(summary) {
        assertEqual(summary.dominance.wantsAdultDystopianFirstMixedSpeculativeQueries, false, `${this.name} should not use dystopian-first query shape`);
      },
    },
    {
      name: "weak historical does not force historical fantasy survival",
      signals: [
        { action: "like", title: "Fantasy Quest", genres: ["fantasy", "adventure"], themes: ["mystery", "quest"], format: "book" },
        { action: "like", title: "Dark Mystery", genres: ["dark fantasy", "mystery"], themes: ["adventure"], format: "book" },
        { action: "skip", title: "Skipped Historical", genres: ["historical fiction"], themes: ["period"], format: "book" },
      ],
      expectedReason: "adult_fantasy_adventure_mystery",
      expectedQueries: ["fantasy adventure", "dark fantasy", "speculative mystery", "science fiction mystery"],
      extra(summary) {
        assertEqual(summary.dominance.wantsAdultFantasyHistoricalSurvival, false, `${this.name} should not activate historical survival`);
      },
    },
    {
      name: "mixed speculative beats generic adult sci-fi",
      signals: [
        { action: "like", title: "Space Thriller", genres: ["science fiction"], themes: ["thriller", "space"], format: "book" },
        { action: "like", title: "Drama Adventure", genres: ["adventure"], themes: ["drama", "survival"], format: "book" },
        { action: "like", title: "Mystery", genres: ["mystery"], themes: ["suspense"], format: "book" },
      ],
      expectedReason: "adult_mixed_speculative",
      expectedQueries: ["speculative thriller", "science fiction thriller", "fantasy romance", "mystery drama"],
      extra(summary) {
        assertEqual(summary.dominance.wantsAdultSciFi, false, `${this.name} should suppress generic adult sci-fi`);
      },
    },
    {
      name: "historical crime requires real activation evidence",
      signals: [
        { action: "like", title: "Historical Crime", genres: ["historical fiction", "crime"], themes: ["drama", "investigation"], format: "book" },
        { action: "like", title: "Crime Drama", genres: ["crime"], themes: ["realistic drama"], format: "book" },
      ],
      expectedReason: "adult_historical_crime_drama",
      expectedQueries: ["crime drama", "historical thriller", "historical mystery", "realistic drama"],
      extra(summary) {
        assertEqual(summary.dominance.hasAdultHistoricalCrimeActivationEvidence, true, `${this.name} should expose activation evidence`);
      },
    },
  ];

  for (const testCase of cases) {
    const profile = buildTasteProfile({ ageBand: "adult", signals: testCase.signals });
    const summary = summarizePlans(buildOpenLibraryQueryPlansForRegression(sourcePlan, profile, adultProfile));
    assertEqual(summary.reason, testCase.expectedReason, `${testCase.name} routing reason`);
    assertDeepEqual(summary.queries, testCase.expectedQueries, `${testCase.name} query list`);
    testCase.extra?.(summary);
    console.log(JSON.stringify({ name: testCase.name, pass: true, reason: summary.reason, queries: summary.queries }));
  }

  const originalFetch = globalThis.fetch;
  const fetchCalls = [];
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    fetchCalls.push(query);
    if (query === "speculative thriller") throw new Error("timeout");
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ docs: [fakeDoc(query, 1), fakeDoc(query, 2)] }),
    };
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "adult",
      signals: cases[0].signals,
    });
    const result = await openLibrarySourceAdapter.search(sourcePlan, { profile });
    assertEqual(result.rawItems.length, 5, "timeout recovery should continue planned fallbacks until five candidates");
    assertDeepEqual(fetchCalls, [
      "speculative thriller",
      "speculative thriller",
      "science fiction thriller",
      "fantasy romance",
      "mystery drama",
    ], "timeout recovery fetch chain");
    assertEqual(Boolean(result.diagnostics.dropReasons?.adult_timeout_recovery_continued_underfilled), true, "timeout recovery should mark underfilled continuation");
    console.log(JSON.stringify({ name: "timeout recovery continues planned fallbacks", pass: true, rawItems: result.rawItems.length, fetchCalls }));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

await main();
