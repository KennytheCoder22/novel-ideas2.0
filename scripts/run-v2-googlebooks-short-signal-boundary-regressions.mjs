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

function assertTruthy(value, message) {
  if (!value) throw new Error(`${message}: expected truthy, got ${JSON.stringify(value)}`);
}

function assertFalsy(value, message) {
  if (value) throw new Error(`${message}: expected falsy, got ${JSON.stringify(value)}`);
}

function assertIncludes(values, expected, message) {
  if (!Array.isArray(values) || !values.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(values)} to include ${JSON.stringify(expected)}`);
  }
}

function assertNotIncludes(values, expected, message) {
  if (Array.isArray(values) && values.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(values)} not to include ${JSON.stringify(expected)}`);
  }
}

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../app/recommender-v2");
const { scoreCandidates } = require(resolve(dir, "score.ts"));
const { selectRecommendations } = require(resolve(dir, "select.ts"));

function profile(likedSignals, dislikedSignals = []) {
  return {
    ageBand: "adult",
    maturityBand: "adult",
    genreFamily: likedSignals.map((value) => ({ value, weight: 1, evidence: [`like:${value}`] })),
    tone: [],
    pacing: [],
    themes: [],
    characterDynamics: [],
    formatPreference: [],
    avoidSignals: dislikedSignals.map((value) => ({ value, weight: 1, evidence: [`dislike:${value}`] })),
    sourceHints: ["googleBooks"],
    diagnostics: {},
  };
}

function googleBooksCandidate(title, description, genres = ["Fiction / Thrillers / Suspense"]) {
  return {
    id: `gb-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    source: "googleBooks",
    sourceId: title,
    title,
    subtitle: "",
    creators: ["Regression Author"],
    description,
    formats: ["book"],
    genres,
    themes: [],
    tones: [],
    characterDynamics: [],
    maturityBand: "adult",
    publicationYear: 2024,
    sourceUrl: "https://books.google.example/regression",
    raw: {
      publisher: "Regression House",
      volumeInfo: {
        publisher: "Regression House",
        publishedDate: "2024",
        categories: genres,
        maturityRating: "NOT_MATURE",
        printType: "BOOK",
        language: "en",
      },
    },
    diagnostics: {
      googleBooksPublicationShape: "novel",
      googleBooksPublicationShapeEvidence: ["regression_novel_fixture"],
      googleBooksPublicationShapePrecedenceDecision: "novel_supported_by_story_level_evidence",
      googleBooksStoryLevelNarrativeEvidence: ["narrative_synopsis"],
      queryText: "science fiction thriller",
      queryFamily: "speculative",
      facets: ["ai", "thriller"],
    },
  };
}

function scoredFor(likedSignals, candidate, dislikedSignals = []) {
  return scoreCandidates([candidate], profile(likedSignals, dislikedSignals))[0];
}

function likedSignals(scored) {
  return scored.diagnostics?.metadataBackedMatchedLikedSignals || [];
}

function dislikedSignals(scored) {
  return scored.diagnostics?.metadataBackedMatchedDislikedSignals || [];
}

function rejectedShortMatches(scored) {
  return scored.diagnostics?.adultGoogleBooksRejectedShortSignalMatches || [];
}

function acceptedMethods(scored, signal) {
  return scored.diagnostics?.adultGoogleBooksSignalMatchMethod?.[signal] || [];
}

// Short signal boundary: "ai" must not match inside unrelated words.
{
  const candidate = googleBooksCandidate(
    "False Short Substrings",
    "The captain said that against certain odds the trail disappeared, yet everyone remained calm.",
  );
  const scored = scoredFor(["ai"], candidate);
  assertNotIncludes(likedSignals(scored), "ai", "embedded ai substrings must not produce liked evidence");
  assertTruthy(rejectedShortMatches(scored).some((entry) => entry.normalizedSignal === "ai" && entry.matchedText.toLowerCase() === "captain"), "captain should be recorded as rejected ai substring evidence");
  assertTruthy(rejectedShortMatches(scored).some((entry) => entry.normalizedSignal === "ai" && entry.matchedText.toLowerCase() === "said"), "said should be recorded as rejected ai substring evidence");
}

{
  const candidate = googleBooksCandidate(
    "False Avoid Substrings",
    "The captain said that the trail disappeared against the ridge.",
  );
  const scored = scoredFor(["thriller"], candidate, ["ai"]);
  assertNotIncludes(dislikedSignals(scored), "ai", "embedded ai substrings must not produce avoid evidence");
  assertTruthy(rejectedShortMatches(scored).some((entry) => entry.normalizedSignal === "ai" && entry.signalBucket === "avoidSignals"), "rejected avoid-side ai substring should be diagnosed");
}

// Exact, punctuation, hyphen, and approved alias forms for "ai" still match.
for (const [index, [description, method]] of [
  ["An AI system begins to make impossible choices.", "unicode_token_boundary"],
  ["An A.I. experiment begins to make impossible choices.", "punctuated_acronym_token"],
  ["An AI-driven thriller follows a runaway system.", "unicode_token_boundary"],
  ["An artificial intelligence begins to make impossible choices.", "approved_alias_phrase"],
].entries()) {
  const title = `Valid Intelligence Case ${index + 1}`;
  const scored = scoredFor(["ai"], googleBooksCandidate(title, description));
  assertIncludes(likedSignals(scored), "ai", `${title} should preserve valid ai evidence`);
  assertIncludes(acceptedMethods(scored, "ai"), method, `${title} should report ${method}`);
}

const shortSignalCases = [
  { signal: "tv", valid: "A TV producer uncovers a conspiracy.", invalid: "The outvoted juror uncovers a conspiracy." },
  { signal: "rpg", valid: "A tabletop RPG designer uncovers a conspiracy.", invalid: "A warpgate engineer uncovers a conspiracy." },
  { signal: "war", valid: "A war changes a divided family.", invalid: "A warmhearted neighbor changes a divided family." },
  { signal: "art", valid: "An art thief changes a divided family.", invalid: "A party guest changes a divided family." },
  { signal: "spy", valid: "A spy crosses a divided city.", invalid: "A crispy clue changes a divided family." },
];

for (const [index, { signal, valid, invalid }] of shortSignalCases.entries()) {
  const validScored = scoredFor([signal], googleBooksCandidate(`Valid ${signal}`, valid));
  assertIncludes(likedSignals(validScored), signal, `${signal} should match as an exact token`);

  const invalidScored = scoredFor([signal], googleBooksCandidate(`Invalid Short Case ${index + 1}`, invalid));
  assertNotIncludes(likedSignals(invalidScored), signal, `${signal} should not match inside another word`);
  assertTruthy(rejectedShortMatches(invalidScored).some((entry) => entry.normalizedSignal === signal), `${signal} rejected substring should be diagnosed`);
}

// Existing multiword and alias semantics for longer signals are unchanged.
for (const signal of ["science fiction", "psychological thriller", "dark fantasy"]) {
  const scored = scoredFor([signal], googleBooksCandidate(`Valid ${signal}`, `A ${signal} novel follows a dangerous investigation.`));
  assertIncludes(likedSignals(scored), signal, `${signal} should still match as a multiword signal`);
}

{
  const scored = scoredFor(["rpg"], googleBooksCandidate("Role Playing Game", "A role-playing game writer is pulled into a conspiracy."));
  assertIncludes(likedSignals(scored), "rpg", "role-playing game should remain an approved rpg alias");
}

// Trace aggregation should expose the scorer's actual Adult Google Books match decisions.
{
  const candidate = googleBooksCandidate("Trace Candidate", "An AI-driven thriller follows a detective.");
  const scored = scoredFor(["ai", "thriller"], candidate);
  const { rejectedReasons } = selectRecommendations([scored], profile(["ai", "thriller"]), 1);
  assertTruthy(rejectedReasons.adultGoogleBooksSignalMatchTraceByTitle?.["Trace Candidate"]?.length > 0, "selection diagnostics should include signal trace by title");
  assertIncludes(Object.keys(rejectedReasons.adultGoogleBooksSignalMatchedFieldByTitle?.["Trace Candidate"] || {}), "ai", "selection diagnostics should include matched fields by signal");
}

// Representative false-positive titles lose false ai evidence when metadata only contains embedded substrings.
for (const [title, description] of [
  ["Psycho Thrill - Girl in the Well", "The captain said the trail disappeared during the investigation."],
  ["Girl, Erased (An Ella Dark FBI Suspense Thriller-Book 6)", "Ella remained against all odds when the trail disappeared."],
  ["Dark Sanctuary", "A captain remained in a certain sanctuary after the trail disappeared."],
  ["In the Dark", "The captain said the trail disappeared against the storm."],
]) {
  const scored = scoredFor(["ai"], googleBooksCandidate(title, description));
  assertNotIncludes(likedSignals(scored), "ai", `${title} should lose false ai evidence`);
  assertTruthy(rejectedShortMatches(scored).some((entry) => entry.normalizedSignal === "ai"), `${title} should report rejected ai substrings`);
}

console.log("Adult Google Books short-signal boundary regressions passed");
