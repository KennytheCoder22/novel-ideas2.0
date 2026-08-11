#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const { adultInverseAgeBandEligibility, selectRecommendations } = require(
  resolve("app/recommender-v2/select.ts"),
);
const { normalizeSourceResults } = require(resolve("app/recommender-v2/normalize.ts"));
const { scoreCandidates } = require(resolve("app/recommender-v2/score.ts"));

function profile(ageBand) {
  return {
    ageBand,
    maturityBand: ageBand,
    genreFamily: [{ value: "fantasy", weight: 2, evidence: ["like:fantasy"] }],
    themes: [{ value: "adventure", weight: 1.5, evidence: ["like:adventure"] }],
    tone: [],
    pacing: [],
    characterDynamics: [],
    formatPreference: [{ value: "book", weight: 1, evidence: ["like:book"] }],
    avoidSignals: [],
    sourceHints: ["googleBooks"],
    diagnostics: {},
  };
}

function candidate(title, overrides = {}) {
  return {
    id: `fixture:${title}`,
    source: "mock",
    sourceId: `fixture:${title}`,
    title,
    creators: ["Regression Author"],
    description: "A fantasy adventure novel with magic, friendship, danger, and a quest.",
    formats: ["book"],
    genres: ["Fiction / Fantasy"],
    themes: ["adventure"],
    tones: [],
    characterDynamics: [],
    publicationYear: 2024,
    sourceUrl: `https://example.test/${encodeURIComponent(title)}`,
    coverUrl: "https://example.test/cover.jpg",
    score: 20,
    scoreBreakdown: { base: 1, genreFacetMatch: 10, positiveTasteMatch: 8, sourceQualityRelevance: 1 },
    matchedSignals: ["fantasy", "adventure"],
    rejectedReasons: [],
    diagnostics: {},
    raw: {},
    ...overrides,
  };
}

const adultNovel = candidate("The Adult Fantasy Novel", {
  genres: ["Fiction / Fantasy / Epic"],
  description: "An adult fantasy novel follows a veteran diplomat through war and political intrigue.",
});

const yaAdultCrossover = candidate("The College Between Worlds", {
  genres: ["Young Adult Fiction / Fantasy", "Fiction / Fantasy / Contemporary"],
  description: "A college-age heroine begins university and navigates an adult readership crossover fantasy.",
  diagnostics: { googleBooksAudienceBand: "teens" },
  raw: { audienceBand: "teens" },
});

const yaOnlyNotMature = candidate("The High School Quest", {
  genres: ["Young Adult Fiction / Fantasy"],
  description: "A young adult fantasy follows teens through a high school mystery.",
  diagnostics: {
    googleBooksAudienceBand: "teens",
    googleBooksContentMaturity: "not_mature",
  },
  raw: {
    audienceBand: "teens",
    contentMaturity: "not_mature",
  },
});

const canonicalKidsCandidate = candidate("Juvenile Adventure", {
  source: "nyt",
  maturityBand: "kids",
  raw: { age_group: "Juvenile" },
});

const adultChildrenEditorNovel = candidate("The Children's Editor", {
  genres: ["Fiction / Literary"],
  description: "An adult literary novel about an editor of children's books confronting a family secret.",
  diagnostics: { googleBooksAudienceBand: "adult" },
  raw: { audienceBand: "adult" },
});

const adultProfile = profile("adult");
const [normalizedKnickKnack] = normalizeSourceResults([{
  source: "googleBooks",
  status: "succeeded",
  diagnostics: {
    source: "googleBooks",
    status: "succeeded",
    planned: true,
    attempted: true,
    timedOut: false,
    rawCount: 1,
  },
  rawItems: [{
    id: "googleBooks:chReDwAAQBAJ",
    sourceId: "chReDwAAQBAJ",
    title: "The Knick Knack Nightmare (Perry & Arvin Adventures, Book 2)",
    creators: ["C. M. Bacon"],
    description: "Perry Dobbs, 13, returns in a fantasy adventure perfect for young readers aged 7-15. Parents, this story will captivate your kids.",
    genres: [
      "Young Adult Fiction / Fantasy / Contemporary",
      "Young Adult Fiction / Action & Adventure / General",
      "Young Adult Fiction / Social Themes / Friendship",
      "Young Adult Fiction / Action & Adventure / Survival Stories",
      "Young Adult Fiction / Science Fiction / General",
    ],
    themes: ["adventure", "friendship", "fantasy"],
    formats: ["book"],
    publicationYear: 2017,
    sourceUrl: "https://books.google.com/books?id=chReDwAAQBAJ",
    coverUrl: "https://books.google.com/books/content?id=chReDwAAQBAJ",
    maturityBand: "NOT_MATURE",
    maturityRating: "NOT_MATURE",
    sourceMaturityRating: "NOT_MATURE",
    contentMaturity: "not_mature",
    audienceBand: "teens",
    requestedAgeBand: "adult",
    queryText: "fantasy adventure novel",
    queryFamily: "fantasy",
    queryCascadeIndex: 0,
    googleBooksPublicationShape: "series_installment",
    googleBooksNarrativeConfidence: 7,
    googleBooksStoryLevelNarrativeEvidence: ["series_installment_identity", "plot_setup_description"],
    volumeInfo: {
      categories: ["Young Adult Fiction / Fantasy / Contemporary"],
      description: "Perfect for young readers aged 7-15 and their parents.",
    },
  }],
}]);
const [knickKnack] = scoreCandidates([normalizedKnickKnack], adultProfile);
assert.equal(knickKnack.source, "googleBooks");
assert.equal(knickKnack.diagnostics.googleBooksAudienceBand, "teens");
assert.ok(knickKnack.score > 0, "topical fantasy/adventure signals should make the leaked row competitive before the inverse age gate");

const juvenileAudit = adultInverseAgeBandEligibility(knickKnack, adultProfile);
assert.equal(juvenileAudit.allowed, false);
assert.equal(juvenileAudit.reason, "adult_inverse_age_band_child_preteen_metadata");
assert.ok(juvenileAudit.youthEvidence.some((value) => value.includes("aged 7 15")));
assert.equal(adultInverseAgeBandEligibility(yaOnlyNotMature, adultProfile).allowed, false);
assert.equal(
  adultInverseAgeBandEligibility(yaOnlyNotMature, adultProfile).reason,
  "adult_inverse_age_band_ya_without_adult_crossover_evidence",
);
assert.equal(adultInverseAgeBandEligibility(canonicalKidsCandidate, adultProfile).allowed, false);
assert.equal(adultInverseAgeBandEligibility(adultChildrenEditorNovel, adultProfile).allowed, true);

const selection = selectRecommendations(
  [knickKnack, yaOnlyNotMature, canonicalKidsCandidate, adultNovel, yaAdultCrossover, adultChildrenEditorNovel],
  adultProfile,
  6,
);
assert.ok(!selection.selected.some((item) => item.title === knickKnack.title));
assert.equal(selection.rejectedReasons.adult_inverse_age_band_child_preteen_metadata, 2);
assert.equal(selection.rejectedReasons.adult_inverse_age_band_ya_without_adult_crossover_evidence, 1);
assert.ok(selection.selected.some((item) => item.title === adultNovel.title));
assert.ok(selection.selected.some((item) => item.title === yaAdultCrossover.title));
assert.ok(selection.selected.some((item) => item.title === adultChildrenEditorNovel.title));

for (const ageBand of ["kids", "preteens", "teens"]) {
  const intendedCandidate = candidate(`${ageBand} path control`, {
    genres: ageBand === "teens"
      ? ["Young Adult Fiction / Fantasy"]
      : ageBand === "preteens"
        ? ["Juvenile Fiction / Fantasy", "Middle grade fiction"]
        : ["Juvenile Fiction / Fantasy", "Picture books"],
    description: ageBand === "teens"
      ? "A young adult fantasy set in high school."
      : ageBand === "preteens"
        ? "A middle grade fantasy for readers ages 9-12."
        : "A children's picture book for early readers.",
  });
  const audit = adultInverseAgeBandEligibility(intendedCandidate, profile(ageBand));
  assert.equal(audit.allowed, true);
  assert.equal(audit.reason, "not_adult_request");
  const result = selectRecommendations([intendedCandidate], profile(ageBand), 1);
  assert.equal(result.rejectedReasons.adult_inverse_age_band_child_preteen_metadata || 0, 0);
  assert.equal(result.rejectedReasons.adult_inverse_age_band_ya_without_adult_crossover_evidence || 0, 0);
}

console.log("PASS Adult inverse age-band regressions");
