import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const OUT_DIR = ".tmp/v2-openlibrary-routing-regressions";
const TS_FILES = [
  "app/recommender-v2/tasteProfile.ts",
  "app/recommender-v2/types.ts",
  "app/recommender-v2/select.ts",
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

function fakeScoredCandidate(overrides = {}) {
  const title = overrides.title || "Teen Selection Candidate";
  return {
    id: overrides.id || title.toLowerCase().replace(/\s+/g, "-"),
    source: overrides.source || "openLibrary",
    title,
    subtitle: overrides.subtitle || "",
    creators: overrides.creators || ["Shared Teen Author"],
    description: overrides.description || "",
    coverUrl: overrides.coverUrl || "",
    maturityBand: overrides.maturityBand,
    genres: overrides.genres || ["Fantasy"],
    themes: overrides.themes || ["Romance"],
    score: overrides.score ?? 8,
    scoreBreakdown: overrides.scoreBreakdown || { sourceQualityRelevance: 2, ageTeenSuitability: 1 },
    diagnostics: overrides.diagnostics || { queryText: "young adult contemporary fantasy", queryFamily: "fantasy_romance", routingReason: "dominant_contemporary_romance_fantasy" },
    rejectedReasons: [],
    raw: overrides.raw || {},
  };
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
  const { selectRecommendations } = await import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/select.js`).href);
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
        { action: "like", title: "Quest Trail", genres: ["adventure"], themes: ["quest", "survival"], format: "book" },
      ],
      expectedReason: "middle_grades_fantasy_adventure",
      expectedQueries: ["middle grade fantasy", "fantasy adventure", "magic school", "middle grade adventure"],
    },
    {
      name: "middle grades fantasy school-family avoids generic fantasy slate",
      signals: [
        { action: "like", title: "Magic Homeroom", genres: ["fantasy"], themes: ["magic", "school"], format: "book" },
        { action: "like", title: "Family Spell Project", genres: ["adventure"], themes: ["family", "friendship"], format: "book" },
      ],
      expectedReason: "middle_grades_fantasy_school_family",
      expectedQueries: ["magic school", "middle grade school story", "middle grade friendship", "middle grade adventure"],
    },
    {
      name: "middle grades fantasy mystery avoids generic fantasy slate",
      signals: [
        { action: "like", title: "Spell Clue", genres: ["fantasy"], themes: ["magic", "mystery"], format: "book" },
        { action: "like", title: "Puzzle Portal", genres: ["mystery"], themes: ["school", "investigation"], format: "book" },
      ],
      expectedReason: "middle_grades_fantasy_mystery",
      expectedQueries: ["middle grade fantasy mystery", "middle grade mystery", "school mystery", "middle grade adventure"],
    },
    {
      name: "middle grades fantasy humor avoids generic fantasy slate",
      signals: [
        { action: "like", title: "Silly Spell", genres: ["fantasy"], themes: ["magic", "humor"], format: "book" },
        { action: "like", title: "Dragon Jokes", genres: ["comedy"], themes: ["funny", "friendship"], format: "book" },
      ],
      expectedReason: "middle_grades_fantasy_humor",
      expectedQueries: ["middle grade humor", "funny fantasy", "children's funny books", "middle grade adventure"],
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
    {
      name: "middle grades playful comedy resists weak nonfiction sci-fi override",
      signals: [
        { action: "like", title: "Joke Quest", genres: ["comedy"], themes: ["playful", "adventure"], format: "book" },
        { action: "like", title: "Funny Trail", genres: ["humor"], themes: ["funny", "friendship"], format: "book" },
        { action: "like", title: "Science Facts", genres: ["nonfiction"], themes: ["science fiction"], format: "book" },
      ],
      expectedReason: "middle_grades_humor",
      expectedQueries: ["middle grade humor", "middle grade school story", "humorous fiction", "middle grade adventure"],
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

  const teenBroadFallbackProfile = buildTasteProfile({
    ageBand: "teens",
    signals: [
      { action: "like", title: "Magic Academy", genres: ["fantasy"], themes: ["school", "action"], format: "book" },
      { action: "like", title: "Action Quest", genres: ["fantasy"], themes: ["adventure"], format: "book" },
    ],
  });
  const teenBroadFallbackSummary = summarizePlans(buildOpenLibraryQueryPlansForRegression(sourcePlan, teenBroadFallbackProfile, teenProfile));
  assertDeepEqual(teenBroadFallbackSummary.queries, ["fantasy school", "action adventure", "young adult fantasy"], "teen locked lane should attempt specific queries before broad fallback");
  assertEqual(teenBroadFallbackSummary.dominance.openLibraryPlanner, "teen_locked_baseline", "teen broad fallback ordering should preserve locked planner");
  console.log(JSON.stringify({ name: "teen locked lane tries specific queries before broad fallback", pass: true, queries: teenBroadFallbackSummary.queries }));

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
      signals: middleGradesCases[5].signals,
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
    assertEqual(result.rawItems.length >= 5, true, `middle grades age-shape filter should preserve age-shaped docs raw=${result.rawItems.length} drops=${JSON.stringify(result.diagnostics.dropReasons)}`);
    assertEqual(Boolean(result.diagnostics.dropReasons?.middle_grades_age_shape_mismatch), true, "middle grades age-shape filter should reject adult literary friendship docs");
    const ageShapeDiagnostics = result.diagnostics.middleGradesAgeShapeDiagnostics || {};
    const ageShapeSamples = Array.isArray(ageShapeDiagnostics.samples) ? ageShapeDiagnostics.samples : [];
    assertEqual(Number(ageShapeDiagnostics.observed) >= 7, true, "middle grades age-shape observability should count evaluated candidates");
    assertEqual(Number(ageShapeDiagnostics.accepted) >= 5, true, "middle grades age-shape observability should count accepted candidates");
    assertEqual(Number(ageShapeDiagnostics.rejected) >= 1, true, "middle grades age-shape observability should count rejected candidates");
    assertEqual(ageShapeSamples.some((sample) => sample.reason === "middle_grades_age_shape_mismatch" && sample.evidence?.hasExplicitMiddleGradesEvidence === false), true, "middle grades age-shape observability should sample mismatch evidence");
    assertEqual(ageShapeSamples.some((sample) => sample.keep === true && sample.evidence?.hasExplicitMiddleGradesEvidence === true), true, "middle grades age-shape observability should sample accepted evidence");
    assertEqual(middleGradesAgeShapeFetchCalls.includes("friendship fiction"), false, "middle grades fetch cascade should avoid broad friendship fiction");
    console.log(JSON.stringify({ name: "middle grades age-shape filter rejects adult friendship drift", pass: true, rawItems: result.rawItems.length, fetchCalls: middleGradesAgeShapeFetchCalls }));
  } finally {
    globalThis.fetch = originalFetch;
  }

  const middleGradesWeakMetadataFetchCalls = [];
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    middleGradesWeakMetadataFetchCalls.push(query);
    const docs = ["Signal Station", "Moonbase Map", "Robot Relay", "Asteroid Team", "Orbit Club"].map((title, index) => ({
      ...fakeDoc(query, index + 40),
      key: `/works/mg-weak-metadata-${index}`,
      title,
      author_name: [`MG SciFi Author ${index}`],
      subject: ["Fiction"],
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
      signals: middleGradesCases[0].signals,
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
    assertEqual(result.rawItems.length >= 5, true, "middle grades age-shape gate should accept age-anchored query results with query genre shape");
    const ageShapeDiagnostics = result.diagnostics.middleGradesAgeShapeDiagnostics || {};
    const ageShapeSamples = Array.isArray(ageShapeDiagnostics.samples) ? ageShapeDiagnostics.samples : [];
    assertEqual(ageShapeSamples.some((sample) => sample.keep === true && sample.evidence?.hasQueryGenreShape === true && sample.evidence?.hasSubjectGenreShape === false), true, "middle grades age-shape diagnostics should show query-genre acceptance for weak metadata");
    console.log(JSON.stringify({ name: "middle grades age-shape accepts age-anchored query genre shape", pass: true, rawItems: result.rawItems.length, fetchCalls: middleGradesWeakMetadataFetchCalls }));
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
      signals: middleGradesCases[5].signals,
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

  const middleGradesUnderfillFetchCalls = [];
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    middleGradesUnderfillFetchCalls.push(query);
    if (/^middle grade fantasy|fantasy adventure|magic school|middle grade adventure$/.test(query)) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ docs: [
          { ...fakeDoc(query, 1), key: `/works/adult-underfill-${query}-1`, title: `Adult ${query} 1`, author_name: ["Adult Author"], subject: ["Fiction", "Literary fiction"], first_publish_year: 1990 },
          { ...fakeDoc(query, 2), key: `/works/adult-underfill-${query}-2`, title: `Adult ${query} 2`, author_name: ["Adult Author"], subject: ["Fiction", "Short stories"], first_publish_year: 1995 },
        ] }),
      };
    }
    const docsForQuery = query === "children's fantasy adventure"
      ? ["Lantern Gate", "Cloud Dragon", "River Spell"]
      : query === "middle grade fiction"
        ? ["Library Quest", "After-School Portal", "Cafeteria Compass"]
        : [];
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ docs: docsForQuery.map((title, index) => ({
        ...fakeDoc(query, index + 50),
        key: `/works/mg-underfill-${query}-${index}`,
        title,
        author_name: [`Underfill Author ${index}`],
        subject: ["Children's fiction", "Adventure stories", "Fantasy"],
        first_publish_year: 2020 + index,
      })) }),
    };
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "preteens",
      signals: middleGradesCases[0].signals,
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
    assertEqual(result.rawItems.length >= 3, true, "middle grades underfill recovery should preserve age-anchored recovery candidates that survive stricter age-shape filters");
    assertEqual(middleGradesUnderfillFetchCalls.includes("children's fantasy adventure"), true, "middle grades underfill recovery should use age-anchored fantasy recovery");
    assertEqual(Boolean(result.diagnostics.dropReasons?.middle_grades_recovery_accepted), true, "middle grades underfill recovery should record accepted recovery candidates");
    assertEqual(Boolean(result.diagnostics.finalCountContractStatus), true, "middle grades underfill-safe recovery should expose final count-contract status");
    assertEqual(Boolean(result.diagnostics.underfillSafeRecoveryAttempted), true, "middle grades underfill-safe recovery should expose attempted diagnostics");
    assertEqual(typeof result.diagnostics.underfillSafeRecoveryAcceptedCount === "number", true, "middle grades underfill-safe recovery should expose accepted-count diagnostics");
    console.log(JSON.stringify({ name: "middle grades underfill recovery continues to five", pass: true, rawItems: result.rawItems.length, fetchCalls: middleGradesUnderfillFetchCalls }));
  } finally {
    globalThis.fetch = originalFetch;
  }

  const middleGradesHumorContinuationFetchCalls = [];
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    middleGradesHumorContinuationFetchCalls.push(query);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ docs: [1, 2, 3, 4, 5, 6, 7, 8].map((index) => fakeDoc(query, index)) }),
    };
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "preteens",
      signals: middleGradesCases[3].signals,
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
    assertEqual(result.rawItems.some((item) => item.queryText === "middle grade adventure"), true, "middle grades fantasy humor should continue to an aligned adventure query after weak successful humor results");
    assertEqual(Boolean(result.diagnostics.dropReasons?.middle_grades_fantasy_humor_default_slate_soft_cap), true, "middle grades fantasy humor continuation should record default slate soft cap");
    assertDeepEqual(middleGradesHumorContinuationFetchCalls, ["middle grade humor", "funny fantasy", "children's funny books", "middle grade adventure"], "middle grades fantasy humor should not stop on successful humor/funny-book queries before adventure");
    console.log(JSON.stringify({ name: "middle grades fantasy humor continues after weak successful humor slate", pass: true, rawItems: result.rawItems.length, fetchCalls: middleGradesHumorContinuationFetchCalls }));
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

  const previousMiddleGradesProxyBase = process.env.OPEN_LIBRARY_PROXY_BASE_URL;
  const middleGradesProxyFetchUrls = [];
  process.env.OPEN_LIBRARY_PROXY_BASE_URL = "https://proxy.example.test";
  globalThis.fetch = async (url) => {
    middleGradesProxyFetchUrls.push(String(url));
    const query = new URL(String(url)).searchParams.get("q") || "";
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ proxyAttempts: 2, docs: [1, 2, 3, 4, 5, 6, 7, 8].map((index) => fakeDoc(query, index)) }),
    };
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "preteens",
      signals: middleGradesCases[0].signals,
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
    assertEqual(middleGradesProxyFetchUrls[0].startsWith("https://proxy.example.test/api/openlibrary?"), true, "configured proxy base should route middle grades Open Library fetches through proxy");
    assertEqual(result.diagnostics.openLibraryProfileLabel, "middle_grades_openlibrary_profile_pending", "middle grades profile label should remain pending/unlocked");
    assertEqual(result.diagnostics.fetches?.[0]?.fetchPath, "proxy", "middle grades fetch diagnostics should mark configured proxy path");
    assertEqual(result.diagnostics.fetches?.[0]?.proxyRetryWindowEnabled, true, "middle grades proxy fetch should use proxy retry client window");
    assertEqual(result.diagnostics.fetches?.[0]?.clientTimeoutMs >= 1600 && result.diagnostics.fetches?.[0]?.clientTimeoutMs < 2500, true, "middle grades proxy fetch should use a reduced middle-grades-specific resilience window");
    console.log(JSON.stringify({ name: "middle grades proxy path uses age-specific resilience window", pass: true, fetchPath: result.diagnostics.fetches?.[0]?.fetchPath, clientTimeoutMs: result.diagnostics.fetches?.[0]?.clientTimeoutMs, profileLabel: result.diagnostics.openLibraryProfileLabel }));
  } finally {
    if (previousMiddleGradesProxyBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousMiddleGradesProxyBase;
    globalThis.fetch = originalFetch;
  }

  const shapedAntiZeroFallbackCases = [
    {
      name: "science",
      expected: "middle grade dystopian adventure",
      signals: [{ action: "like", title: "Space Science", source: "mock", format: "book", genres: ["Science Fiction / Space / Dystopian"], tags: ["science fiction", "space", "dystopian"] }],
    },
    {
      name: "nature",
      expected: "middle grade animal adventure",
      signals: [{ action: "like", title: "Wild Nature", source: "mock", format: "book", genres: ["Nonfiction / Animals / Nature"], tags: ["nonfiction", "animals", "nature"] }],
    },
    {
      name: "friendship",
      expected: "middle grade friendship adventure",
      signals: [{ action: "like", title: "Friend Group", source: "mock", format: "book", genres: ["Friendship / Community / School"], tags: ["friendship", "community", "school"] }],
    },
    {
      name: "robot comedy",
      expected: "middle grade AI robot superhero comedy",
      signals: [{ action: "like", title: "Robot Hero Laughs", source: "mock", format: "book", genres: ["Comedy / Superhero / AI"], tags: ["robots", "superhero", "comedy", "playful"] }],
    },
  ];
  const shapedAntiZeroFallbackQueries = [];
  for (const fallbackCase of shapedAntiZeroFallbackCases) {
    const previousFallbackProxyBase = process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    const originalFallbackDateNow = Date.now;
    const fetchCalls = [];
    let fakeNowOffsetMs = 0;
    process.env.OPEN_LIBRARY_PROXY_BASE_URL = "https://proxy.example.test";
    Date.now = () => originalFallbackDateNow() + fakeNowOffsetMs;
    globalThis.fetch = async (url) => {
      const query = new URL(String(url)).searchParams.get("q") || "";
      fetchCalls.push(query);
      if (fetchCalls.length === 1) {
        fakeNowOffsetMs = 3_500;
        throw new Error("timeout");
      }
      if (fetchCalls.length === 2) {
        fakeNowOffsetMs = 4_200;
        throw new Error("timeout");
      }
      fakeNowOffsetMs = 5_100;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ proxyAttempts: 1, docs: [1, 2, 3, 4, 5, 6].map((index) => fakeDoc(query, index)) }),
      };
    };
    try {
      const profile = buildTasteProfile({ ageBand: "preteens", signals: fallbackCase.signals });
      const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
      shapedAntiZeroFallbackQueries.push(result.diagnostics.middleGradesAntiZeroFallbackShapedQuery);
      assertEqual(result.rawItems.length >= 5, true, `${fallbackCase.name} anti-zero fallback should recover rows`);
      assertEqual(fetchCalls.includes(fallbackCase.expected), true, `${fallbackCase.name} anti-zero fallback should use the swipe-shaped query`);
      assertEqual(result.diagnostics.middleGradesAntiZeroFallbackShapedQuery, fallbackCase.expected, `${fallbackCase.name} diagnostics should expose shaped anti-zero query`);
      assertEqual(Array.isArray(result.diagnostics.middleGradesAntiZeroFallbackShapingSignals), true, `${fallbackCase.name} diagnostics should expose shaping signals`);
    } finally {
      Date.now = originalFallbackDateNow;
      if (previousFallbackProxyBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
      else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousFallbackProxyBase;
      globalThis.fetch = originalFetch;
    }
  }
  assertEqual(new Set(shapedAntiZeroFallbackQueries).size, 4, "different preteen profiles should not all collapse to the same anti-zero fallback query");
  console.log(JSON.stringify({ name: "middle grades anti-zero fallback is shaped by swipe profile", pass: true, fallbackQueries: shapedAntiZeroFallbackQueries }));

  const teenSelectionProfile = buildTasteProfile({
    ageBand: "teens",
    signals: [
      { action: "like", title: "Modern Spell", genres: ["fantasy"], themes: ["romance", "coming of age"], format: "book" },
    ],
  });
  const teenSelectionCandidates = [
    fakeScoredCandidate({ id: "teen-selection-aster", title: "Teen Selection Aster", creators: ["Shared Teen Author"], score: 10 }),
    fakeScoredCandidate({ id: "teen-selection-aster-duplicate", title: "Teen Selection Aster", creators: ["Second Teen Author"], score: 9.95 }),
    ...["Briar", "Cinder", "Dahlia", "Ember", "Fable"].map((seed, index) => fakeScoredCandidate({
      id: `teen-selection-${index}`,
      title: `Teen Selection ${seed}`,
      creators: ["Shared Teen Author"],
      score: 9.9 - index * 0.1,
    })),
  ];
  const teenSelectionResult = selectRecommendations(teenSelectionCandidates, teenSelectionProfile, 10);
  assertEqual(teenSelectionResult.selected.length, 5, "teen selection should relax Open Library diversity underfill to five");
  assertEqual(new Set(teenSelectionResult.selected.map((candidate) => candidate.title)).size, 5, "teen selection underfill recovery should keep duplicate titles blocked");
  assertEqual(Boolean(teenSelectionResult.rejectedReasons.duplicate_title), true, "teen selection should record duplicate title rejection before safe underfill recovery");
  assertEqual(Boolean(teenSelectionResult.rejectedReasons.teen_openlibrary_underfill_relaxed_diversity || teenSelectionResult.rejectedReasons.teen_openlibrary_underfill_safe_candidate_accepted), true, "teen selection should emit teen-only Open Library underfill diagnostics");
  console.log(JSON.stringify({ name: "teen selection relaxes Open Library diversity underfill to five", pass: true, selected: teenSelectionResult.selected.length, rejectedReasons: teenSelectionResult.rejectedReasons }));

  const middleGradesSelectionProfile = buildTasteProfile({
    ageBand: "preteens",
    signals: [
      { action: "like", title: "Funny Hallway", genres: ["comedy"], themes: ["school", "friendship"], format: "book" },
    ],
  });
  const middleGradesSelectionCandidates = [
    fakeScoredCandidate({ id: "middle-selection-aster", title: "Middle Selection Aster", creators: ["Shared Middle Author"], score: 10, maturityBand: "preteens" }),
    fakeScoredCandidate({ id: "middle-selection-aster-duplicate", title: "Middle Selection Aster", creators: ["Second Middle Author"], score: 9.95, maturityBand: "preteens" }),
    ...["Briar", "Cinder", "Dahlia", "Ember", "Fable"].map((seed, index) => fakeScoredCandidate({
      id: `middle-selection-${index}`,
      title: `Middle Selection ${seed}`,
      creators: ["Shared Middle Author"],
      score: 9.9 - index * 0.1,
      maturityBand: "preteens",
      diagnostics: { queryText: "middle grade humor", queryFamily: "humor", routingReason: "middle_grades_fantasy_humor" },
    })),
  ];
  const middleGradesSelectionResult = selectRecommendations(middleGradesSelectionCandidates, middleGradesSelectionProfile, 10);
  assertEqual(middleGradesSelectionResult.selected.length, 5, "middle grades selection should relax Open Library diversity underfill to five");
  assertEqual(new Set(middleGradesSelectionResult.selected.map((candidate) => candidate.title)).size, 5, "middle grades selection underfill recovery should keep duplicate titles blocked");
  assertEqual(Boolean(middleGradesSelectionResult.rejectedReasons.duplicate_title), true, "middle grades selection should record duplicate title rejection before safe underfill recovery");
  assertEqual(Boolean(middleGradesSelectionResult.rejectedReasons.middle_grades_openlibrary_underfill_relaxed_diversity || middleGradesSelectionResult.rejectedReasons.middle_grades_openlibrary_underfill_safe_candidate_accepted), true, "middle grades selection should emit middle-grades Open Library underfill diagnostics");
  assertEqual(Boolean(middleGradesSelectionResult.rejectedReasons.routeAlignmentScoreByTitle), true, "middle grades selection should expose route alignment scores by title");
  assertEqual(Boolean(middleGradesSelectionResult.rejectedReasons.genreFacetMatchScoreByTitle), true, "middle grades selection should expose genre facet match scores by title");
  assertEqual(Boolean(middleGradesSelectionResult.rejectedReasons.fallbackPenaltyByTitle), true, "middle grades selection should expose fallback penalties by title");
  assertEqual(Boolean(middleGradesSelectionResult.rejectedReasons.finalSelectionReasonByTitle), true, "middle grades selection should expose final selection reasons by title");
  assertEqual(Boolean(middleGradesSelectionResult.rejectedReasons.queryLevelRouteAlignmentByTitle), true, "middle grades selection should expose query-level route alignment by title");
  assertEqual(Boolean(middleGradesSelectionResult.rejectedReasons.documentLevelRouteAlignmentByTitle), true, "middle grades selection should expose document-level route alignment by title");
  assertEqual(Boolean(middleGradesSelectionResult.rejectedReasons.routeAlignmentEvidenceFieldsByTitle), true, "middle grades selection should expose route alignment evidence fields by title");
  assertEqual(Number(middleGradesSelectionResult.rejectedReasons.falseRouteAlignedDueToQueryOnlyCount || 0) > 0, true, "middle grades selection should demote query-only route alignment");
  assertEqual(middleGradesSelectionResult.rejectedReasons.finalCountContractStatus, "full_fallback_only", "middle grades query-only underfill slate should be count-success but fallback-only quality");
  console.log(JSON.stringify({ name: "middle grades selection relaxes Open Library diversity underfill to five", pass: true, selected: middleGradesSelectionResult.selected.length, rejectedReasons: middleGradesSelectionResult.rejectedReasons }));

  const middleGradesZeroFinalGuardResult = selectRecommendations([fakeScoredCandidate({
    id: "middle-zero-final-guard",
    title: "Middle Zero Final Guard",
    creators: ["Guard Author"],
    score: -5,
    maturityBand: "preteens",
    diagnostics: { queryText: "middle grade adventure", queryFamily: "adventure", routingReason: "middle_grades_fantasy_humor_final_safe_recovery", emergencyFallback: true, fallbackAlignment: "anti_zero" },
    scoreBreakdown: { ageTeenSuitability: 0.25, avoidSignalPenalty: 0, genreFacetMatch: 0 },
  })], middleGradesSelectionProfile, 5);
  assertEqual(middleGradesZeroFinalGuardResult.selected.length, 1, "middle grades zero-final-items guard should preserve safe Open Library docs");
  assertEqual(Boolean(middleGradesZeroFinalGuardResult.rejectedReasons.accepted_middle_grades_zero_final_items_guard), true, "middle grades zero-final-items guard should emit diagnostics");
  console.log(JSON.stringify({ name: "middle grades zero-final-items guard preserves safe Open Library docs", pass: true, selected: middleGradesZeroFinalGuardResult.selected.length, rejectedReasons: middleGradesZeroFinalGuardResult.rejectedReasons }));

  const middleGradesContemporarySelectionProfile = buildTasteProfile({
    ageBand: "preteens",
    signals: middleGradesCases[5].signals,
  });
  const middleGradesContemporarySelectionCandidates = [
    ...["Portal Quest", "Dragon Trail", "Magic Road", "Castle Run"].map((title, index) => fakeScoredCandidate({
      id: `middle-contemporary-adventure-${index}`,
      title,
      creators: [`Adventure Fallback Author ${index}`],
      score: 10 - index * 0.1,
      maturityBand: "preteens",
      diagnostics: { queryText: "middle grade adventure", queryFamily: "adventure", routingReason: "middle_grades_contemporary_school" },
    })),
    ...["Classroom Friends", "Family Project", "Lunchroom Team", "After School Club"].map((title, index) => fakeScoredCandidate({
      id: `middle-contemporary-aligned-${index}`,
      title,
      creators: [`School Author ${index}`],
      score: index === 0 ? 11 : 5,
      maturityBand: "preteens",
      diagnostics: { queryText: index === 1 ? "middle grade realistic fiction" : index === 2 ? "middle grade friendship" : "middle grade school story", queryFamily: index === 1 ? "realistic" : index === 2 ? "friendship" : "school", routingReason: "middle_grades_contemporary_school" },
    })),
  ];
  const middleGradesContemporarySelectionResult = selectRecommendations(middleGradesContemporarySelectionCandidates, middleGradesContemporarySelectionProfile, 5);
  const contemporaryAlignedSelected = middleGradesContemporarySelectionResult.selected.filter((candidate) => /\b(realistic|school|friendship|classroom|family|contemporary)\b/i.test(String(candidate.diagnostics?.queryText || ""))).length;
  const contemporaryAdventureSelected = middleGradesContemporarySelectionResult.selected.filter((candidate) => /\b(adventure|fantasy|magic|quest)\b/i.test(String(candidate.diagnostics?.queryText || "")) && /middle_grades_contemporary_school/i.test(String(candidate.diagnostics?.routingReason || ""))).length;
  assertEqual(contemporaryAlignedSelected, 4, "middle grades contemporary selection should exhaust aligned school/friendship/realistic candidates before adventure fallback");
  assertEqual(contemporaryAdventureSelected, 1, "middle grades contemporary selection should leave adventure fallback only for true shortage slots");
  assertEqual(Boolean(middleGradesContemporarySelectionResult.rejectedReasons.middle_grades_contemporary_school_alignment_accepted), true, "middle grades contemporary selection should emit alignment diagnostics");
  console.log(JSON.stringify({ name: "middle grades contemporary selection prefers aligned school candidates", pass: true, selected: middleGradesContemporarySelectionResult.selected.map((candidate) => candidate.title), rejectedReasons: middleGradesContemporarySelectionResult.rejectedReasons }));

  const middleGradesContemporaryDefaultCapCandidates = [
    ...["School Gag One", "School Gag Two", "School Gag Three", "School Gag Four", "School Gag Five"].map((title, index) => fakeScoredCandidate({
      id: `middle-contemporary-default-${index}`,
      title,
      creators: [`School Default Author ${index}`],
      score: 10 - index * 0.1,
      maturityBand: "preteens",
      diagnostics: { queryText: "middle grade school story", queryFamily: "school", routingReason: "middle_grades_contemporary_school" },
    })),
    ...["Family Class Project", "Friendship Class Team"].map((title, index) => fakeScoredCandidate({
      id: `middle-contemporary-safer-${index}`,
      title,
      creators: [`School Safer Author ${index}`],
      score: 8 - index * 0.1,
      maturityBand: "preteens",
      diagnostics: { queryText: index === 0 ? "middle grade family story" : "middle grade friendship", queryFamily: index === 0 ? "family" : "friendship", routingReason: "middle_grades_contemporary_school" },
    })),
  ];
  const middleGradesContemporaryDefaultCapResult = selectRecommendations(middleGradesContemporaryDefaultCapCandidates, middleGradesContemporarySelectionProfile, 5);
  const contemporaryDefaultSelected = middleGradesContemporaryDefaultCapResult.selected.filter((candidate) => /middle grade school story/i.test(String(candidate.diagnostics?.queryText || ""))).length;
  assertEqual(contemporaryDefaultSelected <= 3, true, "middle grades contemporary selection should cap generic school/default candidates when safer aligned candidates exist");
  assertEqual(Boolean(middleGradesContemporaryDefaultCapResult.rejectedReasons.middle_grades_contemporary_school_default_cap_accepted), true, "middle grades contemporary default cap should emit replacement diagnostics");
  console.log(JSON.stringify({ name: "middle grades contemporary selection caps generic school defaults", pass: true, selected: middleGradesContemporaryDefaultCapResult.selected.map((candidate) => candidate.title), rejectedReasons: middleGradesContemporaryDefaultCapResult.rejectedReasons }));

  const middleGradesFantasyHumorBalanceProfile = buildTasteProfile({
    ageBand: "preteens",
    signals: middleGradesCases[3].signals,
  });
  const middleGradesFantasyHumorBalanceCandidates = [
    ...["Giggle One", "Giggle Two", "Giggle Three", "Giggle Four", "Giggle Five"].map((title, index) => fakeScoredCandidate({
      id: `middle-humor-default-${index}`,
      title,
      creators: [`Humor Author ${index}`],
      score: 10 - index * 0.1,
      maturityBand: "preteens",
      diagnostics: { queryText: index % 2 === 0 ? "middle grade humor" : "children's funny books", queryFamily: "humor", routingReason: "middle_grades_fantasy_humor" },
    })),
    ...["Quest One", "Quest Two", "Friendship Trail"].map((title, index) => fakeScoredCandidate({
      id: `middle-humor-aligned-${index}`,
      title,
      creators: [`Adventure Author ${index}`],
      score: 8 - index * 0.1,
      maturityBand: "preteens",
      diagnostics: { queryText: index === 2 ? "middle grade friendship" : "middle grade adventure", queryFamily: index === 2 ? "friendship" : "adventure", routingReason: "middle_grades_fantasy_humor" },
    })),
  ];
  const middleGradesFantasyHumorBalanceResult = selectRecommendations(middleGradesFantasyHumorBalanceCandidates, middleGradesFantasyHumorBalanceProfile, 5);
  const middleGradesFantasyHumorAlignedSelected = middleGradesFantasyHumorBalanceResult.selected.filter((candidate) => /\b(adventure|friendship)\b/i.test(String(candidate.diagnostics?.queryText || ""))).length;
  assertEqual(middleGradesFantasyHumorBalanceResult.selected.length, 5, "middle grades fantasy humor balance should keep the requested slate size");
  assertEqual(middleGradesFantasyHumorAlignedSelected >= 2, true, "middle grades fantasy humor balance should include more than one aligned non-humor candidate");
  assertEqual(Boolean(middleGradesFantasyHumorBalanceResult.rejectedReasons.middle_grades_fantasy_humor_aligned_balance_accepted || middleGradesFantasyHumorBalanceResult.rejectedReasons.middle_grades_humor_default_query_family_cap_accepted), true, "middle grades fantasy humor balance should emit aligned/default-cap diagnostics");
  console.log(JSON.stringify({ name: "middle grades fantasy humor selection balances aligned candidates", pass: true, selected: middleGradesFantasyHumorBalanceResult.selected.map((candidate) => candidate.title), rejectedReasons: middleGradesFantasyHumorBalanceResult.rejectedReasons }));

  const middleGradesHumorDefaultCapCandidates = [
    ...["Joke One", "Joke Two", "Joke Three", "Joke Four", "Joke Five"].map((title, index) => fakeScoredCandidate({
      id: `middle-humor-cap-default-${index}`,
      title,
      creators: [`Humor Cap Author ${index}`],
      score: 10 - index * 0.1,
      maturityBand: "preteens",
      diagnostics: { queryText: index % 2 === 0 ? "middle grade humor" : "children's funny books", queryFamily: "humor", routingReason: "middle_grades_humor" },
    })),
    ...["School Laughs", "Friendship Laughs"].map((title, index) => fakeScoredCandidate({
      id: `middle-humor-cap-alt-${index}`,
      title,
      creators: [`Humor Alt Author ${index}`],
      score: 8 - index * 0.1,
      maturityBand: "preteens",
      diagnostics: { queryText: index === 0 ? "middle grade school story" : "middle grade friendship", queryFamily: index === 0 ? "school" : "friendship", routingReason: "middle_grades_humor" },
    })),
  ];
  const middleGradesHumorDefaultCapResult = selectRecommendations(middleGradesHumorDefaultCapCandidates, middleGradesFantasyHumorBalanceProfile, 5);
  const middleGradesHumorDefaultSelected = middleGradesHumorDefaultCapResult.selected.filter((candidate) => /\b(humor|funny)\b/i.test(String(candidate.diagnostics?.queryText || candidate.diagnostics?.queryFamily || ""))).length;
  assertEqual(middleGradesHumorDefaultSelected <= 3, true, "middle grades humor selection should cap humor/default query-family candidates when safe alternatives exist");
  assertEqual(Boolean(middleGradesHumorDefaultCapResult.rejectedReasons.middle_grades_humor_default_query_family_cap_accepted), true, "middle grades humor default cap should emit replacement diagnostics");
  console.log(JSON.stringify({ name: "middle grades humor selection caps default query family", pass: true, selected: middleGradesHumorDefaultCapResult.selected.map((candidate) => candidate.title), rejectedReasons: middleGradesHumorDefaultCapResult.rejectedReasons }));

  const middleGradesAdventureHumorDefaultCapCandidates = [
    ...["Robot Joke One", "Robot Joke Two", "Robot Joke Three", "Robot Joke Four", "Robot Joke Five"].map((title, index) => fakeScoredCandidate({
      id: `middle-adventure-humor-default-${index}`,
      title,
      creators: [`Adventure Humor Default Author ${index}`],
      score: 10 - index * 0.1,
      maturityBand: "preteens",
      diagnostics: { queryText: "middle grade humor", queryFamily: "humor", routingReason: "middle_grades_fantasy_humor" },
    })),
    ...["Adventure Path", "Friendship Quest"].map((title, index) => fakeScoredCandidate({
      id: `middle-adventure-humor-alt-${index}`,
      title,
      creators: [`Adventure Humor Alt Author ${index}`],
      score: index === 0 ? 11 : 5,
      maturityBand: "preteens",
      diagnostics: { queryText: index === 0 ? "middle grade adventure" : "middle grade friendship", queryFamily: index === 0 ? "adventure" : "friendship", routingReason: "middle_grades_fantasy_adventure_age_anchored_recovery" },
    })),
  ];
  const middleGradesAdventureHumorDefaultCapResult = selectRecommendations(middleGradesAdventureHumorDefaultCapCandidates, middleGradesFantasyHumorBalanceProfile, 5);
  const middleGradesAdventureHumorDefaultSelected = middleGradesAdventureHumorDefaultCapResult.selected.filter((candidate) => /\b(humor|funny)\b/i.test(String(candidate.diagnostics?.queryText || candidate.diagnostics?.queryFamily || ""))).length;
  assertEqual(middleGradesAdventureHumorDefaultSelected <= 3, true, "middle grades adventure-humor selection should cap default humor candidates when two safe alternatives exist");
  const middleGradesAdventureHumorAlignedSelected = middleGradesAdventureHumorDefaultCapResult.selected.filter((candidate) => /\b(adventure|friendship)\b/i.test(String(candidate.diagnostics?.queryText || candidate.diagnostics?.queryFamily || ""))).length;
  assertEqual(middleGradesAdventureHumorAlignedSelected >= 2, true, "middle grades adventure-humor selection should use the full ranked pool for aligned replacements");
  assertEqual(Boolean(middleGradesAdventureHumorDefaultCapResult.rejectedReasons.middle_grades_humor_default_query_family_cap_accepted), true, "middle grades adventure-humor default cap should emit replacement diagnostics");
  console.log(JSON.stringify({ name: "middle grades adventure-humor selection caps default query family", pass: true, selected: middleGradesAdventureHumorDefaultCapResult.selected.map((candidate) => candidate.title), rejectedReasons: middleGradesAdventureHumorDefaultCapResult.rejectedReasons }));

  const middleGradesFantasyHumorEnforceCandidates = [
    fakeScoredCandidate({
      id: "middle-humor-enforce-aligned-1",
      title: "Quest Anchor",
      creators: ["Adventure Author A"],
      score: 10,
      maturityBand: "preteens",
      diagnostics: { queryText: "middle grade adventure", queryFamily: "adventure", routingReason: "middle_grades_fantasy_humor" },
    }),
    ...["School One", "School Two", "School Three", "School Four"].map((title, index) => fakeScoredCandidate({
      id: `middle-humor-enforce-school-${index}`,
      title,
      creators: [`School Author ${index}`],
      score: 9.9 - index * 0.1,
      maturityBand: "preteens",
      diagnostics: { queryText: "middle grade school story", queryFamily: "school", routingReason: "middle_grades_contemporary_school" },
    })),
    fakeScoredCandidate({
      id: "middle-humor-enforce-aligned-2",
      title: "Friendship Quest",
      creators: ["Adventure Author B"],
      score: 8,
      maturityBand: "preteens",
      diagnostics: { queryText: "middle grade friendship", queryFamily: "friendship", routingReason: "middle_grades_fantasy_humor" },
    }),
    fakeScoredCandidate({
      id: "middle-humor-enforce-default",
      title: "Joke Portal",
      creators: ["Humor Author Z"],
      score: 1,
      maturityBand: "preteens",
      diagnostics: { queryText: "middle grade humor", queryFamily: "humor", routingReason: "middle_grades_fantasy_humor" },
    }),
  ];
  const middleGradesFantasyHumorEnforceResult = selectRecommendations(middleGradesFantasyHumorEnforceCandidates, middleGradesFantasyHumorBalanceProfile, 5);
  const enforcedAlignedSelected = middleGradesFantasyHumorEnforceResult.selected.filter((candidate) => /\b(adventure|friendship)\b/i.test(String(candidate.diagnostics?.queryText || "")) && /middle_grades_fantasy_humor/i.test(String(candidate.diagnostics?.routingReason || ""))).length;
  assertEqual(enforcedAlignedSelected >= 2, true, "middle grades fantasy humor balance should enforce two aligned candidates even if only one initially ranks into a full slate");
  assertEqual(Boolean(middleGradesFantasyHumorEnforceResult.rejectedReasons.middle_grades_fantasy_humor_aligned_balance_replacements), true, "middle grades fantasy humor enforced balance should record replacement diagnostics");
  console.log(JSON.stringify({ name: "middle grades fantasy humor selection enforces second aligned candidate", pass: true, selected: middleGradesFantasyHumorEnforceResult.selected.map((candidate) => candidate.title), rejectedReasons: middleGradesFantasyHumorEnforceResult.rejectedReasons }));

  const middleGradesAntiZeroFallbackCandidates = [
    ...["Fallback Quest One", "Fallback Quest Two", "Fallback Quest Three", "Fallback Quest Four", "Fallback Quest Five"].map((title, index) => fakeScoredCandidate({
      id: `middle-antizero-fallback-${index}`,
      title,
      creators: [`Fallback Author ${index}`],
      score: 10 - index * 0.1,
      maturityBand: "preteens",
      diagnostics: { queryText: "middle grade fantasy adventure", queryFamily: "fantasy", routingReason: "middle_grades_fantasy_humor_delayed_final_retry", emergencyFallback: true, fallbackAlignment: "anti_zero" },
    })),
    ...["Humor Survivor", "School Survivor", "Friendship Survivor"].map((title, index) => fakeScoredCandidate({
      id: `middle-antizero-aligned-${index}`,
      title,
      creators: [`Aligned Author ${index}`],
      score: 6 - index * 0.1,
      maturityBand: "preteens",
      diagnostics: { queryText: index === 0 ? "middle grade humor" : index === 1 ? "middle grade school story" : "middle grade friendship", queryFamily: index === 0 ? "humor" : index === 1 ? "school" : "friendship", routingReason: "middle_grades_fantasy_humor" },
    })),
  ];
  const middleGradesAntiZeroFallbackResult = selectRecommendations(middleGradesAntiZeroFallbackCandidates, middleGradesFantasyHumorBalanceProfile, 5);
  const antiZeroSelected = middleGradesAntiZeroFallbackResult.selected.filter((candidate) => candidate.diagnostics?.fallbackAlignment === "anti_zero" || candidate.diagnostics?.emergencyFallback).length;
  const alignedSurvivorSelected = middleGradesAntiZeroFallbackResult.selected.filter((candidate) => /Survivor/.test(candidate.title)).length;
  assertEqual(alignedSurvivorSelected >= 3, true, "middle grades anti-zero fallback should not displace surviving humor/school/friendship candidates");
  assertEqual(antiZeroSelected <= 2, true, "middle grades anti-zero fallback should only fill true shortages after aligned candidates are exhausted");
  assertEqual(Boolean(middleGradesAntiZeroFallbackResult.rejectedReasons.middle_grades_anti_zero_fallback_replacements), true, "middle grades anti-zero fallback gate should emit replacement diagnostics");
  assertEqual(Boolean(middleGradesAntiZeroFallbackResult.rejectedReasons.middle_grades_route_aligned_success), true, "middle grades anti-zero fallback gate should emit route-aligned success diagnostics");
  assertEqual(Boolean(middleGradesAntiZeroFallbackResult.rejectedReasons.topRejectedRouteAlignedCandidates), true, "middle grades anti-zero fallback diagnostics should include top rejected route-aligned candidates");
  assertEqual(Boolean(middleGradesAntiZeroFallbackResult.rejectedReasons.selectedVsRejectedRouteAlignmentSummary), true, "middle grades anti-zero fallback diagnostics should compare selected and rejected route alignment");
  console.log(JSON.stringify({ name: "middle grades anti-zero fallback fills only true shortages", pass: true, selected: middleGradesAntiZeroFallbackResult.selected.map((candidate) => candidate.title), rejectedReasons: middleGradesAntiZeroFallbackResult.rejectedReasons }));

  const previousMiddleGradesCascadeProxyBase = process.env.OPEN_LIBRARY_PROXY_BASE_URL;
  const originalMiddleGradesCascadeDateNow = Date.now;
  const middleGradesCascadeFetchCalls = [];
  let fakeMiddleGradesCascadeNowOffsetMs = 0;
  process.env.OPEN_LIBRARY_PROXY_BASE_URL = "https://proxy.example.test";
  Date.now = () => originalMiddleGradesCascadeDateNow() + fakeMiddleGradesCascadeNowOffsetMs;
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    middleGradesCascadeFetchCalls.push(query);
    if (middleGradesCascadeFetchCalls.length === 1) {
      fakeMiddleGradesCascadeNowOffsetMs = 3_500;
      throw new Error("timeout");
    }
    if (middleGradesCascadeFetchCalls.length === 2) {
      fakeMiddleGradesCascadeNowOffsetMs = 4_700;
      throw new Error("timeout");
    }
    fakeMiddleGradesCascadeNowOffsetMs = 4_900;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ proxyAttempts: 1, docs: [1, 2, 3, 4, 5, 6].map((index) => fakeDoc(query, index)) }),
    };
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "preteens",
      signals: middleGradesCases[0].signals,
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
    assertEqual(result.rawItems.length >= 5, true, "middle grades cascade should preserve budget and recover after initial proxy timeouts");
    assertDeepEqual(middleGradesCascadeFetchCalls, ["middle grade fantasy", "fantasy adventure", "middle grade fantasy adventure", "middle grade fantasy mystery"], "middle grades cascade should keep underfill-safe recovery route-specific before generic adventure after repeated timeouts");
    assertEqual(result.diagnostics.finalCountContractStatus !== "full_fallback_only", true, "middle grades cascade should not label route-specific underfill recovery as fallback-only lock quality");
    assertEqual(result.diagnostics.fetches?.[0]?.clientTimeoutMs, 1600, "middle grades first proxy fetch should use reduced resilience window");
    assertEqual(result.diagnostics.fetches?.[1]?.clientTimeoutMs < 1600, true, "middle grades cascade should cap later query timeouts to preserve retry/recovery budget");
    console.log(JSON.stringify({ name: "middle grades cascade jumps to stable fallback under repeated timeout", pass: true, rawItems: result.rawItems.length, fetchCalls: middleGradesCascadeFetchCalls, secondTimeoutMs: result.diagnostics.fetches?.[1]?.clientTimeoutMs }));
  } finally {
    Date.now = originalMiddleGradesCascadeDateNow;
    if (previousMiddleGradesCascadeProxyBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousMiddleGradesCascadeProxyBase;
    globalThis.fetch = originalFetch;
  }

  const previousMiddleGradesDelayedRetryProxyBase = process.env.OPEN_LIBRARY_PROXY_BASE_URL;
  const originalMiddleGradesDelayedRetryDateNow = Date.now;
  const middleGradesDelayedRetryFetchCalls = [];
  let fakeMiddleGradesDelayedRetryNowOffsetMs = 0;
  process.env.OPEN_LIBRARY_PROXY_BASE_URL = "https://proxy.example.test";
  Date.now = () => originalMiddleGradesDelayedRetryDateNow() + fakeMiddleGradesDelayedRetryNowOffsetMs;
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    middleGradesDelayedRetryFetchCalls.push(query);
    if (middleGradesDelayedRetryFetchCalls.length === 1) {
      fakeMiddleGradesDelayedRetryNowOffsetMs = 3_500;
      throw new Error("timeout");
    }
    if (middleGradesDelayedRetryFetchCalls.length === 2) {
      fakeMiddleGradesDelayedRetryNowOffsetMs = 4_200;
      throw new Error("timeout");
    }
    fakeMiddleGradesDelayedRetryNowOffsetMs = 5_100;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ proxyAttempts: 1, docs: [1, 2, 3, 4, 5, 6].map((index) => fakeDoc(query, index)) }),
    };
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "preteens",
      signals: middleGradesCases[0].signals,
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
    assertEqual(result.rawItems.length >= 5, true, "middle grades delayed retry should have enough reserved budget to recover rows");
    assertDeepEqual(middleGradesDelayedRetryFetchCalls, ["middle grade fantasy", "fantasy adventure", "middle grade fantasy adventure", "middle grade fantasy mystery"], "middle grades delayed retry should reserve budget for route-specific underfill-safe recovery after timed-out lane attempts");
    assertEqual(result.diagnostics.middleGradesDelayedRetryAttempted, true, "middle grades delayed retry diagnostics should mark attempted");
    assertEqual(result.diagnostics.middleGradesDelayedRetrySkippedReason, undefined, "middle grades delayed retry should not be skipped when budget was reserved");
    assertEqual(result.diagnostics.middleGradesDelayedRetryTimeoutMs >= 1500, true, "middle grades delayed retry should run with a real timeout budget while preserving final recovery");
    assertEqual(result.diagnostics.middleGradesTimeoutBudgetRemainingBeforeRetry >= 3500, true, "middle grades delayed retry diagnostics should report reserved remaining budget");
    console.log(JSON.stringify({ name: "middle grades delayed retry reserves usable budget", pass: true, rawItems: result.rawItems.length, fetchCalls: middleGradesDelayedRetryFetchCalls, retryTimeoutMs: result.diagnostics.middleGradesDelayedRetryTimeoutMs, retryBudgetMs: result.diagnostics.middleGradesTimeoutBudgetRemainingBeforeRetry }));
  } finally {
    Date.now = originalMiddleGradesDelayedRetryDateNow;
    if (previousMiddleGradesDelayedRetryProxyBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousMiddleGradesDelayedRetryProxyBase;
    globalThis.fetch = originalFetch;
  }

  const previousMiddleGradesContemporaryRetryProxyBase = process.env.OPEN_LIBRARY_PROXY_BASE_URL;
  const originalMiddleGradesContemporaryRetryDateNow = Date.now;
  const middleGradesContemporaryRetryFetchCalls = [];
  let fakeMiddleGradesContemporaryRetryNowOffsetMs = 0;
  process.env.OPEN_LIBRARY_PROXY_BASE_URL = "https://proxy.example.test";
  Date.now = () => originalMiddleGradesContemporaryRetryDateNow() + fakeMiddleGradesContemporaryRetryNowOffsetMs;
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    middleGradesContemporaryRetryFetchCalls.push(query);
    if (middleGradesContemporaryRetryFetchCalls.length === 1) {
      fakeMiddleGradesContemporaryRetryNowOffsetMs = 3_500;
      throw new Error("timeout");
    }
    if (middleGradesContemporaryRetryFetchCalls.length === 2) {
      fakeMiddleGradesContemporaryRetryNowOffsetMs = 4_200;
      throw new Error("timeout");
    }
    fakeMiddleGradesContemporaryRetryNowOffsetMs = 5_100;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ proxyAttempts: 1, docs: [1, 2, 3, 4, 5, 6].map((index) => fakeDoc(query, index)) }),
    };
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "preteens",
      signals: middleGradesCases[5].signals,
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
    assertEqual(result.rawItems.length >= 5, true, "middle grades contemporary delayed retry should recover rows after timed-out realistic/school lane attempts");
    assertDeepEqual(middleGradesContemporaryRetryFetchCalls, ["middle grade realistic fiction", "middle grade school story", "middle grade school adventure", "middle grade friendship"], "middle grades contemporary retry should continue to route-specific underfill-safe recovery after shaped school/community fallback");
    assertEqual(result.diagnostics.middleGradesDelayedRetryAttempted, true, "middle grades contemporary retry diagnostics should mark attempted");
    assertEqual(result.diagnostics.middleGradesDelayedRetryTimeoutMs >= 1500, true, "middle grades contemporary retry should run with a real timeout budget while reserving final safe recovery");
    console.log(JSON.stringify({ name: "middle grades contemporary retry shapes anti-zero fallback from school signals", pass: true, rawItems: result.rawItems.length, fetchCalls: middleGradesContemporaryRetryFetchCalls, retryTimeoutMs: result.diagnostics.middleGradesDelayedRetryTimeoutMs }));
  } finally {
    Date.now = originalMiddleGradesContemporaryRetryDateNow;
    if (previousMiddleGradesContemporaryRetryProxyBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousMiddleGradesContemporaryRetryProxyBase;
    globalThis.fetch = originalFetch;
  }

  const previousMiddleGradesContemporaryDeepRetryProxyBase = process.env.OPEN_LIBRARY_PROXY_BASE_URL;
  const originalMiddleGradesContemporaryDeepRetryDateNow = Date.now;
  const middleGradesContemporaryDeepRetryFetchCalls = [];
  let fakeMiddleGradesContemporaryDeepRetryNowOffsetMs = 0;
  process.env.OPEN_LIBRARY_PROXY_BASE_URL = "https://proxy.example.test";
  Date.now = () => originalMiddleGradesContemporaryDeepRetryDateNow() + fakeMiddleGradesContemporaryDeepRetryNowOffsetMs;
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    middleGradesContemporaryDeepRetryFetchCalls.push(query);
    if (middleGradesContemporaryDeepRetryFetchCalls.length === 1) {
      fakeMiddleGradesContemporaryDeepRetryNowOffsetMs = 3_000;
      throw new Error("timeout");
    }
    if (middleGradesContemporaryDeepRetryFetchCalls.length === 2) {
      fakeMiddleGradesContemporaryDeepRetryNowOffsetMs = 3_600;
      throw new Error("timeout");
    }
    if (middleGradesContemporaryDeepRetryFetchCalls.length === 3) {
      fakeMiddleGradesContemporaryDeepRetryNowOffsetMs = 4_100;
      throw new Error("timeout");
    }
    fakeMiddleGradesContemporaryDeepRetryNowOffsetMs = 5_100;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ proxyAttempts: 1, docs: [1, 2, 3, 4, 5, 6].map((index) => fakeDoc(query, index)) }),
    };
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "preteens",
      signals: middleGradesCases[5].signals,
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
    assertEqual(result.rawItems.length >= 5, true, "middle grades contemporary deep retry should recover before adventure-only fallback");
    assertDeepEqual(middleGradesContemporaryDeepRetryFetchCalls, ["middle grade realistic fiction", "middle grade school story", "middle grade school adventure", "middle grade friendship adventure", "middle grade friendship"], "middle grades contemporary retry should keep route-specific recovery before generic adventure when shaped school/friendship fallback underfills");
    console.log(JSON.stringify({ name: "middle grades contemporary retry shapes fallback before generic adventure", pass: true, rawItems: result.rawItems.length, fetchCalls: middleGradesContemporaryDeepRetryFetchCalls }));
  } finally {
    Date.now = originalMiddleGradesContemporaryDeepRetryDateNow;
    if (previousMiddleGradesContemporaryDeepRetryProxyBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousMiddleGradesContemporaryDeepRetryProxyBase;
    globalThis.fetch = originalFetch;
  }

  const previousMiddleGradesFantasyMysteryRetryProxyBase = process.env.OPEN_LIBRARY_PROXY_BASE_URL;
  const originalMiddleGradesFantasyMysteryRetryDateNow = Date.now;
  const middleGradesFantasyMysteryRetryFetchCalls = [];
  let fakeMiddleGradesFantasyMysteryRetryNowOffsetMs = 0;
  process.env.OPEN_LIBRARY_PROXY_BASE_URL = "https://proxy.example.test";
  Date.now = () => originalMiddleGradesFantasyMysteryRetryDateNow() + fakeMiddleGradesFantasyMysteryRetryNowOffsetMs;
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    middleGradesFantasyMysteryRetryFetchCalls.push(query);
    if (middleGradesFantasyMysteryRetryFetchCalls.length === 1) {
      fakeMiddleGradesFantasyMysteryRetryNowOffsetMs = 3_500;
      throw new Error("timeout");
    }
    if (middleGradesFantasyMysteryRetryFetchCalls.length === 2) {
      fakeMiddleGradesFantasyMysteryRetryNowOffsetMs = 4_200;
      throw new Error("timeout");
    }
    fakeMiddleGradesFantasyMysteryRetryNowOffsetMs = 5_100;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ proxyAttempts: 1, docs: [1, 2, 3, 4, 5, 6].map((index) => fakeDoc(query, index)) }),
    };
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "preteens",
      signals: middleGradesCases[2].signals,
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
    assertEqual(result.rawItems.length >= 5, true, "middle grades fantasy mystery retry should recover via mystery route before generic fantasy");
    assertDeepEqual(middleGradesFantasyMysteryRetryFetchCalls, ["middle grade fantasy mystery", "middle grade mystery", "school mystery", "middle grade mystery adventure"], "middle grades fantasy mystery retry should preserve mystery intent through underfill-safe recovery before generic adventure");
    console.log(JSON.stringify({ name: "middle grades fantasy mystery retry preserves mystery intent", pass: true, rawItems: result.rawItems.length, fetchCalls: middleGradesFantasyMysteryRetryFetchCalls }));
  } finally {
    Date.now = originalMiddleGradesFantasyMysteryRetryDateNow;
    if (previousMiddleGradesFantasyMysteryRetryProxyBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousMiddleGradesFantasyMysteryRetryProxyBase;
    globalThis.fetch = originalFetch;
  }

  const previousMiddleGradesHumorRetryProxyBase = process.env.OPEN_LIBRARY_PROXY_BASE_URL;
  const originalMiddleGradesHumorRetryDateNow = Date.now;
  const middleGradesHumorRetryFetchCalls = [];
  let fakeMiddleGradesHumorRetryNowOffsetMs = 0;
  process.env.OPEN_LIBRARY_PROXY_BASE_URL = "https://proxy.example.test";
  Date.now = () => originalMiddleGradesHumorRetryDateNow() + fakeMiddleGradesHumorRetryNowOffsetMs;
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    middleGradesHumorRetryFetchCalls.push(query);
    if (middleGradesHumorRetryFetchCalls.length === 1) {
      fakeMiddleGradesHumorRetryNowOffsetMs = 3_500;
      throw new Error("timeout");
    }
    if (middleGradesHumorRetryFetchCalls.length === 2) {
      fakeMiddleGradesHumorRetryNowOffsetMs = 4_200;
      throw new Error("timeout");
    }
    fakeMiddleGradesHumorRetryNowOffsetMs = 5_100;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ proxyAttempts: 1, docs: [1, 2, 3, 4, 5, 6].map((index) => fakeDoc(query, index)) }),
    };
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "preteens",
      signals: middleGradesCases[3].signals,
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
    assertEqual(result.rawItems.length >= 5, true, "middle grades humor delayed retry should recover rows after timed-out humor lane attempts");
    assertDeepEqual(middleGradesHumorRetryFetchCalls, ["middle grade humor", "funny fantasy", "middle grade funny family story", "middle grade school story"], "middle grades fantasy-humor retry should jump to reliability-weighted anti-zero fallback after two zero-row timeouts and then try a route-aligned recovery with spare budget");
    assertEqual(result.diagnostics.middleGradesDelayedRetryAttempted, true, "middle grades humor retry diagnostics should mark attempted");
    assertEqual(result.diagnostics.middleGradesAntiZeroFallbackSuccessCount >= 5, true, "middle grades humor retry diagnostics should distinguish anti-zero fallback success");
    assertEqual(Boolean(result.diagnostics.middleGradesFallbackOnlySlate), false, "middle grades humor retry should avoid fallback-only status when post-fallback route recovery succeeds");
    assertDeepEqual(result.diagnostics.fallbackAttemptOrder, ["middle grade funny family story"], "middle grades humor retry should record anti-zero fallback attempt order");
    assertEqual(result.diagnostics.routeAlignedRecoveryAttemptedAfterFallback, true, "middle grades humor retry should try route-aligned recovery after fallback when budget remains");
    assertEqual(result.diagnostics.lockQualityStatus, "mixed_recovery_success", "middle grades humor retry should expose mixed recovery lock quality status");
    assertEqual(result.diagnostics.middleGradesDelayedRetryTimeoutMs >= 1500, true, "middle grades humor retry should run with a real timeout budget while reserving final safe recovery");
    console.log(JSON.stringify({ name: "middle grades fantasy-humor retry jumps to anti-zero fallback", pass: true, rawItems: result.rawItems.length, fetchCalls: middleGradesHumorRetryFetchCalls, retryTimeoutMs: result.diagnostics.middleGradesDelayedRetryTimeoutMs, lockQualityStatus: result.diagnostics.lockQualityStatus }));
  } finally {
    Date.now = originalMiddleGradesHumorRetryDateNow;
    if (previousMiddleGradesHumorRetryProxyBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousMiddleGradesHumorRetryProxyBase;
    globalThis.fetch = originalFetch;
  }

  const previousMiddleGradesHumorRejectedProxyBase = process.env.OPEN_LIBRARY_PROXY_BASE_URL;
  const originalMiddleGradesHumorRejectedDateNow = Date.now;
  const middleGradesHumorRejectedFetchCalls = [];
  let fakeMiddleGradesHumorRejectedNowOffsetMs = 0;
  process.env.OPEN_LIBRARY_PROXY_BASE_URL = "https://proxy.example.test";
  Date.now = () => originalMiddleGradesHumorRejectedDateNow() + fakeMiddleGradesHumorRejectedNowOffsetMs;
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    middleGradesHumorRejectedFetchCalls.push(query);
    if (middleGradesHumorRejectedFetchCalls.length === 1) {
      fakeMiddleGradesHumorRejectedNowOffsetMs = 3_500;
      throw new Error("timeout");
    }
    if (middleGradesHumorRejectedFetchCalls.length === 2) {
      fakeMiddleGradesHumorRejectedNowOffsetMs = 4_200;
      throw new Error("timeout");
    }
    if (middleGradesHumorRejectedFetchCalls.length === 3) {
      fakeMiddleGradesHumorRejectedNowOffsetMs = 4_500;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ proxyAttempts: 1, docs: [1, 2, 3, 4, 5, 6].map((index) => ({ ...fakeDoc(query, index), author_name: [] })) }),
      };
    }
    fakeMiddleGradesHumorRejectedNowOffsetMs = 5_300;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ proxyAttempts: 1, docs: [1, 2, 3, 4, 5, 6].map((index) => fakeDoc(query, index)) }),
    };
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "preteens",
      signals: middleGradesCases[3].signals,
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
    assertEqual(result.rawItems.length >= 5, true, "middle grades fantasy-humor should allow anti-zero fallback after route-aligned recovery rows reject");
    assertDeepEqual(middleGradesHumorRejectedFetchCalls, ["middle grade humor", "funny fantasy", "middle grade funny family story", "middle grade family fantasy", "middle grade school story"], "middle grades fantasy-humor should skip route-adjacent recovery after two zero-row timeouts, move to the next reliable shaped fallback, then try route-aligned recovery when budget remains");
    assertDeepEqual(result.diagnostics.fallbackAttemptOrder, ["middle grade funny family story", "middle grade family fantasy"], "middle grades fantasy-humor should record selected and next-best reliable fallback attempts");
    assertEqual(result.diagnostics.whySelectedFallbackTimedOutOrSucceeded.some((row) => row.startsWith("middle grade funny family story:succeeded")), true, "middle grades fantasy-humor should record the shaped fallback fetch outcome before filtering");
    assertEqual(result.diagnostics.whySelectedFallbackTimedOutOrSucceeded.some((row) => row.startsWith("middle grade family fantasy:succeeded")), true, "middle grades fantasy-humor should record the next reliable fallback success");
    assertEqual(result.diagnostics.middleGradesAntiZeroFallbackSuccessCount >= 5, true, "middle grades fantasy-humor rejected route recovery should distinguish anti-zero fallback success");
    assertEqual(result.diagnostics.middleGradesFallbackOnlySlate, false, "middle grades fantasy-humor rejected fallback should avoid fallback-only diagnostics when post-fallback route recovery succeeds");
    assertEqual(result.diagnostics.routeAlignedRecoveryAttemptedAfterFallback, true, "middle grades fantasy-humor rejected fallback should try post-fallback route recovery with remaining budget");
    console.log(JSON.stringify({ name: "middle grades fantasy-humor anti-zero skips late route recovery", pass: true, rawItems: result.rawItems.length, fetchCalls: middleGradesHumorRejectedFetchCalls, fallbackOnly: result.diagnostics.middleGradesFallbackOnlySlate }));
  } finally {
    Date.now = originalMiddleGradesHumorRejectedDateNow;
    if (previousMiddleGradesHumorRejectedProxyBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousMiddleGradesHumorRejectedProxyBase;
    globalThis.fetch = originalFetch;
  }

  const previousTeenContemporaryTimeoutProxyBase = process.env.OPEN_LIBRARY_PROXY_BASE_URL;
  const originalContemporaryDateNow = Date.now;
  const teenContemporaryCascadeFetchCalls = [];
  let fakeContemporaryNowOffsetMs = 0;
  process.env.OPEN_LIBRARY_PROXY_BASE_URL = "https://proxy.example.test";
  Date.now = () => originalContemporaryDateNow() + fakeContemporaryNowOffsetMs;
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    teenContemporaryCascadeFetchCalls.push(query);
    if (teenContemporaryCascadeFetchCalls.length === 1) {
      fakeContemporaryNowOffsetMs = 4_500;
      throw new Error("timeout");
    }
    if (teenContemporaryCascadeFetchCalls.length === 2) {
      fakeContemporaryNowOffsetMs = 5_650;
      throw new Error("timeout");
    }
    fakeContemporaryNowOffsetMs = 5_800;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ proxyAttempts: 1, docs: [1, 2, 3, 4, 5, 6].map((index) => fakeDoc(query, index)) }),
    };
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "teens",
      signals: [
        { action: "like", title: "Modern Spell", genres: ["fantasy"], themes: ["romance", "coming of age"], format: "book" },
        { action: "like", title: "Heart Quest", genres: ["romance"], themes: ["friendship", "contemporary"], format: "book" },
      ],
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
    assertEqual(result.rawItems.length, 5, "teen contemporary-romance-fantasy cascade should recover after two same-lane timeouts");
    assertDeepEqual(teenContemporaryCascadeFetchCalls, ["young adult contemporary fantasy", "contemporary fantasy teen", "coming of age fantasy"], "teen contemporary-romance-fantasy cascade should rotate through remaining specific queries");
    assertEqual(result.diagnostics.fetches?.[1]?.clientTimeoutMs < 1_600, true, "teen cascade should cap the second same-lane timeout to preserve budget");
    console.log(JSON.stringify({ name: "teen contemporary romance fantasy rotates through specific queries under timeout", pass: true, rawItems: result.rawItems.length, fetchCalls: teenContemporaryCascadeFetchCalls, secondTimeoutMs: result.diagnostics.fetches?.[1]?.clientTimeoutMs }));
  } finally {
    Date.now = originalContemporaryDateNow;
    if (previousTeenContemporaryTimeoutProxyBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousTeenContemporaryTimeoutProxyBase;
    globalThis.fetch = originalFetch;
  }

  const previousTeenSpecificTimeoutProxyBase = process.env.OPEN_LIBRARY_PROXY_BASE_URL;
  const originalSpecificDateNow = Date.now;
  const teenSpecificBeforeBroadFetchCalls = [];
  let fakeSpecificNowOffsetMs = 0;
  process.env.OPEN_LIBRARY_PROXY_BASE_URL = "https://proxy.example.test";
  Date.now = () => originalSpecificDateNow() + fakeSpecificNowOffsetMs;
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    teenSpecificBeforeBroadFetchCalls.push(query);
    if (teenSpecificBeforeBroadFetchCalls.length === 1) {
      fakeSpecificNowOffsetMs = 6_000;
      throw new Error("timeout");
    }
    fakeSpecificNowOffsetMs = 6_200;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ proxyAttempts: 1, docs: [1, 2, 3, 4, 5, 6].map((index) => fakeDoc(query, index)) }),
    };
  };
  try {
    const profile = teenBroadFallbackProfile;
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
    assertEqual(result.rawItems.length, 5, "teen timeout cascade should recover from specific locked lane before broad fallback");
    assertDeepEqual(teenSpecificBeforeBroadFetchCalls, ["fantasy school", "action adventure"], "teen timeout cascade should not spend remaining budget on broad fallback before specific locked-lane queries");
    assertEqual(teenSpecificBeforeBroadFetchCalls.includes("young adult fantasy"), false, "teen timeout cascade should skip broad fallback once specific locked lane reaches target");
    console.log(JSON.stringify({ name: "teen timeout cascade keeps broad fallback behind specific lane queries", pass: true, rawItems: result.rawItems.length, fetchCalls: teenSpecificBeforeBroadFetchCalls }));
  } finally {
    Date.now = originalSpecificDateNow;
    if (previousTeenSpecificTimeoutProxyBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousTeenSpecificTimeoutProxyBase;
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
      fakeNowOffsetMs = 6_000;
      throw new Error("timeout");
    }
    fakeNowOffsetMs = 6_200;
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

  const teenDelayedRetryFetchCalls = [];
  const previousTeenDelayedRetryProxyBase = process.env.OPEN_LIBRARY_PROXY_BASE_URL;
  const originalTeenDelayedRetryDateNow = Date.now;
  let fakeTeenDelayedRetryNowOffsetMs = 0;
  process.env.OPEN_LIBRARY_PROXY_BASE_URL = "https://proxy.example.test";
  Date.now = () => originalTeenDelayedRetryDateNow() + fakeTeenDelayedRetryNowOffsetMs;
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    teenDelayedRetryFetchCalls.push(query);
    if (teenDelayedRetryFetchCalls.length <= 3) {
      fakeTeenDelayedRetryNowOffsetMs = teenDelayedRetryFetchCalls.length === 1 ? 4_500 : teenDelayedRetryFetchCalls.length === 2 ? 6_000 : 6_500;
      throw new Error("timeout");
    }
    fakeTeenDelayedRetryNowOffsetMs = 8_100;
    return {
      ok: true,
      status: 200,
      text: async () => {
        const retrySeeds = ["Aster Road", "Briar Gate", "Cinder Map", "Dahlia Quest", "Ember Trail", "Fable Key"];
        return JSON.stringify({ proxyAttempts: 1, docs: retrySeeds.map((title, index) => ({
          ...fakeDoc(query, index + 80),
          key: `/works/teen-delayed-retry-${index}`,
          title,
          author_name: [`Teen Retry Author ${index}`],
          subject: ["Young adult fiction", "Fantasy", "Adventure", "Teen"],
          first_publish_year: 2017 + index,
        })) });
      },
    };
  };
  try {
    const profile = teenBroadFallbackProfile;
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
    assertEqual(result.rawItems.length, 5, "teen delayed retry should recover five candidates after all lane queries time out");
    assertDeepEqual(teenDelayedRetryFetchCalls, ["fantasy school", "action adventure", "young adult fantasy", "fantasy school"], "teen delayed retry should reuse strongest lane query after all lane timeouts");
    assertEqual(Boolean(result.diagnostics.dropReasons?.teen_delayed_final_retry_attempted), true, "teen delayed retry should mark attempted");
    assertEqual(Boolean(result.diagnostics.dropReasons?.teen_delayed_final_retry_accepted), true, "teen delayed retry should mark accepted docs");
    console.log(JSON.stringify({ name: "teen delayed retry recovers after all lane queries time out", pass: true, rawItems: result.rawItems.length, fetchCalls: teenDelayedRetryFetchCalls }));
  } finally {
    Date.now = originalTeenDelayedRetryDateNow;
    if (previousTeenDelayedRetryProxyBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousTeenDelayedRetryProxyBase;
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
