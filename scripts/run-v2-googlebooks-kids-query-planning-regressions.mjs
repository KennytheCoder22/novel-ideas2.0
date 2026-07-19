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
  assertTruthy(result.queries.some((query) => /picture book/.test(query)), `${fixture.name}: expected a picture-book query`);
  assertTruthy(
    result.queries.some((query) => /early reader|beginning reader|read aloud|illustrated/.test(query)),
    `${fixture.name}: expected a distinct non-picture-book companion query`,
  );
  assertTruthy(Array.isArray(result.diagnostics.kidsGoogleBooksPlannedQueries), `${fixture.name}: planned-query diagnostics should be present`);
  assertTruthy(typeof result.diagnostics.kidsGoogleBooksQueryFamilyByQuery === "object", `${fixture.name}: family diagnostics should be present`);
  assertTruthy(typeof result.diagnostics.kidsGoogleBooksQueryFormatByQuery === "object", `${fixture.name}: format diagnostics should be present`);
  assertTruthy(typeof result.diagnostics.kidsGoogleBooksQueryThemeByQuery === "object", `${fixture.name}: theme diagnostics should be present`);
  assertTruthy(typeof result.diagnostics.kidsGoogleBooksQuerySuppressionReason !== "undefined", `${fixture.name}: suppression diagnostics should be present`);
  assertTruthy(typeof result.diagnostics.kidsGoogleBooksQueryReplacementReason !== "undefined", `${fixture.name}: replacement diagnostics should be present`);
}

// Disliked fantasy with liked humor should not force fantasy templates.
{
  const prof = profile("kids", ["humorous"], [], ["friendship"]);
  prof.avoidSignals = [{ value: "fantasy", weight: 1, evidence: ["dislike:fantasy"] }];
  const result = googleBooksQueries(prof);
  assertNotIncludes(result.queries, "children's fantasy picture book", "disliked fantasy should not force a fantasy query template");
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
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
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
}

console.log("PASS kids google books query planning and partial-failure regressions");
