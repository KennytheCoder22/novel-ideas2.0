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

function assertNotIncludes(values, unexpected, message) {
  if (Array.isArray(values) && values.includes(unexpected)) {
    throw new Error(`${message}: did not expect ${JSON.stringify(unexpected)} in ${JSON.stringify(values)}`);
  }
}

function assertNoNovelTemplates(queries, messagePrefix) {
  for (const query of queries) {
    if (/\bchildren\b.*\bfiction\b.*\bnovel\b/.test(query)) {
      throw new Error(`${messagePrefix}: unexpected children fiction novel template in query ${JSON.stringify(query)}`);
    }
  }
}

function assertNoMalformedChildrenPossessive(queries, messagePrefix) {
  for (const query of queries) {
    if (/\bchildren\s+s\b/i.test(String(query || ""))) {
      throw new Error(`${messagePrefix}: malformed children possessive in query ${JSON.stringify(query)}`);
    }
  }
}

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../app/recommender-v2");
const { buildSearchPlan } = require(resolve(dir, "searchPlan.ts"));
const { buildTasteProfile } = require(resolve(dir, "tasteProfile.ts"));
const { googleBooksSourceAdapter } = require(resolve(dir, "sources/googleBooksSource.ts"));

function profile(ageBand, genreFamilyValues, toneValues = [], themeValues = []) {
  return {
    ageBand,
    maturityBand: ageBand,
    genreFamily: genreFamilyValues.map((value, index) => ({ value, weight: Math.max(1, 2 - index), evidence: [`like:${ageBand}:${value}`] })),
    tone: toneValues.map((value) => ({ value, weight: 1, evidence: [`like:${ageBand}:${value}`] })),
    pacing: [],
    themes: themeValues.map((value) => ({ value, weight: 1, evidence: [`like:${ageBand}:${value}`] })),
    characterDynamics: [],
    formatPreference: [{ value: "book", weight: 1, evidence: [`like:${ageBand}:book`] }],
    avoidSignals: [],
    sourceHints: ["googleBooks"],
    diagnostics: {},
  };
}

function googleBooksQueries(profileInput) {
  const plan = buildSearchPlan(profileInput, { googleBooks: true });
  const gb = plan.sourcePlans.find((sourcePlan) => sourcePlan.source === "googleBooks");
  return {
    queries: gb?.intents.map((intent) => intent.query) || [],
    diagnostics: plan.diagnostics || {},
  };
}

// Kids planner fixtures
for (const fixture of [
  { name: "humor+animals", profile: profile("kids", ["humorous", "adventure"], [], ["animals"]) },
  { name: "friendship+gentle", profile: profile("kids", ["contemporary"], ["gentle"], ["friendship"]) },
  { name: "fantasy+adventure", profile: profile("kids", ["fantasy", "adventure"]) },
  { name: "nature+adventure", profile: profile("kids", ["adventure"], [], ["nature"]) },
  { name: "alphabet+rhythm", profile: profile("kids", [], [], ["alphabet", "rhythm"]) },
  { name: "mixed-picture-early-reader", profile: profile("kids", ["animal", "friendship"], [], ["friendship"]) },
  { name: "weak-generic", profile: profile("kids", []) },
]) {
  const result = googleBooksQueries(fixture.profile);
  const unique = Array.from(new Set(result.queries));
  assertEqual(result.queries.length, unique.length, `${fixture.name}: planner should not emit duplicate queries`);
  assertTruthy(result.queries.length > 0 && result.queries.length <= 3, `${fixture.name}: planner should emit one to three queries`);
  assertNoNovelTemplates(result.queries, `${fixture.name}: planner should avoid generic K-2 novel templates`);
  assertNoMalformedChildrenPossessive(result.queries, `${fixture.name}: planner should not emit malformed possessive`);
  assertNotIncludes(result.queries, "kids fantasy picture book", `${fixture.name}: underperforming fantasy picture-book template must be retired`);
  assertNotIncludes(result.queries, "kids fantasy early reader", `${fixture.name}: underperforming fantasy early-reader template must be retired`);
  assertTruthy(Array.isArray(result.diagnostics.kidsGoogleBooksPlannedQueries), `${fixture.name}: planned-query diagnostics should be present`);
  assertTruthy(typeof result.diagnostics.kidsGoogleBooksQueryFamilyByQuery === "object", `${fixture.name}: family diagnostics should be present`);
  assertTruthy(typeof result.diagnostics.kidsGoogleBooksQueryFormatByQuery === "object", `${fixture.name}: format diagnostics should be present`);
  assertTruthy(typeof result.diagnostics.kidsGoogleBooksQueryThemeByQuery === "object", `${fixture.name}: theme diagnostics should be present`);
  assertTruthy(typeof result.diagnostics.kidsGoogleBooksQuerySuppressionReason !== "undefined", `${fixture.name}: suppression diagnostics should be present`);
  assertTruthy(typeof result.diagnostics.kidsGoogleBooksQueryReplacementReason !== "undefined", `${fixture.name}: replacement diagnostics should be present`);
  assertTruthy(Array.isArray(result.diagnostics.kidsGoogleBooksProfilePositiveFamilies), `${fixture.name}: positive-family diagnostics should be present`);
  assertTruthy(Array.isArray(result.diagnostics.kidsGoogleBooksProfileAvoidFamilies), `${fixture.name}: avoid-family diagnostics should be present`);
  assertTruthy(typeof result.diagnostics.kidsGoogleBooksSelectedCascade === "string", `${fixture.name}: selected-cascade diagnostics should be present`);
  assertTruthy(typeof result.diagnostics.kidsGoogleBooksSelectedPrimaryFamily === "string", `${fixture.name}: primary-family diagnostics should be present`);
  assertTruthy(typeof result.diagnostics.kidsGoogleBooksSelectedSecondaryFamily === "string", `${fixture.name}: secondary-family diagnostics should be present`);
  assertTruthy(typeof result.diagnostics.kidsGoogleBooksGenericPlanningReason === "string", `${fixture.name}: generic-planning diagnostics should be present`);
  assertTruthy(typeof result.diagnostics.kidsGoogleBooksFamilySuppressedReason === "string", `${fixture.name}: family-suppression diagnostics should be present`);
}

// Humor + adventure should use the dedicated thematic cascade for diversity.
{
  const result = googleBooksQueries(profile("kids", ["humorous", "adventure"]));
  assertEqual(
    JSON.stringify(result.queries),
    JSON.stringify(["kids friendship picture book", "kids humorous picture book", "kids rhyming picture book"]),
    "humor+adventure should use the friendship/humor/rhyming thematic cascade",
  );
  assertEqual(
    result.diagnostics.kidsGoogleBooksSelectedCascade,
    "thematic_friendship_humor_rhyming",
    "humor+adventure should report thematic cascade selection",
  );
}

{
  const result = googleBooksQueries(profile("kids", []));
  assertEqual(
    result.diagnostics.kidsGoogleBooksGenericPlanningReason,
    "no_like_backed_family_signals_survived_suppression",
    "generic kids planning should report why no specific family was selected",
  );
}

// Disliked fantasy with liked humor should not force fantasy templates.
{
  const prof = profile("kids", ["humorous"], [], ["friendship"]);
  prof.avoidSignals = [{ value: "fantasy", weight: 1, evidence: ["dislike:fantasy"] }];
  const result = googleBooksQueries(prof);
  assertNotIncludes(result.queries, "kids fantasy picture book", "disliked fantasy should not force retired fantasy picture-book template");
  assertNotIncludes(result.queries, "kids fantasy early reader", "disliked fantasy should not force retired fantasy early-reader template");
  assertNotIncludes(result.queries, "kids magic adventure", "disliked fantasy should not force fantasy-variant query templates");
}

// Fantasy route should preserve fantasy retrieval via new formulations, not old templates.
{
  const result = googleBooksQueries(profile("kids", ["fantasy", "adventure"]));
  assertEqual(
    JSON.stringify(result.queries),
    JSON.stringify(["kids adventure picture book", "kids magic adventure", "kids dragon adventure early reader"]),
    "fantasy+adventure should use the fantasy-friendly adventure cascade",
  );
  assertEqual(
    result.diagnostics.kidsGoogleBooksSelectedCascade,
    "fantasy_magic_adventure",
    "fantasy+adventure should report fantasy cascade selection",
  );
}

// Skip-only fantasy must not contribute positive fantasy evidence.
{
  const taste = buildTasteProfile({
    ageBand: "kids",
    signals: [
      { action: "like", title: "Funny Farm", genres: ["Humorous"], tags: ["funny", "animals", "friendship"] },
      { action: "skip", title: "Magic Castle", genres: ["Fantasy"], tags: ["fantasy", "magic"] },
    ],
    enabledSources: { googleBooks: true },
  });
  const result = googleBooksQueries(taste);
  const joined = result.queries.join(" | ");
  if (/\bfantasy\b/.test(joined)) {
    throw new Error(`skip-only fantasy should not create positive fantasy planning evidence, got queries: ${joined}`);
  }
}

// Cross-band protection (Adult, Teen, Pre-Teen byte-for-byte unchanged for this fixture).
{
  assertEqual(
    JSON.stringify(googleBooksQueries(profile("adult", ["science fiction", "contemporary"])).queries),
    JSON.stringify(["science fiction novel", "science fiction contemporary novel", "science fiction mystery novel"]),
    "adult query planning must remain unchanged",
  );
  assertEqual(
    JSON.stringify(googleBooksQueries(profile("teens", ["science fiction", "contemporary"])).queries),
    JSON.stringify(["young adult science fiction novel", "young adult contemporary fiction novel"]),
    "teen query planning must remain unchanged",
  );
  assertEqual(
    JSON.stringify(googleBooksQueries(profile("preteens", ["science fiction", "contemporary"])).queries),
    JSON.stringify(["middle grade science fiction fiction novel", "middle grade contemporary fiction novel", "middle grade science fiction contemporary fiction"]),
    "preteen query planning must remain unchanged",
  );
}

// Partial-failure tolerance: earlier successful queries must survive a later abort.
{
  const kidsProfile = profile("kids", ["fantasy", "adventure"], [], ["friendship"]);
  const sourcePlan = buildSearchPlan(kidsProfile, { googleBooks: true }).sourcePlans.find((source) => source.source === "googleBooks");
  assertTruthy(sourcePlan, "kids source plan should exist");
  const itemsByQuery = [
    [
      {
        kind: "books#volume",
        id: "kids-ok-1",
        volumeInfo: {
          title: "Garden Friends: A Novel",
          authors: ["Regression Author"],
          description: "When two friends find their neighborhood garden in danger, they must solve clues, work together, and save their magical hideout before summer ends.",
          categories: ["Fiction / Action & Adventure", "Juvenile Fiction / Social Themes / Friendship"],
          publisher: "Kids House",
          publishedDate: "2022",
          pageCount: 32,
          printType: "BOOK",
          language: "en",
          maturityRating: "NOT_MATURE",
        },
      },
    ],
    [
      {
        kind: "books#volume",
        id: "kids-ok-2",
        volumeInfo: {
          title: "Forest Promise: A Novel",
          authors: ["Regression Author"],
          description: "After a storm changes the forest path, three kids must uncover a hidden map, confront danger, and protect their town's oldest secret.",
          categories: ["Fiction / Mystery & Detective / General", "Juvenile Fiction / Nature & the Natural World"],
          publisher: "Kids House",
          publishedDate: "2021",
          pageCount: 36,
          printType: "BOOK",
          language: "en",
          maturityRating: "NOT_MATURE",
        },
      },
    ],
  ];

  let attempt = 0;
  const requestedQueries = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const requestUrl = typeof input === "string" ? input : String(input?.url || "");
    const parsed = new URL(requestUrl);
    requestedQueries.push(String(parsed.searchParams.get("q") || ""));
    attempt += 1;
    if (attempt <= 2) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ totalItems: 1, items: itemsByQuery[attempt - 1] }),
      };
    }
    throw new Error("The operation was aborted.");
  };

  const result = await googleBooksSourceAdapter.search(sourcePlan, { profile: kidsProfile });
  globalThis.fetch = originalFetch;

  assertEqual(result.status, "succeeded", "partial query abort must not force total source failure when earlier queries yielded usable rows");
  assertEqual(result.diagnostics.googleBooksSourceStatus, "partial_success", "source status detail should be partial_success");
  assertEqual(typeof result.diagnostics.failedReason === "undefined", true, "partial success must not carry a contradictory aggregate failedReason");
  assertEqual(result.diagnostics.googleBooksSourceSuccessfulQueries, 2, "two successful queries should be recorded");
  assertEqual(result.diagnostics.googleBooksSourcePartialFailures, 1, "one failed query should be recorded");
  assertEqual(result.rawItems.length >= 2, true, "rows from successful earlier queries must be retained");
  const fetchRows = result.diagnostics.googleBooksSourceFetchDiagnostics || [];
  assertEqual(fetchRows.length >= 3, true, "per-query diagnostics should include all attempted queries");
  assertEqual(fetchRows[0].status, "succeeded", "first query status should be succeeded");
  assertEqual(fetchRows[1].status, "succeeded", "second query status should be succeeded");
  assertEqual(fetchRows[2].status === "aborted" || fetchRows[2].status === "failed", true, "third query should be marked aborted/failed");
  assertEqual(typeof fetchRows[0].acceptedAfterSourcePolicy === "number", true, "acceptedAfterSourcePolicy should be populated");
  assertEqual(typeof fetchRows[0].rawApiCount === "number", true, "rawApiCount should be populated");
  assertNoMalformedChildrenPossessive((sourcePlan.intents || []).map((intent) => intent.query), "planned kids fetch queries");
  assertNoMalformedChildrenPossessive(fetchRows.map((row) => row.query), "attempted kids fetch queries");
  assertNoMalformedChildrenPossessive(requestedQueries, "requested Google Books URL queries");
  assertEqual(
    requestedQueries.slice(0, Math.min(requestedQueries.length, (sourcePlan.intents || []).length)).join(" || "),
    (sourcePlan.intents || []).slice(0, requestedQueries.length).map((intent) => intent.query).join(" || "),
    "Google Books request query should match canonical Kids planner query text",
  );
  assertEqual(
    fetchRows.slice(0, requestedQueries.length).every((row) => String(row.query || "") === String(row.originalPlannedQuery || "")),
    true,
    "per-query diagnostics should retain exact planned query text",
  );
}

// Kids publication-shape unknown rejection audit should expose counterfactual diagnostics without changing acceptance.
{
  const kidsProfile = profile("kids", ["friendship"], [], ["friendship"]);
  const sourcePlan = buildSearchPlan(kidsProfile, { googleBooks: true }).sourcePlans.find((source) => source.source === "googleBooks");
  assertTruthy(sourcePlan, "kids source plan should exist for publication audit");
  const unknownRejectRows = [
    {
      kind: "books#volume",
      id: "kids-unknown-false-reject",
      volumeInfo: {
        title: "Frances Frog's Forever Friend",
        authors: ["Regression Author"],
        description: "Frances Frog meets a new friend near the pond.",
        categories: ["Juvenile Fiction / Social Themes / Friendship"],
        publisher: "Kids House",
        publishedDate: "2022",
        pageCount: 32,
        printType: "BOOK",
        language: "en",
        maturityRating: "NOT_MATURE",
        industryIdentifiers: [{ type: "ISBN_13", identifier: "9780000000001" }],
      },
    },
    {
      kind: "books#volume",
      id: "kids-unknown-correct-reject",
      volumeInfo: {
        title: "Kids Facts",
        authors: ["Regression Author"],
        description: "Facts for kids.",
        categories: [],
        publisher: "",
        publishedDate: "2023",
        printType: "BOOK",
        language: "en",
        maturityRating: "NOT_MATURE",
      },
    },
    {
      kind: "books#volume",
      id: "kids-unknown-ambiguous",
      volumeInfo: {
        title: "Jeremy Jackrabbit",
        authors: ["Regression Author"],
        description: "Jeremy explores the woods.",
        categories: [],
        publisher: "Kids House",
        publishedDate: "2023",
        pageCount: 40,
        printType: "BOOK",
        language: "en",
        maturityRating: "NOT_MATURE",
        industryIdentifiers: [{ type: "ISBN_13", identifier: "9780000000002" }],
      },
    },
  ];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ totalItems: unknownRejectRows.length, items: unknownRejectRows }),
  });
  const result = await googleBooksSourceAdapter.search(sourcePlan, { profile: kidsProfile });
  globalThis.fetch = originalFetch;
  assertEqual(result.rawItems.length, 0, "unknown-shape publication audit must not activate a Kids rescue in this pass");
  const auditByTitle = result.diagnostics.kidsGoogleBooksPublicationAuditByTitle || {};
  const counterfactualByTitle = result.diagnostics.kidsGoogleBooksPublicationCounterfactualDecisionByTitle || {};
  assertTruthy(typeof auditByTitle["Frances Frog's Forever Friend"] === "object", "kids publication audit should include unknown-shape rejected titles");
  assertTruthy(
    String(counterfactualByTitle["Frances Frog's Forever Friend"] || "").startsWith("likely_k2_narrative_publication"),
    "counterfactual diagnostics should mark likely false rejects",
  );
  assertTruthy(
    String(counterfactualByTitle["Kids Facts"] || "").startsWith("likely_correct_reject"),
    "counterfactual diagnostics should mark likely correct rejects",
  );
  assertTruthy(
    String(counterfactualByTitle["Jeremy Jackrabbit"] || "").startsWith("ambiguous"),
    "counterfactual diagnostics should mark ambiguous rejects",
  );
  assertIncludes(result.diagnostics.kidsGoogleBooksLikelyFalseRejectTitles || [], "Frances Frog's Forever Friend", "likely false reject list should include Frances Frog");
  assertIncludes(result.diagnostics.kidsGoogleBooksLikelyCorrectRejectTitles || [], "Kids Facts", "likely correct reject list should include Kids Facts");
  assertIncludes(result.diagnostics.kidsGoogleBooksAmbiguousRejectTitles || [], "Jeremy Jackrabbit", "ambiguous reject list should include Jeremy Jackrabbit");
}

console.log("PASS kids google books query planning and partial-failure regressions");
