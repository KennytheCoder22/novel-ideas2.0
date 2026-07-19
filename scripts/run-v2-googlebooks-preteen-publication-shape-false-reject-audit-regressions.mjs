/**
 * Diagnostic-only regression for Pre-Teen Google Books publication-shape false rejects.
 * The audit observes the existing pre-normalization gate and must not rescue or rerank rows.
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

function googleBook(id, title, description, categories, overrides = {}) {
  const identifiers = overrides.isbnPresent === false
    ? []
    : [{ type: "ISBN_13", identifier: `978000000${id.padStart(4, "0")}` }];
  return {
    kind: "books#volume",
    id,
    volumeInfo: {
      title,
      subtitle: overrides.subtitle || undefined,
      authors: overrides.authors || ["Regression Author"],
      description: description || undefined,
      categories,
      publisher: overrides.publisher || "Regression Press",
      publishedDate: String(overrides.publicationYear || 2024),
      pageCount: overrides.pageCount || 224,
      printType: overrides.printType || "BOOK",
      language: "en",
      industryIdentifiers: identifiers,
    },
  };
}

const clearNovelTitle = "The Clockwork Cave";
const crookedOakTitle = "The Crooked Oak Mysteries (5) \u2013 The Creatures of Killburn Mine";
const coverForMurderTitle = "A Cover for Murder (The Bookstore Mystery Series)";
const sparseNovelTitle = "The Midnight Map";
const writingGuideTitle = "How to Write Your First Mystery";
const schoolPublicationTitle = "School Publication";
const samplerTitle = "Awesome Adventures for Kids Middle Grade Sampler";
const libraryListTitle = "List of Books for School Libraries in the State of Wisconsin";
const anthologyTitle = "Middle Grade Mystery Anthology";
const ambiguousTitle = "The Secret of Black Hollow (3)";

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
    crookedOakTitle,
    "",
    ["Juvenile Fiction / Mysteries & Detective Stories", "Middle grade fiction"],
    { publisher: "BookLife Publishing", pageCount: 176 },
  ),
  googleBook(
    "3",
    coverForMurderTitle,
    "Twelve-year-old Ava must solve a murder at her family bookstore.",
    ["Juvenile Fiction / Mysteries & Detective Stories"],
    { publisher: "Scholastic", pageCount: 208 },
  ),
  googleBook(
    "4",
    sparseNovelTitle,
    "",
    ["Juvenile Fiction / Fantasy & Magic", "Middle grade fiction"],
    { publisher: "Scholastic", pageCount: 192 },
  ),
  googleBook(
    "5",
    writingGuideTitle,
    "A writing guide with plotting exercises, character worksheets, and classroom instruction for young mystery writers.",
    ["Language Arts & Disciplines / Writing", "Education"],
    { publisher: "Young Writers Press", pageCount: 128 },
  ),
  googleBook(
    "6",
    schoolPublicationTitle,
    "A school publication of classroom reports, student essays, school news, and educational material.",
    ["Education / Schools", "Juvenile Nonfiction"],
    { publisher: "School Publications Office", pageCount: 96 },
  ),
  googleBook(
    "7",
    samplerTitle,
    "A free middle grade sampler with preview chapters, excerpts, and sneak peeks from upcoming adventure books.",
    ["Juvenile Fiction / Action & Adventure"],
    { publisher: "Kids Preview Press", pageCount: 64 },
  ),
  googleBook(
    "8",
    libraryListTitle,
    "An institutional catalog and book list prepared for school libraries, educators, and collection purchasing.",
    ["Reference / Bibliographies", "Education / Library & Information Science"],
    { publisher: "Wisconsin Department of Public Instruction", pageCount: 144 },
  ),
  googleBook(
    "9",
    anthologyTitle,
    "An anthology collecting middle grade mystery stories by multiple authors for young readers.",
    ["Juvenile Fiction / Mysteries & Detective Stories", "Fiction / Anthologies"],
    { publisher: "Young Readers Press", authors: ["Regression Editor"], pageCount: 320 },
  ),
  googleBook(
    "10",
    ambiguousTitle,
    "",
    [],
    { publisher: "", pageCount: 160, isbnPresent: false },
  ),
];

globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ totalItems: fixtures.length, items: fixtures }),
});

const { googleBooksSourceAdapter } = require(resolve("app/recommender-v2/sources/googleBooksSource.ts"));

const profile = {
  ageBand: "preteens",
  maturityBand: "preteens",
  genreFamily: [{ value: "mystery", weight: 2, evidence: ["like:fixture"] }],
  tone: [],
  pacing: [],
  themes: [],
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
  intents: [{ id: "preteen-shape-audit", query: "middle grade mystery fiction", facets: ["mystery"] }],
};

const result = await googleBooksSourceAdapter.search(plan, { profile });
const diagnostics = result.diagnostics;
const outputTitles = result.rawItems.map((row) => row.title);

assertEqual(outputTitles, [clearNovelTitle, crookedOakTitle, coverForMurderTitle, sparseNovelTitle], "Audit should observe the production narrative rescue baseline");
assertEqual(diagnostics.preteenGoogleBooksPublicationShapeAuditSummary?.productionBehaviorChanged, true, "Audit should declare the production rescue behavior change");
assertEqual(diagnostics.preteenGoogleBooksPublicationShapeAuditSummary?.auditedRejectedCount, 9, "Every shared-shape rejection should be audited");
assertEqual(diagnostics.preteenGoogleBooksPublicationShapeAuditSummary?.likelyFalseRejectCount, 3, "Three narrative-shaped fixtures should be likely false rejects");
assertEqual(diagnostics.preteenGoogleBooksPublicationShapeAuditSummary?.likelyCorrectRejectCount, 5, "Five artifact fixtures should be likely correct rejects");
assertEqual(diagnostics.preteenGoogleBooksPublicationShapeAuditSummary?.ambiguousRejectCount, 1, "One title-only fixture should remain ambiguous");
assertEqual(diagnostics.preteenGoogleBooksPublicationShapeAuditSummary?.recommendedInterventionStage, "before_scoring_at_publication_shape_gate", "Future intervention belongs at the pre-scoring gate");

for (const title of [crookedOakTitle, coverForMurderTitle, sparseNovelTitle]) {
  assertIncludes(diagnostics.preteenGoogleBooksPublicationShapeLikelyFalseRejectTitles, title, `${title} should be a likely false reject`);
  assertIncludes(outputTitles, title, `${title} should now be rescued into the source scoring handoff`);
}
for (const title of [writingGuideTitle, schoolPublicationTitle, samplerTitle, libraryListTitle, anthologyTitle]) {
  assertIncludes(diagnostics.preteenGoogleBooksPublicationShapeLikelyCorrectRejectTitles, title, `${title} should be a likely correct reject`);
}
assertIncludes(diagnostics.preteenGoogleBooksPublicationShapeAmbiguousRejectTitles, ambiguousTitle, "Title-only fiction cues should remain ambiguous");

assertEqual(
  diagnostics.preteenGoogleBooksPublicationShapeRejectedReasonByTitle[coverForMurderTitle],
  "publication_shape_unknown_insufficient_story_evidence",
  "Series mystery with one story family should expose the current Adult-oriented threshold",
);
assertEqual(
  diagnostics.preteenGoogleBooksPublicationShapeFalseRejectHistogram.publication_shape_unknown_insufficient_narrative_identity,
  2,
  "Missing story-level evidence should be the largest likely-false-reject rule",
);
assertEqual(
  diagnostics.preteenGoogleBooksPublicationShapeFalseRejectHistogram.publication_shape_unknown_insufficient_story_evidence,
  1,
  "Single-story-family threshold should account for the other likely false reject",
);

const coverAudit = diagnostics.preteenGoogleBooksPublicationShapeAuditByTitle[coverForMurderTitle];
assertEqual(coverAudit.authors, ["Regression Author"], "Audit should retain authors");
assertEqual(coverAudit.publisher, "Scholastic", "Audit should retain publisher");
assertEqual(coverAudit.descriptionPresent, true, "Audit should capture description presence");
assertEqual(coverAudit.descriptionExcerptClassification, "useful_narrative_excerpt", "Audit should classify useful narrative excerpts");
assertEqual(coverAudit.pageCount, 208, "Audit should retain page count");
assertEqual(coverAudit.printType, "BOOK", "Audit should retain print type");
assertEqual(coverAudit.isbnPresent, true, "Audit should retain ISBN presence");
assertEqual(coverAudit.publicationYear, 2024, "Audit should retain publication year");
assertEqual(coverAudit.currentPublicationShape, "unknown", "Audit should retain current publication shape");
assertIncludes(coverAudit.narrativeEvidence, "juvenile_fiction_category", "Audit should expose Pre-Teen narrative evidence");
assertEqual(coverAudit.preteenIdentityDecision, "accept", "Counterfactual identity classifier should accept the series mystery");
assertEqual(coverAudit.recommendedFutureDecision, "allow_to_scoring_after_preteen_identity_check", "False reject should recommend scoring handoff, not final acceptance");
assertEqual(coverAudit.disposition, "likely_false_reject", "Series mystery should be classified as likely false reject");
assertEqual(coverAudit.confidence, 0.9, "Series mystery false-reject confidence should be deterministic");

const schoolAudit = diagnostics.preteenGoogleBooksPublicationShapeAuditByTitle[schoolPublicationTitle];
assertIncludes(schoolAudit.artifactEvidence, "school_publication_identity", "School publication should expose artifact evidence");
assertEqual(schoolAudit.preteenIdentityDecision, "reject", "Identity gate should counterfactually reject school publication");
assertEqual(schoolAudit.disposition, "likely_correct_reject", "School publication should remain a likely correct reject");

const teenResult = await googleBooksSourceAdapter.search(plan, { profile: { ...profile, ageBand: "teens", maturityBand: "teens" } });
assertEqual(teenResult.diagnostics.preteenGoogleBooksPublicationShapeRejectedTitles, [], "Audit must remain scoped to Pre-Teen Google Books");

console.log(JSON.stringify({
  name: "preteen google books publication shape false reject audit regressions",
  pass: true,
  outputTitles,
  likelyFalseRejectTitles: diagnostics.preteenGoogleBooksPublicationShapeLikelyFalseRejectTitles,
  likelyCorrectRejectTitles: diagnostics.preteenGoogleBooksPublicationShapeLikelyCorrectRejectTitles,
  ambiguousRejectTitles: diagnostics.preteenGoogleBooksPublicationShapeAmbiguousRejectTitles,
  falseRejectHistogram: diagnostics.preteenGoogleBooksPublicationShapeFalseRejectHistogram,
  auditSummary: diagnostics.preteenGoogleBooksPublicationShapeAuditSummary,
}, null, 2));
