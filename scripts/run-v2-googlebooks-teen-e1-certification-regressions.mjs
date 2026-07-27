/** E1 certification closure: Teen Google Books admission contract. */
import { spawnSync } from "node:child_process";
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
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertNotEqual(actual, unexpected, message) {
  if (actual === unexpected) throw new Error(`${message}: expected value other than ${JSON.stringify(unexpected)}`);
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

function runSuite(scriptPath) {
  const child = spawnSync(process.execPath, [scriptPath], { encoding: "utf8", stdio: "pipe" });
  if (child.status !== 0) {
    throw new Error(`Suite failed: ${scriptPath}\n${child.stdout || ""}\n${child.stderr || ""}`);
  }
  return {
    script: scriptPath,
    status: "pass",
    stdoutTail: String(child.stdout || "").trim().split(/\r?\n/).slice(-12),
  };
}

const v2Dir = resolve("app/recommender-v2");
const { buildSearchPlan } = require(resolve(v2Dir, "searchPlan.ts"));
const { normalizeSourceResults } = require(resolve(v2Dir, "normalize.ts"));
const { scoreCandidates } = require(resolve(v2Dir, "score.ts"));
const { selectRecommendations } = require(resolve(v2Dir, "select.ts"));
const { applyTeensGoogleBooksPreScoringGate, buildGoogleBooksAgeBandInfrastructureDiagnostics } = require(resolve(v2Dir, "engine.ts"));

const prerequisiteSuites = [
  "scripts/run-v2-googlebooks-teens-architecture-regressions.mjs",
  "scripts/run-v2-googlebooks-audience-maturity-separation-regressions.mjs",
];
const prerequisiteResults = prerequisiteSuites.map(runSuite);

const profile = {
  ageBand: "teens",
  maturityBand: "teens",
  genreFamily: [{ value: "mystery", weight: 2, evidence: ["like:teens:mystery"] }],
  tone: [{ value: "tense", weight: 1, evidence: ["like:teens:tense"] }],
  pacing: [],
  themes: [{ value: "friendship", weight: 1, evidence: ["like:teens:friendship"] }],
  characterDynamics: [],
  formatPreference: [{ value: "book", weight: 1, evidence: ["like:teens:book"] }],
  avoidSignals: [],
  sourceHints: ["googleBooks"],
  diagnostics: {},
};

function rawGoogleBook(title, overrides = {}) {
  return {
    id: `googleBooks:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    sourceId: `gb-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title,
    creators: ["Regression Author"],
    description: "A young adult mystery novel follows a teen detective uncovering a dangerous conspiracy.",
    genres: ["Young Adult Fiction / Mysteries & Detective Stories", "Young Adult Fiction / Thrillers & Suspense"],
    themes: ["friendship", "school"],
    tones: ["tense"],
    characterDynamics: [],
    formats: ["book"],
    publicationYear: 2024,
    sourceUrl: `https://books.google.example/${encodeURIComponent(title)}`,
    ageBand: "teens",
    audienceBand: "teens",
    queryText: "young adult mystery fiction novel",
    originalPlannedQuery: "young adult mystery fiction novel",
    queryFamily: "mystery",
    facets: ["Young Adult Fiction / Mysteries & Detective Stories", "Young Adult Fiction / Thrillers & Suspense"],
    googleBooksPublicationShape: "novel",
    googleBooksNarrativeConfidence: 7,
    googleBooksPublicationShapeEvidence: ["fixture_novel_identity"],
    googleBooksStoryLevelNarrativeEvidence: ["explicit_novel_identity", "plot_level_conflict_and_stakes"],
    googleBooksPublicationShapePrecedenceDecision: "fixture_novel_supported",
    maturityBand: "NOT_MATURE",
    maturityRating: "NOT_MATURE",
    sourceMaturityRating: "NOT_MATURE",
    ...overrides,
  };
}

function runFlow(rawRows, limit = 6) {
  const searchPlan = buildSearchPlan(profile, { googleBooks: true });
  const sourceResults = [{
    source: "googleBooks",
    status: rawRows.length ? "succeeded" : "empty",
    rawItems: rawRows,
    diagnostics: {
      source: "googleBooks",
      status: rawRows.length ? "succeeded" : "empty",
      planned: true,
      attempted: true,
      timedOut: false,
      rawCount: rawRows.length,
      rawApiResultCount: rawRows.length,
      normalizedCount: rawRows.length,
      queries: ["young adult mystery fiction novel"],
      googleBooksQueriesAttempted: ["young adult mystery fiction novel"],
    },
  }];
  const normalized = normalizeSourceResults(sourceResults);
  const preScoring = applyTeensGoogleBooksPreScoringGate(normalized, profile);
  const scored = scoreCandidates(preScoring.candidates, profile);
  const selection = selectRecommendations(scored, profile, limit);
  const diagnostics = buildGoogleBooksAgeBandInfrastructureDiagnostics({
    profile,
    searchPlan,
    sourceResults,
    normalizedCandidates: preScoring.candidates,
    scoredCandidates: scored,
    selectedCandidates: selection.selected,
    selectionDiagnostics: selection.rejectedReasons,
    returnedTitles: selection.selected.filter((candidate) => candidate.source === "googleBooks").map((candidate) => candidate.title),
  });
  return { normalized, preScoring, scored, selection, diagnostics };
}

const coverageRows = [];
const coveredReasonCodes = new Set();
const matureLifecycleRows = [];
const declaredButUnreached = [];

function row(gate, fixture, expected, observed, assertion, status = "covered") {
  coverageRows.push({ gate, fixture, expected, observed, assertion, status });
}

// 1) Conclusive age suitability pre-scoring rejection.
{
  const title = "Forbidden Archive";
  const run = runFlow([rawGoogleBook(title, {
    description: "An erotic pornography novel involving incest and sexual abuse.",
    genres: ["Fiction", "Erotica"],
  })]);
  const observed = run.preScoring.diagnostics.rejectedBeforeScoringByTitle[title];
  assertEqual(observed, "teen_googlebooks_conclusive_age_suitability_rejection", "Conclusive age suitability reject must remain pre-scoring");
  coveredReasonCodes.add(observed);
  row("teen_pre_scoring_age_suitability_gate", title, "teen_googlebooks_conclusive_age_suitability_rejection", observed, "conclusive suitability reject removed before scoring");
}

// 2) Teen MATURE lifecycle: teen-labeled mature narrative is tracked separately and remains eligible.
{
  const title = "Teen Explicit Mature Narrative";
  const run = runFlow([rawGoogleBook(title, {
    maturityBand: "MATURE",
    maturityRating: "MATURE",
    sourceMaturityRating: "MATURE",
  })]);
  assertEqual(run.normalized[0].maturityBand, "teens", "Teen MATURE should preserve teen deck identity");
  assertEqual(run.diagnostics.googleBooksContentMaturityByTitle[title], "mature", "Teen MATURE should be recognized as mature content");
  assertEqual(run.diagnostics.googleBooksMaturityDecisionByTitle[title], "explicit_mature_content_tracked_separately_for_teens", "Teen MATURE decision marker should remain stable");
  assertNotEqual(run.diagnostics.googleBooksAgeBandDropReasonByTitle[title], "googlebooks_mature_content_not_allowed_for_teens", "Teen MATURE must not use kids/preteen mature-content reject reasons");
  assertEqual(run.diagnostics.googleBooksAgeBandDropReasonByTitle[title], "selected_googlebooks_candidate", "Teen MATURE narrative may remain eligible");
  coveredReasonCodes.add("selected_googlebooks_candidate");
  matureLifecycleRows.push({
    fixture: title,
    initialDetection: "maturityRating=MATURE, contentMaturity=mature",
    finalOutcome: "selected_googlebooks_candidate",
    lifecycle: "tracked_separately_for_teens_not_hard_rejected",
    diagnostics: "explicit_mature_content_tracked_separately_for_teens",
  });
  row("teen_maturity_tracking_gate", title, "explicit_mature_content_tracked_separately_for_teens + selected_googlebooks_candidate", `${run.diagnostics.googleBooksMaturityDecisionByTitle[title]} + ${run.diagnostics.googleBooksAgeBandDropReasonByTitle[title]}`, "teen mature lifecycle remains tracked-not-hard-rejected");
}

// 3) Teen audience reconciliation rescue path (kids-labeled but YA not-mature narrative).
{
  const title = "Teen Kids-Labeled YA Rescue";
  const run = runFlow([rawGoogleBook(title, {
    audienceBand: "kids",
    ageBand: "kids",
    maturityBand: "NOT_MATURE",
    maturityRating: "NOT_MATURE",
    sourceMaturityRating: "NOT_MATURE",
  })]);
  const rescueReason = run.selection.rejectedReasons.teenGoogleBooksAudienceReconciliationReasonByTitle[title];
  assertEqual(run.selection.rejectedReasons.teenGoogleBooksAudienceReconciliationDecisionByTitle[title], "rescued", "Teen YA rescue should remain explicit");
  assertEqual(rescueReason, "teen_googlebooks_audience_reconciliation_rescue", "Teen YA rescue reason should remain stable");
  assertEqual(run.diagnostics.googleBooksAgeBandDropReasonByTitle[title], "selected_googlebooks_candidate", "Teen YA rescue should remain eligible");
  coveredReasonCodes.add(rescueReason);
  row("teen_audience_reconciliation_gate", title, "teen_googlebooks_audience_reconciliation_rescue", rescueReason, "kids-labeled YA narrative rescue preserved");
}

// 4) Teen audience reconciliation reject path (explicit early-reader not-mature).
{
  const title = "Teen Kids-Labeled Early Reader Reject";
  const run = runFlow([rawGoogleBook(title, {
    audienceBand: "kids",
    ageBand: "kids",
    maturityBand: "NOT_MATURE",
    maturityRating: "NOT_MATURE",
    sourceMaturityRating: "NOT_MATURE",
    genres: ["Juvenile Fiction / Readers / Beginner", "Picture books"],
    description: "A picture book for beginning readers in grade 2 follows a class through an early reader adventure.",
  })]);
  const rejectReason = run.selection.rejectedReasons.teenGoogleBooksAudienceReconciliationReasonByTitle[title];
  assertEqual(run.selection.rejectedReasons.teenGoogleBooksAudienceReconciliationDecisionByTitle[title], "rejected", "Early-reader mismatch should remain blocked");
  assertEqual(rejectReason, "teen_audience_reconciliation_explicit_early_reader_markers", "Early-reader block reason should remain stable");
  assertEqual(run.diagnostics.googleBooksAgeBandDropReasonByTitle[title], "maturity_band_mismatch", "Blocked teen reconciliation should resolve as mismatch");
  coveredReasonCodes.add(rejectReason);
  coveredReasonCodes.add("maturity_band_mismatch");
  row("teen_audience_reconciliation_gate", title, "teen_audience_reconciliation_explicit_early_reader_markers + maturity_band_mismatch", `${rejectReason} + ${run.diagnostics.googleBooksAgeBandDropReasonByTitle[title]}`, "early-reader mismatch remains blocked");
}

// 5) Teen MATURE mismatch variant: kids-labeled YA + MATURE cannot be rescued.
{
  const title = "Teen Kids-Labeled YA Mature Reject";
  const run = runFlow([rawGoogleBook(title, {
    audienceBand: "kids",
    ageBand: "kids",
    maturityBand: "MATURE",
    maturityRating: "MATURE",
    sourceMaturityRating: "MATURE",
  })]);
  const rejectReason = run.selection.rejectedReasons.teenGoogleBooksAudienceReconciliationReasonByTitle[title];
  assertEqual(rejectReason, "teen_audience_reconciliation_content_not_not_mature", "Teen MATURE mismatch should fail reconciliation at content maturity check");
  assertEqual(run.diagnostics.googleBooksAgeBandDropReasonByTitle[title], "maturity_band_mismatch", "Teen MATURE mismatch should remain mismatch reject");
  coveredReasonCodes.add(rejectReason);
  matureLifecycleRows.push({
    fixture: title,
    initialDetection: "maturityRating=MATURE, source audience=kids",
    finalOutcome: "maturity_band_mismatch",
    lifecycle: "not_rescued_due_to_content_not_not_mature",
    diagnostics: "teen_audience_reconciliation_content_not_not_mature",
  });
  row("teen_mature_mismatch_reconciliation_gate", title, "teen_audience_reconciliation_content_not_not_mature + maturity_band_mismatch", `${rejectReason} + ${run.diagnostics.googleBooksAgeBandDropReasonByTitle[title]}`, "MATURE mismatch variant remains blocked");
}

// 6) Teen publication identity reject path.
{
  const title = "Divergent Official Illustrated Movie Companion";
  const run = runFlow([rawGoogleBook(title, {
    title,
    description: "Official illustrated movie companion to the blockbuster adaptation.",
  })]);
  const observed = run.diagnostics.googleBooksAgeBandDropReasonByTitle[title];
  assertEqual(observed, "teen_googlebooks_publication_identity_supplemental_companion", "Teen publication identity companion reject should remain stable");
  assertEqual(run.selection.rejectedReasons.teenGoogleBooksPublicationIdentityDecisionByTitle[title], "rejected", "Teen publication identity decision should be rejected");
  coveredReasonCodes.add(observed);
  row("teen_publication_identity_gate", title, "teen_googlebooks_publication_identity_supplemental_companion", observed, "supplemental companion blocked");
}

const requiredReasons = [
  "teen_googlebooks_conclusive_age_suitability_rejection",
  "teen_googlebooks_publication_identity_supplemental_companion",
  "teen_googlebooks_audience_reconciliation_rescue",
  "teen_audience_reconciliation_explicit_early_reader_markers",
  "teen_audience_reconciliation_content_not_not_mature",
  "maturity_band_mismatch",
  "selected_googlebooks_candidate",
];
const uncoveredReasons = requiredReasons.filter((reason) => !coveredReasonCodes.has(reason));
assertEqual(uncoveredReasons.length, 0, "E1 uncovered reason-code paths must be empty");

for (const reason of [
  "teen_audience_reconciliation_source_label_not_kids_or_preteens",
  "teen_audience_reconciliation_not_from_teen_query",
  "teen_audience_reconciliation_non_narrative_identity_flags",
  "teen_audience_reconciliation_publication_shape_not_story_work",
  "teen_audience_reconciliation_narrative_confidence_below_threshold",
  "teen_audience_reconciliation_insufficient_story_evidence",
  "teen_googlebooks_publication_identity_literary_study",
  "teen_googlebooks_publication_identity_catalog_or_promotional_collection",
  "teen_googlebooks_publication_identity_guide_or_market_reference",
  "teen_googlebooks_publication_identity_non_narrative_shape",
]) {
  declaredButUnreached.push({
    reasonCode: reason,
    status: "declared_but_not_directly_asserted_in_e1_baseline",
    note: "No direct deterministic fixture in this E1 baseline script asserts this branch; branch remains part of declared gate logic.",
  });
}

const summary = {
  suite: "e1-teen-googlebooks-certification-regressions",
  pass: true,
  prerequisiteSuites: prerequisiteResults,
  requiredReasonCount: requiredReasons.length,
  uncoveredReasons,
  matureLifecycleRows,
  declaredButUnreached,
  coverageRows,
};

console.log("PASS: E1 Teen Google Books certification regressions");
console.log(JSON.stringify(summary, null, 2));
