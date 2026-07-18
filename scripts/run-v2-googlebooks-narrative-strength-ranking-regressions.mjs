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

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTruthy(value, message) {
  if (!value) throw new Error(`${message}: expected truthy, got ${JSON.stringify(value)}`);
}

const {
  adultGoogleBooksIdentityEnforcement,
  adultGoogleBooksNarrativeStrength,
  selectRecommendations,
} = require(resolve("app/recommender-v2/select.ts"));

function candidate({
  id,
  title,
  description,
  score,
  authors,
}) {
  return {
    id: `googleBooks:${id}`,
    source: "googleBooks",
    sourceId: id,
    title,
    subtitle: "A Novel",
    creators: authors,
    description,
    formats: ["book"],
    genres: ["Fiction / Mystery & Detective", "Fiction / Thrillers / Suspense"],
    themes: [],
    tones: [],
    characterDynamics: [],
    publicationYear: 2024,
    sourceUrl: "",
    raw: {
      id,
      volumeInfo: {
        title,
        subtitle: "A Novel",
        authors,
        description,
        categories: ["Fiction / Mystery & Detective", "Fiction / Thrillers / Suspense"],
        publisher: "Regression House",
        publishedDate: "2024",
        pageCount: 336,
        printType: "BOOK",
        language: "en",
        industryIdentifiers: [{ type: "ISBN_13", identifier: "9780000000000" }],
      },
    },
    diagnostics: {
      googleBooksPublicationShape: "novel",
      googleBooksPublicationShapeEvidence: ["novel_or_narrative_fiction_shape"],
      googleBooksPublicationShapePrecedenceDecision: "novel_supported_by_story_level_evidence",
      googleBooksStoryLevelNarrativeEvidence: ["plot_setup_description", "character_event_conflict_description"],
      googleBooksNarrativeConfidence: 0.86,
      positiveTasteScore: 6,
      sourceQualityScore: 2,
      metadataBackedMatchedLikedSignals: ["mystery", "thriller"],
      metadataBackedMatchedDislikedSignals: [],
    },
    score,
    matchedSignals: ["mystery", "thriller"],
    rejectedReasons: [],
    scoreBreakdown: {
      base: 1,
      genreFacetMatch: 3,
      positiveTasteMatch: 2,
      sourceQualityRelevance: 2,
      queryRungBonus: 0.4,
      ageTeenSuitability: 0,
      ageBandSuitability: 0,
      avoidSignalPenalty: 0,
      broadAvoidSignalPenalty: 0,
    },
  };
}

const sparseHigherBase = candidate({
  id: "sparse-higher-base",
  title: "Sparse Case",
  authors: ["Regression Author One"],
  score: 8.25,
  description: "A detective investigates a murder in this mystery thriller novel.",
});

const richLowerBase = candidate({
  id: "rich-lower-base",
  title: "River of Knives",
  authors: ["Regression Author Two"],
  score: 8,
  description: "Detective Mara Vale returns to a storm-battered island city after her sister vanishes and a body washes ashore near the old ferry terminal. When the local police close ranks, Mara must uncover a conspiracy linking the murder to a decades-old family betrayal, confront the killer stalking the harbor, and decide whether saving the town is worth exposing the secret that destroyed her home.",
});

const profile = {
  ageBand: "adult",
  genreFamily: [{ value: "mystery", weight: 1 }, { value: "thriller", weight: 1 }],
  tone: [],
  themes: [],
  characterDynamics: [],
  formatPreference: [],
  avoidSignals: [],
  diagnostics: {},
};

const sparseStrength = adultGoogleBooksNarrativeStrength(sparseHigherBase);
const richStrength = adultGoogleBooksNarrativeStrength(richLowerBase);
assertTruthy(richStrength.score > sparseStrength.score, "richer narrative metadata should receive stronger narrative-strength score");

assertEqual(adultGoogleBooksIdentityEnforcement(sparseHigherBase).decision, "accepted", "sparse eligible novel identity should remain accepted");
assertEqual(adultGoogleBooksIdentityEnforcement(richLowerBase).decision, "accepted", "rich eligible novel identity should remain accepted");

const selected = selectRecommendations([sparseHigherBase, richLowerBase], profile, 2).selected.map((item) => item.title);
assertEqual(selected.length, 2, "both eligible candidates should remain selected");
assertEqual(selected[0], "River of Knives", "narrative-strength layer should improve ordering among eligible candidates");
assertEqual(selected[1], "Sparse Case", "higher base score candidate should remain eligible but rank below richer narrative metadata");

assertTruthy(Number(richLowerBase.diagnostics.adultGoogleBooksNarrativeStrengthRankDelta || 0) > 0, "rich candidate should move up in diagnostics");
assertTruthy(Number(sparseHigherBase.diagnostics.adultGoogleBooksNarrativeStrengthRankDelta || 0) < 0, "sparse candidate should move down in diagnostics");
assertEqual(Boolean(richLowerBase.diagnostics.adultGoogleBooksNarrativeStrengthApplied), true, "rich eligible candidate should have narrative-strength ranking applied");
assertEqual(Boolean(sparseHigherBase.diagnostics.adultGoogleBooksNarrativeStrengthApplied), true, "sparse eligible candidate should have narrative-strength ranking applied");

console.log(JSON.stringify({
  name: "adult google books narrative-strength ranking regressions",
  pass: true,
  selected,
  strengths: {
    "Sparse Case": sparseStrength,
    "River of Knives": richStrength,
  },
  rankDeltas: {
    "Sparse Case": sparseHigherBase.diagnostics.adultGoogleBooksNarrativeStrengthRankDelta,
    "River of Knives": richLowerBase.diagnostics.adultGoogleBooksNarrativeStrengthRankDelta,
  },
}, null, 2));
