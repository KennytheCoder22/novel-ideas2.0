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
assertEqual(gate.diagnostics.rejectedBeforeScoringByTitle[atlas.title], "k2_missing_story_picture_reader_relevance", "existing Kids artifact classification reason should be preserved");
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
console.log("All Kids Google Books architecture regressions passed.");
