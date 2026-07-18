/**
 * Diagnostic-only regressions for non-Adult Google Books V2 infrastructure.
 *
 * These fixtures do not assert recommendation quality. They verify that Kids,
 * Pre-Teens, and Teens expose query-plan -> dispatch -> normalization ->
 * scoring -> eligibility -> selection -> wrapper/renderer audit diagnostics,
 * plus deliberate failure-stage labels.
 */
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

function assertTruthy(value, message) {
  if (!value) throw new Error(`${message}: expected truthy, got ${JSON.stringify(value)}`);
}

function assertIncludes(values, expected, message) {
  if (!Array.isArray(values) || !values.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(values)} to include ${JSON.stringify(expected)}`);
  }
}

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../app/recommender-v2");
const { buildSearchPlan } = require(resolve(dir, "searchPlan.ts"));
const { normalizeSourceResults } = require(resolve(dir, "normalize.ts"));
const { scoreCandidates } = require(resolve(dir, "score.ts"));
const { selectRecommendations } = require(resolve(dir, "select.ts"));
const { buildGoogleBooksAgeBandInfrastructureDiagnostics } = require(resolve(dir, "engine.ts"));

function profileFor(ageBand) {
  const ageSpecificGenre = ageBand === "kids" ? "magic" : ageBand === "preteens" ? "fantasy" : "mystery";
  return {
    ageBand,
    maturityBand: ageBand,
    genreFamily: [
      { value: ageSpecificGenre, weight: 2, evidence: [`like:${ageBand}:anchor`] },
      { value: "adventure", weight: 1, evidence: [`like:${ageBand}:anchor`] },
    ],
    tone: [{ value: "warm", weight: 1, evidence: [`like:${ageBand}:anchor`] }],
    pacing: [],
    themes: [{ value: "friendship", weight: 1, evidence: [`like:${ageBand}:anchor`] }],
    characterDynamics: [],
    formatPreference: [{ value: "book", weight: 1, evidence: [`like:${ageBand}:anchor`] }],
    avoidSignals: [],
    sourceHints: ["googleBooks"],
    diagnostics: {},
  };
}

function firstGoogleBooksPlan(searchPlan) {
  return searchPlan.sourcePlans.find((plan) => plan.source === "googleBooks");
}

function rawGoogleBook(ageBand, title, overrides = {}) {
  const baseDescription = ageBand === "kids"
    ? "A picture book story follows Maya and her friend as they discover magic in a moonlit garden and share a gentle adventure for read aloud time."
    : ageBand === "preteens"
      ? "A middle grade fantasy novel follows Mira through a hidden school of magic where she must protect her friends and solve a dangerous quest."
      : "A young adult mystery novel follows Nina as she uncovers a school conspiracy, confronts a hidden threat, and protects her closest friend.";
  const baseGenres = ageBand === "kids"
    ? ["Juvenile Fiction / Fantasy & Magic", "Juvenile Fiction / Readers / Beginner", "Picture books"]
    : ageBand === "preteens"
      ? ["Juvenile Fiction / Fantasy & Magic", "Juvenile Fiction / Action & Adventure", "Middle grade fiction"]
      : ["Young Adult Fiction / Mysteries & Detective Stories", "Young Adult Fiction / Thrillers & Suspense"];
  return {
    id: `googleBooks:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    sourceId: `gb-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title,
    creators: ["Regression Author"],
    description: baseDescription,
    genres: baseGenres,
    themes: ["friendship", "magic", "school"],
    tones: ["warm"],
    characterDynamics: [],
    formats: ["book"],
    publicationYear: 2024,
    sourceUrl: `https://books.google.example/${encodeURIComponent(title)}`,
    ageBand,
    queryText: `${ageBand} regression fiction novel`,
    queryFamily: ageBand === "kids" ? "fantasy" : ageBand === "preteens" ? "fantasy" : "mystery",
    facets: baseGenres,
    ...overrides,
  };
}

function googleBooksSourceResult(profile, searchPlan, rawItems, overrides = {}) {
  const plan = firstGoogleBooksPlan(searchPlan);
  const queries = plan?.intents.map((intent) => intent.query) || [];
  const status = overrides.status || (rawItems.length ? "succeeded" : "empty");
  return {
    source: "googleBooks",
    status,
    rawItems,
    diagnostics: {
      source: "googleBooks",
      status,
      planned: true,
      attempted: status !== "skipped",
      timedOut: false,
      rawCount: rawItems.length,
      rawApiResultCount: rawItems.length,
      normalizedCount: rawItems.length,
      queries,
      googleBooksPlannedQueries: queries,
      googleBooksQueriesAttempted: status === "failed" ? [] : queries,
      rawTitles: rawItems.map((item) => String(item.title || "")).filter(Boolean),
      googleBooksSourceStatus: status,
      googleBooksSourceQueries: queries,
      googleBooksSourceRawApiResultCount: rawItems.length,
      googleBooksSourceNormalizedRowCount: rawItems.length,
      googleBooksSourceDroppedBeforeNormalization: 0,
      googleBooksSourceDropReasons: {},
      ...overrides.diagnostics,
    },
  };
}

function runInfrastructureFlow(ageBand, rawRows, options = {}) {
  const profile = profileFor(ageBand);
  const searchPlan = options.searchPlan || buildSearchPlan(profile, { googleBooks: true });
  const sourceResults = options.sourceResults || [googleBooksSourceResult(profile, searchPlan, rawRows, options.sourceOverrides || {})];
  const normalized = options.normalizedCandidates || normalizeSourceResults(sourceResults);
  const scored = options.scoredCandidates || scoreCandidates(normalized, profile);
  const selection = options.selection || selectRecommendations(scored, profile, options.limit || 5);
  return {
    profile,
    searchPlan,
    sourceResults,
    normalized,
    scored,
    selection,
    diagnostics: buildGoogleBooksAgeBandInfrastructureDiagnostics({
      profile,
      searchPlan,
      sourceResults,
      normalizedCandidates: normalized,
      scoredCandidates: scored,
      selectedCandidates: selection.selected,
      returnedTitles: selection.selected.filter((candidate) => candidate.source === "googleBooks").map((candidate) => candidate.title),
    }),
  };
}

for (const ageBand of ["kids", "preteens", "teens"]) {
  const title = `${ageBand} Google Books Narrative Candidate`;
  const run = runInfrastructureFlow(ageBand, [rawGoogleBook(ageBand, title)]);
  const byDeck = run.diagnostics;
  assertEqual(byDeck.googleBooksAgeBandQueryPlanningByDeck[ageBand].status, "succeeded", `${ageBand}: query planning should succeed`);
  assertEqual(byDeck.googleBooksAgeBandDispatchByDeck[ageBand].status, "succeeded", `${ageBand}: dispatch should succeed`);
  assertEqual(byDeck.googleBooksAgeBandNormalizationByDeck[ageBand].status, "succeeded", `${ageBand}: normalization should succeed`);
  assertEqual(byDeck.googleBooksAgeBandScoringHandoffByDeck[ageBand].status, "succeeded", `${ageBand}: scoring should succeed`);
  assertTruthy(Number(byDeck.googleBooksAgeBandFinalSelectionHandoffByDeck[ageBand].selectedCount || 0) > 0, `${ageBand}: at least one Google Books candidate should reach final selection`);
  assertIncludes(byDeck.googleBooksAgeBandRenderedTitlesByDeck[ageBand], title, `${ageBand}: renderer handoff should include selected Google Books title`);
  assertEqual(byDeck.googleBooksAgeBandDropStageByTitle[title], "rendered_handoff", `${ageBand}: selected title should have rendered handoff status`);
  console.log(`PASS ${ageBand}: Google Books infrastructure success path`);
}

{
  const profile = profileFor("kids");
  const searchPlan = buildSearchPlan(profile, { googleBooks: false });
  const diagnostics = buildGoogleBooksAgeBandInfrastructureDiagnostics({
    profile,
    searchPlan,
    sourceResults: [],
    normalizedCandidates: [],
    scoredCandidates: [],
    selectedCandidates: [],
  });
  assertEqual(diagnostics.googleBooksAgeBandQueryPlanningByDeck.kids.status, "disabled", "disabled Google Books should be reported at query planning");
  assertEqual(diagnostics.googleBooksAgeBandQueryPlanningByDeck.kids.failureKind, "source_disabled", "disabled Google Books should retain source-disabled failure kind");
  console.log("PASS failure: source-disabled query planning");
}

{
  const profile = profileFor("kids");
  const searchPlan = buildSearchPlan(profile, { googleBooks: true });
  const diagnostics = buildGoogleBooksAgeBandInfrastructureDiagnostics({
    profile,
    searchPlan,
    sourceResults: [],
    normalizedCandidates: [],
    scoredCandidates: [],
    selectedCandidates: [],
  });
  assertEqual(diagnostics.googleBooksAgeBandDispatchByDeck.kids.failureKind, "dispatch_failure_missing_source_result", "missing source result should report dispatch failure");
  console.log("PASS failure: dispatch missing source result");
}

{
  const profile = profileFor("teens");
  const searchPlan = buildSearchPlan(profile, { googleBooks: true });
  const sourceResults = [googleBooksSourceResult(profile, searchPlan, [], {
    status: "failed",
    diagnostics: { failedReason: "fixture_network_failure" },
  })];
  const diagnostics = buildGoogleBooksAgeBandInfrastructureDiagnostics({
    profile,
    searchPlan,
    sourceResults,
    normalizedCandidates: [],
    scoredCandidates: [],
    selectedCandidates: [],
  });
  assertEqual(diagnostics.googleBooksAgeBandDispatchByDeck.teens.failureKind, "fetch_failure", "failed source result should report fetch failure");
  console.log("PASS failure: fetch failure");
}

{
  const run = runInfrastructureFlow("preteens", [{ id: "googleBooks:missing-title", sourceId: "missing-title", title: "", ageBand: "preteens" }]);
  assertEqual(run.diagnostics.googleBooksAgeBandNormalizationByDeck.preteens.status, "failed", "raw row without title should report normalization failure");
  console.log("PASS failure: normalization failure");
}

{
  const profile = profileFor("teens");
  const searchPlan = buildSearchPlan(profile, { googleBooks: true });
  const sourceResults = [googleBooksSourceResult(profile, searchPlan, [rawGoogleBook("teens", "Scored Later")])];
  const normalized = normalizeSourceResults(sourceResults);
  const diagnostics = buildGoogleBooksAgeBandInfrastructureDiagnostics({
    profile,
    searchPlan,
    sourceResults,
    normalizedCandidates: normalized,
    scoredCandidates: [],
    selectedCandidates: [],
  });
  assertEqual(diagnostics.googleBooksAgeBandScoringHandoffByDeck.teens.status, "failed", "normalized rows missing from scoring should report scoring failure");
  console.log("PASS failure: scoring handoff failure");
}

{
  const title = "Maturity Mismatch Candidate";
  const run = runInfrastructureFlow("kids", [rawGoogleBook("kids", title, { maturityBand: "NOT_MATURE", maturityRating: "NOT_MATURE" })]);
  assertEqual(run.normalized[0].maturityBand, "kids", "Google Books NOT_MATURE should not overwrite Kids deck identity");
  assertEqual(run.diagnostics.googleBooksContentMaturityByTitle[title], "not_mature", "Google Books NOT_MATURE should be reported as content maturity");
  assertEqual(run.diagnostics.googleBooksAgeBandDropReasonByTitle[title], "selected_googlebooks_candidate", "Google Books NOT_MATURE should not cause maturity-band mismatch");
  assertEqual(run.diagnostics.googleBooksAudienceMaturityMismatchTitles.length, 0, "Google Books content maturity should not be reported as an age-band mismatch");
  console.log("PASS separation: Google Books NOT_MATURE is content maturity, not an age-band mismatch");
}

{
  const profile = profileFor("teens");
  const searchPlan = buildSearchPlan(profile, { googleBooks: true });
  const sourceResults = [googleBooksSourceResult(profile, searchPlan, [], {
    diagnostics: {
      googleBooksPublicationShapeRejectedBeforeRankingByTitle: {
        "Fixture Study Guide": "publication_shape_reference",
      },
    },
  })];
  const diagnostics = buildGoogleBooksAgeBandInfrastructureDiagnostics({
    profile,
    searchPlan,
    sourceResults,
    normalizedCandidates: [],
    scoredCandidates: [],
    selectedCandidates: [],
  });
  assertEqual(diagnostics.googleBooksAgeBandDropStageByTitle["Fixture Study Guide"], "publication-shape_rejection", "publication-shape drop should be distinguishable by title");
  console.log("PASS failure: publication-shape rejection");
}

{
  const first = rawGoogleBook("teens", "Selected Mystery");
  const second = rawGoogleBook("teens", "Ranked Below Mystery");
  const run = runInfrastructureFlow("teens", [first, second], { limit: 1 });
  assertEqual(run.diagnostics.googleBooksAgeBandFinalSelectionHandoffByDeck.teens.status, "succeeded", "one selected candidate should satisfy final selection handoff");
  assertTruthy(
    Object.values(run.diagnostics.googleBooksAgeBandDropReasonByTitle).includes("ranked_below_final_selection"),
    "unselected scored candidate should report final-selection loss",
  );
  console.log("PASS failure: final-selection loss");
}

console.log("PASS googlebooks age-band infrastructure audit regressions");
