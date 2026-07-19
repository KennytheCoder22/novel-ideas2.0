/** Deterministic Kids Google Books pipeline-boundary regressions. */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  module._compile(output, filename);
};

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertIncludes(values, expected, message) {
  if (!Array.isArray(values) || !values.includes(expected)) throw new Error(`${message}: expected ${JSON.stringify(values)} to include ${JSON.stringify(expected)}`);
}
function assertNotIncludes(values, unexpected, message) {
  if (Array.isArray(values) && values.includes(unexpected)) throw new Error(`${message}: did not expect ${JSON.stringify(unexpected)} in ${JSON.stringify(values)}`);
}
function assertOneOf(actual, expectedValues, message) {
  if (!expectedValues.includes(actual)) throw new Error(`${message}: expected one of ${JSON.stringify(expectedValues)}, got ${JSON.stringify(actual)}`);
}

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../app/recommender-v2");
const { applyKidsGoogleBooksPreScoringGate, buildGoogleBooksAgeBandInfrastructureDiagnostics } = require(resolve(dir, "engine.ts"));
const { buildSearchPlan } = require(resolve(dir, "searchPlan.ts"));
const { scoreCandidates } = require(resolve(dir, "score.ts"));
const { selectRecommendations } = require(resolve(dir, "select.ts"));

const profile = {
  ageBand: "kids", maturityBand: "kids",
  genreFamily: [{ value: "magic", weight: 2, evidence: ["like:kids:magic"] }],
  tone: [{ value: "warm", weight: 1, evidence: ["like:kids:warm"] }], pacing: [],
  themes: [{ value: "friendship", weight: 1, evidence: ["like:kids:friendship"] }],
  characterDynamics: [], formatPreference: [{ value: "book", weight: 1, evidence: ["like:kids:book"] }],
  avoidSignals: [], sourceHints: ["googleBooks"], diagnostics: {},
};

function candidate(title, description, overrides = {}) {
  return {
    id: `googleBooks:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, source: "googleBooks", sourceId: title,
    title, creators: ["Fixture Author"], description,
    genres: ["Juvenile Fiction", "Picture books", "Fantasy & Magic"], themes: ["friendship"], tones: ["warm"], characterDynamics: [], formats: ["book"],
    publicationYear: 2024, maturityBand: "kids", sourceUrl: `https://books.example/${encodeURIComponent(title)}`,
    raw: { title, description, ageBand: "kids", audienceBand: "kids", maturityRating: "NOT_MATURE", contentMaturity: "not_mature" },
    diagnostics: { queryText: "kids magic picture book", queryFamily: "magic", googleBooksAudienceBand: "kids", googleBooksContentMaturity: "not_mature", googleBooksPublicationShape: "novel" },
    ...overrides,
  };
}

const garden = candidate("Moon Garden Friends", "A warm picture book story follows two friends on a magical garden adventure.");
const narrativeGuide = candidate("A Dragon's Guide to Friendship", "A picture book story follows a young dragon learning friendship through a magical adventure.");
const atlas = candidate("Animal Picture Atlas", "An informational atlas of animal facts, maps, labels, and reference entries.", { genres: ["Juvenile Nonfiction", "Reference", "Atlases"] });
const mature = candidate("Midnight Garden", "A warm picture book story follows friends through a magical garden.", {
  raw: { title: "Midnight Garden", ageBand: "kids", audienceBand: "kids", maturityRating: "MATURE", contentMaturity: "mature" },
  diagnostics: { queryText: "kids magic picture book", googleBooksAudienceBand: "kids", googleBooksContentMaturity: "mature", googleBooksSourceMaturityRating: "MATURE", googleBooksPublicationShape: "novel" },
});
const teenLeakage = candidate("Young Adult Magic Romance", "A young adult romance for teens at college.", { genres: ["Young Adult Fiction", "Romance"] });
const input = [garden, narrativeGuide, atlas, mature, teenLeakage];

const gate = applyKidsGoogleBooksPreScoringGate(input, profile);
const entered = gate.candidates.map((row) => row.title);
assertIncludes(entered, garden.title, "ordinary Kids narrative should enter scoring");
assertIncludes(entered, narrativeGuide.title, "narrative context should bound informational-word rejection");
for (const rejected of [atlas, mature, teenLeakage]) assertNotIncludes(entered, rejected.title, `${rejected.title} should be removed before scoring`);
assertOneOf(
  gate.diagnostics.rejectedBeforeScoringByTitle[atlas.title],
  ["k2_missing_story_picture_reader_relevance", "k2_unknown_or_non_k2_audience_without_credible_k2_evidence"],
  "Kids informational artifact should be rejected by either audience or format gate",
);
assertEqual(gate.diagnostics.rejectedBeforeScoringByTitle[mature.title], "googlebooks_mature_content_not_allowed_for_kids", "Kids maturity policy reason should be preserved");
console.log("PASS: conclusively rejected Kids Google Books artifacts and age-inappropriate rows never enter scoring");

const scored = scoreCandidates(gate.candidates, profile);
const scoredTitles = scored.map((row) => row.title);
assertEqual(scored.length, 2, "only the two narrative candidates should be scored");
for (const rejected of [atlas, mature, teenLeakage]) assertNotIncludes(scoredTitles, rejected.title, `${rejected.title} should remain absent downstream`);
assertIncludes(scoredTitles, narrativeGuide.title, "bounded narrative candidate should reach scoring");
const selection = selectRecommendations(scored, profile, 5);
assertEqual(selection.selected.length, 2, "Kids final recommendation count should remain stable for the safe fixture pool");
assertIncludes(selection.selected.map((row) => row.title), narrativeGuide.title, "bounded narrative candidate should remain selectable");
console.log("PASS: narrative admission, bounded rescue behavior, and final count remain stable");

const legacySelection = selectRecommendations(scoreCandidates(input, profile), profile, 5);
assertEqual(legacySelection.selected.length, selection.selected.length, "moving conclusive enforcement earlier must not change the fixture final count");

// Independent Kids audience/format eligibility: reject obvious Adult/YA even when NOT_MATURE.
{
  const fixtures = [
    candidate("Sandman Vol. 1: Preludes & Nocturnes 30th Anniversary Edition", "A landmark comics collection.", {
      genres: ["Comics & Graphic Novels", "Fantasy"],
      raw: { title: "Sandman Vol. 1: Preludes & Nocturnes 30th Anniversary Edition", maturityRating: "NOT_MATURE", contentMaturity: "not_mature", audienceBand: "unknown" },
      diagnostics: { queryText: "kids fantasy picture book", googleBooksPublicationShape: "novel", googleBooksSourceMaturityRating: "NOT_MATURE" },
    }),
    candidate("Sparks Rise (The Darkest Minds, Book 2.5)", "A young adult novella set in The Darkest Minds world.", {
      genres: ["Young Adult Fiction", "Science Fiction"],
      raw: { title: "Sparks Rise (The Darkest Minds, Book 2.5)", maturityRating: "NOT_MATURE", contentMaturity: "not_mature", audienceBand: "unknown" },
    }),
    candidate("Long Time Gone", "A literary novel of loss and memory.", {
      genres: ["Fiction", "Literary"],
      raw: { title: "Long Time Gone", maturityRating: "NOT_MATURE", contentMaturity: "not_mature", audienceBand: "unknown" },
    }),
    candidate("Academy and Literature", "Critical essays and literary history.", {
      genres: ["Literary Criticism", "History and Criticism"],
      raw: { title: "Academy and Literature", maturityRating: "NOT_MATURE", contentMaturity: "not_mature", audienceBand: "unknown" },
      diagnostics: { queryText: "kids fantasy picture book", googleBooksPublicationShape: "critical_study", googleBooksSourceMaturityRating: "NOT_MATURE" },
    }),
    candidate("Pope to Swinburne", "Poetry and literary criticism.", {
      genres: ["Poetry", "Literary Criticism"],
      raw: { title: "Pope to Swinburne", maturityRating: "NOT_MATURE", contentMaturity: "not_mature", audienceBand: "unknown" },
    }),
    candidate("Adult Literary Fiction with NOT_MATURE", "An adult literary fiction novel.", {
      genres: ["Fiction", "Literary"],
      raw: { title: "Adult Literary Fiction with NOT_MATURE", maturityRating: "NOT_MATURE", contentMaturity: "not_mature", audienceBand: "unknown" },
    }),
    candidate("Adult Graphic Novel via Kids Query", "An acclaimed fantasy graphic novel for adults.", {
      genres: ["Comics & Graphic Novels", "Fantasy"],
      raw: { title: "Adult Graphic Novel via Kids Query", maturityRating: "NOT_MATURE", contentMaturity: "not_mature", audienceBand: "unknown" },
      diagnostics: { queryText: "kids fantasy picture book", googleBooksPublicationShape: "novel", googleBooksSourceMaturityRating: "NOT_MATURE" },
    }),
    candidate("Curious George Home Run (CGTV Early Reader)", "An early reader story about Curious George.", {
      genres: ["Juvenile Fiction", "Early Readers"],
      raw: { title: "Curious George Home Run (CGTV Early Reader)", maturityRating: "NOT_MATURE", contentMaturity: "not_mature", audienceBand: "unknown" },
    }),
    candidate("Curious George Librarian for a Day (CGTV Early Reader)", "Curious George helps at the library in this early reader.", {
      genres: ["Juvenile Fiction", "Early Readers"],
      raw: { title: "Curious George Librarian for a Day (CGTV Early Reader)", maturityRating: "NOT_MATURE", contentMaturity: "not_mature", audienceBand: "unknown" },
    }),
    candidate("The Farm Next Door", "A short story description.", {
      genres: ["Fiction"],
      raw: { title: "The Farm Next Door", maturityRating: "NOT_MATURE", contentMaturity: "not_mature", audienceBand: "unknown" },
    }),
    candidate("The Actual One", "A short literary description.", {
      genres: ["Fiction"],
      raw: { title: "The Actual One", maturityRating: "NOT_MATURE", contentMaturity: "not_mature", audienceBand: "unknown" },
    }),
    candidate("A Duet for Home", "A short literary description.", {
      genres: ["Fiction"],
      raw: { title: "A Duet for Home", maturityRating: "NOT_MATURE", contentMaturity: "not_mature", audienceBand: "unknown" },
    }),
  ];

  const gate = applyKidsGoogleBooksPreScoringGate(fixtures, profile);
  const entered = new Set(gate.candidates.map((row) => row.title));
  for (const rejectedTitle of [
    "Sandman Vol. 1: Preludes & Nocturnes 30th Anniversary Edition",
    "Sparks Rise (The Darkest Minds, Book 2.5)",
    "Long Time Gone",
    "Academy and Literature",
    "Pope to Swinburne",
    "Adult Literary Fiction with NOT_MATURE",
    "Adult Graphic Novel via Kids Query",
    "The Farm Next Door",
    "The Actual One",
    "A Duet for Home",
  ]) {
    if (entered.has(rejectedTitle)) throw new Error(`${rejectedTitle} should be rejected by independent Kids audience/format eligibility`);
  }
  for (const acceptedTitle of [
    "Curious George Home Run (CGTV Early Reader)",
    "Curious George Librarian for a Day (CGTV Early Reader)",
  ]) {
    if (!entered.has(acceptedTitle)) throw new Error(`${acceptedTitle} should pass independent Kids audience/format eligibility`);
  }
  assertEqual(
    gate.diagnostics.inferredAudienceBandByTitle["Adult Literary Fiction with NOT_MATURE"],
    "unknown",
    "NOT_MATURE alone must not establish kids audience",
  );
  assertEqual(
    gate.diagnostics.rejectedBeforeScoringByTitle["Adult Literary Fiction with NOT_MATURE"],
    "k2_unknown_or_non_k2_audience_without_credible_k2_evidence",
    "unknown audience without strong K-2 evidence should fail closed",
  );
}

const searchPlan = buildSearchPlan(profile, { googleBooks: true });
const sourceResults = [{
  source: "googleBooks", status: "succeeded", rawItems: input.map((row) => row.raw),
  diagnostics: {
    source: "googleBooks", status: "succeeded", planned: true, attempted: true, timedOut: false,
    rawCount: input.length, rawApiResultCount: input.length, normalizedCount: input.length,
    googleBooksQueriesAttempted: ["kids magic picture book"],
    kidsGoogleBooksRejectedBeforeScoringByTitle: gate.diagnostics.rejectedBeforeScoringByTitle,
  },
}];
const lineage = buildGoogleBooksAgeBandInfrastructureDiagnostics({
  profile, searchPlan, sourceResults, normalizedCandidates: gate.candidates, scoredCandidates: scored, selectedCandidates: selection.selected,
  returnedTitles: selection.selected.map((row) => row.title),
});
assertEqual(lineage.googleBooksAgeBandDropStageByTitle[atlas.title], "age_suitability_rejection", "Kids artifact lineage should identify its enforcement boundary");
assertEqual(lineage.googleBooksAgeBandDropStageByTitle[mature.title], "age_suitability_rejection", "Kids mature lineage should identify its enforcement boundary");
assertNotIncludes(lineage.googleBooksAgeBandScoringHandoffByDeck.kids.scoredTitles, atlas.title, "lineage must not claim rejected artifacts were scored");
console.log("PASS: Kids diagnostics accurately report pre-scoring enforcement and downstream absence");

// Collection/bundle identity gate fixtures
{
  const bundleFixtures = [
    candidate("Kid Ebooks With Fun Stories & Kid Jokes", "A collection of fun stories and kid jokes.", {
      genres: ["Juvenile Fiction"],
      raw: { title: "Kid Ebooks With Fun Stories & Kid Jokes", maturityRating: "NOT_MATURE", contentMaturity: "not_mature", audienceBand: "unknown", categories: ["Juvenile Fiction"], description: "Fun stories and picture book collection for kids." },
      diagnostics: { queryText: "kids magic picture book", queryFamily: "magic", googleBooksAudienceBand: "kids", googleBooksContentMaturity: "not_mature", googleBooksPublicationShape: "novel", googleBooksSourceMaturityRating: "NOT_MATURE" },
    }),
    candidate("10 Picture Books for Kids", "Ten picture books for children.", {
      genres: ["Juvenile Fiction"],
      raw: { title: "10 Picture Books for Kids", maturityRating: "NOT_MATURE", contentMaturity: "not_mature", audienceBand: "unknown", categories: ["Juvenile Fiction"] },
      diagnostics: { queryText: "kids magic picture book", queryFamily: "magic", googleBooksAudienceBand: "kids", googleBooksContentMaturity: "not_mature", googleBooksPublicationShape: "novel" },
    }),
    candidate("Curious George Home Run (CGTV Early Reader)", "Curious George helps the team win.", {
      genres: ["Juvenile Fiction", "Early Readers"],
      raw: { title: "Curious George Home Run (CGTV Early Reader)", maturityRating: "NOT_MATURE", contentMaturity: "not_mature", audienceBand: "unknown", categories: ["Juvenile Fiction", "Early Readers"], description: "Curious George helps the team." },
      diagnostics: { queryText: "kids magic picture book", queryFamily: "magic", googleBooksAudienceBand: "kids", googleBooksContentMaturity: "not_mature", googleBooksPublicationShape: "novel" },
    }),
  ];

  const bundleGate = applyKidsGoogleBooksPreScoringGate(bundleFixtures.map((f) => ({ ...f, source: "googleBooks" })), profile);
  const bundleEntered = new Set(bundleGate.candidates.map((r) => r.title));

  if (bundleEntered.has("Kid Ebooks With Fun Stories & Kid Jokes")) throw new Error("Kid Ebooks With Fun Stories & Kid Jokes should be rejected by collection/bundle identity gate");
  if (bundleEntered.has("10 Picture Books for Kids")) throw new Error("10 Picture Books for Kids should be rejected as a numbered books catalog");

  const kidEbooksReason = bundleGate.diagnostics.rejectedBeforeScoringByTitle["Kid Ebooks With Fun Stories & Kid Jokes"] || "";
  if (!kidEbooksReason.includes("k2_collection_or_bundle")) throw new Error(`Kid Ebooks rejection reason should contain k2_collection_or_bundle, got: ${kidEbooksReason}`);

  if (!bundleEntered.has("Curious George Home Run (CGTV Early Reader)")) {
    throw new Error("Curious George Home Run should still pass Kids pre-scoring gate");
  }

  console.log("PASS: Kids Google Books collection/bundle identity gate rejects bundles and accepts single publications");
}

console.log("All Kids Google Books architecture regressions passed.");
