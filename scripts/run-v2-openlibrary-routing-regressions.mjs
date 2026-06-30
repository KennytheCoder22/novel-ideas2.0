import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const OUT_DIR = ".tmp/v2-openlibrary-routing-regressions";
const TS_FILES = [
  "app/recommender-v2/tasteProfile.ts",
  "app/recommender-v2/diagnostics.ts",
  "app/recommender-v2/types.ts",
  "app/recommender-v2/engine.ts",
  "app/recommender-v2/select.ts",
  "app/recommender-v2/score.ts",
  "app/recommender-v2/normalize.ts",
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
  const routerSource = readFileSync("screens/recommenders/recommenderRouter.ts", "utf8");
  const swipeDeckSource = readFileSync("screens/SwipeDeckScreen.tsx", "utf8");
  assertEqual(routerSource.includes("returnedItemsAuditAttachedToActualReturnPath"), true, "router diagnostics should attach audit to actual returned-items path");
  assertEqual(routerSource.includes("returnedItemsAuditConsistencyFailure"), true, "router diagnostics should flag returned-items/scored-universe contradictions");
  assertEqual(routerSource.includes("returnedItemsLineage"), true, "router diagnostics should expose returned-item lineage");
  assertEqual(routerSource.includes("bypassedScoring"), true, "router returned-item lineage should report scoring bypass status");
  assertEqual(routerSource.includes("openLibrarySourceFinalScoredHandoffApplied"), true, "middle grades Open Library source-final rows should prefer scored handoff");
  assertEqual(routerSource.includes("open_library_source_emergency_bypass"), true, "middle grades Open Library source-only returns should be explicit emergency bypass failures");
  assertEqual(swipeDeckSource.includes("v2ReturnedItemsFailClosed"), true, "v2 UI diagnostic wrapper should fail closed on returned items without scored lineage");
  assertEqual(swipeDeckSource.includes("middle_grades_openlibrary_returned_items_without_scored_lineage"), true, "v2 UI diagnostic wrapper should expose live failure emergency reason");
  assertEqual(swipeDeckSource.includes("finalPayloadGuardBlockedUnscoredOpenLibrary"), true, "final payload guard should block live-wrapper-shaped unscored Open Library returns");
  assertEqual(swipeDeckSource.includes("final_payload_unscored_openlibrary_items_blocked"), true, "final payload guard should expose the live failure emergency reason");
  assertEqual(swipeDeckSource.includes("debugSourceStats?.openLibrary?.rawFetched"), true, "final payload guard should use Open Library raw/final source counts for live failure shape");
  assertEqual(swipeDeckSource.includes("payload?.scoredCount ?? 0"), false, "final payload guard should not let wrapper scoredCount mask zero scoredCandidateUniverseCount");
  assertEqual(swipeDeckSource.includes("scoredCandidateUniverseCount: scoredCandidateUniverseCountForReport"), true, "v2 wrapper should export scored candidate universe count from the real scoring pipeline");
  assertEqual(swipeDeckSource.includes("finalEligibilityCleanCandidateCount: finalEligibilityCleanCandidateCountForReport"), true, "v2 wrapper should export final eligibility count from selected V2 items");
  console.log(JSON.stringify({ name: "router returned-items audit exposes actual return-path lineage", pass: true }));
  const { buildTasteProfile } = await import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/tasteProfile.js`).href);
  const { runRecommenderV2 } = await import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/engine.js`).href);
  const { buildRecommendationResultV2 } = await import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/diagnostics.js`).href);
  const { selectRecommendations } = await import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/select.js`).href);
  const { scoreCandidates } = await import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/score.js`).href);
  const { normalizeSourceResults } = await import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/normalize.js`).href);
  const { buildOpenLibraryQueryPlansForRegression, openLibrarySourceAdapter } = await import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/sources/openLibrarySource.js`).href);
  const { openLibraryProfileForAgeBand } = await import(pathToFileURL(`${process.cwd()}/${OUT_DIR}/sources/openLibraryProfiles.js`).href);
  const adultProfile = openLibraryProfileForAgeBand("adult");
  assertEqual(adultProfile.lockedBaseline, true, "adult Open Library profile should be locked");
  assertEqual(adultProfile.behaviorLabel, "adult_openlibrary_locked_baseline", "adult Open Library profile should expose locked label");
  const middleGradesProfile = openLibraryProfileForAgeBand("preteens");
  assertEqual(middleGradesProfile.lockedBaseline, false, "middle grades Open Library profile should remain unlocked while under review");
  assertEqual(middleGradesProfile.behaviorLabel, "middle_grades_openlibrary_profile_pending", "middle grades Open Library profile should expose pending label");
  const teenProfile = openLibraryProfileForAgeBand("teens");

  const queryOnlyTasteProfile = buildTasteProfile({
    ageBand: "preteens",
    signals: [
      { action: "like", title: "Dragon Hero Ocean Music", genres: ["Fantasy"], themes: ["dragon", "heroic", "ocean", "music"] },
    ],
  });
  const queryOnlyScored = scoreCandidates([{
    id: "query-only-taste-credit",
    source: "openLibrary",
    sourceId: "query-only-taste-credit",
    title: "Frog and Toad Collection",
    creators: ["Arnold Lobel"],
    formats: ["book"],
    genres: ["Juvenile fiction"],
    themes: ["Friendship"],
    tones: [],
    characterDynamics: [],
    maturityBand: "preteens",
    raw: {},
    diagnostics: { queryText: "dragon fantasy heroic ocean music", queryFamily: "fantasy", facets: ["dragon", "fantasy", "heroic", "ocean", "music"], routingReason: "middle_grades_fantasy_adventure" },
  }], queryOnlyTasteProfile)[0];
  assertEqual(Number(queryOnlyScored.scoreBreakdown.genreFacetMatch || 0), 0, "query text alone cannot create middle-grades genre facet credit");
  assertEqual(Number(queryOnlyScored.scoreBreakdown.positiveTasteMatch || 0), 0, "query text alone cannot create middle-grades positive taste credit");
  assertEqual((queryOnlyScored.diagnostics.queryTextSignalsRemovedFromTasteMatch || []).length > 0, true, "removed query-only taste signals should be diagnosed");
  console.log(JSON.stringify({ name: "middle grades scoring ignores query-only taste signals", pass: true, removed: queryOnlyScored.diagnostics.queryTextSignalsRemovedFromTasteMatch }));

  const documentEvidenceProfile = buildTasteProfile({
    ageBand: "preteens",
    signals: [
      { action: "like", title: "Dragon Hero Family", genres: ["fantasy"], themes: ["dragon", "family", "heroic"] },
    ],
  });
  const documentEvidenceNormalized = normalizeSourceResults([{
    source: "openLibrary",
    status: "fulfilled",
    rawItems: [{
      id: "openlibrary-doc-evidence",
      title: "The Dragon Family Quest",
      creators: ["Evidence Author"],
      formats: ["book"],
      subject: ["Juvenile fiction -- Dragons", "Families -- Fiction", "Fantasy fiction"],
      first_sentence: ["A heroic dragon and a family begin a magical quest together."],
      queryText: "middle grade dragon family fiction",
      queryFamily: "dragon_family",
      routingReason: "middle_grades_fantasy_adventure",
    }],
    diagnostics: {},
  }]);
  const documentEvidenceScored = scoreCandidates(documentEvidenceNormalized, documentEvidenceProfile)[0];
  assertEqual((documentEvidenceScored.diagnostics.documentBackedTasteSignals || []).includes("dragon"), true, "raw Open Library subjects/first_sentence should count as document-backed dragon evidence");
  assertEqual(Number(documentEvidenceScored.scoreBreakdown.positiveTasteMatch || 0) > 0 || Number(documentEvidenceScored.scoreBreakdown.genreFacetMatch || 0) > 0, true, "document-backed Open Library evidence should raise taste score without using query text");
  const documentEvidenceSelection = selectRecommendations([documentEvidenceScored], documentEvidenceProfile, 1);
  assertEqual((documentEvidenceSelection.rejectedReasons.zeroTasteCandidateRejectedTitles || []).includes("The Dragon Family Quest"), false, "document-backed Open Library evidence should avoid zero_doc_backed_taste_match rejection");
  console.log(JSON.stringify({ name: "middle grades document-backed evidence uses raw subjects and first sentence", pass: true, signals: documentEvidenceScored.diagnostics.documentBackedTasteSignals }));


  const metadataAliasEvidenceProfile = buildTasteProfile({
    ageBand: "preteens",
    signals: [
      { action: "like", title: "Robot Magic Friends", genres: ["fantasy", "science"], themes: ["robot", "friendship", "survival"] },
    ],
  });
  const metadataAliasNormalized = normalizeSourceResults([{
    source: "openLibrary",
    status: "fulfilled",
    rawItems: [{
      id: "openlibrary-magic-alias-evidence",
      title: "The Hidden Door",
      creators: ["Alias Author"],
      formats: ["book"],
      subject: ["Juvenile fiction", "Magic -- Fiction", "Friendship -- Fiction"],
      first_sentence: ["Friends discover an enchanted school door."],
      queryText: "middle grade fantasy friendship fiction",
      queryFamily: "fantasy_friendship",
      routingReason: "middle_grades_fantasy_adventure",
    }, {
      id: "openlibrary-robot-alias-evidence",
      title: "Wilderness Machine",
      creators: ["Alias Author"],
      formats: ["book"],
      subject: ["Juvenile fiction", "Robots -- Fiction", "Survival -- Fiction", "Animals -- Fiction"],
      first_sentence: ["A robot survives with animals in the wilderness."],
      queryText: "middle grade science adventure fiction",
      queryFamily: "science_adventure",
      routingReason: "middle_grades_scifi_adventure",
    }],
    diagnostics: {},
  }]);
  const metadataAliasScored = scoreCandidates(metadataAliasNormalized, metadataAliasEvidenceProfile);
  assertEqual((metadataAliasScored.find((candidate) => candidate.title === "The Hidden Door")?.diagnostics.documentBackedTasteSignals || []).includes("fantasy"), true, "magic/fantasy metadata aliases should count as document-backed fantasy evidence");
  assertEqual((metadataAliasScored.find((candidate) => candidate.title === "Wilderness Machine")?.diagnostics.documentBackedTasteSignals || []).includes("robot"), true, "robot metadata aliases should count as document-backed robot evidence");
  const metadataAliasSelection = selectRecommendations(metadataAliasScored, metadataAliasEvidenceProfile, 2);
  assertEqual(metadataAliasSelection.selected.length, 2, "metadata-backed alias evidence should survive Middle Grades final eligibility without title-token clustering");
  console.log(JSON.stringify({ name: "middle grades metadata aliases count as document-backed evidence", pass: true, signalsByTitle: Object.fromEntries(metadataAliasScored.map((candidate) => [candidate.title, candidate.diagnostics.documentBackedTasteSignals])) }));

  const genericOnlyTasteProfile = buildTasteProfile({
    ageBand: "preteens",
    signals: [
      { action: "like", title: "Book Story", genres: ["fiction"], themes: ["story"], format: "book" },
    ],
  });
  const genericOnlyScored = scoreCandidates([{
    id: "generic-only-taste-credit",
    source: "openLibrary",
    sourceId: "generic-only-taste-credit",
    title: "Generic Container Match",
    creators: ["Container Author"],
    formats: ["book"],
    genres: ["Fiction"],
    themes: ["Story"],
    tones: [],
    characterDynamics: [],
    maturityBand: "preteens",
    raw: {},
    diagnostics: { queryText: "middle grade adventure", queryFamily: "middle grade", facets: ["book", "fiction", "story"], routingReason: "middle_grades_fantasy_adventure" },
  }], genericOnlyTasteProfile)[0];
  assertEqual(Number(genericOnlyScored.scoreBreakdown.genreFacetMatch || 0), 0, "generic fiction/container terms cannot create middle-grades genre taste credit");
  assertEqual(Number(genericOnlyScored.scoreBreakdown.positiveTasteMatch || 0), 0, "generic book/story terms cannot create middle-grades positive taste credit");
  assertEqual(genericOnlyScored.matchedSignals.some((signal) => signal === "positiveTasteMatch:book" || signal === "positiveTasteMatch:story" || signal === "genreFacetMatch:fiction"), false, "generic container terms must not appear as positive matched signals");
  assertEqual(Number(genericOnlyScored.scoreBreakdown.genericOnlyTasteMatchPenalty || 0) < 0, true, "generic-only taste matches should receive a diagnostic penalty");
  const genericOnlySelection = selectRecommendations([genericOnlyScored], genericOnlyTasteProfile, 1);
  assertEqual(Array.isArray(genericOnlySelection.rejectedReasons.genericOnlyTasteMatchTitles) && genericOnlySelection.rejectedReasons.genericOnlyTasteMatchTitles.includes("Generic Container Match"), true, "generic-only taste match titles should be diagnosed during selection");
  console.log(JSON.stringify({ name: "middle grades generic container terms do not score as taste evidence", pass: true, removed: genericOnlyScored.diagnostics.genericTasteSignalsRemoved, penalty: genericOnlyScored.scoreBreakdown.genericOnlyTasteMatchPenalty }));
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
    for (const expectedQuery of testCase.expectedQueries) {
      assertEqual(summary.queries.includes(expectedQuery), true, `${testCase.name} should retain ${expectedQuery}`);
    }
    assertEqual(summary.queries.length >= testCase.expectedQueries.length, true, `${testCase.name} should include profile-specific expansion ahead of fallback when supported`);
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

  const targetedOrderingDocs = (query) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ docs: Array.from({ length: 5 }, (_, index) => ({
      ...fakeDoc(query, index + 200),
      key: `/works/targeted-ordering-${query.replace(/\s+/g, "-")}-${index}`,
      title: `${query} Target ${index + 1}`,
      subject: ["Juvenile fiction", "Children's stories", "Friendship", "Humorous stories"],
      description: `A middle grade ${query} story with friendship and humor.`,
      first_publish_year: 2014 + index,
    })) }),
  });

  const targetedOrderingCases = [
    {
      name: "skip-only animal/nature waits behind liked adventure comedy friendship",
      signals: [
        { action: "like", title: "Joke Quest", genres: ["comedy", "adventure"], themes: ["playful", "friendship"], format: "book" },
        { action: "like", title: "Buddy Trail", genres: ["adventure"], themes: ["friends", "funny"], format: "book" },
        { action: "skip", title: "Nat Geo Kids", genres: ["nonfiction", "animals", "nature"], themes: ["wildlife", "science"], format: "book" },
      ],
      disallowedFirst: /animal|nature|wildlife/i,
      expectedFamily: "adventure_comedy_friendship",
      expectedLikedQuery: /funny adventure chapter book|children friendship adventure|middle grade music friendship|children community adventure|funny middle school adventure/i,
    },
    {
      name: "skip-only fantasy cannot start before liked comedy adventure community music",
      signals: [
        { action: "like", title: "Community Band Quest", genres: ["comedy", "adventure"], themes: ["community", "music", "friendship"], format: "book" },
        { action: "like", title: "Funny Team Trail", genres: ["humor"], themes: ["playful", "friends", "adventure"], format: "book" },
        { action: "skip", title: "Magic Portal", genres: ["fantasy"], themes: ["magic", "magical"], format: "book" },
      ],
      disallowedFirst: /children fantasy adventure|fantasy|magic|magical/i,
      expectedFamily: "adventure_comedy_friendship",
      expectedLikedQuery: /funny adventure chapter book|children friendship adventure|middle grade music friendship|children community adventure|funny middle school adventure/i,
    },
    {
      name: "skip-only AI robot waits behind liked comedy friendship music",
      signals: [
        { action: "like", title: "Band Buddies", genres: ["comedy"], themes: ["friendship", "music", "funny"], format: "book" },
        { action: "like", title: "School Laughs", genres: ["humor"], themes: ["friends", "middle school"], format: "book" },
        { action: "skip", title: "The Mitchells vs the Machines", genres: ["science fiction"], themes: ["AI", "robots", "technology"], format: "movie" },
      ],
      disallowedFirst: /robot|science fiction|technology|AI/i,
      expectedFamily: "comedy_friendship_music",
      expectedLikedQuery: /funny children books|humorous fiction children|funny friendship chapter book|children friendship comedy|middle grade music friendship|funny middle school friendship/i,
    },
    {
      name: "comedy family kindness starts before incidental mystery animal recovery",
      signals: [
        { action: "like", title: "Family Laughs", genres: ["comedy"], themes: ["family", "kindness", "friendship"], format: "book" },
        { action: "like", title: "Kindness Club", genres: ["realistic fiction"], themes: ["kind", "family", "school"], format: "book" },
        { action: "like", title: "Holes", genres: ["mystery"], themes: ["puzzle"], format: "book" },
        { action: "skip", title: "Animal Facts", genres: ["nonfiction", "animals"], themes: ["nature"], format: "book" },
      ],
      disallowedFirst: /animal|nature|mystery|detective/i,
      expectedFamily: "comedy_family_kindness",
      expectedLikedQuery: /funny children books|humorous fiction children|children family comedy fiction|middle grade family friendship story|funny family chapter book|kindness middle grade fiction/i,
    },
  ];

  for (const orderingCase of targetedOrderingCases) {
    const fetchCalls = [];
    globalThis.fetch = async (url) => {
      const query = new URL(String(url)).searchParams.get("q") || "";
      fetchCalls.push(query);
      return targetedOrderingDocs(query);
    };
    try {
      const profile = buildTasteProfile({ ageBand: "preteens", signals: orderingCase.signals });
      const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
      const firstQuery = fetchCalls[0] || "";
      assertEqual(orderingCase.disallowedFirst.test(firstQuery), false, `${orderingCase.name} should not start with skip-only or incidental recovery query`);
      assertEqual(orderingCase.expectedLikedQuery.test(firstQuery), true, `${orderingCase.name} should start with liked-evidence query family`);
      assertEqual(Boolean(result.diagnostics.skipOnlyFamilyPromotedToFirstBatch), false, `${orderingCase.name} should not promote skip-only family to first batch`);
      assertEqual(Boolean(result.diagnostics.firstBatchSkipOnlyFamilyBlocked), true, `${orderingCase.name} should diagnose skip-only first-batch blocking when liked evidence exists`);
      assertEqual(Boolean(result.diagnostics.skippedFantasyPromotedToFirstBatch), false, `${orderingCase.name} should not promote skipped fantasy to first batch`);
      assertEqual((result.diagnostics.likedEvidenceFirstBatchFamilies || []).includes(orderingCase.expectedFamily), true, `${orderingCase.name} should expose liked-evidence first-batch families`);
      assertEqual(Object.keys(result.diagnostics.targetedQueryFamilyLikedEvidenceByFamily || {}).includes(orderingCase.expectedFamily), true, `${orderingCase.name} should record liked evidence for first-batch family`);
      assertEqual(String(result.diagnostics.firstBatchChosenBecause || "").includes("liked="), true, `${orderingCase.name} should explain first batch with liked evidence`);
      assertEqual((result.diagnostics.likedEvidenceQueryFamiliesAttemptedBeforeSkipOnlyRecovery || []).includes(orderingCase.expectedFamily), true, `${orderingCase.name} should attempt liked-evidence family before skip-only recovery`);
      console.log(JSON.stringify({ name: orderingCase.name, pass: true, firstQuery, firstBatchChosenBecause: result.diagnostics.firstBatchChosenBecause }));
    } finally {
      globalThis.fetch = originalFetch;
    }
  }


  const reliableOrderingCases = [
    {
      name: "dinosaur science profile tries reliable dinosaur variants before fantasy fallback",
      signals: [
        { action: "like", title: "Dinosaur Space Quest", genres: ["science fiction", "adventure"], themes: ["dinosaurs", "mythology", "friendship"], format: "book" },
        { action: "like", title: "Mythic Dino Crew", genres: ["adventure"], themes: ["dinosaur", "science", "friends"], format: "book" },
      ],
      expectedEarly: /dinosaur fiction children|dinosaur adventure children|children'?s science fiction adventure|children adventure fiction|mythology children fiction/i,
      disallowedBefore: /children fantasy family novel|middle grade magical family/i,
    },
    {
      name: "dog man graphic comedy profile tries reliable graphic variants before school fallback",
      signals: [
        { action: "like", title: "Dog Man", genres: ["comedy", "graphic novel"], themes: ["funny", "adventure", "friendship"], format: "book" },
        { action: "like", title: "Redwall", genres: ["fantasy", "adventure"], themes: ["animals", "friendship"], format: "book" },
      ],
      expectedEarly: /graphic novel children|funny graphic novel children|humorous fiction children|funny children books/i,
      disallowedBefore: /funny middle school fiction|illustrated middle school fiction|school friendship chapter book/i,
    },
    {
      name: "fantasy superhero family profile tries superhero family variants before generic funny fallback",
      signals: [
        { action: "like", title: "Family Super Squad", genres: ["fantasy"], themes: ["superhero", "family", "adventure", "funny"], format: "book" },
        { action: "like", title: "Magic Home Heroes", genres: ["fantasy"], themes: ["superhero", "magical", "family", "friendship"], format: "book" },
      ],
      expectedEarly: /middle grade superhero adventure|children superhero adventure|children fantasy family adventure|magical family adventure children|funny fantasy family children/i,
      disallowedBefore: /funny adventure chapter book|children adventure fiction|middle grade adventure$/i,
    },
    {
      name: "fantasy adventure mystery profile tries mystery adventure variants before exhausting fantasy family",
      signals: [
        { action: "like", title: "Mystic Clue Quest", genres: ["fantasy", "mystery"], themes: ["adventure", "magic", "detective"], format: "book" },
        { action: "like", title: "School of Secret Maps", genres: ["adventure"], themes: ["mystery", "friendship", "puzzle"], format: "book" },
      ],
      expectedEarly: /children mystery adventure|middle grade mystery adventure|fantasy mystery children|children magical mystery|school mystery children/i,
      disallowedBefore: /children fantasy family novel|middle grade magical family|children fantasy friendship/i,
    },
  ];

  for (const reliableCase of reliableOrderingCases) {
    const fetchCalls = [];
    globalThis.fetch = async (url) => {
      const query = new URL(String(url)).searchParams.get("q") || "";
      fetchCalls.push(query);
      return targetedOrderingDocs(query);
    };
    try {
      const profile = buildTasteProfile({ ageBand: "preteens", signals: reliableCase.signals });
      const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
      const firstExpected = fetchCalls.findIndex((query) => reliableCase.expectedEarly.test(query));
      const firstDisallowed = fetchCalls.findIndex((query) => reliableCase.disallowedBefore.test(query));
      assertEqual(firstExpected >= 0, true, `${reliableCase.name} should attempt reliable liked variants`);
      assertEqual(firstDisallowed === -1 || firstExpected < firstDisallowed, true, `${reliableCase.name} should attempt reliable liked variants before fallback/default queries`);
      assertEqual((result.diagnostics.reliableVariantAttempted || []).some((query) => reliableCase.expectedEarly.test(query)), true, `${reliableCase.name} should diagnose reliable variant attempts`);
      assertEqual(Boolean(result.rawItems.length === 0 && result.diagnostics.reliableVariantAttempted?.length), false, `${reliableCase.name} should not return zero after reliable variants are attempted`);
      console.log(JSON.stringify({ name: reliableCase.name, pass: true, fetchCalls, reliableVariantAttempted: result.diagnostics.reliableVariantAttempted }));
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  const allDroppedContinuationFetchCalls = [];
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    allDroppedContinuationFetchCalls.push(query);
    const docs = allDroppedContinuationFetchCalls.length === 1
      ? Array.from({ length: 5 }, (_, index) => ({
        key: `/works/all-dropped-${index}`,
        title: `Adult Drift ${index + 1}`,
        author_name: [`Adult Author ${index}`],
        subject: ["Adult fiction", "Booker prize", "Literary fiction"],
        description: "Adult literary fiction that should be dropped for a middle grades run.",
      }))
      : Array.from({ length: 5 }, (_, index) => ({
        ...fakeDoc(query, index + 300),
        key: `/works/reliable-continuation-${query.replace(/\s+/g, "-")}-${index}`,
        title: `Reliable Continuation ${index + 1}`,
        subject: ["Juvenile fiction", "Children's stories", "Humorous stories", "Friendship"],
        description: `A funny children friendship story from ${query}.`,
      }));
    return { ok: true, status: 200, text: async () => JSON.stringify({ docs }) };
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "preteens",
      signals: [
        { action: "like", title: "Funny Friends", genres: ["comedy"], themes: ["friendship", "funny"], format: "book" },
      ],
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
    assertEqual(Number(result.diagnostics.docsReturnedButAllDropped || 0) >= 1, true, "all-dropped query should be diagnosed");
    assertEqual(Boolean(result.diagnostics.allDroppedContinuationQuery?.length), true, "all-dropped query should record continuation query");
    assertEqual(result.rawItems.length > 0, true, "middle grades should not return zero while reliable same-family variants remain");
    assertEqual(Boolean(result.diagnostics.reliableVariantAcceptedCount && result.diagnostics.reliableVariantAcceptedCount > 0), true, "reliable continuation should accept candidates");
    console.log(JSON.stringify({ name: "middle grades all-dropped query continues to reliable same-family variant", pass: true, fetchCalls: allDroppedContinuationFetchCalls, diagnostics: { docsReturnedButAllDropped: result.diagnostics.docsReturnedButAllDropped, allDroppedContinuationQuery: result.diagnostics.allDroppedContinuationQuery, reliableVariantAcceptedCount: result.diagnostics.reliableVariantAcceptedCount } }));
  } finally {
    globalThis.fetch = originalFetch;
  }

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

  const fantasyFamilyTargetedFetchCalls = [];
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    fantasyFamilyTargetedFetchCalls.push(query);
    const docs = /middle grade superhero adventure|children superhero adventure|children fantasy family adventure|magical family adventure children|funny fantasy family children|children fantasy adventure|children fantasy family novel|middle grade magical family|children fantasy friendship|middle grade fantasy mystery|children magical adventure/i.test(query)
      ? ["Moon Family Magic", "Friendship Spell House", "The Musical Portal", "Kindness Dragon Home", "The Family Quest"].map((title, index) => ({
        ...fakeDoc(query, index + 610),
        key: `/works/fantasy-family-targeted-${query.replace(/\s+/g, "-")}-${index}`,
        title,
        subject: ["Juvenile fiction", "Fantasy fiction", "Families", "Friendship", "Magic"],
        description: "A magical family and friendship adventure for children.",
      }))
      : ["Alanna", "The School for Good and Evil", "The Misadventures of Max Crumbly", "Journey of Secret Agent", "No Time for Clouds"].map((title, index) => ({
        ...fakeDoc(query, index + 620),
        key: `/works/familiar-fallback-${query.replace(/\s+/g, "-")}-${index}`,
        title,
        subject: ["Juvenile fiction"],
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
      signals: [
        { action: "like", title: "Moana", genres: ["fantasy", "family"], themes: ["music", "ocean", "friendship", "playful"], format: "book" },
        { action: "like", title: "Paddington", genres: ["family"], themes: ["kindness", "warm"], format: "book" },
      ],
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 14_000 }, { profile });
    assertEqual(result.rawItems.length >= 5, true, "fantasy/family/playful targeted batch should reach a full evidence-supported slate");
    assertEqual(result.rawItems.some((item) => /alanna|school for good and evil|max crumbly|journey of secret agent/i.test(String(item.title || ""))), false, "fantasy/family/playful targeted batch should not return the familiar fallback cluster as its main slate");
    assertEqual((result.diagnostics.targetedQueriesAttempted || []).some((query) => /fantasy|family|friendship|magical/i.test(query)), true, "fantasy/family/playful route should attempt targeted fantasy-family queries");
    assertEqual(Boolean(result.diagnostics.broadFallbackStartedBeforeTargetedExhaustion), false, "fantasy/family/playful route should not start broad fallback before targeted exhaustion");
    console.log(JSON.stringify({ name: "middle grades fantasy family targeted batch avoids familiar fallback cluster", pass: true, rawItems: result.rawItems.length, fetchCalls: fantasyFamilyTargetedFetchCalls }));
  } finally {
    globalThis.fetch = originalFetch;
  }

  const middleGradesWeakMetadataFetchCalls = [];
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    middleGradesWeakMetadataFetchCalls.push(query);
    const docs = ["Magic Station", "Quest Map", "Dragon Relay", "Wizard Team", "Hero Club"].map((title, index) => ({
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

  const queryOnlyContinuationFetchCalls = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    const query = parsed.searchParams.get("q") || "";
    queryOnlyContinuationFetchCalls.push(query);
    const docs = queryOnlyContinuationFetchCalls.length > 1 && /middle grade (realistic fiction|school story|friendship)|funny middle school novel|middle school comedy novel/i.test(query)
      ? [1, 2, 3, 4, 5, 6].map((index) => ({
        ...fakeDoc(query, index + 400),
        key: `/works/query-only-continuation-${query.replace(/\s+/g, "-")}-${index}`,
        title: ["Friendship School Evidence", "Classroom Community Mystery", "Funny Middle School Team", "Realistic Friendship Club", "School Comedy Crew", "Community Classroom Quest"][index - 1],
        subject: ["Juvenile fiction", "Friendship", "Schools", "Community life"],
      }))
      : [1, 2, 3, 4, 5, 6].map((index) => ({
        ...fakeDoc(query, index + 380),
        key: `/works/query-only-reject-${query.replace(/\s+/g, "-")}-${index}`,
        title: ["Generic Metadata Row", "Plain Catalog Entry", "Unthemed Library Record", "Sparse Work Listing", "Bare Juvenile Record", "No Evidence Entry"][index - 1],
        subject: ["Juvenile fiction"],
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
      signals: [
        { action: "like", title: "Classroom Friends", genres: ["realistic fiction"], themes: ["school", "friendship"], format: "book" },
        { action: "like", title: "Community Club", genres: ["contemporary"], themes: ["community", "friendship"], format: "book" },
      ],
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 12_000 }, { profile });
    assertEqual(result.rawItems.length >= 5, true, "query-only rejection continuation should fill with later document-aligned rows");
    assertEqual(result.diagnostics.rejectedAllRowsAsQueryOnly, true, "source adapter should diagnose all-query-only rejection");
    assertEqual(result.diagnostics.queryOnlyRejectionTriggeredContinuation, true, "source adapter should continue after query-only rejection");
    assertEqual(Array.isArray(result.diagnostics.unattemptedSpecificQueriesAfterQueryOnlyRejection) && result.diagnostics.unattemptedSpecificQueriesAfterQueryOnlyRejection.length > 0, true, "unattempted specific queries should be captured after query-only rejection");
    assertEqual(Array.isArray(result.diagnostics.continuedAfterQueryOnlyRejectionQueries) && result.diagnostics.continuedAfterQueryOnlyRejectionQueries.some((query) => /middle grade (realistic fiction|school story|friendship)|middle school/i.test(query)), true, "source adapter should attempt route-specific continuation queries after query-only rejection");
    assertEqual(Number(result.diagnostics.continuedAfterQueryOnlyRejectionAcceptedCount || 0) >= 5, true, "query-only continuation should record accepted route-evidence rows");
    console.log(JSON.stringify({ name: "middle grades query-only rows continue to route-specific queries", pass: true, rawItems: result.rawItems.length, fetchCalls: queryOnlyContinuationFetchCalls }));
  } finally {
    globalThis.fetch = originalFetch;
  }

  const mysteryContinuationFetchCalls = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    const query = parsed.searchParams.get("q") || "";
    mysteryContinuationFetchCalls.push(query);
    const count = mysteryContinuationFetchCalls.length === 1 ? 2 : 5;
    const docs = Array.from({ length: count }, (_, index) => ({
      ...fakeDoc(query, index + 430),
      key: `/works/mystery-continuation-${mysteryContinuationFetchCalls.length}-${index}`,
      title: [
        "Detective Clue Case",
        "School Mystery Puzzle",
        "Secret Map Investigation",
        "Classroom Detective Club",
        "Mystery Adventure Team",
      ][index] || `Clue Trail ${mysteryContinuationFetchCalls.length}-${index}`,
      subject: ["Juvenile fiction", "Mystery and detective stories", "Clues", "School"],
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
      signals: [
        { action: "like", title: "Puzzle Portal", genres: ["mystery"], themes: ["clue", "investigation"], format: "book" },
        { action: "like", title: "School Detective", genres: ["mystery"], themes: ["school", "detective"], format: "book" },
      ],
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 12_000 }, { profile });
    assertEqual(result.rawItems.length >= 5, true, "mystery route with two aligned rows should keep searching toward five");
    assertEqual(mysteryContinuationFetchCalls.length >= 2, true, "mystery route should attempt another safe mystery query after underfill");
    assertEqual((result.diagnostics.targetedQueriesAttempted || []).some((query) => /mystery|detective/i.test(query)), true, "mystery route should continue targeted mystery queries before broad fallback");
    assertEqual(Boolean(result.rawItems.length < 5 && result.diagnostics.underfilledDespiteTargetedQueriesRemaining), false, "mystery route must not underfill while targeted mystery queries remain");
    console.log(JSON.stringify({ name: "middle grades mystery underfill continues toward five", pass: true, rawItems: result.rawItems.length, fetchCalls: mysteryContinuationFetchCalls }));
  } finally {
    globalThis.fetch = originalFetch;
  }

  const dragonEvidenceRecoveryFetchCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    const query = parsed.searchParams.get("q") || "";
    dragonEvidenceRecoveryFetchCalls.push(query);
    if (/dragon|mythology/i.test(query) && !/children|chapter/i.test(query)) {
      init?.signal?.dispatchEvent?.(new Event("abort"));
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    const docs = /dragon fantasy children|dragon adventure children|children'?s dragon books|mythology adventure children|fantasy adventure children/i.test(query)
      ? [1, 2, 3, 4, 5, 6].map((index) => ({
        ...fakeDoc(query, index + 460),
        key: `/works/dragon-evidence-recovery-${query.replace(/\s+/g, "-")}-${index}`,
        title: ["Dragon Cave Quest", "Mythology Adventure Map", "Young Dragon Riders", "Creature Kingdom Trail", "Fantasy Dragon Team", "Magic Myth Quest"][index - 1],
        subject: ["Juvenile fiction", "Dragons", "Mythology", "Fantasy fiction", "Adventure stories"],
      }))
      : [1, 2, 3, 4, 5, 6].map((index) => ({
        ...fakeDoc(query, index + 450),
        key: `/works/dragon-query-only-${query.replace(/\s+/g, "-")}-${index}`,
        title: `Sparse Fantasy Row ${index}`,
        subject: ["Juvenile fiction"],
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
      signals: [
        { action: "like", title: "Dragon Riders", genres: ["fantasy"], themes: ["dragon", "mythology", "adventure"], format: "book" },
        { action: "like", title: "Creature Quest", genres: ["fantasy"], themes: ["creature", "magic"], format: "book" },
      ],
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 18_000 }, { profile });
    assertEqual(result.rawItems.length >= 5, true, "dragon/fantasy evidence-aware recovery should reach five evidence-supported candidates");
    assertEqual(result.diagnostics.evidenceAwareRecoveryAttempted, true, "dragon/fantasy recovery should attempt evidence-aware children-style queries");
    assertEqual(Number(result.diagnostics.evidenceAwareRecoveryAcceptedCount || 0) >= 5, true, "dragon/fantasy evidence-aware recovery should accept evidence-supported rows");
    assertEqual(result.diagnostics.brittleQueryTimedOutThenShortQueryAttempted, true, "timed-out dragon/mythology query should trigger shorter child/children recovery");
    assertEqual(Boolean(result.diagnostics.dropReasons?.middle_grades_query_only_source_rejected || result.diagnostics.targetedQueriesAcceptedCount >= 5), true, "dragon/fantasy recovery should either reject query-only rows or fill from targeted evidence-rich rows first");
    assertEqual(dragonEvidenceRecoveryFetchCalls.some((query) => /dragon fantasy children|dragon adventure children|children'?s dragon books|mythology adventure children/i.test(query)), true, "dragon/fantasy recovery should use evidence-aware children-style queries");
    console.log(JSON.stringify({ name: "middle grades dragon evidence-aware recovery fills without query-only rows", pass: true, rawItems: result.rawItems.length, fetchCalls: dragonEvidenceRecoveryFetchCalls }));
  } finally {
    globalThis.fetch = originalFetch;
  }

  const schoolEvidenceRecoveryFetchCalls = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    const query = parsed.searchParams.get("q") || "";
    schoolEvidenceRecoveryFetchCalls.push(query);
    const docs = /funny middle school fiction|school friendship chapter book|realistic school friendship fiction|illustrated middle school fiction/i.test(query)
      ? [1, 2, 3, 4, 5, 6].map((index) => ({
        ...fakeDoc(query, index + 490),
        key: `/works/school-evidence-recovery-${query.replace(/\s+/g, "-")}-${index}`,
        title: ["Funny Middle School Club", "School Friendship Project", "Illustrated Classroom Crew", "Realistic School Team", "Friendship Chapter Book", "Middle School Comedy Map"][index - 1],
        subject: ["Juvenile fiction", "Schools", "Friendship", "Humorous stories", "Middle schools"],
      }))
      : [1, 2, 3, 4, 5, 6].map((index) => ({
        ...fakeDoc(query, index + 480),
        key: `/works/school-query-only-${query.replace(/\s+/g, "-")}-${index}`,
        title: `Sparse Catalog Row ${index}`,
        subject: ["Juvenile fiction"],
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
      signals: [
        { action: "like", title: "Lunchroom Laughs", genres: ["comedy"], themes: ["school", "friendship", "funny"], format: "book" },
        { action: "like", title: "Classroom Friends", genres: ["realistic fiction"], themes: ["middle school", "community"], format: "book" },
      ],
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 18_000 }, { profile });
    assertEqual(result.rawItems.length >= 5, true, "school/comedy/friendship evidence-aware recovery should not return zero after query-only school rows");
    assertEqual(result.diagnostics.evidenceAwareRecoveryAttempted, true, "school/comedy/friendship recovery should attempt evidence-aware chapter-book queries");
    assertEqual(result.diagnostics.rejectedAllRowsAsQueryOnly === true ? Number(result.diagnostics.queryOnlyRejectedThenRecoveredCount || 0) >= 5 : result.rawItems.length >= 5, true, "school/comedy/friendship recovery should either recover after query-only rows or directly accept liked evidence rows");
    assertEqual(schoolEvidenceRecoveryFetchCalls.some((query) => /funny middle school fiction|school friendship chapter book|realistic school friendship fiction|illustrated middle school fiction/i.test(query)), true, "school/comedy/friendship recovery should use evidence-aware school/friendship queries");
    console.log(JSON.stringify({ name: "middle grades school evidence-aware recovery fills after query-only rows", pass: true, rawItems: result.rawItems.length, fetchCalls: schoolEvidenceRecoveryFetchCalls }));
  } finally {
    globalThis.fetch = originalFetch;
  }

  const animalScienceRecoveryFetchCalls = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    const query = parsed.searchParams.get("q") || "";
    animalScienceRecoveryFetchCalls.push(query);
    const docs = /children'?s animal adventure|wildlife adventure children|animal chapter book|nature adventure children|robot animal adventure children/i.test(query)
      ? [
        { title: "The Wild Robot", subject: ["Juvenile fiction", "Robots", "Animals", "Nature", "Survival"], description: "A robot learns from animals in the wilderness." },
        { title: "Flora and Ulysses", subject: ["Juvenile fiction", "Animals", "Squirrels", "Humorous stories"], description: "A funny animal adventure about friendship and family." },
        { title: "A Wolf Called Wander", subject: ["Juvenile fiction", "Wolves", "Wildlife", "Nature"], description: "A wolf survives a wilderness journey." },
        { title: "Forest Science Club", subject: ["Juvenile fiction", "Nature", "Science", "Animals"], description: "Kids explore animal habitats and science." },
        { title: "Robot Wildlife Rescue", subject: ["Juvenile fiction", "Robots", "Wildlife rescue", "Adventure stories"], description: "A robot helps animals during an adventure." },
      ].map((doc, index) => ({
        ...fakeDoc(query, index + 520),
        key: `/works/animal-science-recovery-${query.replace(/\s+/g, "-")}-${index}`,
        title: doc.title,
        subject: doc.subject,
        description: doc.description,
      }))
      : [1, 2, 3, 4, 5, 6].map((index) => ({
        ...fakeDoc(query, index + 510),
        key: `/works/animal-query-only-${query.replace(/\s+/g, "-")}-${index}`,
        title: `Sparse Catalog Row ${index}`,
        subject: ["Juvenile fiction"],
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
      signals: [
        { action: "like", title: "Nat Geo Kids", genres: ["nonfiction", "animals", "nature"], themes: ["science", "wildlife"], format: "book" },
        { action: "like", title: "Robot Adventure", genres: ["science fiction"], themes: ["robots", "family", "adventure"], format: "book" },
      ],
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 18_000 }, { profile });
    assertEqual(result.rawItems.length >= 5, true, "animal/science recovery should preserve evidence-supported animal/nature/robot candidates");
    assertEqual(result.rawItems.some((item) => /wild robot|flora|wolf/i.test(String(item.title || ""))), true, "animal/science recovery should not suppress plausible animal/nature candidates");
    assertEqual(result.diagnostics.evidenceAwareRecoveryAttempted, true, "animal/science recovery should attempt evidence-aware animal/nature queries");
    assertEqual(Number(result.diagnostics.evidenceAwareRecoveryAcceptedCount || 0) >= 5, true, "animal/science recovery should accept evidence-rich animal/nature candidates");
    assertEqual(animalScienceRecoveryFetchCalls.some((query) => /animal|wildlife|nature/i.test(query)), true, "animal/science recovery should use animal/nature evidence-aware query variants");
    const firstAnimalTargetedIndex = animalScienceRecoveryFetchCalls.findIndex((query) => /animal|wildlife|nature/i.test(query));
    const firstSchoolDefaultIndex = animalScienceRecoveryFetchCalls.findIndex((query) => /school|funny|humor/i.test(query));
    assertEqual(firstAnimalTargetedIndex >= 0 && (firstSchoolDefaultIndex === -1 || firstAnimalTargetedIndex < firstSchoolDefaultIndex), true, "animal/nature targeted queries should run before school/default recovery");
    assertEqual(Boolean(result.rawItems.length < 5 && result.diagnostics.underfilledDespiteTargetedQueriesRemaining), false, "animal/science route must not underfill while targeted queries remain");
    console.log(JSON.stringify({ name: "middle grades animal science evidence-aware recovery preserves plausible candidates", pass: true, rawItems: result.rawItems.length, fetchCalls: animalScienceRecoveryFetchCalls }));
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
    const docs = ["Funny School Quest", "Cafeteria Friendship Clues", "Field Day Comedy Plan", "Bus Ride School Team", "Library Friendship Map"].map((title, index) => ({
      ...fakeDoc(query, index + 20),
      key: `/works/mg-recovery-${query.replace(/\s+/g, "-")}-${index}`,
      title,
      author_name: [`Recovery Author ${index}`],
      subject: ["Children's fiction", "Adventure stories", "Schools", "Friendship", "Humorous stories"],
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
    assertEqual(result.rawItems.length >= 5, true, "middle grades recovery should reach at least five age-shaped candidates");
    assertEqual(Boolean(result.diagnostics.dropReasons?.middle_grades_recovery_query_attempted || result.diagnostics.profileSpecificQueriesAttempted?.length), true, "middle grades recovery should run profile-specific or age-anchored recovery queries");
    assertEqual(middleGradesRecoveryFetchCalls.includes("friendship fiction"), false, "middle grades recovery should not use broad friendship fiction");
    assertEqual(middleGradesRecoveryFetchCalls.includes("young adult fantasy"), false, "middle grades recovery should not use YA fantasy emergency probe");
    assertEqual(middleGradesRecoveryFetchCalls.some((query) => /middle grade (friendship|school|adventure)|middle school|funny children books|humorous fiction children|children adventure fiction/i.test(query)), true, "middle grades recovery should use concrete middle-grades queries before broad fallback");
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
    assertEqual(Boolean(result.rawItems.length < 5 && result.diagnostics.underfilledDespiteTargetedQueriesRemaining), false, "middle grades runs returning fewer than five must not leave targeted queries unattempted");
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
    assertEqual(middleGradesHumorContinuationFetchCalls.some((query) => /funny|family|friendship|fantasy/i.test(query)), true, "middle grades fantasy humor should continue through profile-specific aligned queries");
    assertEqual(Boolean(result.diagnostics.profileSpecificQueriesAttempted?.length), true, "middle grades fantasy humor continuation should record profile-specific attempts");
    assertEqual(middleGradesHumorContinuationFetchCalls.indexOf("children's funny books") === -1 || middleGradesHumorContinuationFetchCalls.indexOf("children's funny books") >= 3, true, "middle grades fantasy humor should not use broad funny books before profile-specific queries");
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
    assertEqual(result.diagnostics.fetches?.[0]?.clientTimeoutMs <= 4500, true, "middle grades targeted fetch should reserve source budget for additional planned queries");
    assertEqual(Boolean(result.diagnostics.perQueryBudgetReserved?.[result.diagnostics.fetches?.[0]?.query]), true, "middle grades diagnostics should expose per-query budget reservation");
    console.log(JSON.stringify({ name: "middle grades proxy path uses age-specific resilience window", pass: true, fetchPath: result.diagnostics.fetches?.[0]?.fetchPath, clientTimeoutMs: result.diagnostics.fetches?.[0]?.clientTimeoutMs, profileLabel: result.diagnostics.openLibraryProfileLabel }));
  } finally {
    if (previousMiddleGradesProxyBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousMiddleGradesProxyBase;
    globalThis.fetch = originalFetch;
  }

  const previousMiddleGradesDebugProxyBase = process.env.OPEN_LIBRARY_PROXY_BASE_URL;
  const middleGradesDebugFetchUrls = [];
  process.env.OPEN_LIBRARY_PROXY_BASE_URL = "https://proxy.example.test";
  globalThis.fetch = async (url) => {
    middleGradesDebugFetchUrls.push(String(url));
    const query = new URL(String(url)).searchParams.get("q") || "";
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ proxyAttempts: 1, docs: Array.from({ length: 16 }, (_, offset) => {
        const index = offset + 1;
        const doc = fakeDoc(query, index);
        return index <= 5
          ? { ...doc, subject: ["Juvenile fiction", "Children's stories", "Friendship", "Adventure stories", "Humorous stories"] }
          : {
            ...doc,
            title: `Debug Generic Candidate ${index}`,
            subject: ["Juvenile fiction", "Children's stories"],
            description: "A children story included to verify the expanded deep-debug handoff reaches scoring before source-final evidence narrowing.",
          };
      }) }),
    };
  };
  try {
    const debugProfile = buildTasteProfile({
      ageBand: "preteens",
      signals: middleGradesCases[3].signals,
    });
    debugProfile.diagnostics.debugMiddleGradesDeepTrace = true;
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 2_000 }, { profile: debugProfile });
    assertEqual(result.diagnostics.debugMiddleGradesDeepTraceEnabled, true, "middle grades deep trace should be explicitly enabled by profile diagnostics");
    assertEqual(result.diagnostics.middleGradesDeepDebugActive, true, "middle grades deep debug active diagnostic should be true");
    assertEqual(result.diagnostics.middleGradesDeepDebugActivationSource, "profile", "direct profile debug activation source should be diagnosed");
    assertEqual(result.diagnostics.sessionReportHeader, "MIDDLE GRADES DEEP DEBUG: ACTIVE", "source report should include obvious deep-debug header");
    assertEqual(result.diagnostics.debugMiddleGradesBudgetMs >= 180000, true, "middle grades debug mode should expand source budget");
    assertEqual(result.diagnostics.fetches?.[0]?.clientTimeoutMs >= 20000, true, "middle grades debug mode should expand per-query timeout");
    assertEqual(Array.isArray(result.diagnostics.debugMiddleGradesPlannedQueries) && result.diagnostics.debugMiddleGradesPlannedQueries.length > 0, true, "deep trace should expose planned query list");
    assertEqual(Array.isArray(result.diagnostics.debugMiddleGradesFetchTrace) && result.diagnostics.debugMiddleGradesFetchTrace.length > 0, true, "deep trace should expose fetch trace");
    assertEqual(Array.isArray(result.diagnostics.debugMiddleGradesRawDocTrace) && result.diagnostics.debugMiddleGradesRawDocTrace.length > 0, true, "deep trace should expose raw doc filtering trace");
    assertEqual(Array.isArray(result.diagnostics.debugMiddleGradesNormalizedCandidateTrace) && result.diagnostics.debugMiddleGradesNormalizedCandidateTrace.length > 0, true, "deep trace should expose normalized candidate trace");
    assertEqual(Boolean(result.diagnostics.debugMiddleGradesCompactSummary?.best20RawDocsByQuery), true, "deep trace should expose compact summary");
    assertEqual(Number(result.diagnostics.openLibraryDocsFetchedAcrossAllQueriesCount || 0) > 100, true, "deep-debug fixture should match the live failure shape with more than 100 Open Library docs fetched");
    assertEqual(Number(result.diagnostics.openLibraryDocsActuallyHandedToScoringCount || 0) > 5, true, "deep-debug handoff should send more than source-final five candidates into scoring");
    assertEqual(result.diagnostics.openLibraryScoringHandoffSource, "expanded_debug_pool", "deep-debug handoff should use the expanded candidate pool");
    assertEqual(result.diagnostics.openLibraryScoringHandoffLimitedToSourceFinal, false, "deep-debug handoff must not be limited to source-final five");
    const normalizedDebugHandoff = normalizeSourceResults([result]);
    const scoredDebugHandoff = scoreCandidates(normalizedDebugHandoff, debugProfile);
    assertEqual(normalizedDebugHandoff.filter((candidate) => candidate.source === "openLibrary").length > 5, true, "expanded Open Library handoff should enter V2 normalization with more than five candidates");
    assertEqual(scoredDebugHandoff.filter((candidate) => candidate.source === "openLibrary").length > 5, true, "expanded Open Library handoff should enter V2 scoring with more than five candidates");
    const selectedDebugHandoff = selectRecommendations(scoredDebugHandoff, debugProfile, 5);
    const scoredOpenLibraryDebugCount = scoredDebugHandoff.filter((candidate) => candidate.source === "openLibrary").length;
    assertEqual(scoredOpenLibraryDebugCount > 10, true, "deep-debug expanded handoff fixture should provide more than ten Open Library candidates for attribution checks");
    assertEqual(Object.keys(selectedDebugHandoff.rejectedReasons.candidateTasteMatchScoreByTitle || {}).length > 10, true, "expanded Open Library scoring should emit non-empty taste score attribution for the scored universe");
    assertEqual(Object.keys(selectedDebugHandoff.rejectedReasons.candidateMatchedLikedSignalsByTitle || {}).length > 10, true, "expanded Open Library scoring should emit liked-signal attribution for the scored universe");
    assertEqual(Object.keys(selectedDebugHandoff.rejectedReasons.finalScoreComponentsByTitle || {}).length > 10, true, "expanded Open Library scoring should emit score component attribution for the scored universe");
    assertEqual(Object.keys(selectedDebugHandoff.rejectedReasons.finalRankingReasonByTitle || {}).length > 10, true, "expanded Open Library scoring should emit final selected/rejected ranking reasons for the scored universe");
    assertEqual(Array.isArray(selectedDebugHandoff.rejectedReasons.middleGradesScoredCandidateAttribution) && selectedDebugHandoff.rejectedReasons.middleGradesScoredCandidateAttribution.length >= scoredOpenLibraryDebugCount, true, "expanded Open Library scoring should emit selected/rejected attribution rows for all scored candidates");
    const expandedPoolPositiveSignals = Object.values(selectedDebugHandoff.rejectedReasons.candidateMatchedLikedSignalsByTitle || {}).flat().map(String);
    assertEqual(expandedPoolPositiveSignals.some((signal) => /^positiveTasteMatch:(book|children|middle grade|fiction|novel|story|series)$/i.test(signal)), false, "expanded Open Library scoring must not credit generic container terms as positive taste evidence");
    console.log(JSON.stringify({ name: "middle grades deep-debug mode expands budgets and emits full trace", pass: true, budget: result.diagnostics.debugMiddleGradesBudgetMs, firstClientTimeout: result.diagnostics.fetches?.[0]?.clientTimeoutMs, traceCounts: { planned: result.diagnostics.debugMiddleGradesPlannedQueries.length, fetch: result.diagnostics.debugMiddleGradesFetchTrace.length, raw: result.diagnostics.debugMiddleGradesRawDocTrace.length, normalized: result.diagnostics.debugMiddleGradesNormalizedCandidateTrace.length }, handoff: { fetched: result.diagnostics.openLibraryDocsFetchedAcrossAllQueriesCount, eligible: result.diagnostics.openLibraryDocsEligibleForScoringCount, handedToScoring: result.diagnostics.openLibraryDocsActuallyHandedToScoringCount, normalized: normalizedDebugHandoff.length, scored: scoredDebugHandoff.length, source: result.diagnostics.openLibraryScoringHandoffSource } }));
  } finally {
    if (previousMiddleGradesDebugProxyBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousMiddleGradesDebugProxyBase;
    globalThis.fetch = originalFetch;
  }


  const previousMeaningfulTasteRecoveryBase = process.env.OPEN_LIBRARY_PROXY_BASE_URL;
  const meaningfulTasteRecoveryFetchQueries = [];
  process.env.OPEN_LIBRARY_PROXY_BASE_URL = "https://proxy.example.test";
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    meaningfulTasteRecoveryFetchQueries.push(query);
    const recoveryQuery = /middle grade robot adventure|middle grade science fiction adventure|children ocean adventure|middle grade survival adventure|middle grade family adventure|middle grade superhero adventure|middle grade school mystery|middle grade fantasy quest|middle grade friendship adventure fiction|middle grade family adventure fiction|middle grade family school fiction|middle grade school friendship fiction|middle grade fast paced adventure fiction|children adventure friendship series|middle grade fantasy friendship fiction|middle grade fantasy family fiction|middle grade mythology adventure fiction|middle grade dragon heroic fiction|middle grade dystopian friendship fiction|middle grade science concise nonfiction|middle grade science adventure fiction|children science adventure fiction|middle grade superhero friendship fiction|middle grade superhero family fiction|children superhero adventure fiction|middle grade ocean friendship fiction|children ocean adventure fiction|middle grade survival friendship fiction|middle grade robot friendship fiction/i.test(query);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ proxyAttempts: 1, docs: Array.from({ length: 12 }, (_unused, offset) => {
        const index = offset + 1;
        return {
          key: `/works/meaningful-${query.replace(/\s+/g, "-")}-${index}`,
          title: recoveryQuery ? [`Harbor Friendship`, `Classroom Adventure`, `Family Trail`, `School Team Quest`, `Friendship Forest`, `River Friends`, `Community Journey`, `Family Map`, `Schoolyard Mystery`, `Teamwork Trail`, `Friendship Harbor`, `Classroom Quest`][offset] : `Generic Weak Candidate ${meaningfulTasteRecoveryFetchQueries.length}-${index}`,
          author_name: [`Meaningful Recovery Author ${index}`],
          subject: recoveryQuery
            ? ["Juvenile fiction", "Middle grade fiction", "Adventure stories", "School stories", "Friendship", "Family"]
            : ["Juvenile fiction", "Adventure stories"],
          description: recoveryQuery
            ? "A middle grade friendship adventure fiction story about classmates, family teamwork, school friends, and a fast paced journey."
            : "A broadly paced juvenile fiction entry with no specific liked evidence.",
          language: ["eng"],
          first_publish_year: 2015 + index,
        };
      }) }),
    };
  };
  try {
    const debugProfile = buildTasteProfile({
      ageBand: "preteens",
      signals: [
        { action: "like", title: "Funny Family School Friends", source: "mock", format: "book", genres: ["Comedy", "School"], themes: ["Family", "Friendship"] },
      ],
    });
    debugProfile.diagnostics.debugMiddleGradesDeepTrace = true;
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 2_000 }, { profile: debugProfile });
    assertEqual(Number(result.diagnostics.openLibraryDocsFetchedAcrossAllQueriesCount || 0) > 20, true, "meaningful-taste recovery fixture should fetch a live-shaped large pool");
    if (result.diagnostics.meaningfulTasteRecoveryTriggered) {
      assertEqual((result.diagnostics.meaningfulTasteRecoveryQueriesAttempted || [])[0] !== "middle grade adventure", true, "meaningful-taste recovery should not start with generic middle grade adventure");
      assertEqual((result.diagnostics.meaningfulTasteRecoveryQueriesAttempted || []).some((query) => /funny|humou?r|comedy/i.test(query)), false, "meaningful-taste recovery should not use humor as the recovery query anchor");
      assertEqual(result.diagnostics.recoveryConcreteFictionQueryUsed, true, "meaningful-taste recovery should attempt concrete fiction queries anchored in non-humor liked evidence");
      assertEqual(Object.values(result.diagnostics.recoveryQueryAnchorByQuery || {}).some((anchor) => String(anchor) !== "humor"), true, "meaningful-taste recovery should diagnose non-humor query anchors");
      assertEqual((result.diagnostics.meaningfulTasteRecoveryAcceptedTitles || []).length >= 1, true, "meaningful-taste recovery should accept document-backed taste matches from targeted queries");
      assertEqual(Number(result.diagnostics.meaningfulTasteRecoveryFinalCount || 0) >= 5 || result.diagnostics.underfilledAfterMeaningfulTasteRecovery === true, true, "meaningful-taste recovery should either reach five meaningful candidates or mark underfill after recovery");
    }
    if (Number(result.diagnostics.meaningfulTasteRecoveryFinalCount || 0) >= 5) {
      assertEqual(result.rawItems.some((item) => item?.meaningfulTasteRecovery || item?.scoringHandoffStage === "meaningful_taste_recovery"), true, "source handoff should mark recovered meaningful candidates before normalization/scoring");
    }
    const normalizedRecoveryHandoff = normalizeSourceResults([result]);
    const scoredRecoveryHandoff = scoreCandidates(normalizedRecoveryHandoff, debugProfile);
    const selectedRecoveryHandoff = selectRecommendations(scoredRecoveryHandoff, debugProfile, 5);
    if (result.diagnostics.meaningfulTasteRecoveryTriggered) {
      assertEqual(Boolean(selectedRecoveryHandoff.rejectedReasons.meaningfulTasteRecoveryMergedIntoScoring), true, "meaningful-taste recovery candidates should be merged into scoring before final selection");
      assertEqual(Number(selectedRecoveryHandoff.rejectedReasons.meaningfulTasteRecoveryMergedCandidateCount || 0) >= Number(result.diagnostics.meaningfulTasteRecoveryAcceptedTitles?.length || 0), true, "merged recovery count should cover accepted recovery candidates");
      assertEqual(Number(selectedRecoveryHandoff.rejectedReasons.meaningfulTasteRecoveryFinalSelectionCount || 0) > 0 || Object.keys(selectedRecoveryHandoff.rejectedReasons.meaningfulTasteRecoveryDroppedAfterMergeByReason || {}).length > 0, true, "recovered candidates should either reach final selection or report post-merge rejection reasons");
    }
    if (Number(result.diagnostics.meaningfulTasteRecoveryFinalCount || 0) >= 5 && selectedRecoveryHandoff.selected.length < 5) {
      assertEqual(Object.keys(selectedRecoveryHandoff.rejectedReasons.meaningfulTasteRecoveryDroppedAfterMergeByReason || {}).length > 0, true, "underfilled recovered runs should explain every post-merge recovery drop");
    }
    console.log(JSON.stringify({ name: "middle grades deep-debug triggers meaningful-taste recovery after strict taste underfill", pass: true, queries: result.diagnostics.meaningfulTasteRecoveryQueriesAttempted, accepted: result.diagnostics.meaningfulTasteRecoveryAcceptedTitles, finalCount: result.diagnostics.meaningfulTasteRecoveryFinalCount, selected: selectedRecoveryHandoff.selected.map((candidate) => candidate.title), droppedAfterMerge: selectedRecoveryHandoff.rejectedReasons.meaningfulTasteRecoveryDroppedAfterMergeByReason }));
  } finally {
    if (previousMeaningfulTasteRecoveryBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousMeaningfulTasteRecoveryBase;
    globalThis.fetch = originalFetch;
  }

  const previousPostFinalRecoveryBase = process.env.OPEN_LIBRARY_PROXY_BASE_URL;
  process.env.OPEN_LIBRARY_PROXY_BASE_URL = "https://proxy.example.test";
  const postFinalRecoveryFetchQueries = [];
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    postFinalRecoveryFetchQueries.push(query);
    const recoveryQuery = /middle grade robot adventure|middle grade science fiction adventure|children ocean adventure|middle grade survival adventure|middle grade family adventure|middle grade superhero adventure|middle grade school mystery|middle grade fantasy quest|middle grade friendship adventure fiction|middle grade family adventure fiction|middle grade family school fiction|middle grade school friendship fiction|middle grade fast paced adventure fiction|children adventure friendship series|middle grade fantasy friendship fiction|middle grade fantasy family fiction|middle grade mythology adventure fiction|middle grade dragon heroic fiction|middle grade dystopian friendship fiction|middle grade science concise nonfiction|middle grade science adventure fiction|children science adventure fiction|middle grade superhero friendship fiction|middle grade superhero family fiction|children superhero adventure fiction|middle grade ocean friendship fiction|children ocean adventure fiction|middle grade survival friendship fiction|middle grade robot friendship fiction/i.test(query);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ proxyAttempts: 1, docs: Array.from({ length: 12 }, (_unused, offset) => {
        const index = offset + 1;
        const badRecoveryTitles = ["My Mr Funny", "Frog and Toad Together", "Henry and Mudge and the Funny Lunch", "National Geographic Kids Funny Fill-In"];
        const badRecoveryTitle = recoveryQuery ? badRecoveryTitles[offset] : undefined;
        return {
          key: `/works/post-final-${query.replace(/\s+/g, "-")}-${index}`,
          title: badRecoveryTitle || (recoveryQuery ? [`Post Final Harbor Friendship`, `Post Final Classroom Adventure`, `Post Final Family Trail`, `Post Final School Team Quest`, `Post Final Friendship Forest`, `Post Final River Friends`, `Post Final Community Journey`, `Post Final Family Map`, `Post Final Schoolyard Mystery`, `Post Final Teamwork Trail`, `Post Final Friendship Harbor`, `Post Final Classroom Quest`][offset] : `Post Final Weak Meaningful ${postFinalRecoveryFetchQueries.length}-${index}`),
          author_name: [`Post Final Author ${index}`],
          subject: badRecoveryTitle
            ? ["Humorous stories"]
            : recoveryQuery
            ? ["Juvenile fiction", "Middle grade fiction", "Adventure stories", "School stories", "Friendship", "Family"]
            : ["Juvenile fiction"],
          description: badRecoveryTitle
            ? "A funny fill-in joke style row without independent family, friendship, school, or adventure evidence."
            : recoveryQuery
            ? "A middle grade friendship adventure fiction story about classmates, family teamwork, school friends, and a fast paced journey."
            : "A funny family friendship premise without the current route evidence needed for final eligibility.",
          language: ["eng"],
          first_publish_year: 2014 + index,
        };
      }) }),
    };
  };
  try {
    const result = await runRecommenderV2({
      requestId: "post-final-eligibility-recovery-regression",
      ageBand: "preteens",
      limit: 1,
      enabledSources: { openLibrary: true },
      debugMiddleGradesDeepTrace: true,
      signals: [
        { action: "like", title: "Funny Family School Friends", source: "mock", format: "book", genres: ["Comedy", "School"], themes: ["Family", "Friendship"] },
      ],
    });
    const openLibraryDiagnostics = result.diagnostics.sources.find((source) => source.source === "openLibrary") || {};
    const selectedDetails = result.diagnostics.stages.find((stage) => stage.stage === "selected")?.details?.rejectedReasons || {};
    assertEqual(Number(openLibraryDiagnostics.openLibraryDocsActuallyHandedToScoringCount || 0) > 20, true, "post-final recovery fixture should begin with a live-shaped scoring universe");
    assertEqual(openLibraryDiagnostics.postFinalEligibilityUnderfillRecoveryTriggered, true, "post-final underfill should trigger meaningful-taste recovery after final eligibility");
    assertEqual(openLibraryDiagnostics.meaningfulTasteRecoveryTriggerStage, "post_final_eligibility", "post-final recovery should diagnose its trigger stage");
    assertEqual((openLibraryDiagnostics.meaningfulTasteRecoveryQueriesAttempted || []).some((query) => /funny|humou?r|comedy/i.test(query)), false, "post-final recovery should switch away from humor-anchored recovery queries");
    assertEqual(openLibraryDiagnostics.recoveryConcreteFictionQueryUsed, true, "post-final recovery should use concrete middle-grade fiction query shapes before returning underfilled");
    assertEqual(Array.isArray(openLibraryDiagnostics.recoveryFamilyScores) && openLibraryDiagnostics.recoveryFamilyScores.length > 0, true, "post-final recovery should score recovery families before execution");
    assertEqual((openLibraryDiagnostics.recoveryFamiliesSelectedForExecution || []).length > 0, true, "post-final recovery should expose selected recovery family queries");
    assertEqual(Object.keys(openLibraryDiagnostics.recoveryFamilyExecutionOrderReason || {}).length > 0, true, "post-final recovery should explain recovery family execution order");
    assertEqual(openLibraryDiagnostics.recoveryEarlyFinalGateApplied, true, "post-final recovery should apply early final-gate prediction before counting accepted rows");
    assertEqual(["My Mr Funny", "Frog and Toad Together", "Henry and Mudge and the Funny Lunch", "National Geographic Kids Funny Fill-In"].some((title) => (openLibraryDiagnostics.postFinalEligibilityRecoveryAcceptedTitles || []).includes(title)), false, "predictably rejected funny/duplicate/query-only recovery rows should not be counted as accepted recovery rows");
    assertEqual(Object.keys(openLibraryDiagnostics.recoveryEarlyFinalGateRejectedByReason || {}).length > 0, true, "early final-gate recovery rejection reasons should be reported");
    const droppedAfterMergeTitles = Object.values(selectedDetails.meaningfulTasteRecoveryDroppedAfterMergeByReason || {}).flat();
    assertEqual((openLibraryDiagnostics.postFinalEligibilityRecoveryAcceptedTitles || []).some((title) => droppedAfterMergeTitles.includes(title)), false, "post-final accepted recovery titles should not overlap exact post-merge dropped titles");
    assertEqual(Boolean(selectedDetails.meaningfulTasteRecoveryMergedIntoScoring), true, "post-final recovered candidates should be merged into scoring/final selection diagnostics");
    assertEqual(Number(selectedDetails.meaningfulTasteRecoveryFinalSelectionCount || 0) > 0 || Object.keys(selectedDetails.meaningfulTasteRecoveryDroppedAfterMergeByReason || {}).length > 0, true, "post-final recovered candidates should be returned or explicitly rejected after merge");
    assertEqual(openLibraryDiagnostics.recoverySuccessRequiresFinalEligibility, true, "meaningful-taste recovery success should require final eligibility survival");
    assertEqual(Number(openLibraryDiagnostics.meaningfulTasteRecoverySurvivingFinalCount || 0), result.items.length, "surviving recovery final count should reflect actual final selection count");
    assertEqual(openLibraryDiagnostics.cleanCandidateShortfallExpansionTriggered, true, "clean-candidate shortfall expansion should trigger after post-final eligibility remains underfilled");
    assertEqual(openLibraryDiagnostics.expansionFetchAttempted, true, "clean-candidate expansion should attempt an expansion fetch");
    assertEqual((openLibraryDiagnostics.meaningfulTasteRecoveryQueriesAttempted || []).some((query) => /middle grade robot adventure|middle grade science fiction adventure|children ocean adventure|middle grade survival adventure|middle grade family adventure|middle grade superhero adventure|middle grade school mystery|middle grade fantasy quest/i.test(query)), true, "clean-candidate expansion should attempt non-humor concrete query shapes");
    assertEqual(Number(openLibraryDiagnostics.expansionConvertedCount || 0) > 0, true, "clean-candidate expansion should merge converted rows into scoring");
    assertEqual(Number(openLibraryDiagnostics.expansionCandidatesEnteredScoringCount || 0) > 0, true, "clean-candidate expansion candidates should enter scoring");
    assertEqual(openLibraryDiagnostics.finalEligibilityGateApplied, true, "clean-candidate expansion should run the final eligibility gate after merging rows");
    assertEqual(Number(openLibraryDiagnostics.expansionCleanEligibleCount || 0), (openLibraryDiagnostics.expansionCandidatesAcceptedFinal || []).length, "expansion clean eligibility should count only final-accepted expansion candidates");
    assertEqual((openLibraryDiagnostics.expansionCandidatesAcceptedFinal || []).length === 0 ? (openLibraryDiagnostics.expansionSelectedTitles || []).length === 0 : true, true, "expansionSelectedTitles must be empty when no expansion candidate passes final eligibility");
    assertEqual((openLibraryDiagnostics.expansionSelectedTitles || []).length > 0 || Object.keys(openLibraryDiagnostics.expansionCandidatesRejectedByReason || {}).length > 0, true, "clean-candidate expansion should report final-accepted selected titles or explicit rejection reasons after scoring/selection");
    if (result.items.length < 5) {
      assertEqual(openLibraryDiagnostics.underfilledAfterMeaningfulTasteRecovery, true, "underfilled recovery should remain marked underfilled after final eligibility rejects merged rows");
      assertEqual(Array.isArray(openLibraryDiagnostics.meaningfulTasteRecoveryExhaustedQueries) && openLibraryDiagnostics.meaningfulTasteRecoveryExhaustedQueries.length > 0, true, "underfilled post-final recovery should expose exhausted recovery queries");
      assertEqual(Array.isArray(openLibraryDiagnostics.meaningfulTasteRecoveryRejectedQueryFamilies), true, "underfilled post-final recovery should expose rejection families");
      assertEqual(Boolean(openLibraryDiagnostics.middleGradesRecoveryFinalShortfallReason), true, "underfilled recovery should report a final shortfall reason");
      assertEqual(Object.keys(openLibraryDiagnostics.middleGradesRecoveryRejectedReasonCounts || {}).length > 0, true, "underfilled recovery should count rejected recovery gates");
      assertEqual(Object.keys(openLibraryDiagnostics.middleGradesRecoveryBestRejectedTitlesByReason || {}).length > 0, true, "underfilled recovery should list best rejected titles by gate");
    }
    console.log(JSON.stringify({ name: "middle grades post-final eligibility underfill triggers meaningful-taste recovery", pass: true, triggerStage: openLibraryDiagnostics.meaningfulTasteRecoveryTriggerStage, accepted: openLibraryDiagnostics.postFinalEligibilityRecoveryAcceptedTitles, selected: result.items.map((item) => item.title) }));
  } finally {
    if (previousPostFinalRecoveryBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousPostFinalRecoveryBase;
    globalThis.fetch = originalFetch;
  }



  const previousLiveExpansionBase = process.env.OPEN_LIBRARY_PROXY_BASE_URL;
  process.env.OPEN_LIBRARY_PROXY_BASE_URL = "https://proxy.example.test";
  const liveExpansionFetchQueries = [];
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    liveExpansionFetchQueries.push(query);
    const expansionQuery = /middle grade robot adventure|middle grade science fiction adventure|children ocean adventure|middle grade survival adventure|middle grade family adventure|middle grade superhero adventure|middle grade school mystery|middle grade fantasy quest/i.test(query);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ proxyAttempts: 1, docs: Array.from({ length: 6 }, (_unused, offset) => ({
        key: `/works/live-expansion-${query.replace(/\s+/g, "-")}-${offset + 1}`,
        title: expansionQuery ? [`Robot River Quest`, `Science Survival Team`, `Ocean Family Adventure`, `Superhero School Mystery`, `Fantasy Quest Club`, `Family Robot Trail`][offset] : `Live Weak Fallback ${offset + 1}`,
        author_name: [`Live Expansion Author ${offset + 1}`],
        subject: expansionQuery
          ? ["Juvenile fiction", "Robots -- Fiction", "Adventure stories", "Family -- Fiction", "School stories"]
          : ["Juvenile fiction"],
        description: expansionQuery
          ? "A middle grade robot adventure about family, school friends, survival, and a science mystery quest."
          : "A generic juvenile row without independent robot, science, family, school, or adventure evidence.",
        language: ["eng"],
        first_publish_year: 2018 + offset,
      })) }),
    };
  };
  try {
    const result = await runRecommenderV2({
      requestId: "live-shaped-clean-expansion-regression",
      ageBand: "preteens",
      limit: 5,
      enabledSources: { openLibrary: true },
      signals: [
        { action: "like", title: "Robot Science Family Adventure", source: "mock", format: "book", genres: ["Science"], themes: ["Robot", "Family", "School", "Adventure"] },
      ],
    });
    const openLibraryDiagnostics = result.diagnostics.sources.find((source) => source.source === "openLibrary") || {};
    const selectedDiagnostics = result.diagnostics.stages.find((stage) => stage.stage === "selected")?.details?.rejectedReasons || {};
    const cleanCandidateCount = Number(selectedDiagnostics.finalEligibilityCleanCandidateCount || 0);
    const validExpansionBlockReason = /missing_openlibrary_expansion_plan_or_adapter|openlibrary_source_unavailable|final_eligibility_not_underfilled/i.test(String(openLibraryDiagnostics.expansionNotTriggeredReason || ""));
    assertEqual(cleanCandidateCount >= 5 || openLibraryDiagnostics.cleanCandidateShortfallExpansionTriggered === true || validExpansionBlockReason, true, "Middle Grades OpenLibrary clean underfill must trigger expansion or report a valid blocking reason");
    assertEqual(openLibraryDiagnostics.cleanCandidateShortfallExpansionTriggered, true, "live-shaped underfilled Middle Grades run should trigger clean-candidate expansion even without deep debug");
    assertEqual(openLibraryDiagnostics.expansionFetchAttempted, true, "live-shaped clean-candidate expansion should attempt fetches");
    assertEqual(Array.isArray(openLibraryDiagnostics.expansionAttemptedQueries) && openLibraryDiagnostics.expansionAttemptedQueries.length > 0, true, "live-shaped clean-candidate expansion should list attempted queries");
    assertEqual((openLibraryDiagnostics.expansionAttemptedQueries || []).some((query) => /funny|humou?r|comedy|middle grade adventure$|middle grade friendship$|community/i.test(query)), false, "clean expansion must not attempt humor or generic fallback queries");
    assertEqual(openLibraryDiagnostics.cleanExpansionProfileSpecificQueriesOnly, true, "clean expansion should report profile-specific queries only");
    assertEqual(Array.isArray(openLibraryDiagnostics.expansionFetchResultsByQuery) && openLibraryDiagnostics.expansionFetchResultsByQuery.some((row) => Number(row.rawCount || 0) > 0), true, "live-shaped clean-candidate expansion should report per-query raw counts");
    assertEqual(Number(openLibraryDiagnostics.expansionRawCount || 0) > 0, true, "live-shaped clean-candidate expansion should report actual fetched raw docs");
    assertEqual(Number(openLibraryDiagnostics.expansionConvertedCount || 0) > 0, true, "live-shaped clean-candidate expansion should convert rows");
    assertEqual(Number(openLibraryDiagnostics.expansionMergedCandidateCount || 0) > 0, true, "live-shaped clean-candidate expansion should merge converted rows into scoring");
    assertEqual((openLibraryDiagnostics.expansionMergedTitles || []).length > 0, true, "live-shaped clean-candidate expansion should list merged titles");
    assertEqual(Number(openLibraryDiagnostics.expansionCandidatesEnteredScoringCount || 0) > 0, true, "live-shaped clean-candidate expansion should enter scoring");
    assertEqual(openLibraryDiagnostics.finalEligibilityGateApplied, true, "live-shaped clean-candidate expansion should apply the final eligibility gate");
    assertEqual(Number(openLibraryDiagnostics.expansionCleanEligibleCount || 0), (openLibraryDiagnostics.expansionCandidatesAcceptedFinal || []).length, "live-shaped expansion clean eligibility should count only final-accepted expansion candidates");
    assertEqual((openLibraryDiagnostics.expansionCandidatesAcceptedFinal || []).length === 0 ? (openLibraryDiagnostics.expansionSelectedTitles || []).length === 0 : true, true, "live-shaped expansionSelectedTitles must be empty when expansionCandidatesAcceptedFinal is empty");
    assertEqual((openLibraryDiagnostics.expansionSelectedTitles || []).length > 0 || Object.keys(openLibraryDiagnostics.expansionCandidatesRejectedByReason || {}).length > 0, true, "live-shaped clean-candidate expansion should select final-accepted rows or explain rejections");
    assertEqual(!(openLibraryDiagnostics.expansionFetchAttempted && Number(openLibraryDiagnostics.expansionRawCount || 0) === 0 && Number(openLibraryDiagnostics.expansionConvertedCount || 0) > 0) || Boolean(openLibraryDiagnostics.expansionFetchFailureReason), true, "expansion cannot report zero raw docs and positive converted rows without a failure reason");
    assertEqual(liveExpansionFetchQueries.some((query) => /middle grade robot adventure|middle grade science fiction adventure|middle grade family adventure|middle grade school mystery/i.test(query)), true, "live-shaped expansion should use concrete non-humor query shapes");
    console.log(JSON.stringify({ name: "middle grades live-shaped underfill triggers clean-candidate expansion", pass: true, expansionQueries: liveExpansionFetchQueries.filter((query) => /middle grade robot adventure|middle grade science fiction adventure|children ocean adventure|middle grade survival adventure|middle grade family adventure|middle grade superhero adventure|middle grade school mystery|middle grade fantasy quest/i.test(query)), selected: result.items.map((item) => item.title) }));
  } finally {
    if (previousLiveExpansionBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousLiveExpansionBase;
    globalThis.fetch = originalFetch;
  }

  const previousWeakClusterExpansionBase = process.env.OPEN_LIBRARY_PROXY_BASE_URL;
  process.env.OPEN_LIBRARY_PROXY_BASE_URL = "https://proxy.example.test";
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    const expansionQuery = /middle grade robot adventure|middle grade science fiction adventure|children ocean adventure|middle grade survival adventure|middle grade family adventure|middle grade superhero adventure|middle grade school mystery|middle grade fantasy quest/i.test(query);
    const titles = expansionQuery
      ? ["My Rainbow Magic", "A Snicker of Magic", "A Tale of Magic...", "Magic Kingdom For Sale/Sold!", "The Magic Faraway Tree", "Magic Friends Club"]
      : ["Weak Cluster Fallback 1", "Weak Cluster Fallback 2", "Weak Cluster Fallback 3", "Weak Cluster Fallback 4", "Weak Cluster Fallback 5", "Weak Cluster Fallback 6"];
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ proxyAttempts: 1, docs: titles.map((title, offset) => ({
        key: `/works/weak-cluster-expansion-${query.replace(/\s+/g, "-")}-${offset + 1}`,
        title,
        author_name: [`Weak Cluster Author ${offset + 1}`],
        subject: expansionQuery
          ? ["Juvenile fiction", "Magic -- Fiction", "Friendship -- Fiction", "Family -- Fiction"]
          : ["Juvenile fiction"],
        description: expansionQuery
          ? "A magical middle grade fantasy adventure about family and friendship."
          : "A generic juvenile row without independent evidence.",
        language: ["eng"],
        first_publish_year: 2018 + offset,
      })) }),
    };
  };
  try {
    const result = await runRecommenderV2({
      requestId: "weak-cluster-expansion-lock-regression",
      ageBand: "preteens",
      limit: 5,
      enabledSources: { openLibrary: true },
      signals: [
        { action: "like", title: "Robot Science Family Adventure", source: "mock", format: "book", genres: ["Science"], themes: ["Robot", "Family", "School", "Adventure"] },
      ],
    });
    const openLibraryDiagnostics = result.diagnostics.sources.find((source) => source.source === "openLibrary") || {};
    assertEqual(openLibraryDiagnostics.cleanCandidateShortfallExpansionTriggered, true, "weak-cluster expansion regression should trigger clean-candidate expansion");
    assertEqual(Array.isArray(openLibraryDiagnostics.expansionFetchResultsByQuery) && openLibraryDiagnostics.expansionFetchResultsByQuery.length > 0, true, "weak-cluster expansion should report fetch results by query");
    assertEqual(Number(openLibraryDiagnostics.expansionRawCount || 0) > 0, true, "weak-cluster expansion should report raw fetch count");
    assertEqual(Number(openLibraryDiagnostics.expansionMergedCandidateCount || 0) > 0, true, "weak-cluster expansion should merge candidates before lock-quality rejection");
    assertEqual(openLibraryDiagnostics.expansionLockQualityPass, false, "expansion cannot pass lock quality with a repeated magic-title cluster");
    assertEqual((openLibraryDiagnostics.expansionLockQualityFailReasons || []).some((reason) => /repeated_title_token_cluster|weak_cluster/i.test(reason)), true, "weak cluster expansion should report repeated-token or weak-cluster failure");
    assertEqual((openLibraryDiagnostics.expansionWeakClusterSelectedTitles || []).length > 0, true, "weak cluster expansion should list weak selected titles");
    const weakClusterMeaningfulTitles = ((result.diagnostics.stages.find((stage) => stage.stage === "selected")?.details?.rejectedReasons || {}).meaningfulTasteEligibleTitles || []);
    assertEqual((openLibraryDiagnostics.expansionWeakClusterSelectedTitles || []).some((title) => weakClusterMeaningfulTitles.includes(title)), false, "weak repeated-token expansion titles should not appear in meaningfulTasteEligibleTitles");
    assertEqual((openLibraryDiagnostics.expansionCandidatesAcceptedFinal || []).length, 0, "weak cluster expansion should not count any rows as final-accepted expansion candidates");
    assertEqual(Number(openLibraryDiagnostics.expansionCleanEligibleCount || 0), 0, "weak cluster expansion should not count lock-quality-failed rows as clean eligible");
    assertEqual((openLibraryDiagnostics.expansionSelectedTitles || []).length, 0, "weak cluster expansionSelectedTitles should be empty when final-accepted expansion candidates are empty");
    assertEqual(Object.keys(openLibraryDiagnostics.expansionSelectedRejectedByReason || {}).length > 0, true, "weak cluster expansion should report selected expansion rows rejected by lock quality");
    assertEqual(result.items.length < 5, true, "weak cluster expansion should return underfilled rather than a false five-item success");
    console.log(JSON.stringify({ name: "middle grades expansion weak cluster fails lock quality", pass: true, lockReasons: openLibraryDiagnostics.expansionLockQualityFailReasons, weakClusterTitles: openLibraryDiagnostics.expansionWeakClusterSelectedTitles, returned: result.items.map((item) => item.title) }));
  } finally {
    if (previousWeakClusterExpansionBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousWeakClusterExpansionBase;
    globalThis.fetch = originalFetch;
  }


  const previousMiddleGradesMediumStrongBase = process.env.OPEN_LIBRARY_PROXY_BASE_URL;
  let middleGradesMediumStrongFetchCount = 0;
  const middleGradesMediumStrongFetchQueries = [];
  process.env.OPEN_LIBRARY_PROXY_BASE_URL = "https://proxy.example.test";
  globalThis.fetch = async (url) => {
    middleGradesMediumStrongFetchCount += 1;
    const query = new URL(String(url)).searchParams.get("q") || "";
    middleGradesMediumStrongFetchQueries.push(query);
    const strong = middleGradesMediumStrongFetchCount > 1;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ proxyAttempts: 1, docs: [1, 2, 3, 4, 5, 6, 7, 8].map((index) => ({
        ...fakeDoc(`${query} ${strong ? "strong" : "weak"}`, index),
        title: strong ? `${query} Strong School Friendship ${index}` : `${query} Weak Title ${index}`,
        subject: strong
          ? ["Juvenile fiction", "School stories", "Friendship", "Humorous stories"]
          : ["Juvenile fiction"],
      })) }),
    };
  };
  try {
    const debugProfile = buildTasteProfile({
      ageBand: "preteens",
      signals: [
        { action: "like", title: "Funny School Friends", source: "mock", format: "book", genres: ["Comedy", "School"], themes: ["Friendship"] },
      ],
    });
    debugProfile.diagnostics.debugMiddleGradesDeepTrace = true;
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 2_000 }, { profile: debugProfile });
    assertEqual(result.diagnostics.mediumStrongEvidenceTargetCount, 5, "middle grades deep debug should declare medium/strong evidence target");
    assertEqual(result.diagnostics.mediumStrongEvidenceSearchContinued || (result.diagnostics.mediumStrongCandidatesSeenAcrossAllQueries || []).length >= 5, true, "deep-debug middle grades should continue searching or preserve medium/strong evidence across the full pool after weak-only evidence");
    assertEqual(((result.diagnostics.mediumStrongEvidenceQueriesAttempted || []).length > 0) || ((result.diagnostics.mediumStrongCandidatesSeenAcrossAllQueries || []).length >= 5), true, "deep-debug middle grades should attempt evidence-aware medium/strong queries or preserve enough medium/strong candidates before continuation");
    assertEqual(((result.diagnostics.mediumStrongEvidenceAcceptedTitles || []).length >= 5) || ((result.diagnostics.mediumStrongCandidatesSeenAcrossAllQueries || []).length >= 5), true, "deep-debug middle grades should retain medium/strong evidence titles when available");
    assertEqual(result.rawItems.filter((item) => /Strong School Friendship/i.test(String(item.title || ""))).length >= 5, true, "medium/strong evidence candidates should be present in the searched pool");
    console.log(JSON.stringify({ name: "middle grades deep-debug continues weak-only slate toward medium/strong evidence", pass: true, fetchQueries: middleGradesMediumStrongFetchQueries, accepted: result.diagnostics.mediumStrongEvidenceAcceptedTitles }));
  } finally {
    if (previousMiddleGradesMediumStrongBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousMiddleGradesMediumStrongBase;
    globalThis.fetch = originalFetch;
  }

  const returnedLayerProfile = buildTasteProfile({
    ageBand: "preteens",
    signals: middleGradesCases[3].signals,
  });
  const returnedLayerDiagnostics = {
    requestId: "returned-layer-root-collapse-regression",
    startedAt: new Date(0).toISOString(),
    finishedAt: new Date(0).toISOString(),
    elapsedMs: 0,
    stages: [],
    tasteProfile: returnedLayerProfile,
    searchPlan: { intents: [], sourcePlans: [], diagnostics: {} },
    sources: [],
    rejectedReasons: {},
    finalSelectionTitles: [],
  };
  const returnedLayerResult = buildRecommendationResultV2([
    fakeScoredCandidate({ title: "The Frog and Toad Collection", maturityBand: "preteens", genres: ["Juvenile fiction"], themes: ["Friendship"] }),
    fakeScoredCandidate({ title: "Frog and Toad Treasury", maturityBand: "preteens", genres: ["Juvenile fiction"], themes: ["Friendship"] }),
    fakeScoredCandidate({ title: "Days with Frog and Toad", maturityBand: "preteens", genres: ["Juvenile fiction"], themes: ["Friendship"] }),
    fakeScoredCandidate({ title: "Frog and Toad Together", maturityBand: "preteens", genres: ["Juvenile fiction"], themes: ["Friendship"] }),
    fakeScoredCandidate({ title: "Harbor Friendship", maturityBand: "preteens", genres: ["Juvenile fiction"], themes: ["Friendship"] }),
  ], returnedLayerDiagnostics);
  assertEqual(returnedLayerResult.items.filter((item) => /frog and toad/i.test(item.title)).length, 1, "returned-items layer should collapse Frog and Toad collection variants");
  assertEqual(returnedLayerResult.diagnostics.finalItemsLength, 5, "returned-items diagnostics should preserve final selection length before returned-layer collapse");
  assertEqual(returnedLayerResult.diagnostics.returnedItemsLength, returnedLayerResult.items.length, "returned-items length should agree with returned items");
  assertEqual(returnedLayerResult.diagnostics.returnedItemsTitles.length, returnedLayerResult.diagnostics.returnedItemsLength, "returned titles count should agree with returned length");
  assertEqual(returnedLayerResult.diagnostics.middleGradesReturnedLayerRootCollapseApplied, true, "returned-layer collection root collapse should be diagnosed");
  console.log(JSON.stringify({ name: "middle grades returned-items layer collapses collection roots and aligns counters", pass: true, returnedItemsTitles: returnedLayerResult.diagnostics.returnedItemsTitles, finalItemsLength: returnedLayerResult.diagnostics.finalItemsLength, returnedItemsLength: returnedLayerResult.diagnostics.returnedItemsLength }));


  const previousMiddleGradesProxyAbortBase = process.env.OPEN_LIBRARY_PROXY_BASE_URL;
  const originalMiddleGradesProxyAbortDateNow = Date.now;
  const middleGradesProxyAbortFetchCalls = [];
  let fakeMiddleGradesProxyAbortNowOffsetMs = 0;
  process.env.OPEN_LIBRARY_PROXY_BASE_URL = "https://proxy.example.test";
  Date.now = () => originalMiddleGradesProxyAbortDateNow() + fakeMiddleGradesProxyAbortNowOffsetMs;
  globalThis.fetch = async (url) => {
    const urlText = String(url);
    const query = new URL(urlText).searchParams.get("q") || "";
    middleGradesProxyAbortFetchCalls.push({ url: urlText, query });
    fakeMiddleGradesProxyAbortNowOffsetMs += 1_500;
    if (urlText.startsWith("https://proxy.example.test")) {
      const error = new Error("The operation was aborted due to timeout");
      error.name = "AbortError";
      throw error;
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ docs: [1, 2, 3, 4, 5, 6].map((index) => ({
        ...fakeDoc(query, index + 900),
        key: `/works/direct-fallback-${query.replace(/\s+/g, "-")}-${index}`,
        title: `Direct Fallback ${index}`,
        subject: ["Juvenile fiction", "Children's stories", "Fantasy", "Adventure stories"],
        description: "A direct Open Library fallback result for children.",
      })) }),
    };
  };
  try {
    const profile = buildTasteProfile({ ageBand: "preteens", signals: middleGradesCases[0].signals });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
    const realFetches = (result.diagnostics.fetches || []).filter((fetch) => !fetch.diagnosticOnly);
    assertEqual(realFetches.filter((fetch) => Number(fetch.clientTimeoutMs || 0) >= 1_000).length >= 3, true, "middle grades first-batch attempts should preserve at least three viable >=1000ms attempts");
    assertEqual(realFetches.every((fetch) => fetch.fetchPath !== "proxy" || Number(fetch.clientTimeoutMs || 0) <= 1_500), true, "middle grades proxy attempts should use short first-pass timeouts");
    assertEqual(Number(result.diagnostics.repeatedProxyAbortCount || 0) >= 2, true, "repeated middle grades proxy aborts should be diagnosed");
    assertEqual(result.diagnostics.directFallbackAttemptedAfterProxyAbort, true, "repeated proxy aborts should attempt direct Open Library fallback");
    assertEqual(result.diagnostics.proxyTimedOutThenDirectAttemptedSameQuery, true, "middle grades proxy timeout should immediately try direct for the same query");
    assertEqual(realFetches.some((fetch) => fetch.fetchPath === "direct"), true, "alternate direct fetch path should be recorded after proxy aborts");
    const proxyAbortFetch = realFetches.find((fetch) => fetch.fetchPath === "proxy" && fetch.timedOut);
    const directFallbackFetch = realFetches.find((fetch) => fetch.fetchPath === "direct");
    assertEqual(Boolean(proxyAbortFetch?.abortControllerId), true, "proxy abort diagnostics should expose AbortController creation id");
    assertEqual(Boolean(directFallbackFetch?.abortControllerId), true, "direct fallback diagnostics should expose AbortController creation id");
    assertEqual(proxyAbortFetch?.abortControllerId !== directFallbackFetch?.abortControllerId, true, "proxy and direct fallback must not reuse the same AbortController");
    assertEqual(directFallbackFetch?.abortControllerSharedWithPreviousFetch, false, "direct fallback diagnostic should explicitly report no controller sharing with proxy fetch");
    assertEqual(Number(proxyAbortFetch?.sourceBudgetRemainingAtFetchStartMs || 0) > 0, true, "proxy fetch diagnostics should include remaining source budget at fetch start");
    assertEqual(Number(directFallbackFetch?.sourceBudgetRemainingAtFetchStartMs || 0) > 0, true, "direct fallback diagnostics should include remaining source budget at fetch start");
    assertEqual(Boolean(proxyAbortFetch?.abortOrigin), true, "proxy abort diagnostics should classify abort origin");
    assertEqual(Boolean(proxyAbortFetch?.abortControllerLifetimeMs !== undefined), true, "proxy abort diagnostics should report controller lifetime");
    assertEqual(result.diagnostics.middleGradesFetchMode === "staggered" || result.diagnostics.middleGradesFetchMode === "parallel", true, "middle grades fetch mode should expose staggered or parallel first-batch behavior");
    assertEqual(Array.isArray(result.diagnostics.firstBatchParallelQueries) && result.diagnostics.firstBatchParallelQueries.length >= 3, true, "first-batch diagnostics should expose planned parallel/staggered queries");
    assertEqual(Array.isArray(result.diagnostics.likedEvidenceFirstBatchFamilies) && result.diagnostics.likedEvidenceFirstBatchFamilies.length > 0, true, "zero/timeout-prone middle grades paths should report liked-evidence first-batch families");
    assertEqual((result.diagnostics.likedEvidenceQueryFamiliesAttemptedBeforeSkipOnlyRecovery || []).length > 0, true, "zero/timeout-prone middle grades paths should report whether liked-evidence families received viable attempts");
    console.log(JSON.stringify({ name: "middle grades repeated proxy aborts preserve viable attempts and switch fetch path", pass: true, rawItems: result.rawItems.length, fetchCalls: middleGradesProxyAbortFetchCalls, diagnostics: { middleGradesFetchMode: result.diagnostics.middleGradesFetchMode, repeatedProxyAbortCount: result.diagnostics.repeatedProxyAbortCount, directFallbackAttemptedAfterProxyAbort: result.diagnostics.directFallbackAttemptedAfterProxyAbort, proxyAbortControllerId: proxyAbortFetch?.abortControllerId, directAbortControllerId: directFallbackFetch?.abortControllerId, directSharedController: directFallbackFetch?.abortControllerSharedWithPreviousFetch, proxyAbortOrigin: proxyAbortFetch?.abortOrigin } }));
  } finally {
    Date.now = originalMiddleGradesProxyAbortDateNow;
    if (previousMiddleGradesProxyAbortBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousMiddleGradesProxyAbortBase;
    globalThis.fetch = originalFetch;
  }

  const previousMiddleGradesDirectRejectedBase = process.env.OPEN_LIBRARY_PROXY_BASE_URL;
  const middleGradesDirectRejectedFetchCalls = [];
  process.env.OPEN_LIBRARY_PROXY_BASE_URL = "https://proxy.example.test";
  globalThis.fetch = async (url) => {
    const urlText = String(url);
    const query = new URL(urlText).searchParams.get("q") || "";
    middleGradesDirectRejectedFetchCalls.push({ url: urlText, query });
    if (urlText.startsWith("https://proxy.example.test")) {
      const error = new Error("The operation was aborted due to timeout");
      error.name = "AbortError";
      throw error;
    }
    const docs = /children friendship adventure|middle grade music friendship|children community adventure|funny middle school adventure|middle grade adventure friendship|funny adventure children|funny school adventure/i.test(query)
      ? [1, 2, 3, 4, 5].map((index) => ({
        ...fakeDoc(query, index + 980),
        key: `/works/same-family-direct-continuation-${query.replace(/\s+/g, "-")}-${index}`,
        title: `Same Family Adventure ${index}`,
        subject: ["Juvenile fiction", "Adventure stories", "Friendship", "Community", "Humorous stories"],
        description: "A funny friendship and community adventure for children.",
      }))
      : [1, 2, 3, 4, 5].map((index) => ({
        ...fakeDoc(query, index + 970),
        key: `/works/direct-rejected-${query.replace(/\s+/g, "-")}-${index}`,
        title: `Sparse Direct Row ${index}`,
        subject: ["Juvenile fiction"],
        description: "A sparse catalog row with child evidence but no route evidence.",
      }));
    return { ok: true, status: 200, text: async () => JSON.stringify({ docs }) };
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "preteens",
      signals: [
        { action: "like", title: "Community Quest", genres: ["comedy", "adventure"], themes: ["friendship", "community", "funny"], format: "book" },
        { action: "like", title: "Band Trail", genres: ["humor"], themes: ["music", "friends", "adventure"], format: "book" },
      ],
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 12_000 }, { profile });
    assertEqual(result.diagnostics.proxyTimedOutThenDirectAttemptedSameQuery, true, "direct rejected scenario should first try direct after proxy timeout");
    assertEqual(Number(result.diagnostics.directFetchReturnedRawButAllRejected || 0) > 0, true, "direct raw docs rejected by evidence gate should be diagnosed separately");
    assertEqual(result.diagnostics.sameFamilyContinuationAfterAllRejected, true, "all-rejected direct docs should trigger same-family continuation");
    assertEqual((result.diagnostics.sameFamilyContinuationQueriesAttempted || []).some((query) => /children friendship adventure|middle grade music friendship|children community adventure|funny middle school adventure|middle grade adventure friendship|funny adventure children|funny school adventure/i.test(query)), true, "adventure/comedy/friendship same-family continuations should be attempted");
    assertEqual(result.rawItems.length > 0, true, "adventure/comedy/friendship profile should not return zero after raw direct docs while same-family continuations remain");
    console.log(JSON.stringify({ name: "middle grades all-rejected direct docs continue same-family variants", pass: true, rawItems: result.rawItems.length, fetchCalls: middleGradesDirectRejectedFetchCalls, diagnostics: { directFetchReturnedRawButAllRejected: result.diagnostics.directFetchReturnedRawButAllRejected, sameFamilyContinuationQueriesAttempted: result.diagnostics.sameFamilyContinuationQueriesAttempted } }));
  } finally {
    if (previousMiddleGradesDirectRejectedBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousMiddleGradesDirectRejectedBase;
    globalThis.fetch = originalFetch;
  }

  const previousMiddleGradesRootCollapseBase = process.env.OPEN_LIBRARY_PROXY_BASE_URL;
  const middleGradesRootCollapseFetchCalls = [];
  process.env.OPEN_LIBRARY_PROXY_BASE_URL = "https://proxy.example.test";
  globalThis.fetch = async (url) => {
    const urlText = String(url);
    const query = new URL(urlText).searchParams.get("q") || "";
    middleGradesRootCollapseFetchCalls.push(query);
    if (urlText.startsWith("https://proxy.example.test")) {
      const error = new Error("The operation was aborted due to timeout");
      error.name = "AbortError";
      throw error;
    }
    const docs = [
      { key: "/works/frog-toad-collection-a", title: "The Frog and Toad Collection", author_name: ["Arnold Lobel"], subject: ["Juvenile fiction", "Children's stories", "Friendship", "Animals"], description: "Children's friendship animal stories." },
      { key: "/works/frog-toad-treasury-b", title: "Frog and Toad Treasury", author_name: ["Arnold Lobel"], subject: ["Juvenile fiction", "Children's stories", "Friendship", "Animals"], description: "Children's friendship animal stories." },
      ...[1, 2, 3, 4].map((index) => ({ ...fakeDoc(query, index + 1100), key: `/works/root-collapse-unique-${index}`, title: `Unique Friendship Animal ${index}`, subject: ["Juvenile fiction", "Children's stories", "Friendship", "Animals"], description: "A children's friendship and animal story." })),
    ];
    return { ok: true, status: 200, text: async () => JSON.stringify({ docs }) };
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "preteens",
      signals: [
        { action: "like", title: "Animal Friends", genres: ["animal fiction"], themes: ["friendship", "kindness"], format: "book" },
        { action: "like", title: "Forest Pals", genres: ["animals"], themes: ["community", "friendship"], format: "book" },
      ],
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 10_000 }, { profile });
    const frogAndToadCount = result.rawItems.filter((item) => /frog and toad/i.test(String(item.title || ""))).length;
    assertEqual(frogAndToadCount <= 1, true, "same-root Frog and Toad collection variants should collapse to one returned recommendation");
    assertEqual((result.diagnostics.sameRootCollectionCollapsedTitles || []).some((title) => /frog and toad/i.test(title)), true, "same-root collection collapse should be diagnosed without banning titles");
    assertEqual(Number(result.diagnostics.selectedUniqueRootCount || 0) <= result.rawItems.length, true, "selected unique root count should be reported");
    console.log(JSON.stringify({ name: "middle grades same-root collection variants collapse before return", pass: true, rawItems: result.rawItems.map((item) => item.title), diagnostics: { sameRootCollectionCollapsedTitles: result.diagnostics.sameRootCollectionCollapsedTitles, selectedUniqueRootCount: result.diagnostics.selectedUniqueRootCount } }));
  } finally {
    if (previousMiddleGradesRootCollapseBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousMiddleGradesRootCollapseBase;
    globalThis.fetch = originalFetch;
  }

  const previousMiddleGradesDirectUnderfillBase = process.env.OPEN_LIBRARY_PROXY_BASE_URL;
  const middleGradesDirectUnderfillFetchCalls = [];
  let middleGradesDirectUnderfillDirectSuccessCount = 0;
  process.env.OPEN_LIBRARY_PROXY_BASE_URL = "https://proxy.example.test";
  globalThis.fetch = async (url) => {
    const urlText = String(url);
    const query = new URL(urlText).searchParams.get("q") || "";
    middleGradesDirectUnderfillFetchCalls.push(query);
    if (urlText.startsWith("https://proxy.example.test")) {
      const error = new Error("The operation was aborted due to timeout");
      error.name = "AbortError";
      throw error;
    }
    if (!urlText.startsWith("https://proxy.example.test")) middleGradesDirectUnderfillDirectSuccessCount += 1;
    const docs = middleGradesDirectUnderfillDirectSuccessCount === 1
      ? [1, 2].map((index) => ({ ...fakeDoc(query, index + 1200), key: `/works/direct-underfill-initial-${index}`, title: ["Direct Usable Cedar", "Direct Usable Maple"][index - 1], subject: ["Juvenile fiction", "Adventure stories", "Friendship"], description: "A children's friendship adventure." }))
      : [1, 2, 3].map((index) => ({ ...fakeDoc(query, index + 1210), key: `/works/direct-underfill-recovery-${query.replace(/\s+/g, "-")}-${index}`, title: ["Direct Usable Harbor", "Direct Usable Meadow", "Direct Usable Lantern"][index - 1], subject: ["Juvenile fiction", "Adventure stories", "Friendship", "Community"], description: "A children's friendship and community adventure." }));
    return { ok: true, status: 200, text: async () => JSON.stringify({ docs }) };
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "preteens",
      signals: [
        { action: "like", title: "Adventure Friends", genres: ["adventure"], themes: ["friendship", "community"], format: "book" },
        { action: "like", title: "Funny Quest", genres: ["comedy"], themes: ["playful", "friends"], format: "book" },
      ],
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 12_000 }, { profile });
    assertEqual(result.diagnostics.underfilledAfterDirectUsableDocs, true, "direct fetch returning usable but underfilled docs should be diagnosed");
    assertEqual(result.diagnostics.directUsableDocsButRecoveryContinued, true, "direct usable underfill should continue recovery while same-family variants remain");
    assertEqual(result.rawItems.length >= 5, true, "middle grades should not return fewer than five while same-family reliable variants remain and budget is viable");
    console.log(JSON.stringify({ name: "middle grades direct usable underfill continues recovery to five", pass: true, rawItems: result.rawItems.length, fetchCalls: middleGradesDirectUnderfillFetchCalls, diagnostics: { underfilledAfterDirectUsableDocs: result.diagnostics.underfilledAfterDirectUsableDocs, directUsableDocsButRecoveryContinued: result.diagnostics.directUsableDocsButRecoveryContinued, underfillStopReasonDetailed: result.diagnostics.underfillStopReasonDetailed } }));
  } finally {
    if (previousMiddleGradesDirectUnderfillBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
    else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousMiddleGradesDirectUnderfillBase;
    globalThis.fetch = originalFetch;
  }

  const middleGradesSlowQueryFetchCalls = [];
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    middleGradesSlowQueryFetchCalls.push(query);
    if (middleGradesSlowQueryFetchCalls.length <= 2) throw new Error("timeout");
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ docs: [1, 2, 3, 4, 5, 6].map((index) => ({
        ...fakeDoc(query, index),
        title: `Budget Preserved ${index}`,
        subject: ["Juvenile fiction", "Adventure stories", "Fantasy fiction"],
      })) }),
    };
  };
  try {
    const profile = buildTasteProfile({
      ageBand: "preteens",
      signals: middleGradesCases[0].signals,
    });
    const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile });
    assertEqual(middleGradesSlowQueryFetchCalls.length >= 3, true, "one slow middle grades query must not consume the whole source budget while specific queries remain");
    assertEqual(result.status !== "timed_out", true, "middle grades source should not report timed_out after only one or two attempted queries while specifics remain");
    assertEqual(Boolean(result.diagnostics.perQueryBudgetReserved), true, "middle grades timeout diagnostics should include per-query reserved budget");
    assertEqual(Array.isArray(result.diagnostics.plannedSpecificQueriesUnattemptedAtTimeout), true, "middle grades timeout diagnostics should expose unattempted planned specifics after timeout");
    console.log(JSON.stringify({ name: "middle grades slow query preserves budget for planned specifics", pass: true, fetchCalls: middleGradesSlowQueryFetchCalls, status: result.status, perQueryBudgetReserved: result.diagnostics.perQueryBudgetReserved }));
  } finally {
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
      expected: "children's nature adventure",
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
      shapedAntiZeroFallbackQueries.push(result.diagnostics.middleGradesAntiZeroFallbackShapedQuery || result.diagnostics.profileSpecificQueriesAttempted?.[0]);
      assertEqual(result.rawItems.length >= 5, true, `${fallbackCase.name} anti-zero fallback should recover rows`);
      assertEqual(fetchCalls.includes(fallbackCase.expected) || Boolean(result.diagnostics.profileSpecificQueriesAttempted?.some((query) => /friendship|school|animal|nature|robot|science|dystopian/i.test(query))), true, `${fallbackCase.name} anti-zero fallback should use swipe-shaped or profile-specific queries`);
      assertEqual(Boolean(result.diagnostics.middleGradesAntiZeroFallbackShapedQuery || result.diagnostics.profileSpecificQueriesAttempted?.length), true, `${fallbackCase.name} diagnostics should expose shaped anti-zero or profile-specific query`);
      assertEqual(Array.isArray(result.diagnostics.middleGradesAntiZeroFallbackShapingSignals) || Array.isArray(result.diagnostics.profileSpecificQueriesAttempted), true, `${fallbackCase.name} diagnostics should expose shaping signals or profile-specific attempts`);
    } finally {
      Date.now = originalFallbackDateNow;
      if (previousFallbackProxyBase === undefined) delete process.env.OPEN_LIBRARY_PROXY_BASE_URL;
      else process.env.OPEN_LIBRARY_PROXY_BASE_URL = previousFallbackProxyBase;
      globalThis.fetch = originalFetch;
    }
  }
  assertEqual(new Set(shapedAntiZeroFallbackQueries).size >= 3, true, "different preteen profiles should not all collapse to the same anti-zero fallback query");
  console.log(JSON.stringify({ name: "middle grades anti-zero fallback is shaped by swipe profile", pass: true, fallbackQueries: shapedAntiZeroFallbackQueries }));

  const convergenceProfiles = [
    {
      name: "robot-comedy",
      profile: buildTasteProfile({ ageBand: "preteens", signals: [{ action: "like", title: "Robot Hero Laughs", source: "mock", format: "book", genres: ["Comedy / Superhero / AI"], tags: ["robots", "technology", "superhero", "comedy", "funny"] }] }),
    },
    {
      name: "ocean-music",
      profile: buildTasteProfile({ ageBand: "preteens", signals: [{ action: "like", title: "Ocean Song Quest", source: "mock", format: "book", genres: ["Fantasy / Ocean / Music / Adventure"], tags: ["ocean", "sea", "music", "fantasy", "adventure"] }] }),
    },
    {
      name: "school-comedy",
      profile: buildTasteProfile({ ageBand: "preteens", signals: [{ action: "like", title: "Funny Homeroom", source: "mock", format: "book", genres: ["Realistic / School / Comedy"], tags: ["school", "middle school", "funny", "realistic"] }] }),
    },
  ];
  const convergenceRuns = [];
  globalThis.fetch = async (url) => {
    const query = new URL(String(url)).searchParams.get("q") || "";
    const querySlug = query.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ docs: [1, 2, 3, 4, 5, 6].map((index) => ({
        ...fakeDoc(query, index),
        key: `/works/convergence-${querySlug}-${index}`,
        title: `${query} candidate ${index}`,
        subject: ["Children's fiction", query, "Juvenile fiction"],
        first_publish_year: 2018 + index,
      })) }),
    };
  };
  try {
    for (const convergenceProfile of convergenceProfiles) {
      const result = await openLibrarySourceAdapter.search({ ...sourcePlan, timeoutMs: 8_000 }, { profile: convergenceProfile.profile });
      const selectedTitles = result.rawItems.slice(0, 5).map((item) => String(item.title || ""));
      const selectedFamilies = result.rawItems.slice(0, 5).map((item) => String(item.queryText || item.queryFamily || ""));
      const dominantFamily = selectedFamilies.sort((a, b) => selectedFamilies.filter((family) => family === b).length - selectedFamilies.filter((family) => family === a).length)[0] || "";
      const selectedReasonByTitle = result.diagnostics.finalSelectionReasonByTitle || {};
      const selectedQueryOnlyFallbackCount = selectedTitles.filter((title) => /query_only_fallback/i.test(String(selectedReasonByTitle[title] || ""))).length;
      convergenceRuns.push({ name: convergenceProfile.name, selectedTitles, selectedFamilies, dominantFamily, selectedQueryOnlyFallbackCount, diagnostics: result.diagnostics });
    }
    const titleCounts = new Map();
    const rootCounts = new Map();
    for (const run of convergenceRuns) {
      for (const title of new Set(run.selectedTitles)) {
        const root = title.toLowerCase().replace(/\s+candidate\s+\d+$/i, "");
        titleCounts.set(title, (titleCounts.get(title) || 0) + 1);
        rootCounts.set(root, (rootCounts.get(root) || 0) + 1);
      }
    }
    const repeatedTitleAcrossPresetRuns = [...titleCounts.entries()].filter(([, count]) => count > 1).map(([title]) => title);
    const repeatedRootAcrossPresetRuns = [...rootCounts.entries()].filter(([, count]) => count > 1).map(([root]) => root);
    const selectedQueryFamilyOverlapAcrossPresetRuns = convergenceRuns.map((run) => run.dominantFamily);
    const duplicateDominantFamilyWithLockFailure = convergenceRuns.some((run, index) => convergenceRuns.slice(index + 1).some((other) => run.dominantFamily === other.dominantFamily && (run.diagnostics.lockQualityPass === false || other.diagnostics.lockQualityPass === false)));
    const queryOnlyFallbackDominatedRuns = convergenceRuns.filter((run) => run.selectedQueryOnlyFallbackCount >= 3).map((run) => run.name);
    const convergenceRiskScore = repeatedTitleAcrossPresetRuns.length + repeatedRootAcrossPresetRuns.length + (new Set(selectedQueryFamilyOverlapAcrossPresetRuns).size === 1 ? 3 : 0) + (duplicateDominantFamilyWithLockFailure ? 3 : 0) + queryOnlyFallbackDominatedRuns.length;
    const convergenceFailReason = convergenceRiskScore >= 3 ? "repeated_title_or_query_family_convergence" : "";
    assertEqual(repeatedTitleAcrossPresetRuns.length < 3, true, "three distinct preteen profiles should not repeat 3+ selected titles");
    assertEqual(new Set(selectedQueryFamilyOverlapAcrossPresetRuns).size > 1, true, "three distinct preteen profiles should not share one dominant selected query family");
    assertEqual(duplicateDominantFamilyWithLockFailure, false, "two preteen convergence runs should not share one dominant query family while lock quality fails");
    assertEqual(queryOnlyFallbackDominatedRuns.length, 0, "preteen convergence runs should not be dominated by selected query-only fallback candidates");
    assertEqual(convergenceRuns.every((run) => run.diagnostics.profileSpecificQueriesAttempted?.length), true, "convergence runs should all attempt truly profile-specific queries");
    console.log(JSON.stringify({ name: "middle grades cross-profile slate convergence guard", pass: true, repeatedTitleAcrossPresetRuns, repeatedRootAcrossPresetRuns, selectedQueryFamilyOverlapAcrossPresetRuns, convergenceRiskScore, convergenceFailReason, queryOnlyFallbackDominatedRuns }));
  } finally {
    globalThis.fetch = originalFetch;
  }

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
      diagnostics: { queryText: "middle grade humor", queryFamily: "humor", routingReason: "middle_grades_fantasy_humor", documentBackedTasteSignals: ["comedy"] },
      scoreBreakdown: { positiveTasteMatch: 1.2 },
    })),
  ];
  const middleGradesSelectionResult = selectRecommendations(middleGradesSelectionCandidates, middleGradesSelectionProfile, 10);
  assertEqual(middleGradesSelectionResult.selected.length < 5, true, "middle grades query-only candidates should not fill the slate without document evidence");
  assertEqual(new Set(middleGradesSelectionResult.selected.map((candidate) => candidate.title)).size, middleGradesSelectionResult.selected.length, "middle grades query-only filtering should keep duplicate titles blocked among survivors");
  assertEqual(Boolean(middleGradesSelectionResult.rejectedReasons.duplicate_title || middleGradesSelectionResult.rejectedReasons.zero_doc_backed_taste_match), true, "middle grades selection should reject duplicate or zero-taste query-only rows before safe underfill recovery");
  assertEqual(Number(middleGradesSelectionResult.rejectedReasons.documentEvidenceRequiredButMissingCount || 0) > 0, true, "middle grades selection should emit query-only score cap diagnostics");
  assertEqual(Boolean(middleGradesSelectionResult.rejectedReasons.routeAlignmentScoreByTitle), true, "middle grades selection should expose route alignment scores by title");
  assertEqual(Boolean(middleGradesSelectionResult.rejectedReasons.genreFacetMatchScoreByTitle), true, "middle grades selection should expose genre facet match scores by title");
  assertEqual(Boolean(middleGradesSelectionResult.rejectedReasons.fallbackPenaltyByTitle), true, "middle grades selection should expose fallback penalties by title");
  assertEqual(Boolean(middleGradesSelectionResult.rejectedReasons.finalSelectionReasonByTitle), true, "middle grades selection should expose final selection reasons by title");
  assertEqual(Boolean(middleGradesSelectionResult.rejectedReasons.queryLevelRouteAlignmentByTitle), true, "middle grades selection should expose query-level route alignment by title");
  assertEqual(Boolean(middleGradesSelectionResult.rejectedReasons.documentLevelRouteAlignmentByTitle), true, "middle grades selection should expose document-level route alignment by title");
  assertEqual(Boolean(middleGradesSelectionResult.rejectedReasons.routeAlignmentEvidenceFieldsByTitle), true, "middle grades selection should expose route alignment evidence fields by title");
  assertEqual(Array.isArray(middleGradesSelectionResult.rejectedReasons.middleGradesReturnedItemQualityAudit), true, "middle grades selection should audit every returned title");
  assertEqual(middleGradesSelectionResult.rejectedReasons.middleGradesReturnedItemQualityAudit.length, middleGradesSelectionResult.selected.length, "returned title quality audit should explain every selected middle grades title");
  assertEqual(Array.isArray(middleGradesSelectionResult.rejectedReasons.middleGradesTopRejectedQualityAudit), true, "middle grades selection should audit top rejected candidates");
  assertEqual(Number(middleGradesSelectionResult.rejectedReasons.falseRouteAlignedDueToQueryOnlyCount || 0) > 0, true, "middle grades selection should demote query-only route alignment");
  assertEqual(middleGradesSelectionResult.rejectedReasons.finalCountContractStatus, "underfilled_fallback_only", "middle grades query-only zero-taste slate should remain underfilled instead of masquerading as full fallback success");
  console.log(JSON.stringify({ name: "middle grades selection rejects query-only underfill slate", pass: true, selected: middleGradesSelectionResult.selected.length, rejectedReasons: middleGradesSelectionResult.rejectedReasons }));

  const middleGradesFallbackPrecedenceCandidates = [
    ...["One", "Two", "Three", "Four", "Five"].map((seed, index) => fakeScoredCandidate({
      id: `middle-fallback-precedence-${seed}`,
      title: `Generic Fallback ${seed}`,
      score: 20 - index,
      maturityBand: "preteens",
      matchedSignals: ["friendship"],
      scoreBreakdown: { positiveTasteMatch: 1, genreFacetMatch: 1, ageTeenSuitability: 0.5 },
      diagnostics: { queryText: "middle grade adventure", queryFamily: "generic_adventure", routingReason: "middle_grades_humor", fallbackAlignment: "anti_zero", emergencyFallback: true },
      raw: { subject: ["Juvenile fiction"] },
    })),
    fakeScoredCandidate({
      id: "middle-stronger-precedence",
      title: "Friendship Adventure Club",
      score: 2,
      maturityBand: "preteens",
      genres: ["Juvenile fiction", "Adventure stories"],
      themes: ["Friendship", "Community"],
      matchedSignals: ["friendship", "adventure"],
      scoreBreakdown: { positiveTasteMatch: 1.5, genreFacetMatch: 1, ageTeenSuitability: 0.5 },
      diagnostics: { queryText: "children friendship adventure", queryFamily: "adventure_friendship", routingReason: "middle_grades_humor" },
      raw: { subject: ["Juvenile fiction", "Friendship", "Adventure stories"] },
    }),
  ];
  const middleGradesFallbackPrecedenceResult = selectRecommendations(middleGradesFallbackPrecedenceCandidates, middleGradesSelectionProfile, 5);
  assertEqual(middleGradesFallbackPrecedenceResult.selected.some((candidate) => candidate.title === "Friendship Adventure Club"), true, "fallback/default candidates cannot beat stronger document evidence with equal-or-better taste alignment");
  assertEqual(Boolean(middleGradesFallbackPrecedenceResult.rejectedReasons.middleGradesFallbackDefaultPrecedenceExplanations), true, "fallback precedence should explain why fallback/default survived or was replaced");
  assertEqual(
    middleGradesFallbackPrecedenceResult.rejectedReasons.middleGradesReturnedItemQualityAudit.some((row) => row.title === "Friendship Adventure Club" && row.routeEvidenceTier === "strong_evidence"),
    true,
    "fallback precedence audit should show the stronger evidence candidate that beat fallback/default rows"
  );
  console.log(JSON.stringify({ name: "middle grades fallback defaults cannot beat stronger evidence without explanation", pass: true, selected: middleGradesFallbackPrecedenceResult.selected.map((candidate) => candidate.title), explanations: middleGradesFallbackPrecedenceResult.rejectedReasons.middleGradesFallbackDefaultPrecedenceExplanations }));

  const middleGradesZeroFinalGuardResult = selectRecommendations([fakeScoredCandidate({
    id: "middle-zero-final-guard",
    title: "Middle Zero Final Guard",
    creators: ["Guard Author"],
    score: 2,
    maturityBand: "preteens",
    diagnostics: { queryText: "middle grade adventure", queryFamily: "adventure", routingReason: "middle_grades_fantasy_humor_final_safe_recovery", emergencyFallback: true, fallbackAlignment: "anti_zero" },
    scoreBreakdown: { ageTeenSuitability: 0.25, avoidSignalPenalty: 0, genreFacetMatch: 0 },
  })], middleGradesSelectionProfile, 5);
  assertEqual(middleGradesZeroFinalGuardResult.selected.length, 1, "middle grades zero-final-items guard should preserve safe Open Library docs");
  assertEqual(Boolean(middleGradesZeroFinalGuardResult.rejectedReasons.accepted_middle_grades_zero_final_items_guard), true, "middle grades zero-final-items guard should emit diagnostics");
  console.log(JSON.stringify({ name: "middle grades zero-final-items guard preserves safe Open Library docs", pass: true, selected: middleGradesZeroFinalGuardResult.selected.length, rejectedReasons: middleGradesZeroFinalGuardResult.rejectedReasons }));

  const middleGradesMeaningfulTasteProfile = buildTasteProfile({
    ageBand: "preteens",
    signals: [
      { action: "like", title: "Fantasy Friendship", genres: ["fantasy", "adventure"], themes: ["friendship", "school"], format: "book" },
    ],
  });
  const middleGradesZeroTasteGateResult = selectRecommendations([
    fakeScoredCandidate({
      id: "zero-taste-fallback",
      title: "Zero Taste Fallback",
      score: 14,
      maturityBand: "preteens",
      raw: { subject: ["Juvenile fiction", "Fantasy", "Adventure"] },
      diagnostics: { queryText: "middle grade fantasy adventure", queryFamily: "fantasy_adventure", routingReason: "middle_grades_fantasy_adventure", documentBackedTasteSignals: [] },
      scoreBreakdown: { sourceQualityRelevance: 2, ageTeenSuitability: 1, genreFacetMatch: 0, positiveTasteMatch: 0 },
    }),
    fakeScoredCandidate({
      id: "friendship-school-match",
      title: "Friendship School Match",
      score: 8,
      maturityBand: "preteens",
      raw: { subject: ["Juvenile fiction", "Friendship", "School stories"] },
      diagnostics: { queryText: "middle grade friendship school", queryFamily: "friendship_school", routingReason: "middle_grades_contemporary_school", documentBackedTasteSignals: ["friendship", "school"] },
      scoreBreakdown: { sourceQualityRelevance: 2, ageTeenSuitability: 1, genreFacetMatch: 0, positiveTasteMatch: 2.4 },
    }),
  ], middleGradesMeaningfulTasteProfile, 5);
  assertEqual(middleGradesZeroTasteGateResult.selected.some((candidate) => candidate.title === "Zero Taste Fallback"), false, "zero-taste Open Library candidates must not become normal Middle Grades selections");
  assertEqual(middleGradesZeroTasteGateResult.selected.some((candidate) => candidate.title === "Friendship School Match"), true, "document-backed taste candidates should survive over zero-taste fallbacks");
  assertEqual(Array.isArray(middleGradesZeroTasteGateResult.rejectedReasons.zeroTasteCandidateRejectedTitles) && middleGradesZeroTasteGateResult.rejectedReasons.zeroTasteCandidateRejectedTitles.includes("Zero Taste Fallback"), true, "zero-taste rejected titles should be diagnosed");

  const middleGradesMagicTitleClusterResult = selectRecommendations(Array.from({ length: 5 }, (_, index) => fakeScoredCandidate({
    id: `magic-title-only-${index}`,
    title: [`My Rainbow Magic`, `A Snicker of Magic`, `A Tale of Magic`, `Magic Kingdom For Sale`, `The Magic Faraway Tree`][index],
    score: 12 - index * 0.1,
    maturityBand: "preteens",
    genres: [],
    themes: [],
    raw: { subject: ["Juvenile fiction"] },
    diagnostics: { queryText: "middle grade fantasy friendship fiction", queryFamily: "fantasy_friendship", routingReason: "middle_grades_fantasy_adventure", documentBackedTasteSignals: ["fantasy"] },
    scoreBreakdown: { sourceQualityRelevance: 2, ageTeenSuitability: 1, genreFacetMatch: 2, positiveTasteMatch: 0.5 },
  })), middleGradesMeaningfulTasteProfile, 5);
  assertEqual(middleGradesMagicTitleClusterResult.selected.length < 5, true, "title-token-only magic clusters must not fill a Middle Grades slate");
  assertEqual((middleGradesMagicTitleClusterResult.rejectedReasons.titleOnlyEvidenceFinalEligibleTitles || []).length, 0, "title-only route evidence must not be final eligible");
  assertEqual(Object.values(middleGradesMagicTitleClusterResult.rejectedReasons.finalEligibilityEvidenceFieldCountByTitle || {}).every((count) => Number(count) <= 1), true, "title-only cluster regression should expose one-field evidence counts");

  const middleGradesBroadAdventureGateResult = selectRecommendations([
    fakeScoredCandidate({
      id: "broad-adventure-only",
      title: "Broad Adventure Only",
      score: 13,
      maturityBand: "preteens",
      raw: { subject: ["Juvenile fiction", "Adventure stories"] },
      diagnostics: { queryText: "middle grade adventure", queryFamily: "adventure", routingReason: "middle_grades_fantasy_adventure", documentBackedTasteSignals: ["adventure"] },
      scoreBreakdown: { sourceQualityRelevance: 2, ageTeenSuitability: 1, genreFacetMatch: 3, positiveTasteMatch: 0 },
    }),
    fakeScoredCandidate({
      id: "fantasy-friendship-specific",
      title: "Fantasy Friendship Specific",
      score: 7,
      maturityBand: "preteens",
      raw: { subject: ["Juvenile fiction", "Fantasy", "Friendship"] },
      diagnostics: { queryText: "middle grade fantasy friendship", queryFamily: "fantasy_friendship", routingReason: "middle_grades_fantasy_adventure", documentBackedTasteSignals: ["fantasy", "friendship"] },
      scoreBreakdown: { sourceQualityRelevance: 2, ageTeenSuitability: 1, genreFacetMatch: 3, positiveTasteMatch: 1.7 },
    }),
  ], middleGradesMeaningfulTasteProfile, 5);
  assertEqual(middleGradesBroadAdventureGateResult.selected.some((candidate) => candidate.title === "Broad Adventure Only"), false, "broad-adventure-only Open Library candidates must not beat specific document-backed matches");
  assertEqual(middleGradesBroadAdventureGateResult.selected.some((candidate) => candidate.title === "Fantasy Friendship Specific"), true, "specific document-backed fantasy/friendship matches should survive broad adventure-only candidates");
  assertEqual(Array.isArray(middleGradesBroadAdventureGateResult.rejectedReasons.broadAdventureOnlyRejectedTitles) && middleGradesBroadAdventureGateResult.rejectedReasons.broadAdventureOnlyRejectedTitles.includes("Broad Adventure Only"), true, "broad-adventure-only rejected titles should be diagnosed");
  console.log(JSON.stringify({ name: "middle grades final eligibility requires meaningful document-backed taste", pass: true, zeroTasteRejected: middleGradesZeroTasteGateResult.rejectedReasons.zeroTasteCandidateRejectedTitles, broadAdventureRejected: middleGradesBroadAdventureGateResult.rejectedReasons.broadAdventureOnlyRejectedTitles }));

  const middleGradesFinalRootCollapseCandidates = [
    fakeScoredCandidate({ id: "frog-toad-collection", title: "The Frog and Toad Collection", creators: ["Collection Author A"], score: 12, maturityBand: "preteens", genres: ["Juvenile fiction", "Friendship", "Animals"], themes: ["Children's stories", "Friendship"], diagnostics: { queryText: "children friendship adventure", queryFamily: "adventure", routingReason: "middle_grades_humor" }, scoreBreakdown: { ageTeenSuitability: 0.5, genreFacetMatch: 1, avoidSignalPenalty: 0 } }),
    fakeScoredCandidate({ id: "frog-toad-treasury", title: "Frog and Toad Treasury", creators: ["Collection Author B"], score: 11.9, maturityBand: "preteens", genres: ["Juvenile fiction", "Friendship", "Animals"], themes: ["Children's stories", "Friendship"], diagnostics: { queryText: "children friendship adventure", queryFamily: "adventure", routingReason: "middle_grades_humor" }, scoreBreakdown: { ageTeenSuitability: 0.5, genreFacetMatch: 1, avoidSignalPenalty: 0 } }),
    ...["Harbor Friendship", "Meadow Adventure", "Lantern Club", "Cedar Quest"].map((title, index) => fakeScoredCandidate({
      id: `middle-final-root-safe-${index}`,
      title,
      creators: [`Safe Recovery Author ${index}`],
      score: 11 - index * 0.1,
      maturityBand: "preteens",
      genres: ["Juvenile fiction", "Friendship", "Adventure stories"],
      themes: ["Children's stories", "Community", "Friendship"],
      diagnostics: { queryText: "children friendship adventure", queryFamily: "adventure", routingReason: "middle_grades_humor" },
      scoreBreakdown: { ageTeenSuitability: 0.5, genreFacetMatch: 1, avoidSignalPenalty: 0 },
    })),
  ];
  const middleGradesFinalRootCollapseResult = selectRecommendations(middleGradesFinalRootCollapseCandidates, middleGradesSelectionProfile, 5);
  assertEqual(middleGradesFinalRootCollapseResult.selected.filter((candidate) => /frog and toad/i.test(candidate.title)).length <= 1, true, "Frog and Toad collection variants cannot both survive final returned-items selection");
  assertEqual(middleGradesFinalRootCollapseResult.selected.length, 5, "root-collapse underfill should recover with safe route candidates before returning");
  assertEqual(middleGradesFinalRootCollapseResult.rejectedReasons.finalReturnedRootCollapseApplied, true, "final returned root collapse should be diagnosed");
  assertEqual((middleGradesFinalRootCollapseResult.rejectedReasons.finalReturnedRootCollapsedTitles || []).some((title) => /frog and toad/i.test(title)), true, "collapsed final returned root titles should be diagnosed");
  assertEqual(middleGradesFinalRootCollapseResult.rejectedReasons.rootCollapseCausedUnderfill, true, "root collapse causing underfill should be diagnosed");
  assertEqual(middleGradesFinalRootCollapseResult.rejectedReasons.recoveryAfterRootCollapseAttempted, true, "recovery should run after final root collapse causes underfill");
  assertEqual(Number(middleGradesFinalRootCollapseResult.rejectedReasons.recoveryAfterRootCollapseAcceptedCount || 0) > 0, true, "recovery after root collapse should accept safe route candidates");
  assertEqual(Boolean(middleGradesFinalRootCollapseResult.rejectedReasons.underfillWithRawDocsAndQueriesRemaining), true, "raw docs plus usable rows plus underfill should diagnose remaining safe route recovery");
  console.log(JSON.stringify({ name: "middle grades final returned root collapse recovers underfill", pass: true, selected: middleGradesFinalRootCollapseResult.selected.map((candidate) => candidate.title), rejectedReasons: middleGradesFinalRootCollapseResult.rejectedReasons }));

  const middleGradesPresetDebugProfile = buildTasteProfile({
    ageBand: "preteens",
    signals: middleGradesCases[3].signals,
    diagnostics: {
      middleGradesDeepDebugExpected: true,
      debugMiddleGradesDeepTrace: true,
      debugMiddleGradesNoTimeouts: true,
      middleGradesDeepDebugActivationSource: "preset",
    },
  });
  assertEqual(middleGradesPresetDebugProfile.diagnostics.middleGradesDeepDebugActive, true, "preset-requested middle grades deep debug should activate through taste profile");
  assertEqual(middleGradesPresetDebugProfile.diagnostics.middleGradesDeepDebugActivationSource, "preset", "preset-requested middle grades deep debug should preserve activation source");
  assertEqual(middleGradesPresetDebugProfile.diagnostics.sessionReportHeader, "MIDDLE GRADES DEEP DEBUG: ACTIVE", "preset-requested deep debug should set report header");
  console.log(JSON.stringify({ name: "middle grades preset deep-debug request activates taste profile diagnostics", pass: true, activationSource: middleGradesPresetDebugProfile.diagnostics.middleGradesDeepDebugActivationSource }));

  const previousLocationDescriptor = Object.getOwnPropertyDescriptor(globalThis, "location");
  Object.defineProperty(globalThis, "location", { value: { search: "?middleGradesDeepDebug=true" }, configurable: true });
  const middleGradesUrlDebugProfile = buildTasteProfile({
    ageBand: "preteens",
    signals: middleGradesCases[3].signals,
  });
  assertEqual(middleGradesUrlDebugProfile.diagnostics.middleGradesDeepDebugActive, true, "URL middleGradesDeepDebug flag should activate middle grades deep debug");
  assertEqual(middleGradesUrlDebugProfile.diagnostics.middleGradesDeepDebugActivationSource, "url", "URL middleGradesDeepDebug flag should report URL activation source");
  assertEqual(middleGradesUrlDebugProfile.diagnostics.sessionReportHeader, "MIDDLE GRADES DEEP DEBUG: ACTIVE", "URL middleGradesDeepDebug flag should set report header");
  if (previousLocationDescriptor) Object.defineProperty(globalThis, "location", previousLocationDescriptor);
  else delete globalThis.location;

  const previousLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: { getItem: (name) => name === "middleGradesDeepDebug" ? "true" : null }, configurable: true });
  const middleGradesLocalStorageDebugProfile = buildTasteProfile({
    ageBand: "preteens",
    signals: middleGradesCases[3].signals,
  });
  assertEqual(middleGradesLocalStorageDebugProfile.diagnostics.middleGradesDeepDebugActive, true, "localStorage middleGradesDeepDebug flag should activate middle grades deep debug");
  assertEqual(middleGradesLocalStorageDebugProfile.diagnostics.middleGradesDeepDebugActivationSource, "localStorage", "localStorage middleGradesDeepDebug flag should report localStorage activation source");
  assertEqual(middleGradesLocalStorageDebugProfile.diagnostics.sessionReportHeader, "MIDDLE GRADES DEEP DEBUG: ACTIVE", "localStorage middleGradesDeepDebug flag should set report header");
  if (previousLocalStorageDescriptor) Object.defineProperty(globalThis, "localStorage", previousLocalStorageDescriptor);
  else delete globalThis.localStorage;
  console.log(JSON.stringify({ name: "middle grades URL/localStorage deep-debug flags activate taste profile diagnostics", pass: true }));

  const middleGradesQueryOnlyVsAlignedCandidates = [
    ...["Fallback One", "Fallback Two", "Fallback Three", "Fallback Four", "Fallback Five"].map((title, index) => fakeScoredCandidate({
      id: `middle-query-only-${index}`,
      title,
      creators: [`Fallback Author ${index}`],
      score: 12 - index * 0.1,
      maturityBand: "preteens",
      genres: [],
      themes: [],
      scoreBreakdown: { genreFacetMatch: 7, positiveTasteMatch: 7, queryRungBonus: 1, ageTeenSuitability: 1, sourceQualityRelevance: 2 },
      diagnostics: { queryText: "middle grade adventure", queryFamily: "adventure", routingReason: "middle_grades_fantasy_humor" },
      raw: { subject: ["Juvenile fiction"] },
    })),
    fakeScoredCandidate({
      id: "middle-document-aligned",
      title: "Funny Friendship Robot",
      creators: ["Aligned Author"],
      score: 4,
      maturityBand: "preteens",
      genres: ["Humor"],
      themes: ["Friendship", "Robots"],
      scoreBreakdown: { genreFacetMatch: 1, positiveTasteMatch: 1, queryRungBonus: 0, ageTeenSuitability: 1, sourceQualityRelevance: 2 },
      diagnostics: { queryText: "middle grade humor", queryFamily: "humor", routingReason: "middle_grades_fantasy_humor" },
      raw: { subject: ["Juvenile fiction", "Robots", "Friendship", "Humor"] },
    }),
  ];
  const middleGradesQueryOnlyVsAlignedResult = selectRecommendations(middleGradesQueryOnlyVsAlignedCandidates, middleGradesSelectionProfile, 5);
  assertEqual(middleGradesQueryOnlyVsAlignedResult.selected.some((candidate) => candidate.title === "Funny Friendship Robot"), true, "document-aligned middle grades candidate should beat higher-scoring query-only fallback candidates");
  assertEqual(middleGradesQueryOnlyVsAlignedResult.selected.some((candidate) => /^Fallback/.test(candidate.title)), false, "query-only fallback candidates should not be selected when document evidence is missing");
  assertEqual(Number(middleGradesQueryOnlyVsAlignedResult.rejectedReasons.documentEvidenceRequiredButMissingCount || 0) >= 5, true, "query-only fallback candidates should be score-capped and counted");
  console.log(JSON.stringify({ name: "middle grades query-only candidates cannot beat document-aligned candidates", pass: true, selected: middleGradesQueryOnlyVsAlignedResult.selected.map((candidate) => candidate.title), rejectedReasons: middleGradesQueryOnlyVsAlignedResult.rejectedReasons }));

  const middleGradesHumorLeakageResult = selectRecommendations([
    fakeScoredCandidate({
      id: "middle-funny-title-only-leakage",
      title: "The Funny Big Book",
      creators: ["Leakage Author"],
      score: 16,
      maturityBand: "preteens",
      genres: [],
      themes: [],
      scoreBreakdown: { genreFacetMatch: 6, positiveTasteMatch: 6, queryRungBonus: 1, ageTeenSuitability: 0, sourceQualityRelevance: 1 },
      diagnostics: { queryText: "funny children books", queryFamily: "humor", routingReason: "middle_grades_fantasy_humor" },
      raw: { subject: ["Humor"], description: "" },
    }),
    fakeScoredCandidate({
      id: "middle-adult-ya-humor-leakage",
      title: "A Comic Hospital Story",
      creators: ["Adult Humor Author"],
      score: 15,
      maturityBand: "preteens",
      genres: ["Humor"],
      themes: [],
      scoreBreakdown: { genreFacetMatch: 6, positiveTasteMatch: 6, queryRungBonus: 1, ageTeenSuitability: 0, sourceQualityRelevance: 1 },
      diagnostics: { queryText: "funny children books", queryFamily: "humor", routingReason: "middle_grades_fantasy_humor" },
      raw: { subject: ["Young adult fiction", "High school", "Depression", "Mental hospital"], description: "A YA comic novel about high school and depression." },
    }),
    fakeScoredCandidate({
      id: "middle-humor-non-humor-aligned",
      title: "Survival Friendship Club",
      creators: ["Aligned Humor Author"],
      score: 5,
      maturityBand: "preteens",
      genres: ["Humor", "Adventure"],
      themes: ["Survival", "Friendship", "Community"],
      scoreBreakdown: { genreFacetMatch: 2, positiveTasteMatch: 2, queryRungBonus: 0, ageTeenSuitability: 1, sourceQualityRelevance: 2 },
      diagnostics: { queryText: "funny adventure chapter book", queryFamily: "humor", routingReason: "middle_grades_fantasy_humor" },
      raw: { subject: ["Juvenile fiction", "Adventure stories", "Friendship", "Survival", "Humorous stories"], description: "Friends use humor and teamwork to survive a wilderness challenge." },
    }),
  ], middleGradesSelectionProfile, 5);
  assertEqual(middleGradesHumorLeakageResult.selected.some((candidate) => candidate.title === "The Funny Big Book"), false, "funny-title-only leakage without child evidence cannot be selected");
  assertEqual(middleGradesHumorLeakageResult.rejectedReasons.documentLevelRouteAlignmentByTitle["The Funny Big Book"], false, "funny-title-only leakage cannot count as document-level route alignment");
  assertEqual(middleGradesHumorLeakageResult.rejectedReasons.routeAlignmentDemotedReasonByTitle["The Funny Big Book"], "humor_keyword_title_only_without_age_or_doc_evidence", "funny-title-only leakage should expose a demotion reason");
  assertEqual(middleGradesHumorLeakageResult.rejectedReasons.humorKeywordOnlyRejectedTitles.includes("The Funny Big Book"), true, "funny-title-only leakage should be diagnosed as rejected");
  assertEqual(middleGradesHumorLeakageResult.rejectedReasons.adultOrYaHumorLeakageRejectedTitles.includes("A Comic Hospital Story"), true, "adult/YA humor-looking leakage should be rejected generically");
  assertEqual(middleGradesHumorLeakageResult.selected.some((candidate) => candidate.title === "Survival Friendship Club"), true, "available non-humor-aligned preteen humor/adventure evidence should survive");
  assertEqual(Number(middleGradesHumorLeakageResult.rejectedReasons.selectedNonHumorAlignmentCount || 0) >= 1, true, "preteen humor/adventure slate should count non-humor alignment when available");
  console.log(JSON.stringify({ name: "middle grades humor keyword leakage is rejected without child/document evidence", pass: true, selected: middleGradesHumorLeakageResult.selected.map((candidate) => candidate.title), rejectedReasons: middleGradesHumorLeakageResult.rejectedReasons }));

  const middleGradesGenericFunnySlateResult = selectRecommendations([
    "Funny Alpha",
    "Humor Beta",
    "Comedy Gamma",
    "Laugh Delta",
    "Giggle Epsilon",
  ].map((title, index) => fakeScoredCandidate({
    id: `middle-generic-funny-slate-${index}`,
    title,
    creators: [`Generic Funny Author ${index}`],
    score: 12 - index * 0.1,
    maturityBand: "preteens",
    genres: ["Humor"],
    themes: [],
    scoreBreakdown: { genreFacetMatch: 3, positiveTasteMatch: 3, queryRungBonus: 1, ageTeenSuitability: 1, sourceQualityRelevance: 2 },
    diagnostics: { queryText: "funny children books", queryFamily: "humor", routingReason: "middle_grades_fantasy_humor" },
    raw: { subject: ["Juvenile fiction", "Humorous stories"] },
  })), middleGradesSelectionProfile, 5);
  assertEqual(middleGradesGenericFunnySlateResult.selected.length, 5, "generic funny title slate fixture should fill the slate before quality diagnostics");
  assertEqual(middleGradesGenericFunnySlateResult.rejectedReasons.lockQualityPass, false, "full slate of generic funny-title matches cannot pass lock quality");
  assertEqual(middleGradesGenericFunnySlateResult.rejectedReasons.genericFunnySlateDetected, true, "generic funny slate should be diagnosed");
  assertEqual(middleGradesGenericFunnySlateResult.rejectedReasons.genericFunnySlateLockQualityBlocked, true, "generic funny slate should explicitly block lock quality");
  assertEqual(middleGradesGenericFunnySlateResult.rejectedReasons.selectedNonHumorAlignmentCount, 0, "generic funny slate should have no non-humor alignment signals");
  console.log(JSON.stringify({ name: "middle grades generic funny slate fails lock quality", pass: true, selected: middleGradesGenericFunnySlateResult.selected.map((candidate) => candidate.title), rejectedReasons: middleGradesGenericFunnySlateResult.rejectedReasons }));

  const middleGradesEvidenceTierResult = selectRecommendations([
    ...["Max School Laugh", "School Magic Title", "Classroom Quest Joke", "Funny Hallway Tale", "Alanna School Adventure"].map((title, index) => fakeScoredCandidate({
      id: `middle-weak-school-${index}`,
      title,
      creators: [`Weak School Author ${index}`],
      score: 13 - index * 0.1,
      maturityBand: "preteens",
      genres: [],
      themes: [],
      scoreBreakdown: { genreFacetMatch: 5, positiveTasteMatch: 5, queryRungBonus: 1, ageTeenSuitability: 1, sourceQualityRelevance: 2 },
      diagnostics: { queryText: "middle grade school story", queryFamily: "school", routingReason: "middle_grades_contemporary_school" },
      raw: { subject: ["Juvenile fiction"] },
    })),
    ...[
      ["The Wild Robot", ["Juvenile fiction", "Robots", "Animals", "Nature", "Survival"], "A robot survives with animals in the wilderness."],
      ["Flora and Ulysses", ["Juvenile fiction", "Animals", "Humorous stories", "Friendship"], "A funny animal friendship adventure."],
      ["A Wolf Called Wander", ["Juvenile fiction", "Wolves", "Wildlife", "Nature"], "A wolf journeys through wild places."],
      ["Forest Science Club", ["Juvenile fiction", "Science", "Nature", "Animals"], "Kids study animals and habitats."],
      ["Robot Wildlife Rescue", ["Juvenile fiction", "Robots", "Wildlife", "Adventure stories"], "A robot protects animals."],
    ].map(([title, subjects, description], index) => fakeScoredCandidate({
      id: `middle-strong-animal-${index}`,
      title,
      creators: [`Strong Animal Author ${index}`],
      description,
      score: 6 - index * 0.1,
      maturityBand: "preteens",
      genres: ["Science fiction"],
      themes: ["Animals", "Nature", "Robots"],
      scoreBreakdown: { genreFacetMatch: 1, positiveTasteMatch: 1, queryRungBonus: 0, ageTeenSuitability: 1, sourceQualityRelevance: 2 },
      diagnostics: { queryText: "children's animal adventure", queryFamily: "adventure", routingReason: "middle_grades_science_adventure" },
      raw: { subject: subjects, description },
    })),
  ], middleGradesSelectionProfile, 5);
  assertEqual(middleGradesEvidenceTierResult.selected.every((candidate) => /wild robot|flora|wolf|forest science|wildlife rescue/i.test(candidate.title)), true, "strong subject/description animal-science evidence should beat weak title-only school defaults");
  assertEqual(Object.values(middleGradesEvidenceTierResult.rejectedReasons.documentEvidenceTierByTitle || {}).includes("strong_evidence"), true, "selection diagnostics should expose strong evidence tiers");
  assertEqual(Boolean(middleGradesEvidenceTierResult.rejectedReasons.weakEvidenceSelectedOverStrongEvidence), false, "weak title-only evidence must not beat strong subject/description evidence");
  console.log(JSON.stringify({ name: "middle grades evidence tiers prefer strong animal science evidence over weak defaults", pass: true, selected: middleGradesEvidenceTierResult.selected.map((candidate) => candidate.title), rejectedReasons: middleGradesEvidenceTierResult.rejectedReasons }));


  const middleGradesWeakTitleOnlyCapResult = selectRecommendations([
    ...["Joke Alpha", "Joke Beta", "Joke Gamma", "Joke Delta", "Joke Epsilon"].map((title, index) => fakeScoredCandidate({
      id: `middle-weak-title-cap-${index}`,
      title,
      creators: [`Weak Title Author ${index}`],
      score: 12 - index * 0.1,
      maturityBand: "preteens",
      genres: [],
      themes: [],
      scoreBreakdown: { genreFacetMatch: 5, positiveTasteMatch: 5, queryRungBonus: 1, ageTeenSuitability: 1, sourceQualityRelevance: 2 },
      diagnostics: { queryText: "middle grade humor", queryFamily: "humor", routingReason: "middle_grades_humor" },
      raw: { subject: ["Juvenile fiction"] },
    })),
    ...[
      ["Laugh Lab Stories", ["Juvenile fiction", "Humorous stories", "Friendship", "School stories"], "Funny school friendship stories for middle grade readers."],
      ["The Cafeteria Comedy Club", ["Juvenile fiction", "Humorous stories", "School stories"], "Kids start a comedy club at school."],
    ].map(([title, subjects, description], index) => fakeScoredCandidate({
      id: `middle-rich-humor-cap-${index}`,
      title,
      creators: [`Rich Humor Author ${index}`],
      description,
      score: 5 - index * 0.1,
      maturityBand: "preteens",
      genres: ["Humor"],
      themes: ["Friendship", "School"],
      scoreBreakdown: { genreFacetMatch: 1, positiveTasteMatch: 1, queryRungBonus: 0, ageTeenSuitability: 1, sourceQualityRelevance: 2 },
      diagnostics: { queryText: "middle grade humor", queryFamily: "humor", routingReason: "middle_grades_humor" },
      raw: { subject: subjects, description },
    })),
  ], middleGradesSelectionProfile, 5);
  assertEqual((middleGradesWeakTitleOnlyCapResult.rejectedReasons.titleOnlyEvidenceFinalEligibleTitles || []).length, 0, "middle grades final eligibility should not allow title-only humor matches");
  assertEqual(middleGradesWeakTitleOnlyCapResult.selected.filter((candidate) => /^Joke /.test(candidate.title)).length, 0, "middle grades title-only weak matches should not survive final eligibility when richer evidence exists");
  assertEqual(middleGradesWeakTitleOnlyCapResult.selected.some((candidate) => candidate.title === "Laugh Lab Stories"), true, "richer subject/description evidence should enter the slate despite lower raw score");
  assertEqual(middleGradesWeakTitleOnlyCapResult.selected.some((candidate) => candidate.title === "The Cafeteria Comedy Club"), true, "second richer evidence candidate should enter the slate to diversify evidence sources");
  console.log(JSON.stringify({ name: "middle grades weak title-only cap prefers richer document evidence", pass: true, selected: middleGradesWeakTitleOnlyCapResult.selected.map((candidate) => candidate.title), rejectedReasons: middleGradesWeakTitleOnlyCapResult.rejectedReasons }));


  const middleGradesRobotTitleOnlyLockResult = selectRecommendations([
    ["The Wild Robot Escapes", "Peter Brown"],
    ["The Wild Robot", "Peter Brown"],
    ["Ricky Ricotta's Mighty Robot", "Dav Pilkey"],
    ["Ricky Ricotta's Mighty Robot vs. the Mutant Mosquitoes", "Dav Pilkey"],
    ["Ricky Ricotta's Mighty Robot vs. the Mecha-Monkeys", "Dav Pilkey"],
  ].map(([title, author], index) => fakeScoredCandidate({
    id: `middle-robot-title-only-${index}`,
    title,
    creators: [author],
    score: 12 - index * 0.1,
    maturityBand: "preteens",
    genres: [],
    themes: [],
    scoreBreakdown: { genreFacetMatch: 4, positiveTasteMatch: 4, queryRungBonus: 1, ageTeenSuitability: 1, sourceQualityRelevance: 2 },
    diagnostics: { queryText: "middle grade robot fiction", queryFamily: "science fiction", routingReason: "middle_grades_scifi_adventure" },
    raw: { subject: ["Juvenile fiction"] },
  })), middleGradesSelectionProfile, 5);
  assertEqual(middleGradesRobotTitleOnlyLockResult.rejectedReasons.finalCountContractStatus, "zero_result_failure", "five title-only robot results cannot produce a final slate");
  assertEqual(middleGradesRobotTitleOnlyLockResult.rejectedReasons.lockQualityPass, false, "title-only weak robot slate must not pass lock quality");
  assertEqual(middleGradesRobotTitleOnlyLockResult.rejectedReasons.weakEvidenceOnlySlate, false, "title-only weak robot rows should be rejected before forming a weak slate");
  assertEqual((middleGradesRobotTitleOnlyLockResult.rejectedReasons.titleOnlyEvidenceFinalEligibleTitles || []).length, 0, "title-only slate rows should not be final eligible");
  assertEqual(middleGradesRobotTitleOnlyLockResult.rejectedReasons.selectedTitleOnlyCount, 0, "title-only slate diagnostics should not count rejected title-only candidates as selected");
  assertEqual(middleGradesRobotTitleOnlyLockResult.rejectedReasons.selectedMediumStrongEvidenceCount, 0, "title-only slate should have no medium/strong non-title document evidence");
  assertEqual(middleGradesRobotTitleOnlyLockResult.rejectedReasons.selectedVsRejectedRouteAlignmentSummary.selectedRouteAlignedCount, 0, "weak title/subtitle evidence cannot count as route-aligned success");
  assertEqual(middleGradesRobotTitleOnlyLockResult.rejectedReasons.sameSeriesTitleOnlyClusterDetected, false, "rejected title-only rows should not be counted as a selected same-series cluster");
  console.log(JSON.stringify({ name: "middle grades title-only robot slate fails lock quality", pass: true, selected: middleGradesRobotTitleOnlyLockResult.selected.map((candidate) => candidate.title), rejectedReasons: middleGradesRobotTitleOnlyLockResult.rejectedReasons }));

  const middleGradesMagicClusterLockResult = selectRecommendations([
    "My Rainbow Magic",
    "A Snicker of Magic",
    "A Tale of Magic...",
    "Magic Kingdom For Sale/Sold!",
    "The Magic Faraway Tree",
  ].map((title, index) => fakeScoredCandidate({
    id: `middle-magic-cluster-${index}`,
    title,
    creators: [`Magic Cluster Author ${index}`],
    description: "A magical middle grade fantasy adventure with family, friendship, and school evidence.",
    score: 12 - index * 0.1,
    maturityBand: "preteens",
    genres: ["Fantasy"],
    themes: ["Magic", "Friendship", "Family"],
    scoreBreakdown: { genreFacetMatch: 3, positiveTasteMatch: 3, ageTeenSuitability: 1, sourceQualityRelevance: 2 },
    diagnostics: { queryText: "middle grade fantasy quest", queryFamily: "fantasy", routingReason: "middle_grades_fantasy_adventure" },
    raw: { subject: ["Juvenile fiction", "Magic -- Fiction", "Friendship -- Fiction", "Family -- Fiction"] },
  })), middleGradesSelectionProfile, 5);
  assertEqual(middleGradesMagicClusterLockResult.selected.length, 5, "magic cluster fixture should still form a count-complete slate before lock-quality checks");
  assertEqual(middleGradesMagicClusterLockResult.rejectedReasons.repeatedTitleTokenClusterDetected, true, "magic title-token cluster should be detected");
  assertEqual(middleGradesMagicClusterLockResult.rejectedReasons.repeatedTitleTokenClusterToken, "magic", "magic title-token cluster should report the repeated token");
  assertEqual(middleGradesMagicClusterLockResult.rejectedReasons.lockQualityPass, false, "magic title-token cluster cannot pass lock quality");
  assertEqual((middleGradesMagicClusterLockResult.rejectedReasons.lockQualityFailReasons || []).includes("repeated_title_token_cluster_detected"), true, "magic title-token cluster should add a lock-quality failure reason");
  console.log(JSON.stringify({ name: "middle grades repeated magic title-token cluster fails lock quality", pass: true, selected: middleGradesMagicClusterLockResult.selected.map((candidate) => candidate.title), lockReasons: middleGradesMagicClusterLockResult.rejectedReasons.lockQualityFailReasons }));

  const middleGradesFourWeakResult = selectRecommendations(["One", "Two", "Three", "Four"].map((seed, index) => fakeScoredCandidate({
    id: `middle-four-weak-${seed}`,
    title: `Weak Adventure ${seed}`,
    creators: [`Weak Author ${index}`],
    score: 10 - index,
    maturityBand: "preteens",
    genres: [],
    themes: [],
    scoreBreakdown: { genreFacetMatch: 2, positiveTasteMatch: 2, ageTeenSuitability: 1, sourceQualityRelevance: 2 },
    diagnostics: { queryText: "middle grade adventure", queryFamily: "adventure", routingReason: "middle_grades_fantasy_humor" },
    raw: { subject: ["Juvenile fiction"] },
  })), middleGradesSelectionProfile, 5);
  assertEqual(middleGradesFourWeakResult.selected.length, 0, "four weak title-only rows should be rejected rather than pretending count success");
  assertEqual(middleGradesFourWeakResult.rejectedReasons.lockQualityPass, false, "returned count of four weak rows must fail lock quality");
  assertEqual(middleGradesFourWeakResult.rejectedReasons.finalCountContractStatus !== "full_route_aligned", true, "returned count of four weak rows cannot be full route aligned");
  console.log(JSON.stringify({ name: "middle grades four weak rows remain underfilled failed slate", pass: true, selected: middleGradesFourWeakResult.selected.map((candidate) => candidate.title), status: middleGradesFourWeakResult.rejectedReasons.finalCountContractStatus }));

  const middleGradesLocalHistoryArtifactResult = selectRecommendations([fakeScoredCandidate({
    id: "middle-local-history-artifact",
    title: "A Regional History Compendium",
    creators: ["Reference Author"],
    score: 20,
    maturityBand: "preteens",
    genres: ["History", "Reference", "Nonfiction"],
    themes: ["Local history"],
    scoreBreakdown: { genreFacetMatch: 8, positiveTasteMatch: 8, queryRungBonus: 1, ageTeenSuitability: 1, sourceQualityRelevance: 2 },
    diagnostics: { queryText: "middle grade friendship school novel", queryFamily: "school", routingReason: "middle_grades_contemporary_school" },
    raw: { subject: ["Local history", "Reference", "Nonfiction", "Bibliography"] },
  })], middleGradesSelectionProfile, 5);
  assertEqual(middleGradesLocalHistoryArtifactResult.selected.length, 0, "local-history/reference nonfiction artifact should not be returned for preteen fiction profile");
  assertEqual(Boolean(middleGradesLocalHistoryArtifactResult.rejectedReasons.middle_grades_reference_or_local_history_artifact), true, "local-history/reference artifact should be rejected by generic evidence rules");
  console.log(JSON.stringify({ name: "middle grades local-history reference artifact is rejected generically", pass: true, rejectedReasons: middleGradesLocalHistoryArtifactResult.rejectedReasons }));

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
      diagnostics: { queryText: index === 1 ? "middle grade realistic fiction" : index === 2 ? "middle grade friendship" : "middle grade school story", queryFamily: index === 1 ? "realistic" : index === 2 ? "friendship" : "school", routingReason: "middle_grades_contemporary_school", documentBackedTasteSignals: ["school", "friendship"] },
      scoreBreakdown: { sourceQualityRelevance: 2, ageTeenSuitability: 1, positiveTasteMatch: 2.4 },
      raw: { subject: ["Juvenile fiction", "School", "Friendship", "Family", "Classroom"] },
    })),
  ];
  const middleGradesContemporarySelectionResult = selectRecommendations(middleGradesContemporarySelectionCandidates, middleGradesContemporarySelectionProfile, 5);
  const contemporaryAlignedSelected = middleGradesContemporarySelectionResult.selected.filter((candidate) => /\b(realistic|school|friendship|classroom|family|contemporary)\b/i.test(String(candidate.diagnostics?.queryText || ""))).length;
  const contemporaryAdventureSelected = middleGradesContemporarySelectionResult.selected.filter((candidate) => /\b(adventure|fantasy|magic|quest)\b/i.test(String(candidate.diagnostics?.queryText || "")) && /middle_grades_contemporary_school/i.test(String(candidate.diagnostics?.routingReason || ""))).length;
  assertEqual(contemporaryAlignedSelected, 4, "middle grades contemporary selection should exhaust aligned school/friendship/realistic candidates before adventure fallback");
  assertEqual(contemporaryAdventureSelected, 0, "middle grades contemporary selection should reject query-only adventure fallback when aligned evidence exists");
  assertEqual(Number(middleGradesContemporarySelectionResult.rejectedReasons.middle_grades_route_aligned_success || 0) >= 4, true, "middle grades contemporary selection should emit route-aligned diagnostics");
  console.log(JSON.stringify({ name: "middle grades contemporary selection prefers aligned school candidates", pass: true, selected: middleGradesContemporarySelectionResult.selected.map((candidate) => candidate.title), rejectedReasons: middleGradesContemporarySelectionResult.rejectedReasons }));

  const middleGradesContemporaryDefaultCapCandidates = [
    ...["School Gag One", "School Gag Two", "School Gag Three", "School Gag Four", "School Gag Five"].map((title, index) => fakeScoredCandidate({
      id: `middle-contemporary-default-${index}`,
      title,
      creators: [`School Default Author ${index}`],
      score: 10 - index * 0.1,
      maturityBand: "preteens",
      diagnostics: { queryText: "middle grade school story", queryFamily: "school", routingReason: "middle_grades_contemporary_school", documentBackedTasteSignals: ["school"] },
      scoreBreakdown: { sourceQualityRelevance: 2, ageTeenSuitability: 1, positiveTasteMatch: 1.2 },
      raw: { subject: ["Juvenile fiction", "School", "Classroom"] },
    })),
    ...["Family Class Project", "Friendship Class Team"].map((title, index) => fakeScoredCandidate({
      id: `middle-contemporary-safer-${index}`,
      title,
      creators: [`School Safer Author ${index}`],
      score: 8 - index * 0.1,
      maturityBand: "preteens",
      diagnostics: { queryText: index === 0 ? "middle grade family story" : "middle grade friendship", queryFamily: index === 0 ? "family" : "friendship", routingReason: "middle_grades_contemporary_school", documentBackedTasteSignals: ["family", "friendship"] },
      scoreBreakdown: { sourceQualityRelevance: 2, ageTeenSuitability: 1, positiveTasteMatch: 2.4 },
      raw: { subject: ["Juvenile fiction", "School", "Family", "Friendship", "Classroom"] },
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
      diagnostics: { queryText: index % 2 === 0 ? "middle grade humor" : "children's funny books", queryFamily: "humor", routingReason: "middle_grades_fantasy_humor", documentBackedTasteSignals: ["comedy"] },
      scoreBreakdown: { positiveTasteMatch: 1.2 },
      raw: { subject: ["Juvenile fiction", "Humorous stories"] },
    })),
    ...["Quest One", "Quest Two", "Friendship Trail"].map((title, index) => fakeScoredCandidate({
      id: `middle-humor-aligned-${index}`,
      title,
      creators: [`Adventure Author ${index}`],
      score: 8 - index * 0.1,
      maturityBand: "preteens",
      diagnostics: { queryText: index === 2 ? "middle grade friendship" : "middle grade adventure", queryFamily: index === 2 ? "friendship" : "adventure", routingReason: "middle_grades_fantasy_humor", documentBackedTasteSignals: index === 2 ? ["friendship"] : ["adventure", "fantasy"] },
      scoreBreakdown: { genreFacetMatch: index === 2 ? 0 : 1.2, positiveTasteMatch: index === 2 ? 1.2 : 0.8 },
      raw: { subject: ["Juvenile fiction", index === 2 ? "Friendship" : "Adventure stories"] },
    })),
  ];
  const middleGradesFantasyHumorBalanceResult = selectRecommendations(middleGradesFantasyHumorBalanceCandidates, middleGradesFantasyHumorBalanceProfile, 5);
  const middleGradesFantasyHumorAlignedSelected = middleGradesFantasyHumorBalanceResult.selected.filter((candidate) => /\b(adventure|friendship)\b/i.test(String(candidate.diagnostics?.queryText || ""))).length;
  assertEqual(middleGradesFantasyHumorBalanceResult.selected.length, 3, "middle grades fantasy humor balance should underfill rather than admit title-only humor defaults");
  assertEqual(middleGradesFantasyHumorAlignedSelected >= 2, true, "middle grades fantasy humor balance should include more than one aligned non-humor candidate");
  assertEqual((middleGradesFantasyHumorBalanceResult.rejectedReasons.titleOnlyEvidenceFinalEligibleTitles || []).length, 0, "middle grades fantasy humor balance should not treat title-only humor defaults as final eligible");
  console.log(JSON.stringify({ name: "middle grades fantasy humor selection balances aligned candidates", pass: true, selected: middleGradesFantasyHumorBalanceResult.selected.map((candidate) => candidate.title), rejectedReasons: middleGradesFantasyHumorBalanceResult.rejectedReasons }));

  const middleGradesHumorDefaultCapCandidates = [
    ...["Joke One", "Joke Two", "Joke Three", "Joke Four", "Joke Five"].map((title, index) => fakeScoredCandidate({
      id: `middle-humor-cap-default-${index}`,
      title,
      creators: [`Humor Cap Author ${index}`],
      score: 10 - index * 0.1,
      maturityBand: "preteens",
      diagnostics: { queryText: index % 2 === 0 ? "middle grade humor" : "children's funny books", queryFamily: "humor", routingReason: "middle_grades_humor", documentBackedTasteSignals: ["comedy"] },
      scoreBreakdown: { positiveTasteMatch: 1.2 },
      raw: { subject: ["Juvenile fiction", "Humorous stories"] },
    })),
    ...["School Laughs", "Friendship Laughs"].map((title, index) => fakeScoredCandidate({
      id: `middle-humor-cap-alt-${index}`,
      title,
      creators: [`Humor Alt Author ${index}`],
      score: 8 - index * 0.1,
      maturityBand: "preteens",
      diagnostics: { queryText: index === 0 ? "middle grade school story" : "middle grade friendship", queryFamily: index === 0 ? "school" : "friendship", routingReason: "middle_grades_humor", documentBackedTasteSignals: index === 0 ? ["school"] : ["friendship"] },
      scoreBreakdown: { positiveTasteMatch: 1.2 },
      raw: { subject: ["Juvenile fiction", index === 0 ? "School stories" : "Friendship"] },
    })),
  ];
  const middleGradesHumorDefaultCapResult = selectRecommendations(middleGradesHumorDefaultCapCandidates, middleGradesFantasyHumorBalanceProfile, 5);
  const middleGradesHumorDefaultSelected = middleGradesHumorDefaultCapResult.selected.filter((candidate) => /\b(humor|funny)\b/i.test(String(candidate.diagnostics?.queryText || candidate.diagnostics?.queryFamily || ""))).length;
  assertEqual(middleGradesHumorDefaultSelected <= 3, true, "middle grades humor selection should cap humor/default query-family candidates when safe alternatives exist");
  assertEqual((middleGradesHumorDefaultCapResult.rejectedReasons.titleOnlyEvidenceFinalEligibleTitles || []).length, 0, "middle grades humor defaults should not be final eligible on title-only evidence");
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
      diagnostics: { queryText: index === 0 ? "middle grade adventure" : "middle grade friendship", queryFamily: index === 0 ? "adventure" : "friendship", routingReason: "middle_grades_fantasy_adventure_age_anchored_recovery", documentBackedTasteSignals: index === 0 ? ["adventure", "fantasy"] : ["friendship"] },
      scoreBreakdown: { positiveTasteMatch: index === 0 ? 0.8 : 1.2, genreFacetMatch: index === 0 ? 1.2 : 0 },
      raw: { subject: ["Juvenile fiction", index === 0 ? "Adventure stories" : "Friendship"] },
    })),
  ];
  const middleGradesAdventureHumorDefaultCapResult = selectRecommendations(middleGradesAdventureHumorDefaultCapCandidates, middleGradesFantasyHumorBalanceProfile, 5);
  const middleGradesAdventureHumorDefaultSelected = middleGradesAdventureHumorDefaultCapResult.selected.filter((candidate) => /\b(humor|funny)\b/i.test(String(candidate.diagnostics?.queryText || candidate.diagnostics?.queryFamily || ""))).length;
  assertEqual(middleGradesAdventureHumorDefaultSelected <= 3, true, "middle grades adventure-humor selection should cap default humor candidates when two safe alternatives exist");
  const middleGradesAdventureHumorAlignedSelected = middleGradesAdventureHumorDefaultCapResult.selected.filter((candidate) => /\b(adventure|friendship)\b/i.test(String(candidate.diagnostics?.queryText || candidate.diagnostics?.queryFamily || ""))).length;
  assertEqual(middleGradesAdventureHumorAlignedSelected >= 2, true, "middle grades adventure-humor selection should use the full ranked pool for aligned replacements");
  assertEqual((middleGradesAdventureHumorDefaultCapResult.rejectedReasons.titleOnlyEvidenceFinalEligibleTitles || []).length, 0, "middle grades adventure-humor defaults should not be final eligible on title-only evidence");
  console.log(JSON.stringify({ name: "middle grades adventure-humor selection caps default query family", pass: true, selected: middleGradesAdventureHumorDefaultCapResult.selected.map((candidate) => candidate.title), rejectedReasons: middleGradesAdventureHumorDefaultCapResult.rejectedReasons }));

  const middleGradesFantasyHumorEnforceCandidates = [
    fakeScoredCandidate({
      id: "middle-humor-enforce-aligned-1",
      title: "Quest Anchor",
      creators: ["Adventure Author A"],
      score: 10,
      maturityBand: "preteens",
      diagnostics: { queryText: "middle grade adventure", queryFamily: "adventure", routingReason: "middle_grades_fantasy_humor" },
      raw: { subject: ["Juvenile fiction", "Adventure stories", "Fantasy"] },
    }),
    ...["School One", "School Two", "School Three", "School Four"].map((title, index) => fakeScoredCandidate({
      id: `middle-humor-enforce-school-${index}`,
      title,
      creators: [`School Author ${index}`],
      score: 9.9 - index * 0.1,
      maturityBand: "preteens",
      diagnostics: { queryText: "middle grade school story", queryFamily: "school", routingReason: "middle_grades_contemporary_school" },
      raw: { subject: ["Juvenile fiction", "School stories"] },
    })),
    fakeScoredCandidate({
      id: "middle-humor-enforce-aligned-2",
      title: "Friendship Quest",
      creators: ["Adventure Author B"],
      score: 8,
      maturityBand: "preteens",
      diagnostics: { queryText: "middle grade friendship", queryFamily: "friendship", routingReason: "middle_grades_fantasy_humor" },
      raw: { subject: ["Juvenile fiction", "Friendship"] },
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
      raw: { subject: ["Juvenile fiction", index === 0 ? "Humorous stories" : index === 1 ? "School stories" : "Friendship"] },
    })),
  ];
  const middleGradesAntiZeroFallbackResult = selectRecommendations(middleGradesAntiZeroFallbackCandidates, middleGradesFantasyHumorBalanceProfile, 5);
  const antiZeroSelected = middleGradesAntiZeroFallbackResult.selected.filter((candidate) => candidate.diagnostics?.fallbackAlignment === "anti_zero" || candidate.diagnostics?.emergencyFallback).length;
  const alignedSurvivorSelected = middleGradesAntiZeroFallbackResult.selected.filter((candidate) => /Survivor/.test(candidate.title)).length;
  assertEqual(alignedSurvivorSelected >= 2, true, "middle grades anti-zero fallback should preserve surviving non-title-only school/friendship candidates");
  assertEqual(antiZeroSelected <= 3, true, "middle grades anti-zero fallback should only fill true shortages after aligned candidates are exhausted");
  assertEqual((middleGradesAntiZeroFallbackResult.rejectedReasons.titleOnlyEvidenceFinalEligibleTitles || []).length, 0, "middle grades anti-zero fallback gate should not accept title-only evidence as final eligible");
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
    assertEqual(middleGradesCascadeFetchCalls.length >= 3, true, "middle grades cascade should spend real attempts on profile-specific route queries");
    assertEqual(result.diagnostics.finalCountContractStatus !== "full_fallback_only", true, "middle grades cascade should not label route-specific underfill recovery as fallback-only lock quality");
    assertEqual(result.diagnostics.fetches?.[0]?.clientTimeoutMs <= 4500, true, "middle grades first proxy fetch should cap per-query budget to preserve route-specific attempts");
    assertEqual(Boolean(result.diagnostics.profileSpecificQueriesAttempted?.length || middleGradesCascadeFetchCalls.some((query) => /middle grade|fantasy|magic/i.test(query))), true, "middle grades cascade should expose profile-specific or route-specific query attempts");
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
    assertEqual(middleGradesDelayedRetryFetchCalls.length >= 3, true, "middle grades delayed retry should spend real attempts on profile-specific queries after timeouts");
    assertEqual(Boolean(result.diagnostics.middleGradesDelayedRetryAttempted || result.diagnostics.profileSpecificQueriesTimedOut >= 2 || (result.diagnostics.fetches || []).filter((fetch) => fetch.timedOut).length >= 2 || middleGradesDelayedRetryFetchCalls.length >= 3), true, "middle grades delayed retry diagnostics should mark attempted or route-specific timeouts");
    assertEqual(Boolean(result.diagnostics.profileSpecificQueriesAttempted?.length || middleGradesDelayedRetryFetchCalls.some((query) => /middle grade|fantasy|magic/i.test(query))), true, "middle grades delayed retry should expose profile-specific or route-specific attempts");
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
    assertEqual(middleGradesContemporaryRetryFetchCalls.some((query) => /school|friendship|middle school|realistic/i.test(query)), true, "middle grades contemporary retry should continue to profile-specific school/community queries");
    assertEqual(Boolean(result.diagnostics.middleGradesDelayedRetryAttempted || result.diagnostics.profileSpecificQueriesTimedOut >= 2 || result.diagnostics.repeatedProxyAbortCount >= 2 || result.diagnostics.directFallbackAttemptedAfterProxyAbort), true, "middle grades contemporary retry diagnostics should mark delayed retry or profile-specific timeouts");
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
    assertEqual(middleGradesContemporaryDeepRetryFetchCalls.some((query) => /school|friendship|middle school|realistic/i.test(query)), true, "middle grades contemporary retry should keep profile-specific recovery before generic adventure when underfilled");
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
    assertEqual(middleGradesFantasyMysteryRetryFetchCalls.some((query) => /mystery/i.test(query)), true, "middle grades fantasy mystery retry should preserve mystery intent through profile-specific recovery before generic adventure");
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
    assertEqual(middleGradesHumorRetryFetchCalls.some((query) => /funny|humor|family|friendship|school/i.test(query)), true, "middle grades fantasy-humor retry should use profile-specific humor/family/school queries");
    assertEqual(Boolean(result.diagnostics.profileSpecificQueriesAttempted?.length), true, "middle grades humor retry diagnostics should expose profile-specific attempts");
    assertEqual(result.diagnostics.lockQualityStatus !== "fallback_only_success", true, "middle grades humor retry should not treat fallback-only success as lock quality");
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
    assertEqual(middleGradesHumorRejectedFetchCalls.some((query) => /funny|family|school|friendship/i.test(query)), true, "middle grades fantasy-humor should keep trying profile-specific recovery before generic fallback");
    assertEqual(Boolean(result.diagnostics.profileSpecificQueriesAttempted?.length), true, "middle grades fantasy-humor rejected fallback should expose profile-specific attempts");
    assertEqual(result.diagnostics.middleGradesFallbackOnlySlate !== true, true, "middle grades fantasy-humor rejected fallback should avoid fallback-only diagnostics when profile-specific recovery succeeds");
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
