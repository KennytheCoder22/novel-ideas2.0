/**
 * Regression tests for Google Books stage-lineage diagnostics.
 *
 * These are diagnostics-only checks. They verify that a Google Books title that
 * is selected/rendered cannot also be reported as dropped at final eligibility.
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
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(values, expected, message) {
  if (!Array.isArray(values) || !values.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(values)} to include ${JSON.stringify(expected)}`);
  }
}

const v2Dir = resolve("app/recommender-v2");
const {
  computeGoogleBooksDropDiagnostics,
  computeGoogleBooksDropDiagnosticsByTitle,
  harmonizeGoogleBooksStageLineage,
} = require(resolve(v2Dir, "googleBooksLineageDiagnostics.ts"));
const { selectRecommendations } = require(resolve(v2Dir, "select.ts"));

{
  const renderedTitle = "Rendered Google Books Novel";
  const stages = harmonizeGoogleBooksStageLineage({
    normalizedCandidate: [renderedTitle],
    rankedCandidate: [renderedTitle],
    finalEligibility: [],
    finalAcceptedDocs: [],
    wrapperInput: [renderedTitle],
    wrapperOutput: [renderedTitle],
    returnedItems: [renderedTitle],
    renderedRecommendations: [renderedTitle],
    rendererInput: [renderedTitle],
    rendererOutput: [renderedTitle],
  });

  assertIncludes(stages.finalEligibility, renderedTitle, "Rendered title should be added to finalEligibility lineage");
  assertIncludes(stages.finalAcceptedDocs, renderedTitle, "Rendered title should be added to finalAcceptedDocs lineage");

  const dropped = computeGoogleBooksDropDiagnostics(stages);
  assertEqual(dropped.droppedStage, "", "Rendered title lineage should not produce a top-level dropped stage");
  assertEqual(dropped.droppedReason, "", "Rendered title lineage should not produce a top-level dropped reason");

  const byTitle = computeGoogleBooksDropDiagnosticsByTitle(stages);
  assertEqual(byTitle.droppedStageByTitle[renderedTitle], "", "Rendered title should not be dropped by title");
  assertEqual(byTitle.droppedReasonByTitle[renderedTitle], "", "Rendered title should not have a dropped reason by title");
  console.log("PASS: rendered Google Books title is not reported as dropped at final eligibility");
}

{
  const rejectedTitle = "Rejected Google Books Novel";
  const stages = {
    normalizedCandidate: [rejectedTitle],
    rankedCandidate: [rejectedTitle],
    finalEligibility: [],
    finalAcceptedDocs: [],
    wrapperInput: [],
    wrapperOutput: [],
    returnedItems: [],
    renderedRecommendations: [],
    rendererInput: [],
    rendererOutput: [],
  };
  const byTitle = computeGoogleBooksDropDiagnosticsByTitle(
    stages,
    { [rejectedTitle]: "googlebooks_mature_content_not_allowed_for_kids" },
  );

  assertEqual(byTitle.droppedStageByTitle[rejectedTitle], "finalEligibility", "Non-rendered rejected title should retain finalEligibility drop");
  assertEqual(byTitle.droppedReasonByTitle[rejectedTitle], "googlebooks_mature_content_not_allowed_for_kids", "Rejected title should expose real final eligibility reason");
  console.log("PASS: rejected Google Books title keeps final eligibility drop diagnostics");
}

{
  const title = "Teen Google Books Selected Novel";
  const profile = {
    ageBand: "teens",
    maturityBand: "teens",
    genreFamily: [{ value: "mystery", weight: 2, evidence: ["like:teen-googlebooks-fixture"] }],
    tone: [],
    pacing: [],
    themes: [],
    characterDynamics: [],
    formatPreference: [{ value: "book", weight: 1, evidence: ["like:teen-googlebooks-fixture"] }],
    avoidSignals: [],
    sourceHints: ["googleBooks"],
    diagnostics: {},
  };
  const candidate = {
    id: "googlebooks-lineage-teen-selected",
    source: "googleBooks",
    sourceId: "gb-lineage-teen-selected",
    title,
    subtitle: "",
    creators: ["Regression Author"],
    description: "A young adult mystery novel follows a student detective through a dangerous school conspiracy.",
    formats: ["book"],
    genres: ["Young Adult Fiction / Mysteries & Detective Stories"],
    themes: ["school"],
    tones: [],
    characterDynamics: [],
    maturityBand: "teens",
    publicationYear: 2024,
    sourceUrl: "https://books.google.example/lineage",
    raw: {},
    diagnostics: { googleBooksPublicationShape: "novel" },
    score: 12,
    matchedSignals: ["mystery"],
    rejectedReasons: [],
    scoreBreakdown: { positiveTasteMatch: 4, sourceQualityRelevance: 2 },
  };

  const result = selectRecommendations([candidate], profile, 1);
  assertEqual(result.selected[0]?.title, title, "Teen Google Books fixture should be selected");

  const diagnostics = result.rejectedReasons;
  assertEqual(diagnostics.googleBooksFinalEligibilityDecisionByTitle?.[title], "accepted", "Selected non-Adult Google Books title should get accepted final eligibility diagnostics");
  assertEqual(
    diagnostics.googleBooksFinalEligibilityReasonByTitle?.[title],
    "googlebooks_final_eligibility_folded_into_generic_selection_path",
    "Selected non-Adult Google Books title should explain folded final eligibility path",
  );
  assertEqual(diagnostics.googleBooksFinalSelectionDecisionByTitle?.[title], "selected", "Selected non-Adult Google Books title should get selected final selection diagnostics");
  console.log("PASS: non-Adult Google Books selection emits folded final eligibility lineage");
}

console.log("All Google Books lineage diagnostics regressions passed.");
