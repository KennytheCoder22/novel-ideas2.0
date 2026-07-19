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
  applyGoogleBooksRenderingStageLineage,
} = require(resolve(v2Dir, "googleBooksLineageDiagnostics.ts"));
const { buildGoogleBooksAgeBandInfrastructureDiagnostics } = require(resolve(v2Dir, "engine.ts"));
const { selectRecommendations } = require(resolve(v2Dir, "select.ts"));

function profileFor(ageBand) {
  return {
    ageBand,
    maturityBand: ageBand,
    genreFamily: [{ value: "mystery", weight: 2, evidence: [`like:${ageBand}:fixture`] }],
    tone: [], pacing: [], themes: [], characterDynamics: [],
    formatPreference: [{ value: "book", weight: 1, evidence: [`like:${ageBand}:fixture`] }],
    avoidSignals: [], sourceHints: ["googleBooks"], diagnostics: {},
  };
}

function scoredCandidate(title, ageBand, overrides = {}) {
  return {
    id: `googleBooks:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    source: "googleBooks", sourceId: title, title, subtitle: "", creators: [`${title} Author`],
    description: ageBand === "kids" ? "A picture book story about magical friends." : ageBand === "preteens" ? "A middle grade mystery novel about friends." : "A young adult mystery novel about a school conspiracy.",
    formats: ["book"], genres: ageBand === "kids" ? ["Juvenile Fiction", "Picture books"] : ageBand === "preteens" ? ["Middle grade fiction", "Juvenile Fiction"] : ["Young Adult Fiction", "Mystery"],
    themes: ["friendship"], tones: [], characterDynamics: [], maturityBand: ageBand,
    publicationYear: 2024, sourceUrl: `https://books.example/${encodeURIComponent(title)}`,
    raw: { title, ageBand, audienceBand: ageBand, maturityRating: "NOT_MATURE", contentMaturity: "not_mature" },
    diagnostics: { googleBooksPublicationShape: "novel", googleBooksContentMaturity: "not_mature", googleBooksAudienceBand: ageBand },
    score: 10, matchedSignals: ["mystery"], rejectedReasons: [], scoreBreakdown: { positiveTasteMatch: 4, sourceQualityRelevance: 2, ageBandSuitability: 1 },
    ...overrides,
  };
}

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
    "teens_googlebooks_named_final_eligibility_passed",
    "Selected Teen Google Books title should expose its named final-eligibility pass",
  );
  assertEqual(diagnostics.googleBooksFinalSelectionDecisionByTitle?.[title], "selected", "Selected non-Adult Google Books title should get selected final selection diagnostics");
  assertEqual(diagnostics.googleBooksFinalEligibilityGateByTitle?.[title], "teens_googlebooks_final_eligibility", "Selected Teen title should expose the named final gate");
  assertEqual(diagnostics.googleBooksPostRankingGateByTitle?.[title], "selected", "Selected Teen title should expose the post-ranking selection gate");
  console.log("PASS: non-Adult Google Books selection emits named final-eligibility lineage");
}

{
  const profile = profileFor("teens");
  const rejected = scoredCandidate("Teen Final Gate Reject", "teens", { score: -10, scoreBreakdown: { ageBandSuitability: 1, sourceQualityRelevance: 0 } });
  const result = selectRecommendations([rejected], profile, 1);
  assertEqual(result.selected.length, 0, "Final-eligibility diagnostic fixture should remain rejected");
  assertEqual(result.rejectedReasons.googleBooksFinalEligibilityDecisionByTitle?.[rejected.title], "rejected", "Final rejection should be named as final eligibility");
  assertEqual(result.rejectedReasons.googleBooksFinalEligibilityGateByTitle?.[rejected.title], "teens_positive_score_final_eligibility", "Final rejection should identify its specific gate");
  assertEqual(result.rejectedReasons.googleBooksFinalEligibilityReasonByTitle?.[rejected.title], "non_positive_score", "Final rejection should preserve its substantive reason");
  assertEqual(result.rejectedReasons.googleBooksPostRankingGateByTitle?.[rejected.title], "final_eligibility", "Final rejection should not be mislabeled as selection loss");
  console.log("PASS: younger-band final-eligibility rejection exposes a specific named gate and reason");
}

{
  const profile = profileFor("teens");
  const first = scoredCandidate("Selected Teen Mystery", "teens");
  const second = scoredCandidate("Eligible Teen Mystery", "teens");
  const result = selectRecommendations([first, second], profile, 1);
  assertEqual(result.selected.length, 1, "Selection fixture count must remain one");
  assertEqual(result.selected[0].title, first.title, "Selection fixture contents must remain unchanged");
  assertEqual(result.rejectedReasons.googleBooksFinalEligibilityDecisionByTitle?.[second.title], "accepted", "Ranked-below title should remain final-eligible");
  assertEqual(result.rejectedReasons.googleBooksFinalSelectionDecisionByTitle?.[second.title], "passed_eligibility_not_selected", "Ranked-below title should be reported as a selection loss");
  assertEqual(result.rejectedReasons.googleBooksPostRankingGateByTitle?.[second.title], "selection_capacity_or_quality_ordering", "Selection loss should have a named post-ranking gate");
  console.log("PASS: final eligibility and selection loss are diagnostically distinct without changing contents or count");
}

{
  const profile = profileFor("kids");
  const title = "Kids Pre-Scoring Reject";
  const sourceResults = [{
    source: "googleBooks", status: "succeeded", rawItems: [],
    diagnostics: {
      source: "googleBooks", status: "succeeded", planned: true, attempted: true, timedOut: false,
      kidsGoogleBooksRejectedBeforeScoringByTitle: { [title]: "googlebooks_mature_content_not_allowed_for_kids" },
    },
  }];
  const diagnostics = buildGoogleBooksAgeBandInfrastructureDiagnostics({
    profile, searchPlan: { sourcePlans: [] }, sourceResults,
    normalizedCandidates: [], scoredCandidates: [], selectedCandidates: [], selectionDiagnostics: {},
  });
  assertEqual(diagnostics.googleBooksStageDecisionByTitle[title].pre_scoring, "rejected", "Pre-scoring loss should be explicitly named");
  assertEqual(diagnostics.googleBooksStageReasonByTitle[title].pre_scoring, "googlebooks_mature_content_not_allowed_for_kids", "Pre-scoring loss should preserve its reason");
  assertEqual(diagnostics.googleBooksStageDecisionByTitle[title].final_eligibility, "not_reached", "Pre-scoring loss must not be reported as final eligibility");
  assertEqual(diagnostics.googleBooksStageDecisionByTitle[title].selection, "not_reached", "Pre-scoring loss must not be reported as final selection");
  console.log("PASS: pre-scoring rejection is not mislabeled as a final-selection loss");
}

{
  const profile = profileFor("preteens");
  const rescued = scoredCandidate("Rescued Preteen Narrative", "preteens");
  const sourceResults = [{
    source: "googleBooks", status: "succeeded", rawItems: [rescued.raw],
    diagnostics: {
      source: "googleBooks", status: "succeeded", planned: true, attempted: true, timedOut: false,
      preteenGoogleBooksPublicationShapeRescueAppliedByTitle: { [rescued.title]: true },
      preteenGoogleBooksPublicationShapeRescueReasonByTitle: { [rescued.title]: "preteen_unknown_shape_rescued_by_corroborated_narrative_identity" },
    },
  }];
  const diagnostics = buildGoogleBooksAgeBandInfrastructureDiagnostics({
    profile, searchPlan: { sourcePlans: [] }, sourceResults,
    normalizedCandidates: [rescued], scoredCandidates: [rescued], selectedCandidates: [], selectionDiagnostics: {},
  });
  assertEqual(diagnostics.googleBooksStageDecisionByTitle[rescued.title].publication_identity_or_shape_policy, "rescued", "Rescue should remain distinct from ordinary admission");
  assertEqual(diagnostics.googleBooksStageGateByTitle[rescued.title].publication_identity_or_shape_policy, "preteen_publication_shape_narrative_rescue", "Rescue should expose its named gate");
  assertEqual(diagnostics.googleBooksStageReasonByTitle[rescued.title].publication_identity_or_shape_policy, "preteen_unknown_shape_rescued_by_corroborated_narrative_identity", "Rescue should preserve its reason");
  console.log("PASS: intended Pre-Teen rescue remains distinguishable from ordinary admission");
}

{
  const profile = profileFor("kids");
  const selected = scoredCandidate("Rendered Kids Narrative", "kids");
  const selection = selectRecommendations([selected], profile, 1);
  const sourceResults = [{ source: "googleBooks", status: "succeeded", rawItems: [selected.raw], diagnostics: { source: "googleBooks", status: "succeeded", planned: true, attempted: true, timedOut: false } }];
  const diagnostics = buildGoogleBooksAgeBandInfrastructureDiagnostics({
    profile, searchPlan: { sourcePlans: [] }, sourceResults,
    normalizedCandidates: [selected], scoredCandidates: [selected], selectedCandidates: selection.selected,
    returnedTitles: [selected.title], selectionDiagnostics: selection.rejectedReasons,
  });
  const rendered = applyGoogleBooksRenderingStageLineage(
    diagnostics.googleBooksStageDecisionByTitle,
    diagnostics.googleBooksStageReasonByTitle,
    diagnostics.googleBooksStageGateByTitle,
    [selected.title],
  );
  for (const stage of diagnostics.googleBooksStageOrder) {
    const decision = rendered.decisionByTitle[selected.title]?.[stage];
    if (!decision || decision === "not_reached" || decision === "not_reported") throw new Error(`Selected lineage missing complete stage ${stage}: ${JSON.stringify(rendered.decisionByTitle[selected.title])}`);
  }
  assertEqual(rendered.decisionByTitle[selected.title].rendering, "rendered", "Selected candidate should complete renderer lineage");
  assertEqual(selection.selected.length, 1, "Complete-lineage diagnostics must not change final count");
  assertEqual(selection.selected[0].title, selected.title, "Complete-lineage diagnostics must not change final contents");
  console.log("PASS: selected younger-band candidate retains complete source-through-rendering lineage");
}

console.log("All Google Books lineage diagnostics regressions passed.");
