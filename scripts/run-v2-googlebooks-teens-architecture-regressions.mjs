/** Deterministic Teens Google Books pipeline-boundary regressions. */
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
function assertEqual(actual, expected, message) { if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
function assertIncludes(values, expected, message) { if (!Array.isArray(values) || !values.includes(expected)) throw new Error(`${message}: expected ${JSON.stringify(values)} to include ${JSON.stringify(expected)}`); }
function assertNotIncludes(values, unexpected, message) { if (Array.isArray(values) && values.includes(unexpected)) throw new Error(`${message}: did not expect ${JSON.stringify(unexpected)} in ${JSON.stringify(values)}`); }

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../app/recommender-v2");
const { applyTeensGoogleBooksPreScoringGate, buildGoogleBooksAgeBandInfrastructureDiagnostics } = require(resolve(dir, "engine.ts"));
const { buildSearchPlan } = require(resolve(dir, "searchPlan.ts"));
const { scoreCandidates } = require(resolve(dir, "score.ts"));
const { selectRecommendations } = require(resolve(dir, "select.ts"));

const profile = {
  ageBand: "teens", maturityBand: "teens",
  genreFamily: [{ value: "mystery", weight: 2, evidence: ["like:teens:mystery"] }],
  tone: [{ value: "tense", weight: 1, evidence: ["like:teens:tense"] }], pacing: [],
  themes: [{ value: "friendship", weight: 1, evidence: ["like:teens:friendship"] }],
  characterDynamics: [], formatPreference: [{ value: "book", weight: 1, evidence: ["like:teens:book"] }],
  avoidSignals: [], sourceHints: ["googleBooks"], diagnostics: {},
};
function candidate(title, description, overrides = {}) {
  return {
    id: `googleBooks:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, source: "googleBooks", sourceId: title,
    title, creators: ["Fixture Author"], description,
    genres: ["Young Adult Fiction", "Mystery & Detective Stories"], themes: ["friendship"], tones: ["tense"], characterDynamics: [], formats: ["book"],
    publicationYear: 2024, maturityBand: "teens", sourceUrl: `https://books.example/${encodeURIComponent(title)}`,
    raw: { title, description, ageBand: "teens", audienceBand: "teens", maturityRating: "NOT_MATURE", contentMaturity: "not_mature" },
    diagnostics: { queryText: "young adult mystery novel", queryFamily: "mystery", googleBooksAudienceBand: "teens", googleBooksContentMaturity: "not_mature", googleBooksPublicationShape: "novel" },
    ...overrides,
  };
}
const mystery = candidate("The Cipher at Blackwood", "A young adult mystery novel follows Nina as she uncovers a school conspiracy and protects her closest friend.");
const explicitMature = candidate("The Midnight Cipher", "A young adult mystery novel follows Nina through a tense conspiracy.", {
  raw: { title: "The Midnight Cipher", ageBand: "teens", audienceBand: "teens", maturityRating: "MATURE", contentMaturity: "mature" },
  diagnostics: { queryText: "young adult mystery novel", googleBooksAudienceBand: "teens", googleBooksContentMaturity: "mature", googleBooksSourceMaturityRating: "MATURE", googleBooksPublicationShape: "novel" },
});
const explicitAgeReject = candidate("Forbidden Archive", "An erotic pornography novel involving incest and sexual abuse.", { genres: ["Fiction", "Erotica"], themes: [], tones: [] });
const adultRomanceReject = candidate("College Desire", "A sensual new adult college romance from Harlequin.", { genres: ["Romance", "New Adult"], themes: [], tones: [] });
const weakerSuitability = candidate("Clown Hunt", "A contemporary suspense story.", { genres: ["Fiction"], themes: [], tones: [], publicationYear: 1990 });
const kitsu = { ...mystery, id: "kitsu:fixture", source: "kitsu", sourceId: "kitsu-fixture", title: "Kitsu Teen Fixture" };
const input = [mystery, explicitMature, explicitAgeReject, adultRomanceReject, weakerSuitability, kitsu];

const gate = applyTeensGoogleBooksPreScoringGate(input, profile);
const entered = gate.candidates.map((row) => row.title);
for (const allowed of [mystery, explicitMature, weakerSuitability, kitsu]) assertIncludes(entered, allowed.title, `${allowed.title} should cross the Teens pre-scoring boundary`);
for (const rejected of [explicitAgeReject, adultRomanceReject]) assertNotIncludes(entered, rejected.title, `${rejected.title} should be removed before scoring`);
assertEqual(gate.diagnostics.ageSuitabilityScoreByTitle[explicitAgeReject.title], -6, "existing strongest Teen suitability score should be preserved");
assertEqual(gate.diagnostics.ageSuitabilityScoreByTitle[adultRomanceReject.title], -4.5, "existing conclusive Teen suitability threshold should be preserved");
assertEqual(gate.diagnostics.ageSuitabilityScoreByTitle[weakerSuitability.title], -2.5, "weaker Teen suitability signal should remain a scoring/ranking policy");
assertEqual(gate.diagnostics.rejectedBeforeScoringByTitle[explicitMature.title], undefined, "Teen explicit-mature tracking policy should remain non-rejecting");
console.log("PASS: conclusive Teen age rejects are removed before scoring while weaker and explicit-mature policies are preserved");

const scored = scoreCandidates(gate.candidates, profile);
const scoredTitles = scored.map((row) => row.title);
for (const rejected of [explicitAgeReject, adultRomanceReject]) assertNotIncludes(scoredTitles, rejected.title, `${rejected.title} must remain absent downstream`);
assertIncludes(scoredTitles, mystery.title, "Teen narrative candidate should enter scoring");
assertIncludes(scoredTitles, kitsu.title, "Kitsu candidate must be unaffected by the Google Books gate");
const selection = selectRecommendations(scored, profile, 5);
const legacySelection = selectRecommendations(scoreCandidates(input, profile), profile, 5);
assertEqual(selection.selected.length, legacySelection.selected.length, "moving conclusive Teen enforcement earlier must preserve final count");
console.log("PASS: Teen narrative admission, final count, and Kitsu behavior remain stable");

const googleRows = input.filter((row) => row.source === "googleBooks");
const searchPlan = buildSearchPlan(profile, { googleBooks: true });
const sourceResults = [{
  source: "googleBooks", status: "succeeded", rawItems: googleRows.map((row) => row.raw),
  diagnostics: {
    source: "googleBooks", status: "succeeded", planned: true, attempted: true, timedOut: false,
    rawCount: googleRows.length, rawApiResultCount: googleRows.length, normalizedCount: googleRows.length,
    googleBooksQueriesAttempted: ["young adult mystery novel"],
    teensGoogleBooksRejectedBeforeScoringByTitle: gate.diagnostics.rejectedBeforeScoringByTitle,
  },
}];
const lineage = buildGoogleBooksAgeBandInfrastructureDiagnostics({
  profile, searchPlan, sourceResults,
  normalizedCandidates: gate.candidates.filter((row) => row.source === "googleBooks"),
  scoredCandidates: scored.filter((row) => row.source === "googleBooks"),
  selectedCandidates: selection.selected.filter((row) => row.source === "googleBooks"),
  returnedTitles: selection.selected.filter((row) => row.source === "googleBooks").map((row) => row.title),
});
assertEqual(lineage.googleBooksAgeBandDropStageByTitle[explicitAgeReject.title], "age_suitability_rejection", "Teen conclusive rejection should expose its actual stage");
assertNotIncludes(lineage.googleBooksAgeBandScoringHandoffByDeck.teens.scoredTitles, explicitAgeReject.title, "lineage must not report a conclusive reject as scored");
console.log("PASS: Teen diagnostics accurately report pre-scoring enforcement and downstream absence");
console.log("All Teens Google Books architecture regressions passed.");
