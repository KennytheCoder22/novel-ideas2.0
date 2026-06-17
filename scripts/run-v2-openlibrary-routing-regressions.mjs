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
  const middleGradesProfile = openLibraryProfileForAgeBand("preteens");
  assertEqual(middleGradesProfile.lockedBaseline, false, "middle grades Open Library profile should remain unlocked while under review");
  assertEqual(middleGradesProfile.behaviorLabel, "middle_grades_openlibrary_profile_pending", "middle grades Open Library profile should expose pending label");
  const teenProfile = openLibraryProfileForAgeBand("teens");
  assertEqual(teenProfile.lockedBaseline, true, "teen Open Library profile should remain locked");
  assertEqual(teenProfile.behaviorLabel, "teen_openlibrary_locked_baseline", "teen Open Library profile should expose locked label");
  const kidsProfile = openLibraryProfileForAgeBand("kids");
  assertEqual(kidsProfile.lockedBaseline, false, "kids Open Library profile should remain pending");
  assertEqual(kidsProfile.behaviorLabel, "k2_openlibrary_profile_pending", "kids Open Library profile should expose pending label");

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

  const middleGradesCases = [
    {
      name: "middle grades fantasy adventure candidate baseline",
      signals: [
        { action: "like", title: "Magic Quest", genres: ["fantasy"], themes: ["magic", "adventure"], format: "book" },
        { action: "like", title: "School Adventure", genres: ["adventure"], themes: ["school", "friendship"], format: "book" },
      ],
      expectedReason: "middle_grades_fantasy_adventure",
      expectedQueries: ["middle grade fantasy", "fantasy adventure", "magic school", "adventure fiction"],
    },
    {
      name: "middle grades mystery adventure candidate baseline",
      signals: [
        { action: "like", title: "Puzzle Club", genres: ["mystery"], themes: ["detective", "school"], format: "book" },
        { action: "like", title: "Clue Chase", genres: ["adventure"], themes: ["investigation"], format: "book" },
      ],
      expectedReason: "middle_grades_mystery_adventure",
      expectedQueries: ["middle grade mystery", "mystery adventure", "school mystery", "detective fiction"],
    },
    {
      name: "middle grades contemporary school uses age-anchored fallback",
      signals: [
        { action: "like", title: "Classroom Friends", genres: ["realistic fiction"], themes: ["school", "friendship"], format: "book" },
        { action: "like", title: "Family Project", genres: ["contemporary"], themes: ["family", "coming of age"], format: "book" },
      ],
      expectedReason: "middle_grades_contemporary_school",
      expectedQueries: ["middle grade realistic fiction", "middle grade school story", "middle grade friendship", "middle grade adventure"],
    },
  ];

  for (const testCase of middleGradesCases) {
    const profile = buildTasteProfile({ ageBand: "preteens", signals: testCase.signals });
    const summary = summarizePlans(buildOpenLibraryQueryPlansForRegression(sourcePlan, profile, middleGradesProfile));
    assertEqual(summary.dominance.openLibraryPlanner, "middle_grades_profile_candidate", `${testCase.name} should use middle grades candidate planner`);
    assertEqual(summary.dominance.lockedBaseline, false, `${testCase.name} should remain unlocked`);
    assertEqual(summary.reason, testCase.expectedReason, `${testCase.name} routing reason`);
    assertDeepEqual(summary.queries, testCase.expectedQueries, `${testCase.name} query list`);
    assertEqual(summary.queries.includes("friendship fiction"), false, `${testCase.name} should not use broad friendship fiction`);
    console.log(JSON.stringify({ name: testCase.name, pass: true, reason: summary.reason, queries: summary.queries }));
  }

  const originalFetch = globalThis.fetch;

  const ageBandIsolationCases = [
    {
      name: "adult Open Library lane isolation",
      ageBand: "adult",
      profile: adultProfile,
      signals: cases[3].signals,
      expectedAgeProfile: "adult",
      expectedPlanner: "adult_locked_baseline",
      subjects: ["Fiction", "Mystery", "Historical fiction", "Drama"],
      titlePrefix: "Adult Lane",
    },
    {
      name: "teen Open Library lane isolation",
      ageBand: "teens",
      profile: teenProfile,
      signals: [
        { action: "like", title: "Teen Quest", genres: ["fantasy"], themes: ["adventure", "school"], format: "book" },
        { action: "like", title: "Teen Puzzle", genres: ["mystery"], themes: ["friendship"], format: "book" },
      ],
      expectedAgeProfile: "teen",
      expectedPlanner: "teen_locked_baseline",
      subjects: ["Young adult fiction", "Teen", "Fantasy", "Adventure"],
      titlePrefix: "Teen Lane",
    },
    {
      name: "middle grades Open Library lane isolation",
      ageBand: "preteens",
      profile: middleGradesProfile,
      signals: middleGradesCases[0].signals,
      expectedAgeProfile: "middleGrades",
      expectedPlanner: "middle_grades_profile_candidate",
      subjects: ["Juvenile fiction", "Children's stories", "Fantasy", "Adventure"],
      titlePrefix: "Middle Grade Lane",
    },
    {
      name: "kids Open Library lane isolation",
      ageBand: "kids",
      profile: kidsProfile,
      signals: [
        { action: "like", title: "Picture Book", genres: ["adventure"], themes: ["animals"], format: "book" },
        { action: "like", title: "Read Aloud", genres: ["humor"], themes: ["friendship"], format: "book" },
      ],
      expectedAgeProfile: "k2",
      expectedPlanner: "generic_pending_profile",
      subjects: ["Juvenile fiction", "Children's stories", "Easy readers", "Animals"],
      titlePrefix: "Kids Lane",
    },
  ];

  for (const isolationCase of ageBandIsolationCases) {
    const fetchCalls = [];
    globalThis.fetch = async (url) => {
      const query = new URL(String(url)).searchParams.get("q") || "";
      fetchCalls.push(query);
      const titleSeeds = ["River", "Harbor", "Forest", "Garden", "Comet", "Lantern", "Meadow", "Bridge"];
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ docs: titleSeeds.map((seed, index) => ({
          ...fakeDoc(query, index + 70),
          key: `/works/${isolationCase.expectedAgeProfile}-isolation-${index}`,
          title: `${isolationCase.titlePrefix} ${seed}`,
          author_name: [`${isolationCase.titlePrefix} Author ${index}`],
          subject: isolationCase.subjects,
          first_publish_year: 2012 + index,
        })) }),
      };
    };
    try {
      const profile = buildTasteProfile({ ageBand: isolationCase.ageBand, signals: isolationCase.signals });
      const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
      assertEqual(result.diagnostics.openLibraryAgeProfile, isolationCase.expectedAgeProfile, `${isolationCase.name} should report its own age profile`);
      assertEqual(result.diagnostics.openLibraryQueryRouting?.dominance?.openLibraryPlanner, isolationCase.expectedPlanner, `${isolationCase.name} should use its own planner`);
      if (isolationCase.ageBand !== "teens") {
        assertEqual(Boolean(result.diagnostics.dropReasons?.teen_underfill_recovery_query_attempted), false, `${isolationCase.name} should not run teen recovery outside teens`);
      }
      if (isolationCase.ageBand !== "preteens") {
        assertEqual(Boolean(result.diagnostics.dropReasons?.middle_grades_recovery_query_attempted), false, `${isolationCase.name} should not run middle grades recovery outside preteens`);
        assertEqual(Boolean(result.diagnostics.dropReasons?.middle_grades_age_shape_mismatch), false, `${isolationCase.name} should not apply middle grades age-shape outside preteens`);
      }
      if (isolationCase.ageBand !== "adult") {
        assertEqual(Boolean(result.diagnostics.dropReasons?.adult_underfill_recovery_query_attempted), false, `${isolationCase.name} should not run adult underfill recovery outside adults`);
      }
      const illegalQueryPattern = isolationCase.ageBand === "teens"
        ? /children|middle grade/i
        : isolationCase.ageBand === "preteens"
          ? /young adult|teen realistic|teen mystery/i
          : isolationCase.ageBand === "kids"
            ? /young adult|teen mystery|middle grade|children's adventure fiction/i
            : /middle grade|children's|teen mystery/i;
      assertEqual(fetchCalls.some((query) => illegalQueryPattern.test(query)), false, `${isolationCase.name} should not fetch another age lane's recovery queries`);
      console.log(JSON.stringify({ name: isolationCase.name, pass: true, rawItems: result.rawItems.length, fetchCalls }));
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  const middleGradesAgeShapeFetchCalls = [];
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    middleGradesAgeShapeFetchCalls.push(query);
    const adultLiteraryFriendshipDocs = [
      { ...fakeDoc(query, 1), key: "/works/adult-friendship-1", title: "Adult Friendship Stories", author_name: ["Adult Author"], subject: ["Fiction", "Friendship", "Short stories", "Literary fiction"], first_publish_year: 1985 },
      { ...fakeDoc(query, 2), key: "/works/adult-friendship-2", title: "Classic Friendship", author_name: ["Classic Author"], subject: ["Fiction", "Friendship", "Classic literature"], first_publish_year: 1905 },
    ];
    const middleGradesTitles = ["The River Club", "Locker Notes", "The Cafeteria Map", "Project Week", "The New Neighbor", "Field Trip Team"];
    const middleGradesDocs = middleGradesTitles.map((title, index) => ({
      ...fakeDoc(query, index + 10),
      key: `/works/mg-school-${index}`,
      title,
      author_name: [`MG Author ${index}`],
      subject: ["Juvenile fiction", "Schools", "Friendship", "Children's stories"],
      first_publish_year: 2015 + index,
    }));
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ docs: [...adultLiteraryFriendshipDocs, ...middleGradesDocs] }),
    };
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "preteens",
      signals: middleGradesCases[2].signals,
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
    assertEqual(result.rawItems.length >= 5, true, `middle grades age-shape filter should preserve age-shaped docs raw=${result.rawItems.length} drops=${JSON.stringify(result.diagnostics.dropReasons)}`);
    assertEqual(Boolean(result.diagnostics.dropReasons?.middle_grades_age_shape_mismatch), true, "middle grades age-shape filter should reject adult literary friendship docs");
    assertEqual(middleGradesAgeShapeFetchCalls.includes("friendship fiction"), false, "middle grades fetch cascade should avoid broad friendship fiction");
    console.log(JSON.stringify({ name: "middle grades age-shape filter rejects adult friendship drift", pass: true, rawItems: result.rawItems.length, fetchCalls: middleGradesAgeShapeFetchCalls }));
  } finally {
    globalThis.fetch = originalFetch;
  }

  const middleGradesRecoveryFetchCalls = [];
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    middleGradesRecoveryFetchCalls.push(query);
    if (/^middle grade realistic fiction|middle grade school story|middle grade friendship|middle grade adventure$/.test(query)) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ docs: [
          { ...fakeDoc(query, 1), key: `/works/adult-recovery-${query}-1`, title: `Adult ${query} 1`, author_name: ["Adult Author"], subject: ["Fiction", "Friendship", "Literary fiction"], first_publish_year: 1990 },
          { ...fakeDoc(query, 2), key: `/works/adult-recovery-${query}-2`, title: `Adult ${query} 2`, author_name: ["Adult Author"], subject: ["Fiction", "Friendship", "Short stories"], first_publish_year: 1995 },
        ] }),
      };
    }
    const docs = ["Pine Hill Quest", "Cafeteria Clues", "Field Day Plan", "Bus Ride Team", "Library Map"].map((title, index) => ({
      ...fakeDoc(query, index + 20),
      key: `/works/mg-recovery-${index}`,
      title,
      author_name: [`Recovery Author ${index}`],
      subject: ["Children's fiction", "Adventure stories", "Schools"],
      first_publish_year: 2018 + index,
    }));
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ docs }),
    };
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "preteens",
      signals: middleGradesCases[2].signals,
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
    assertEqual(result.rawItems.length, 5, "middle grades recovery should reach five age-shaped candidates");
    assertEqual(Boolean(result.diagnostics.dropReasons?.middle_grades_recovery_query_attempted), true, "middle grades recovery should run age-anchored recovery queries");
    assertEqual(middleGradesRecoveryFetchCalls.includes("friendship fiction"), false, "middle grades recovery should not use broad friendship fiction");
    assertEqual(middleGradesRecoveryFetchCalls.includes("young adult fantasy"), false, "middle grades recovery should not use YA fantasy emergency probe");
    assertEqual(middleGradesRecoveryFetchCalls.includes("middle grade adventure"), true, "middle grades recovery should use middle grade adventure");
    console.log(JSON.stringify({ name: "middle grades recovery uses age-anchored safe queries", pass: true, rawItems: result.rawItems.length, fetchCalls: middleGradesRecoveryFetchCalls }));
  } finally {
    globalThis.fetch = originalFetch;
  }

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
    assertEqual(result.diagnostics.fetches?.[0]?.clientTimeoutMs >= 4500 && result.diagnostics.fetches?.[0]?.clientTimeoutMs < 6500, true, "teen proxy fetch should leave source-budget room for locked cascade fallbacks");
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

  const teenIsolationFetchCalls = [];
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    teenIsolationFetchCalls.push(query);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ docs: [1, 2, 3, 4, 5, 6].map((index) => ({
        ...fakeDoc(query, index + 30),
        key: `/works/teen-isolation-${query}-${index}`,
        title: `Teen Isolation ${query} ${index}`,
        author_name: [`Teen Author ${index}`],
        subject: ["Young adult fiction", "Fantasy", "Adventure", "Teen"],
        first_publish_year: 2016 + index,
      })) }),
    };
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "teens",
      signals: [
        { action: "like", title: "Magic Trial", genres: ["fantasy"], themes: ["adventure", "school"], format: "book" },
        { action: "like", title: "Quest Team", genres: ["fantasy"], themes: ["friendship"], format: "book" },
      ],
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
    assertEqual(result.diagnostics.openLibraryProfileLabel, "teen_openlibrary_locked_baseline", "teen isolation should keep locked profile label");
    assertEqual(result.diagnostics.openLibraryQueryRouting?.dominance?.openLibraryPlanner, "teen_locked_baseline", "teen isolation should keep teen planner");
    assertEqual(Boolean(result.diagnostics.dropReasons?.middle_grades_recovery_query_attempted), false, "teen isolation should not run middle grades recovery");
    assertEqual(Boolean(result.diagnostics.dropReasons?.middle_grades_age_shape_mismatch), false, "teen isolation should not apply middle grades age-shape gate");
    assertEqual(teenIsolationFetchCalls.some((query) => /children|middle grade/i.test(query)), false, "teen isolation should not fetch middle grades recovery queries");
    console.log(JSON.stringify({ name: "teen isolation excludes middle grades recovery and age-shape gate", pass: true, rawItems: result.rawItems.length, fetchCalls: teenIsolationFetchCalls }));
  } finally {
    globalThis.fetch = originalFetch;
  }

  const teenUnderfillRecoveryFetchCalls = [];
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    teenUnderfillRecoveryFetchCalls.push(query);
    const acceptedCount = teenUnderfillRecoveryFetchCalls.length === 1 ? 3 : /teen mystery|young adult mystery|mystery adventure/.test(query) ? 4 : 0;
    return {
      ok: true,
      status: 200,
      text: async () => {
        const teenRecoveryTitles = ["The Caper Map", "Signal at Midnight", "The Hidden Pass", "Rooftop Clue", "The Last Envelope", "Harbor Puzzle"];
        return JSON.stringify({ docs: Array.from({ length: acceptedCount }, (_unused, index) => ({
          ...fakeDoc(query, index + 50),
          key: `/works/teen-underfill-${query}-${index}`,
          title: teenRecoveryTitles[index] || `Teen Recovery Pick ${index}`,
          author_name: [`Teen Recovery Author ${index}`],
          subject: ["Young adult fiction", "Mystery", "Adventure", "Teen"],
          first_publish_year: 2018 + index,
        })) });
      },
    };
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "teens",
      signals: [
        { action: "like", title: "Puzzle Run", genres: ["mystery"], themes: ["heist", "adventure"], format: "book" },
        { action: "like", title: "Caper Crew", genres: ["mystery"], themes: ["friendship"], format: "book" },
      ],
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
    assertEqual(result.rawItems.length, 5, "teen underfill recovery should reach five locked-lane candidates");
    assertEqual(Boolean(result.diagnostics.dropReasons?.teen_underfill_recovery_query_attempted), true, "teen underfill recovery should run teen-only recovery");
    assertEqual(Boolean(result.diagnostics.dropReasons?.middle_grades_recovery_query_attempted), false, "teen underfill recovery should not run middle grades recovery");
    assertEqual(Boolean(result.diagnostics.dropReasons?.middle_grades_age_shape_mismatch), false, "teen underfill recovery should not apply middle grades age-shape gate");
    assertEqual(teenUnderfillRecoveryFetchCalls.some((query) => /children|middle grade/i.test(query)), false, "teen underfill recovery should not fetch middle grades recovery queries");
    console.log(JSON.stringify({ name: "teen underfill recovery stays teen-only and reaches five", pass: true, rawItems: result.rawItems.length, fetchCalls: teenUnderfillRecoveryFetchCalls }));
  } finally {
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
