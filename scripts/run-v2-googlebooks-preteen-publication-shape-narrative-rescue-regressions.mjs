/**
 * Production regressions for the Pre-Teen Google Books unknown-shape narrative rescue.
 */
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
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(values, expected, message) {
  if (!Array.isArray(values) || !values.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(values)} to include ${JSON.stringify(expected)}`);
  }
}

function assertNotIncludes(values, unexpected, message) {
  if (Array.isArray(values) && values.includes(unexpected)) {
    throw new Error(`${message}: expected ${JSON.stringify(values)} not to include ${JSON.stringify(unexpected)}`);
  }
}

function googleBook(id, title, description, categories, overrides = {}) {
  return {
    kind: "books#volume",
    id,
    volumeInfo: {
      title,
      subtitle: overrides.subtitle || undefined,
      authors: overrides.authors || ["Regression Author"],
      description: description || undefined,
      categories,
      publisher: overrides.publisher === undefined ? "Regression Press" : overrides.publisher,
      publishedDate: String(overrides.publicationYear || 2024),
      pageCount: overrides.pageCount || 224,
      printType: overrides.printType || "BOOK",
      language: "en",
      industryIdentifiers: overrides.isbnPresent === false
        ? []
        : [{ type: "ISBN_13", identifier: `978000000${id.padStart(4, "0")}` }],
    },
  };
}

const clearNovelTitle = "The Clockwork Cave";
const samplerQuestTitle = "The Sampler's Quest";
const crookedOakTitle = "The Crooked Oak Mysteries (5) \u2013 The Creatures of Killburn Mine";
const coverForMurderTitle = "A Cover for Murder (The Bookstore Mystery Series)";
const midnightMapTitle = "The Midnight Map";
const writingGuideTitle = "How to Write Your First Mystery";
const schoolPublicationTitle = "School Publication";
const samplerTitle = "Awesome Adventures for Kids Middle Grade Sampler";
const libraryListTitle = "List of Books for School Libraries in the State of Wisconsin";
const anthologyTitle = "Middle Grade Mystery Anthology";
const ambiguousTitle = "The Secret of Black Hollow (3)";
const sparseTitleOnlyTitle = "Mystery Series";
const nonfictionReferenceTitle = "The Mystery of Writing History: A Reference Guide";

const fixtures = [
  googleBook(
    "1",
    clearNovelTitle,
    "A middle grade fantasy novel follows Mira through a hidden cave where she must save her friends, uncover an ancient secret, and survive a dangerous magical quest.",
    ["Juvenile Fiction / Fantasy & Magic", "Juvenile Fiction / Action & Adventure", "Middle grade fiction"],
    { publisher: "Scholastic" },
  ),
  googleBook(
    "2",
    samplerQuestTitle,
    "A middle grade fantasy novel follows Sampler, a clever apprentice, as she must protect her friends, solve an ancient mystery, and survive a magical quest.",
    ["Juvenile Fiction / Fantasy & Magic", "Juvenile Fiction / Action & Adventure"],
    { publisher: "Scholastic" },
  ),
  googleBook(
    "3",
    crookedOakTitle,
    "",
    ["Juvenile Fiction / Mysteries & Detective Stories", "Middle grade fiction"],
    { publisher: "BookLife Publishing", pageCount: 176 },
  ),
  googleBook(
    "4",
    coverForMurderTitle,
    "Twelve-year-old Ava must solve a murder at her family bookstore.",
    ["Juvenile Fiction / Mysteries & Detective Stories"],
    { publisher: "Scholastic", pageCount: 208 },
  ),
  googleBook(
    "5",
    midnightMapTitle,
    "",
    ["Juvenile Fiction / Fantasy & Magic", "Middle grade fiction"],
    { publisher: "Scholastic", pageCount: 192 },
  ),
  googleBook(
    "6",
    writingGuideTitle,
    "A writing guide with plotting exercises, character worksheets, and classroom instruction for young mystery writers.",
    ["Language Arts & Disciplines / Writing", "Education"],
    { publisher: "Young Writers Press", pageCount: 128 },
  ),
  googleBook(
    "7",
    schoolPublicationTitle,
    "A school publication of classroom reports, student essays, school news, and educational material.",
    ["Education / Schools", "Juvenile Nonfiction"],
    { publisher: "School Publications Office", pageCount: 96 },
  ),
  googleBook(
    "8",
    samplerTitle,
    "A free middle grade sampler with preview chapters, excerpts, and sneak peeks from upcoming adventure books.",
    ["Juvenile Fiction / Action & Adventure"],
    { publisher: "Kids Preview Press", pageCount: 64 },
  ),
  googleBook(
    "9",
    libraryListTitle,
    "An institutional catalog and book list prepared for school libraries, educators, and collection purchasing.",
    ["Reference / Bibliographies", "Education / Library & Information Science"],
    { publisher: "Wisconsin Department of Public Instruction", pageCount: 144 },
  ),
  googleBook(
    "10",
    anthologyTitle,
    "An anthology collecting middle grade mystery stories by multiple authors for young readers.",
    ["Juvenile Fiction / Mysteries & Detective Stories", "Fiction / Anthologies"],
    { publisher: "Young Readers Press", authors: ["Regression Editor"], pageCount: 320 },
  ),
  googleBook(
    "11",
    ambiguousTitle,
    "",
    [],
    { publisher: "", pageCount: 160, isbnPresent: false },
  ),
  googleBook(
    "12",
    sparseTitleOnlyTitle,
    "",
    [],
    { publisher: "Regression Press", pageCount: 180 },
  ),
  googleBook(
    "13",
    nonfictionReferenceTitle,
    "A nonfiction reference work about the history and craft of mystery fiction, with definitions, examples, and study material.",
    ["Reference", "Literary Criticism", "Juvenile Nonfiction"],
    { publisher: "Education Reference Press", pageCount: 256 },
  ),
];

globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ totalItems: fixtures.length, items: fixtures }),
});

const { googleBooksSourceAdapter } = require(resolve("app/recommender-v2/sources/googleBooksSource.ts"));
const { runRecommenderV2 } = require(resolve("app/recommender-v2/engine.ts"));

const profile = {
  ageBand: "preteens",
  maturityBand: "preteens",
  genreFamily: [
    { value: "fantasy", weight: 3, evidence: ["like:fixture"] },
    { value: "adventure", weight: 2, evidence: ["like:fixture"] },
  ],
  tone: [],
  pacing: [],
  themes: [{ value: "friendship", weight: 1, evidence: ["like:fixture"] }],
  characterDynamics: [],
  formatPreference: [{ value: "book", weight: 1, evidence: ["like:fixture"] }],
  avoidSignals: [],
  sourceHints: ["googleBooks"],
  diagnostics: {},
};
const plan = {
  source: "googleBooks",
  enabled: true,
  timeoutMs: 5000,
  intents: [{ id: "preteen-rescue", query: "middle grade fantasy adventure fiction", facets: ["fantasy", "adventure"] }],
};

const sourceResult = await googleBooksSourceAdapter.search(plan, { profile });
const sourceDiagnostics = sourceResult.diagnostics;
const sourceOutputTitles = sourceResult.rawItems.map((row) => row.title);
const rescuedTitles = [crookedOakTitle, coverForMurderTitle, midnightMapTitle];
const originalPassTitles = [clearNovelTitle, samplerQuestTitle];

assertEqual(sourceOutputTitles, [...originalPassTitles, ...rescuedTitles], "Only original narrative controls and three corroborated rescues should reach normalization");
assertEqual(sourceDiagnostics.preteenGoogleBooksPublicationShapeRescuedTitles, rescuedTitles, "Exactly three audited false rejects should be rescued");

for (const title of rescuedTitles) {
  assertEqual(sourceDiagnostics.preteenGoogleBooksPublicationShapeRescueAppliedByTitle[title], true, `${title} should apply rescue`);
  assertEqual(
    sourceDiagnostics.preteenGoogleBooksPublicationShapeRescueReasonByTitle[title],
    "preteen_unknown_shape_rescued_by_corroborated_narrative_identity",
    `${title} should expose the stable rescue reason`,
  );
  const evidence = sourceDiagnostics.preteenGoogleBooksPublicationShapeRescueEvidenceByTitle[title] || [];
  if (evidence.length < 2) throw new Error(`${title} should have at least two independent evidence families`);
}

const rejectedControls = [
  writingGuideTitle,
  schoolPublicationTitle,
  samplerTitle,
  libraryListTitle,
  anthologyTitle,
  ambiguousTitle,
  sparseTitleOnlyTitle,
  nonfictionReferenceTitle,
];
for (const title of rejectedControls) {
  assertNotIncludes(sourceOutputTitles, title, `${title} should remain rejected before scoring`);
  assertIncludes(sourceDiagnostics.preteenGoogleBooksPublicationShapeRescueRejectedTitles, title, `${title} should expose a rescue rejection`);
}
assertEqual(
  sourceDiagnostics.preteenGoogleBooksPublicationShapeRescueRejectedReasonByTitle[ambiguousTitle],
  "preteen_identity_not_rescuable_narrative",
  "Title-only ambiguous record should fail narrative identity",
);
assertEqual(
  sourceDiagnostics.preteenGoogleBooksPublicationShapeRescueRejectedReasonByTitle[sparseTitleOnlyTitle],
  "preteen_identity_not_rescuable_narrative",
  "Mystery/series title words alone should not rescue",
);
assertEqual(
  sourceDiagnostics.preteenGoogleBooksPublicationShapeRescueRejectedReasonByTitle[anthologyTitle],
  "not_rescuable_unknown_shape_reason",
  "Anthology should remain outside unknown-shape rescue scope",
);
assertEqual(sourceDiagnostics.preteenGoogleBooksPublicationShapeRescueSummary.automaticFinalAcceptance, false, "Source rescue must not grant final acceptance");
assertEqual(sourceDiagnostics.preteenGoogleBooksPublicationShapeRescueSummary.otherAgeBandsChanged, false, "Other age bands must remain unchanged");

for (const ageBand of ["kids", "teens", "adult"]) {
  const otherResult = await googleBooksSourceAdapter.search(plan, {
    profile: { ...profile, ageBand, maturityBand: ageBand },
  });
  assertEqual(otherResult.diagnostics.preteenGoogleBooksPublicationShapeRescuedTitles, [], `${ageBand} must not apply Pre-Teen rescue`);
  for (const title of rescuedTitles) {
    assertNotIncludes(otherResult.rawItems.map((row) => row.title), title, `${ageBand} should retain the shared publication-shape rejection for ${title}`);
  }
}

const engineResult = await runRecommenderV2({
  requestId: "preteen-googlebooks-publication-shape-narrative-rescue",
  ageBand: "preteens",
  limit: 1,
  enabledSources: {
    mock: false,
    googleBooks: true,
    openLibrary: false,
    kitsu: false,
    comicVine: false,
    localLibrary: false,
    nyt: false,
  },
  signals: [
    { action: "like", title: clearNovelTitle, genres: ["Middle Grade Fantasy", "Adventure"], tags: ["fantasy", "adventure", "friendship", "magic"] },
    { action: "like", title: samplerQuestTitle, genres: ["Middle Grade Fantasy"], tags: ["fantasy", "adventure", "magic"] },
  ],
});
const engineSourceDiagnostics = (engineResult.diagnostics.sources || []).find((source) => source.source === "googleBooks") || {};
const selectedTitles = engineResult.items.map((item) => item.title);

for (const title of rescuedTitles) {
  assertIncludes(engineSourceDiagnostics.preteenGoogleBooksPublicationShapeRescueEnteredScoringTitles, title, `${title} should enter scoring`);
}
assertEqual(engineSourceDiagnostics.preteenGoogleBooksPublicationShapeRescueSelectedTitles, [], "Rescued fixtures should not be force-selected in the deterministic slate");
assertEqual(selectedTitles.length, 1, "Rescue should not change the one-item deterministic recommendation count");
assertIncludes(originalPassTitles, selectedTitles[0], "An original strong narrative control should win the one-item slate");
for (const title of rescuedTitles) {
  assertEqual(
    engineSourceDiagnostics.preteenGoogleBooksPublicationShapeRescueNotSelectedReasonByTitle[title],
    "ranked_below_final_selection",
    `${title} should expose downstream non-selection`,
  );
}
assertEqual(engineSourceDiagnostics.preteenGoogleBooksPublicationShapeRescueSummary.scoringCandidateCountChange, 3, "Rescue should add three scoring candidates");
assertEqual(engineSourceDiagnostics.preteenGoogleBooksPublicationShapeRescueSummary.finalRecommendationCountChange, 0, "Rescue should add no final recommendations in this fixture");

console.log(JSON.stringify({
  name: "preteen google books publication shape narrative rescue regressions",
  pass: true,
  sourceOutputTitles,
  rescuedTitles: sourceDiagnostics.preteenGoogleBooksPublicationShapeRescuedTitles,
  rejectedControls,
  enteredScoringTitles: engineSourceDiagnostics.preteenGoogleBooksPublicationShapeRescueEnteredScoringTitles,
  selectedRescuedTitles: engineSourceDiagnostics.preteenGoogleBooksPublicationShapeRescueSelectedTitles,
  finalSelectedTitles: selectedTitles,
  rescueSummary: engineSourceDiagnostics.preteenGoogleBooksPublicationShapeRescueSummary,
}, null, 2));
