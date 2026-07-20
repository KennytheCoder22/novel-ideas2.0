/**
 * Regression tests for separating Google Books audience/deck labels from
 * content maturity metadata.
 */
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

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertNotEqual(actual, expected, message) {
  if (actual === expected) throw new Error(`${message}: expected value other than ${JSON.stringify(expected)}`);
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
const { buildSearchPlan } = require(resolve(dir, "searchPlan.ts"));
const { normalizeSourceResults } = require(resolve(dir, "normalize.ts"));
const { scoreCandidates } = require(resolve(dir, "score.ts"));
const { selectRecommendations } = require(resolve(dir, "select.ts"));
const { buildGoogleBooksAgeBandInfrastructureDiagnostics } = require(resolve(dir, "engine.ts"));

function profileFor(ageBand) {
  const profileGenres = {
    kids: ["magic", "adventure"],
    preteens: ["fantasy", "adventure"],
    teens: ["mystery", "thriller"],
    adult: ["mystery", "thriller"],
  }[ageBand];
  return {
    ageBand,
    maturityBand: ageBand,
    genreFamily: profileGenres.map((value) => ({ value, weight: 2, evidence: [`like:${ageBand}:anchor`] })),
    tone: [{ value: "warm", weight: 1, evidence: [`like:${ageBand}:anchor`] }],
    pacing: [],
    themes: [{ value: "friendship", weight: 1, evidence: [`like:${ageBand}:anchor`] }],
    characterDynamics: [],
    formatPreference: [{ value: "book", weight: 1, evidence: [`like:${ageBand}:anchor`] }],
    avoidSignals: [],
    sourceHints: ["googleBooks"],
    diagnostics: {},
  };
}

function rawGoogleBook(ageBand, title, overrides = {}) {
  const deckMetadata = {
    kids: {
      description: "A picture book story follows Maya and her friends as they discover magic in a moonlit garden and share a gentle adventure.",
      genres: ["Juvenile Fiction / Fantasy & Magic", "Juvenile Fiction / Readers / Beginner", "Picture books"],
      queryFamily: "fantasy",
    },
    preteens: {
      description: "A middle grade fantasy novel follows Mira through a hidden school of magic where she protects her friends and solves a dangerous quest.",
      genres: ["Juvenile Fiction / Fantasy & Magic", "Juvenile Fiction / Action & Adventure", "Middle grade fiction"],
      queryFamily: "fantasy",
    },
    teens: {
      description: "A young adult mystery novel follows Nina as she uncovers a school conspiracy, confronts a hidden threat, and protects her closest friend.",
      genres: ["Young Adult Fiction / Mysteries & Detective Stories", "Young Adult Fiction / Thrillers & Suspense"],
      queryFamily: "mystery",
    },
    adult: {
      description: "A mystery thriller novel follows a detective who uncovers a conspiracy, confronts danger, and protects a witness.",
      genres: ["Fiction / Thrillers / Suspense", "Fiction / Mystery & Detective"],
      queryFamily: "mystery",
    },
  }[ageBand];
  return {
    id: `googleBooks:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    sourceId: `gb-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title,
    creators: ["Regression Author"],
    description: deckMetadata.description,
    genres: deckMetadata.genres,
    themes: ["friendship", "magic", "school"],
    tones: ["warm"],
    characterDynamics: [],
    formats: ["book"],
    publicationYear: 2024,
    sourceUrl: `https://books.google.example/${encodeURIComponent(title)}`,
    ageBand,
    audienceBand: ageBand,
    queryText: `${ageBand} regression fiction novel`,
    queryFamily: deckMetadata.queryFamily,
    facets: deckMetadata.genres,
    googleBooksPublicationShape: "novel",
    googleBooksNarrativeConfidence: 4,
    googleBooksPublicationShapeEvidence: ["fixture_novel_identity"],
    googleBooksStoryLevelNarrativeEvidence: ["fixture_story_synopsis"],
    googleBooksPublicationShapePrecedenceDecision: "fixture_novel_supported",
    ...overrides,
  };
}

function googleBooksSourceResult(profile, searchPlan, rawItems) {
  const plan = searchPlan.sourcePlans.find((row) => row.source === "googleBooks");
  const queries = plan?.intents.map((intent) => intent.query) || [];
  return {
    source: "googleBooks",
    status: rawItems.length ? "succeeded" : "empty",
    rawItems,
    diagnostics: {
      source: "googleBooks",
      status: rawItems.length ? "succeeded" : "empty",
      planned: true,
      attempted: true,
      timedOut: false,
      rawCount: rawItems.length,
      rawApiResultCount: rawItems.length,
      normalizedCount: rawItems.length,
      queries,
      googleBooksPlannedQueries: queries,
      googleBooksQueriesAttempted: queries,
      rawTitles: rawItems.map((item) => String(item.title || "")).filter(Boolean),
      googleBooksSourceStatus: rawItems.length ? "succeeded" : "empty",
      googleBooksSourceQueries: queries,
      googleBooksSourceRawApiResultCount: rawItems.length,
      googleBooksSourceNormalizedRowCount: rawItems.length,
      googleBooksSourceDroppedBeforeNormalization: 0,
      googleBooksSourceDropReasons: {},
    },
  };
}

function runFlow(ageBand, rawRows, limit = 5) {
  const profile = profileFor(ageBand);
  const searchPlan = buildSearchPlan(profile, { googleBooks: true });
  const sourceResults = [googleBooksSourceResult(profile, searchPlan, rawRows)];
  const normalized = normalizeSourceResults(sourceResults);
  const scored = scoreCandidates(normalized, profile);
  const selection = selectRecommendations(scored, profile, limit);
  const diagnostics = buildGoogleBooksAgeBandInfrastructureDiagnostics({
    profile,
    searchPlan,
    sourceResults,
    normalizedCandidates: normalized,
    scoredCandidates: scored,
    selectedCandidates: selection.selected,
    selectionDiagnostics: selection.rejectedReasons,
    returnedTitles: selection.selected.filter((candidate) => candidate.source === "googleBooks").map((candidate) => candidate.title),
  });
  return { profile, normalized, scored, selection, diagnostics };
}

for (const ageBand of ["kids", "preteens", "teens"]) {
  const title = `${ageBand} NOT_MATURE Candidate`;
  const run = runFlow(ageBand, [rawGoogleBook(ageBand, title, { maturityBand: "NOT_MATURE", maturityRating: "NOT_MATURE" })]);
  assertEqual(run.normalized[0].maturityBand, ageBand, `${ageBand}: normalized maturityBand should remain the requested deck label`);
  assertEqual(run.diagnostics.googleBooksContentMaturityByTitle[title], "not_mature", `${ageBand}: NOT_MATURE should be content maturity`);
  assertEqual(run.diagnostics.googleBooksAudienceBandByTitle[title], ageBand, `${ageBand}: source audience band should be preserved`);
  assertNotEqual(run.diagnostics.googleBooksAgeBandDropReasonByTitle[title], "maturity_band_mismatch", `${ageBand}: NOT_MATURE must not be an age-band mismatch`);
  assertEqual(run.diagnostics.googleBooksAudienceMaturityMismatchTitles.length, 0, `${ageBand}: no audience/maturity mismatch should be reported`);
  console.log(`PASS ${ageBand}: NOT_MATURE is allowed as content maturity`);
}

{
  const title = "Adult NOT_MATURE Candidate";
  const run = runFlow("adult", [rawGoogleBook("adult", title, { maturityBand: "NOT_MATURE", maturityRating: "NOT_MATURE" })]);
  assertEqual(run.normalized[0].maturityBand, "NOT_MATURE", "Adult Google Books should preserve previous top-level maturityBand behavior");
  assertEqual(run.diagnostics.googleBooksContentMaturityByTitle[title], "not_mature", "Adult NOT_MATURE should be diagnosed as content maturity");
  assertEqual(run.diagnostics.googleBooksAudienceMaturityMismatchTitles.length, 0, "Adult NOT_MATURE should not create a mismatch");
  console.log("PASS adult: NOT_MATURE remains allowed and preserves existing Adult normalization");
}

for (const ageBand of ["kids", "preteens"]) {
  const title = `${ageBand} Explicit Mature Candidate`;
  const run = runFlow(ageBand, [rawGoogleBook(ageBand, title, { maturityBand: "MATURE", maturityRating: "MATURE" })]);
  const expectedReason = ageBand === "kids"
    ? "googlebooks_mature_content_not_allowed_for_kids"
    : "googlebooks_mature_content_not_allowed_for_preteens";
  assertEqual(run.diagnostics.googleBooksContentMaturityByTitle[title], "mature", `${ageBand}: MATURE should be content maturity`);
  assertEqual(run.diagnostics.googleBooksAgeBandDropReasonByTitle[title], expectedReason, `${ageBand}: explicit mature content should be rejected`);
  assertEqual(run.diagnostics.googleBooksMaturityDecisionByTitle[title], `explicit_mature_content_rejected_for_${ageBand}`, `${ageBand}: mature rejection should be diagnosed separately`);
  console.log(`PASS ${ageBand}: explicit mature content remains separately enforceable`);
}

{
  const title = "Teen Explicit Mature Candidate";
  const run = runFlow("teens", [rawGoogleBook("teens", title, { maturityBand: "MATURE", maturityRating: "MATURE" })]);
  assertEqual(run.normalized[0].maturityBand, "teens", "Teen Google Books should preserve deck identity separately from MATURE");
  assertNotIncludes([run.diagnostics.googleBooksAgeBandDropReasonByTitle[title]], "googlebooks_mature_content_not_allowed_for_teens", "Teen should not use Kids/Pre-Teen mature-content reasons");
  assertEqual(run.diagnostics.googleBooksMaturityDecisionByTitle[title], "explicit_mature_content_tracked_separately_for_teens", "Teen maturity treatment should be explicit and independent");
  console.log("PASS teens: explicit mature content is tracked separately from deck identity");
}

{
  const title = "Teen Kids-Labeled YA Novel Candidate";
  const run = runFlow("teens", [rawGoogleBook("teens", title, {
    audienceBand: "kids",
    maturityBand: "NOT_MATURE",
    maturityRating: "NOT_MATURE",
    sourceMaturityRating: "NOT_MATURE",
    queryText: "young adult fantasy fiction novel",
    originalPlannedQuery: "young adult fantasy fiction novel",
    googleBooksPublicationShape: "novel",
    googleBooksNarrativeConfidence: 7,
    googleBooksStoryLevelNarrativeEvidence: ["explicit_novel_identity", "plot_level_conflict_and_stakes"],
    genres: ["Young Adult Fiction / Fantasy", "Young Adult Fiction / Action & Adventure"],
    description: "A young adult fantasy novel follows a teen heroine through a dangerous rebellion and school conspiracy.",
  })]);
  assertEqual(run.normalized[0].maturityBand, "kids", "Teen rescue should not mutate source audience normalization");
  assertEqual(run.diagnostics.googleBooksAgeBandDropReasonByTitle[title], "selected_googlebooks_candidate", "Teen reconciliation should rescue YA narrative books mislabeled as kids");
  assertEqual(run.selection.rejectedReasons.teenGoogleBooksAudienceReconciliationDecisionByTitle[title], "rescued", "Teen reconciliation decision should be explicitly diagnosed as rescued");
  assertEqual(run.selection.rejectedReasons.teenGoogleBooksAudienceReconciliationReasonByTitle[title], "teen_googlebooks_audience_reconciliation_rescue", "Teen reconciliation reason should record the rescue path");
  assertIncludes(run.selection.rejectedReasons.googleBooksFinalEligibilityEvidenceByTitle[title], "teen_audience_reconciliation:rescued", "Final eligibility evidence should include teen reconciliation status");
  console.log("PASS teens: kids-labeled YA narratives can be rescued via audience reconciliation");
}

{
  const title = "Teen Kids-Labeled Early Reader Candidate";
  const run = runFlow("teens", [rawGoogleBook("teens", title, {
    audienceBand: "kids",
    maturityBand: "NOT_MATURE",
    maturityRating: "NOT_MATURE",
    sourceMaturityRating: "NOT_MATURE",
    queryText: "young adult fantasy fiction novel",
    originalPlannedQuery: "young adult fantasy fiction novel",
    googleBooksPublicationShape: "novel",
    googleBooksNarrativeConfidence: 7,
    googleBooksStoryLevelNarrativeEvidence: ["explicit_novel_identity", "plot_level_conflict_and_stakes"],
    genres: ["Juvenile Fiction / Readers / Beginner", "Picture books"],
    description: "A picture book for beginning readers in grade 2 follows a class through an early reader adventure.",
  })]);
  assertEqual(run.diagnostics.googleBooksAgeBandDropReasonByTitle[title], "maturity_band_mismatch", "Teen reconciliation must not rescue explicit early-reader books");
  assertEqual(run.selection.rejectedReasons.teenGoogleBooksAudienceReconciliationDecisionByTitle[title], "rejected", "Teen reconciliation should record a blocked rescue decision");
  assertEqual(run.selection.rejectedReasons.teenGoogleBooksAudienceReconciliationReasonByTitle[title], "teen_audience_reconciliation_explicit_early_reader_markers", "Teen reconciliation should explain the block reason");
  assertIncludes(run.selection.rejectedReasons.googleBooksFinalEligibilityEvidenceByTitle[title], "teen_audience_reconciliation:rejected", "Final eligibility evidence should record rejected teen reconciliation");
  console.log("PASS teens: explicit early-reader evidence remains an enforced reject");
}

{
  const title = "Unknown Maturity Candidate";
  const run = runFlow("kids", [rawGoogleBook("kids", title, { maturityBand: undefined, maturityRating: undefined, sourceMaturityRating: undefined })]);
  assertEqual(run.normalized[0].maturityBand, "kids", "Unknown maturity must not become a maturity deck label");
  assertEqual(run.diagnostics.googleBooksContentMaturityByTitle[title], "unknown", "Unknown maturity should remain unknown");
  assertEqual(run.diagnostics.googleBooksMaturityDecisionByTitle[title], "unknown_maturity_preserved_without_deck_inference", "Unknown maturity should not be treated as mature");
  assertNotEqual(run.diagnostics.googleBooksAgeBandDropReasonByTitle[title], "maturity_band_mismatch", "Unknown maturity should not create a deck mismatch");
  console.log("PASS unknown: maturity is neither mature nor a deck label");
}

{
  const title = "The Band of Bigs";
  const run = runFlow("kids", [rawGoogleBook("kids", title, { maturityBand: "NOT_MATURE", maturityRating: "NOT_MATURE" })]);
  assertEqual(run.normalized[0].raw.ageBand, "kids", "The Band of Bigs fixture should preserve raw ageBand");
  assertEqual(run.normalized[0].maturityBand, "kids", "The Band of Bigs should normalize deck identity separately");
  assertEqual(run.diagnostics.googleBooksContentMaturityByTitle[title], "not_mature", "The Band of Bigs should diagnose NOT_MATURE as content maturity");
  assertEqual(run.diagnostics.googleBooksAgeBandDropReasonByTitle[title], "selected_googlebooks_candidate", "The Band of Bigs must not be rejected solely for NOT_MATURE");
  assertIncludes(run.diagnostics.googleBooksAgeBandRenderedTitlesByDeck.kids, title, "The Band of Bigs should survive the live failure shape");
  console.log("PASS live-shape: The Band of Bigs no longer fails maturity_band_mismatch");
}

{
  const title = "Pre-Teen Juvenile Fiction Reclassified Candidate";
  const run = runFlow("preteens", [rawGoogleBook("preteens", title, {
    audienceBand: "kids",
    maturityBand: "NOT_MATURE",
    maturityRating: "NOT_MATURE",
    sourceMaturityRating: "NOT_MATURE",
    description: "A middle grade adventure novel follows two friends who solve a dangerous mystery in their town library.",
    genres: ["Juvenile Fiction / Action & Adventure"],
  })]);
  assertEqual(run.normalized[0].maturityBand, undefined, "Pre-Teen NOT_MATURE juvenile-fiction labels should be reclassified to unknown maturity band");
  assertEqual(run.diagnostics.googleBooksAgeBandDropReasonByTitle[title], "selected_googlebooks_candidate", "Pre-Teen reclassified juvenile-fiction title should no longer fail maturity mismatch");
  console.log("PASS preteens: broad juvenile-fiction kids labels can be evaluated");
}

{
  const title = "Pre-Teen Explicit Early Reader Candidate";
  const run = runFlow("preteens", [rawGoogleBook("preteens", title, {
    audienceBand: "kids",
    maturityBand: "NOT_MATURE",
    maturityRating: "NOT_MATURE",
    sourceMaturityRating: "NOT_MATURE",
    description: "A picture book for beginning readers in grade 1 follows a preschool class through alphabet fun.",
    genres: ["Juvenile Fiction / Readers / Beginner", "Picture books"],
  })]);
  assertEqual(run.normalized[0].maturityBand, "kids", "Explicit early-reader markers must remain kids for Pre-Teens");
  assertEqual(run.diagnostics.googleBooksAgeBandDropReasonByTitle[title], "maturity_band_mismatch", "Explicit early-reader books should still fail the Pre-Teen maturity gate");
  console.log("PASS preteens: explicit early-reader markers remain protected");
}

{
  const title = "Pre-Teen Teen-Labeled Middle Grade Candidate";
  const run = runFlow("preteens", [rawGoogleBook("preteens", title, {
    audienceBand: "teens",
    maturityBand: "NOT_MATURE",
    maturityRating: "NOT_MATURE",
    sourceMaturityRating: "NOT_MATURE",
    description: "A middle grade fantasy novel follows Lina as she solves a hidden-school mystery and protects her friends.",
    genres: ["Juvenile Fiction / Fantasy & Magic", "Middle grade fiction"],
  })]);
  assertEqual(run.normalized[0].maturityBand, undefined, "High-confidence middle-grade novels should bypass teen source labels for Pre-Teens");
  assertEqual(run.diagnostics.googleBooksAgeBandDropReasonByTitle[title], "selected_googlebooks_candidate", "Teen-labeled middle-grade novel should remain eligible for Pre-Teens");
  console.log("PASS preteens: high-confidence middle-grade novels bypass teen source labels");
}

{
  const title = "Pre-Teen Adult-Labeled Middle Grade Candidate";
  const run = runFlow("preteens", [rawGoogleBook("preteens", title, {
    audienceBand: "adult",
    maturityBand: "NOT_MATURE",
    maturityRating: "NOT_MATURE",
    sourceMaturityRating: "NOT_MATURE",
    description: "A middle grade fantasy novel follows Lina as she solves a hidden-school mystery and protects her friends.",
    genres: ["Juvenile Fiction / Fantasy & Magic", "Middle grade fiction"],
  })]);
  assertEqual(run.normalized[0].maturityBand, undefined, "High-confidence middle-grade novels should bypass adult source labels for Pre-Teens");
  assertEqual(run.diagnostics.googleBooksAgeBandDropReasonByTitle[title], "selected_googlebooks_candidate", "Adult-labeled middle-grade novel should remain eligible for Pre-Teens");
  console.log("PASS preteens: high-confidence middle-grade novels bypass adult source labels");
}

{
  const title = "Pre-Teen Teen-Labeled Nonfiction Guide Candidate";
  const run = runFlow("preteens", [rawGoogleBook("preteens", title, {
    audienceBand: "teens",
    maturityBand: "NOT_MATURE",
    maturityRating: "NOT_MATURE",
    sourceMaturityRating: "NOT_MATURE",
    description: "A classroom study guide with chapter summaries and teacher prompts for literature instruction.",
    genres: ["Education", "Juvenile Nonfiction"],
  })]);
  assertEqual(run.normalized[0].maturityBand, "teens", "Non-middle-grade artifacts must not bypass teen source labels");
  console.log("PASS preteens: non-middle-grade teen labels remain unchanged");
}

console.log("PASS googlebooks audience/maturity separation regressions");
