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
  const label = index === 1 ? "Alpha" : index === 2 ? "Beta" : index === 3 ? "Gamma" : `Extra${index}`;
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
  assertEqual(adultProfile.lockedBaseline, true, "adult Open Library profile should be locked");
  assertEqual(adultProfile.behaviorLabel, "adult_openlibrary_locked_baseline", "adult Open Library profile should expose locked label");

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
    {
      name: "fantasy romance adventure avoids mixed speculative without counter evidence",
      signals: [
        { action: "like", title: "Fantasy Romance", genres: ["fantasy", "romance"], themes: ["magic", "romantic"], format: "book" },
        { action: "like", title: "Myth Action", genres: ["fantasy"], themes: ["mythology", "action", "adventure"], format: "book" },
        { action: "skip", title: "Skipped Space", genres: ["science fiction"], themes: ["space"], format: "book" },
      ],
      expectedReason: "adult_fantasy_romance_adventure",
      expectedQueries: ["fantasy romance", "fantasy adventure", "mythological fantasy", "romantic fantasy"],
      extra(summary) {
        assertEqual(summary.dominance.wantsAdultMixedSpeculative, false, `${this.name} should not route through mixed speculative`);
        assertEqual(summary.dominance.wantsAdultFantasyRomanceAdventure, true, `${this.name} should expose fantasy romance adventure routing`);
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

  const delayedRetryFetchCalls = [];
  const delayedRetryCounts = new Map();
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    delayedRetryFetchCalls.push(query);
    delayedRetryCounts.set(query, (delayedRetryCounts.get(query) || 0) + 1);
    if (query === "speculative thriller" && delayedRetryCounts.get(query) >= 3) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ docs: [fakeDoc(query, 1), fakeDoc(query, 2), fakeDoc(query, 3)] }),
      };
    }
    throw new Error("timeout");
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "adult",
      signals: cases[0].signals,
    });
    const result = await openLibrarySourceAdapter.search(sourcePlan, { profile });
    assertEqual(result.rawItems.length, 3, "delayed final retry should recover rows when all immediate fallbacks time out");
    assertDeepEqual(delayedRetryFetchCalls, [
      "speculative thriller",
      "speculative thriller",
      "science fiction thriller",
      "fantasy romance",
      "mystery drama",
      "speculative thriller",
    ], "delayed final retry fetch chain");
    assertEqual(Boolean(result.diagnostics.dropReasons?.adult_delayed_final_retry_accepted), true, "delayed final retry should mark accepted rows");
    console.log(JSON.stringify({ name: "delayed final retry recovers after adult double timeout", pass: true, rawItems: result.rawItems.length, fetchCalls: delayedRetryFetchCalls }));
  } finally {
    globalThis.fetch = originalFetch;
  }

  const previousProxyBase = process.env.OPEN_LIBRARY_PROXY_BASE_URL;
  const proxyFetchUrls = [];
  process.env.OPEN_LIBRARY_PROXY_BASE_URL = "https://proxy.example.test";
  globalThis.fetch = async (url) => {
    proxyFetchUrls.push(String(url));
    const query = new URL(String(url)).searchParams.get("q") || "";
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ proxyAttempts: 2, docs: [1, 2, 3, 4, 5, 6, 7, 8].map((index) => fakeDoc(query, index)) }),
    };
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "adult",
      signals: cases[4].signals,
    });
    const result = await openLibrarySourceAdapter.search(sourcePlan, { profile });
    assertEqual(proxyFetchUrls[0].startsWith("https://proxy.example.test/api/openlibrary?"), true, "configured proxy base should route Open Library fetches through proxy");
    assertEqual(result.diagnostics.fetches?.[0]?.fetchPath, "proxy", "fetch diagnostics should mark configured proxy path");
    assertEqual(result.diagnostics.fetches?.[0]?.proxyAttempts, 2, "fetch diagnostics should surface proxy attempt count");
    assertEqual(result.diagnostics.fetches?.[0]?.proxyRetryWindowEnabled, true, "adult proxy fetch should use proxy retry client window");
    assertEqual(result.diagnostics.fetches?.[0]?.clientTimeoutMs >= 19000, true, "adult proxy fetch should not abort before proxy retries can finish");
    console.log(JSON.stringify({ name: "configured proxy path surfaces proxy attempts", pass: true, fetchPath: result.diagnostics.fetches?.[0]?.fetchPath, proxyAttempts: result.diagnostics.fetches?.[0]?.proxyAttempts, clientTimeoutMs: result.diagnostics.fetches?.[0]?.clientTimeoutMs }));
  } finally {
    if (previousProxyBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousProxyBase;
    globalThis.fetch = originalFetch;
  }

  const previousTeenProxyBase = process.env.OPEN_LIBRARY_PROXY_BASE_URL;
  const teenProxyFetchUrls = [];
  process.env.OPEN_LIBRARY_PROXY_BASE_URL = "https://proxy.example.test";
  globalThis.fetch = async (url) => {
    teenProxyFetchUrls.push(String(url));
    const query = new URL(String(url)).searchParams.get("q") || "";
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ proxyAttempts: 2, docs: [1, 2, 3, 4, 5, 6, 7, 8].map((index) => fakeDoc(query, index)) }),
    };
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "teens",
      signals: cases[2].signals,
    });
    const teenSourcePlan = { ...sourcePlan, timeoutMs: 8_000 };
    const result = await openLibrarySourceAdapter.search(teenSourcePlan, { profile });
    assertEqual(teenProxyFetchUrls[0].startsWith("https://proxy.example.test/api/openlibrary?"), true, "configured proxy base should route teen Open Library fetches through proxy");
    assertEqual(result.diagnostics.openLibraryProfileLabel, "teen_openlibrary_locked_baseline", "teen profile label should remain locked baseline");
    assertEqual(result.diagnostics.fetches?.[0]?.fetchPath, "proxy", "teen fetch diagnostics should mark configured proxy path");
    assertEqual(result.diagnostics.fetches?.[0]?.proxyRetryWindowEnabled, true, "teen proxy fetch should use proxy retry client window");
    assertEqual(result.diagnostics.fetches?.[0]?.clientTimeoutMs >= 6500, true, "teen proxy fetch should not abort at the 2s per-query baseline");
    console.log(JSON.stringify({ name: "teen proxy path uses resilience window without route changes", pass: true, fetchPath: result.diagnostics.fetches?.[0]?.fetchPath, clientTimeoutMs: result.diagnostics.fetches?.[0]?.clientTimeoutMs, profileLabel: result.diagnostics.openLibraryProfileLabel }));
  } finally {
    if (previousTeenProxyBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousTeenProxyBase;
    globalThis.fetch = originalFetch;
  }

  const previousTeenTimeoutProxyBase = process.env.OPEN_LIBRARY_PROXY_BASE_URL;
  const originalDateNow = Date.now;
  const teenTimeoutCascadeFetchCalls = [];
  let fakeNowOffsetMs = 0;
  process.env.OPEN_LIBRARY_PROXY_BASE_URL = "https://proxy.example.test";
  Date.now = () => originalDateNow() + fakeNowOffsetMs;
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    teenTimeoutCascadeFetchCalls.push(query);
    if (teenTimeoutCascadeFetchCalls.length === 1) {
      fakeNowOffsetMs = 7_100;
      throw new Error("timeout");
    }
    fakeNowOffsetMs = 7_200;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ proxyAttempts: 1, docs: [1, 2, 3, 4, 5, 6, 7, 8].map((index) => fakeDoc(query, index)) }),
    };
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "teens",
      signals: cases[2].signals,
    });
    const teenSourcePlan = { ...sourcePlan, timeoutMs: 8_000 };
    const result = await openLibrarySourceAdapter.search(teenSourcePlan, { profile });
    assertEqual(result.rawItems.length, 5, "teen timeout cascade should continue planned queries until five candidates");
    assertEqual(Boolean(result.diagnostics.dropReasons?.main_query_reserved_probe_time), false, "teen timeout cascade should not reserve emergency probe time after a main timeout");
    assertEqual(Boolean(result.diagnostics.dropReasons?.teen_timeout_cascade_continued_underfilled), true, "teen timeout cascade should mark underfilled continuation");
    assertEqual(result.diagnostics.fetches?.some((fetch) => fetch.queryFamily === "emergency_fallback"), false, "teen timeout cascade should not spend remaining budget on emergency probe");
    console.log(JSON.stringify({ name: "teen timeout cascade continues planned queries without probe reserve", pass: true, rawItems: result.rawItems.length, fetchCalls: teenTimeoutCascadeFetchCalls }));
  } finally {
    Date.now = originalDateNow;
    if (previousTeenTimeoutProxyBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousTeenTimeoutProxyBase;
    globalThis.fetch = originalFetch;
  }

  const underfillFetchCalls = [];
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    underfillFetchCalls.push(query);
    const docs = query === "horror fiction"
      ? [fakeDoc(query, 1), fakeDoc(query, 2), fakeDoc(query, 3)]
      : [fakeDoc(query, 1), fakeDoc(query, 2)];
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ docs }),
    };
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "adult",
      signals: [
        { action: "like", title: "Horror One", genres: ["horror"], themes: ["supernatural", "dark"], format: "book" },
        { action: "like", title: "Horror Two", genres: ["horror"], themes: ["psychological"], format: "book" },
      ],
    });
    const result = await openLibrarySourceAdapter.search(sourcePlan, { profile });
    assertEqual(result.rawItems.length, 8, "adult underfill recovery should add lane-safe slack for final selection filters");
    assertDeepEqual(underfillFetchCalls, ["gothic horror", "supernatural horror", "dark fantasy", "contemporary gothic fiction"], "adult underfill recovery should try remaining planned lane queries first");
    assertEqual(Boolean(result.diagnostics.dropReasons?.adult_underfill_recovery_accepted), true, "adult underfill recovery should mark accepted rows");
    console.log(JSON.stringify({ name: "adult underfill recovery tops up short lane-safe slates", pass: true, rawItems: result.rawItems.length, fetchCalls: underfillFetchCalls }));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

await main();
