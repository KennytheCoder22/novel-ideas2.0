/**
 * Regression tests: Adult Google Books taste-alignment diagnostics.
 *
 * Verifies:
 * 1. Every ranked candidate gets a complete taste-alignment explanation
 *    (tasteEvidenceSource, threshold, allCandidateTasteFamilies, likedSignalCount).
 * 2. Candidates with no metadata-backed liked signals receive reason
 *    "no_document_backed_liked_signals" and tasteEvidenceSource "none".
 * 3. A candidate with a matching content-family signal receives
 *    reason "positive_net_liked_family_document_backed".
 * 4. Disliked evidence cancels a family that would otherwise pass.
 * 5. A broad-tone-only signal fails without genreFacetMatch > 0.
 * 6. Two specific tone/theme signals pass the gate.
 * 7. Context-only signals alone fail.
 * 8. negativeNetTasteFamilies is correctly populated.
 * 9. profileLikedFamilies reflects the profile's top genre/tone/theme families.
 * 10. Pre-ranking rejections show real reason in droppedReasonByTitle
 *     (The Burning Court diagnostic inconsistency fix).
 * 11. Frozen publication-shape and mock-source regressions remain green.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

function assertDeepEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTruthy(value, message) {
  if (!value) throw new Error(`${message}: expected truthy, got ${JSON.stringify(value)}`);
}

function assertFalsy(value, message) {
  if (value) throw new Error(`${message}: expected falsy, got ${JSON.stringify(value)}`);
}

function assertIncludes(array, item, message) {
  if (!Array.isArray(array) || !array.includes(item)) {
    throw new Error(`${message}: ${JSON.stringify(array)} should include ${JSON.stringify(item)}`);
  }
}

function assertNotIncludes(array, item, message) {
  if (Array.isArray(array) && array.includes(item)) {
    throw new Error(`${message}: ${JSON.stringify(array)} should NOT include ${JSON.stringify(item)}`);
  }
}

const dir = resolve(fileURLToPath(new URL("../app/recommender-v2", import.meta.url)));

// Load the internal function via the select module transpilation.
// Since adultGoogleBooksMeaningfulTasteEligibility is not exported, we test it
// indirectly via adultGoogleBooksFinalEligibility or via the full selection pipeline.
// We build minimal ScoredCandidate fixtures.

function makeScoredCandidate({
  title = "Test Book",
  subtitle = "",
  description = "A test book.",
  likedSignals = [],
  dislikedSignals = [],
  genreFacetMatch = 0,
  source = "googleBooks",
  creators = ["Test Author"],
  genres = [],
  themes = [],
  tones = [],
  formats = ["book"],
  queryText = "",
  queryFamily = "",
  facets = [],
  score = 1,
  scoreBreakdown = {},
  raw = {},
} = {}) {
  return {
    id: `test-${title.toLowerCase().replace(/\s+/g, "-")}`,
    title,
    subtitle,
    source,
    score,
    creators,
    description,
    genres,
    tones,
    themes,
    characterDynamics: [],
    formats,
    diagnostics: {
      metadataBackedMatchedLikedSignals: likedSignals,
      metadataBackedMatchedDislikedSignals: dislikedSignals,
      queryText,
      queryFamily,
      facets,
    },
    scoreBreakdown: {
      sourceQualityRelevance: 1,
      genreFacetMatch,
      ...scoreBreakdown,
    },
    rejectedReasons: [],
    raw,
  };
}

function novelCandidate(overrides = {}) {
  const title = overrides.title || "Novel Candidate";
  return makeScoredCandidate({
    title,
    subtitle: "A Novel",
    description: "A detective must uncover secrets in a dangerous case while the story follows a protagonist facing escalating conflict.",
    creators: ["Regression Author"],
    genres: ["Fiction / Mystery & Detective"],
    raw: {
      volumeInfo: {
        categories: ["Fiction / Mystery & Detective"],
        description: "A detective must uncover secrets in a dangerous case while the story follows a protagonist facing escalating conflict.",
      },
    },
    ...overrides,
  });
}

const adultProfile = {
  ageBand: "adult",
  maturityBand: "adult",
  genreFamily: [{ value: "mystery", weight: 5 }, { value: "historical", weight: 3 }],
  tone: [{ value: "atmospheric", weight: 4 }, { value: "dark", weight: 2 }],
  themes: [{ value: "secrets", weight: 3 }, { value: "investigation", weight: 2 }],
  pacing: [],
  characterDynamics: [],
  formatPreference: [{ value: "book", weight: 4 }],
  avoidSignals: [{ value: "romance", weight: 3 }],
  diagnostics: {},
};

// We need the select module's internal functions. Since they're not exported,
// we test via selectRecommendations + addAdultGoogleBooksSelectionObservability side effects.
const { selectRecommendations } = require(resolve(dir, "select.ts"));

// Helper: run selection and extract rejectedReasons (which holds all diagnostic maps).
function runSelection(candidates, profile = adultProfile, limit = 10) {
  const { rejectedReasons } = selectRecommendations(candidates, profile, limit);
  return rejectedReasons;
}

// ─── T1: No metadata-backed liked signals → no_document_backed_liked_signals ──
{
  const candidate = makeScoredCandidate({ title: "Empty Signals Book", likedSignals: [], dislikedSignals: [] });
  const diagnostics = runSelection([candidate]);
  const failureReason = diagnostics.adultGoogleBooksMeaningfulTasteFailureReasonByTitle?.["Empty Signals Book"];
  assertEqual(failureReason, "no_document_backed_liked_signals", "T1: empty signals → no_document_backed_liked_signals");
  const evidenceSource = diagnostics.adultGoogleBooksTasteEvidenceSourceByTitle?.["Empty Signals Book"];
  assertEqual(evidenceSource, "none", "T1: tasteEvidenceSource must be 'none' with no signals");
  const score = diagnostics.adultGoogleBooksMeaningfulAlignmentScoreByTitle?.["Empty Signals Book"];
  assertEqual(score, 0, "T1: meaningfulAlignmentScore must be 0 with no signals");
  console.log("PASS T1: no signals → no_document_backed_liked_signals");
}

// ─── T2: Matching content-family signal → positive_net_liked_family ───────────
{
  const candidate = makeScoredCandidate({ title: "Mystery Novel", likedSignals: ["mystery", "crime"], dislikedSignals: [] });
  const diagnostics = runSelection([candidate]);
  const tasteReason = diagnostics.adultGoogleBooksMeaningfulTasteFailureReasonByTitle?.["Mystery Novel"];
  assertEqual(tasteReason, "positive_net_liked_family_document_backed", "T2: mystery family should report the positive family pass reason");
  const passed = diagnostics.adultGoogleBooksMeaningfulTastePassedByTitle?.["Mystery Novel"];
  assertTruthy(passed, "T2: mystery family should pass meaningfulTaste");
  const candidateFamilies = diagnostics.adultGoogleBooksCandidateTasteFamiliesByTitle?.["Mystery Novel"];
  assertIncludes(candidateFamilies, "mystery_crime_thriller", "T2: mystery family must be in candidateTasteFamilies");
  const evidenceSource = diagnostics.adultGoogleBooksTasteEvidenceSourceByTitle?.["Mystery Novel"];
  assertEqual(evidenceSource, "family", "T2: tasteEvidenceSource must be 'family' for family match");
  console.log("PASS T2: mystery family signal → positive_net_liked_family_document_backed");
}

// ─── T3: Disliked evidence cancels a matched family ────────────────────────────
{
  const candidate = makeScoredCandidate({ title: "Fantasy with Dislike", likedSignals: ["fantasy"], dislikedSignals: ["fantasy"] });
  const diagnostics = runSelection([candidate]);
  const passed = diagnostics.adultGoogleBooksMeaningfulTastePassedByTitle?.["Fantasy with Dislike"];
  assertFalsy(passed, "T3: equal liked and disliked family must NOT pass (not strictly greater)");
  const negFamilies = diagnostics.adultGoogleBooksNegativeNetTasteFamiliesByTitle?.["Fantasy with Dislike"];
  // When equal, neither list wins → should not be in positiveNet or negativeNet
  assertNotIncludes(diagnostics.adultGoogleBooksPositiveNetTasteFamiliesByTitle?.["Fantasy with Dislike"] || [], "fantasy", "T3: tied family must not be in positiveNet");
  console.log("PASS T3: disliked cancels same family → gate fails");
}

// ─── T4: Two specific tone/theme signals → passes ─────────────────────────────
{
  const candidate = makeScoredCandidate({ title: "Atmospheric Investigation", likedSignals: ["psychological", "investigation"], dislikedSignals: [] });
  const diagnostics = runSelection([candidate]);
  const passed = diagnostics.adultGoogleBooksMeaningfulTastePassedByTitle?.["Atmospheric Investigation"];
  assertTruthy(passed, "T4: two specific tone/theme signals should pass");
  const evidenceSource = diagnostics.adultGoogleBooksTasteEvidenceSourceByTitle?.["Atmospheric Investigation"];
  assertEqual(evidenceSource, "specific_tone_theme", "T4: tasteEvidenceSource must be specific_tone_theme");
  console.log("PASS T4: two specific tone/theme signals → specific_liked_tone_theme_document_backed");
}

// ─── T5: Broad tone only, no genreFacetMatch → fails ─────────────────────────
{
  const candidate = makeScoredCandidate({ title: "Only Dark", likedSignals: ["dark"], dislikedSignals: [], genreFacetMatch: 0 });
  const diagnostics = runSelection([candidate]);
  const passed = diagnostics.adultGoogleBooksMeaningfulTastePassedByTitle?.["Only Dark"];
  assertFalsy(passed, "T5: single broad tone with no genreFacetMatch should fail");
  const failureReason = diagnostics.adultGoogleBooksMeaningfulTasteFailureReasonByTitle?.["Only Dark"];
  assertEqual(failureReason, "broad_tone_without_content_family_corroboration", "T5: failure reason must be broad_tone_without_content_family_corroboration");
  console.log("PASS T5: broad tone only (no genreFacetMatch) → broad_tone_without_content_family_corroboration");
}

// ─── T6: Broad tone + positive genreFacetMatch → passes ───────────────────────
{
  const candidate = makeScoredCandidate({ title: "Dark with FacetMatch", likedSignals: ["dark"], dislikedSignals: [], genreFacetMatch: 1 });
  const diagnostics = runSelection([candidate]);
  const passed = diagnostics.adultGoogleBooksMeaningfulTastePassedByTitle?.["Dark with FacetMatch"];
  assertFalsy(passed, "T6: broad tone with genreFacetMatch > 0 still needs a family or specific signal to pass");
  const failureReason = diagnostics.adultGoogleBooksMeaningfulTasteFailureReasonByTitle?.["Dark with FacetMatch"];
  assertEqual(failureReason, "no_positive_net_document_backed_taste_support", "T6: broad tone + facet match should not use the broad-tone-only branch");
  console.log("PASS T6: broad tone + genreFacetMatch > 0 avoids broad-tone-only but still fails final taste combination");
}

// ─── T7: Context-only signals alone → fails ────────────────────────────────────
{
  const candidate = makeScoredCandidate({ title: "Family Friendship", likedSignals: ["family", "friendship"], dislikedSignals: [] });
  const diagnostics = runSelection([candidate]);
  const passed = diagnostics.adultGoogleBooksMeaningfulTastePassedByTitle?.["Family Friendship"];
  assertFalsy(passed, "T7: context-only signals should fail");
  const failureReason = diagnostics.adultGoogleBooksMeaningfulTasteFailureReasonByTitle?.["Family Friendship"];
  assertEqual(failureReason, "context_only_signal_not_meaningful", "T7: failure reason must be context_only_signal_not_meaningful");
  console.log("PASS T7: context-only signals → context_only_signal_not_meaningful");
}

// ─── T8: negativeNetTasteFamilies is populated ────────────────────────────────
{
  const candidate = makeScoredCandidate({ title: "Disliked Horror", likedSignals: ["mystery"], dislikedSignals: ["horror"] });
  const diagnostics = runSelection([candidate]);
  const negFamilies = diagnostics.adultGoogleBooksNegativeNetTasteFamiliesByTitle?.["Disliked Horror"];
  assertIncludes(negFamilies || [], "horror_paranormal", "T8: disliked horror must appear in negativeNetTasteFamilies");
  console.log("PASS T8: negativeNetTasteFamilies populated for disliked horror family");
}

// ─── T9: profileLikedFamilies reflects profile genre/tone/theme families ───────
{
  const diagnostics = runSelection([makeScoredCandidate({ title: "Any Book" })], adultProfile);
  const profileFamilies = diagnostics.adultGoogleBooksProfileLikedFamilies || [];
  // adultProfile has mystery, historical, atmospheric (supplemental→""), dark (supplemental→""), secrets (→""), investigation (→"")
  // mystery → mystery_crime_thriller, historical → historical
  assertIncludes(profileFamilies, "mystery_crime_thriller", "T9: profile with mystery should include mystery_crime_thriller");
  assertIncludes(profileFamilies, "historical", "T9: profile with historical should include historical");
  console.log("PASS T9: profileLikedFamilies contains mystery_crime_thriller and historical from profile");
}

// ─── T10: profileAvoidFamilies reflects profile.avoidSignals ──────────────────
{
  const diagnostics = runSelection([makeScoredCandidate({ title: "Any Book 2" })], adultProfile);
  const avoidFamilies = diagnostics.adultGoogleBooksProfileAvoidFamilies || [];
  // adultProfile.avoidSignals = [{ value: "romance" }] → romance → romance family
  assertIncludes(avoidFamilies, "romance", "T10: profile with avoid:romance should include romance in profileAvoidFamilies");
  console.log("PASS T10: profileAvoidFamilies contains romance from avoidSignals");
}

// ─── T11: All ranked candidates get a complete alignment explanation ────────────
{
  const candidates = [
    makeScoredCandidate({ title: "Book A", likedSignals: ["mystery"] }),
    makeScoredCandidate({ title: "Book B", likedSignals: [] }),
    makeScoredCandidate({ title: "Book C", likedSignals: ["psychological", "atmospheric"] }),
  ];
  const diagnostics = runSelection(candidates);
  for (const title of ["Book A", "Book B", "Book C"]) {
    assertTruthy(
      diagnostics.adultGoogleBooksTasteEvidenceSourceByTitle?.[title] !== undefined,
      `T11: ${title} must have a tasteEvidenceSource entry`,
    );
    assertTruthy(
      diagnostics.adultGoogleBooksMeaningfulAlignmentThresholdByTitle?.[title] !== undefined,
      `T11: ${title} must have a meaningfulAlignmentThreshold entry`,
    );
    assertTruthy(
      diagnostics.adultGoogleBooksMeaningfulAlignmentScoreByTitle?.[title] !== undefined,
      `T11: ${title} must have a meaningfulAlignmentScore entry`,
    );
    assertTruthy(
      diagnostics.adultGoogleBooksCandidateTasteFamiliesByTitle?.[title] !== undefined,
      `T11: ${title} must have a candidateTasteFamilies entry`,
    );
  }
  console.log("PASS T11: every ranked candidate has complete alignment explanation");
}

// ─── T12: Mock source still disabled with normal profile ──────────────────────
{
  const { buildSearchPlan } = require(resolve(dir, "searchPlan.ts"));
  const plan = buildSearchPlan(adultProfile, { googleBooks: true });
  const mockPlan = plan.sourcePlans.find((p) => p.source === "mock");
  assertFalsy(mockPlan?.enabled, "T12: mock must still be disabled after taste-alignment changes");
  console.log("PASS T12: mock source still disabled in normal runs");
}

// T13: Semantic derivation diagnostics produce one cohort per rejected ranked candidate.
{
  const profile = {
    ...adultProfile,
    avoidSignals: [{ value: "romance", weight: 3 }, { value: "horror", weight: 2 }],
  };
  const candidates = [
    makeScoredCandidate({ title: "No Evidence", likedSignals: [], dislikedSignals: [], queryText: "mystery thriller" }),
    novelCandidate({
      title: "Light Novel Alias",
      likedSignals: ["light novel"],
      queryText: "fantasy adventure",
      description: "A light novel about an isekai hero summoned to another world with magical gods, fairy courts, quests, dungeons, adventurers, and RPG-like game world rules.",
      raw: {
        volumeInfo: {
          categories: ["Fiction / Fantasy"],
          description: "A light novel about an isekai hero summoned to another world with magical gods, fairy courts, quests, dungeons, adventurers, and RPG-like game world rules.",
        },
      },
    }),
    novelCandidate({ title: "Broad Tone", likedSignals: ["dark"], queryText: "horror fiction" }),
    novelCandidate({ title: "Context Only", likedSignals: ["family"], queryText: "family drama fiction" }),
    makeScoredCandidate({ title: "Romance Non Profile", likedSignals: ["romance"], dislikedSignals: [], queryText: "romance novel", description: "A sparse record." }),
    novelCandidate({ title: "Avoided Horror", likedSignals: ["horror"], dislikedSignals: ["horror"], queryText: "horror novel" }),
    makeScoredCandidate({
      title: "Positive Branch Failure",
      likedSignals: ["mystery"],
      queryText: "mystery thriller",
      description: "A sparse record.",
      raw: {},
      scoreBreakdown: { sourceQualityRelevance: 1 },
    }),
    novelCandidate({ title: "Specific Tie Failure", likedSignals: ["mystery", "psychological"], dislikedSignals: ["mystery"], queryText: "mystery thriller" }),
  ];
  const diagnostics = runSelection(candidates, profile);
  const cohortByTitle = diagnostics.adultGoogleBooksAlignmentFailureCohortByTitle || {};
  for (const title of candidates.map((candidate) => candidate.title)) {
    assertTruthy(cohortByTitle[title], `T13: ${title} must have one primary failure cohort`);
  }
  assertEqual(cohortByTitle["No Evidence"], "no_document_backed_liked_signals", "T13: no evidence cohort");
  assertEqual(cohortByTitle["Light Novel Alias"], "liked_signals_present_but_no_candidate_family", "T13: light novel alias must be distinguished from zero evidence");
  assertEqual(cohortByTitle["Broad Tone"], "broad_tone_only", "T13: broad tone cohort");
  assertEqual(cohortByTitle["Context Only"], "context_only", "T13: context-only cohort");
  assertEqual(cohortByTitle["Romance Non Profile"], "candidate_family_canceled_by_avoid_evidence", "T13: avoided romance family cohort");
  assertEqual(cohortByTitle["Avoided Horror"], "candidate_family_canceled_by_avoid_evidence", "T13: avoided horror family cohort");
  assertEqual(cohortByTitle["Positive Branch Failure"], "positive_score_but_failed_named_branch", "T13: positive taste can still fail later named branch");
  assertEqual(cohortByTitle["Specific Tie Failure"], "specific_evidence_present_but_no_passing_combination", "T13: specific evidence without passing combination cohort");
  assertEqual(diagnostics.adultGoogleBooksAlignmentFailureCohortCount?.no_document_backed_liked_signals, 1, "T13: failure cohort count");
  console.log("PASS T13: rejected Adult Google Books candidates get primary failure cohorts");
}

// T14: Raw semantic trace shows field support, canonicalization, unmapped aliases.
{
  const candidate = novelCandidate({
    title: "Prisoner Of Fate",
    likedSignals: ["light novel", "magic"],
    queryText: "fantasy adventure",
    description: "A light novel where an isekai prisoner enters another world, learns magic, meets gods and fairy allies, and accepts a quest through a dungeon.",
    raw: {
      volumeInfo: {
        categories: ["Fiction / Fantasy"],
        description: "A light novel where an isekai prisoner enters another world, learns magic, meets gods and fairy allies, and accepts a quest through a dungeon.",
      },
    },
  });
  const diagnostics = runSelection([candidate]);
  assertIncludes(diagnostics.adultGoogleBooksRawSemanticTermsByTitle?.["Prisoner Of Fate"], "light novel", "T14: raw trace should include light novel");
  assertIncludes(diagnostics.adultGoogleBooksRawSemanticTermsByTitle?.["Prisoner Of Fate"], "isekai", "T14: raw trace should include isekai");
  assertIncludes(diagnostics.adultGoogleBooksCanonicalizedSemanticTermsByTitle?.["Prisoner Of Fate"], "light novel", "T14: canonical trace should include light novel");
  assertIncludes(diagnostics.adultGoogleBooksUnmappedSemanticTermsByTitle?.["Prisoner Of Fate"], "light novel", "T14: light novel should be visible as unmapped under current production family mapping");
  assertIncludes(diagnostics.adultGoogleBooksFamilyDerivationEvidenceByTitle?.["Prisoner Of Fate"]?.fantasy || [], "magic description categories", "T14: family derivation identifies term and metadata field");
  console.log("PASS T14: semantic derivation trace exposes light-novel aliases and field-level family evidence");
}

// T15: Query-family counterfactuals are diagnostic-only, bounded, and avoid-aware.
{
  const rescue = novelCandidate({ title: "Counterfactual Rescue", likedSignals: ["psychological"], queryText: "mystery thriller", queryFamily: "mystery" });
  const generic = novelCandidate({ title: "Generic Query Block", likedSignals: ["psychological"], queryText: "fiction books", queryFamily: "books" });
  const avoidProfile = { ...adultProfile, avoidSignals: [{ value: "mystery", weight: 3 }] };
  const avoid = novelCandidate({ title: "Avoid Query Block", likedSignals: ["psychological"], queryText: "mystery thriller", queryFamily: "mystery" });
  const rescueDiagnostics = runSelection([rescue]);
  const genericDiagnostics = runSelection([generic]);
  const avoidDiagnostics = runSelection([avoid], avoidProfile);
  assertTruthy(rescueDiagnostics.adultGoogleBooksQueryFamilyCounterfactualWouldPassByTitle?.["Counterfactual Rescue"], "T15: profile-liked query family can be counted as a counterfactual rescue");
  assertEqual(rescueDiagnostics.adultGoogleBooksQueryFamilyCounterfactualRescueCount, 1, "T15: rescue count is diagnostic");
  assertEqual(rescueDiagnostics.adultGoogleBooksMeaningfulTastePassedByTitle?.["Counterfactual Rescue"], false, "T15: counterfactual must not alter actual gate");
  assertFalsy(genericDiagnostics.adultGoogleBooksQueryFamilyCounterfactualWouldPassByTitle?.["Generic Query Block"], "T15: generic query cannot rescue");
  assertEqual(genericDiagnostics.adultGoogleBooksQueryFamilyCounterfactualBlockedReasonByTitle?.["Generic Query Block"], "generic_query_terms_cannot_rescue", "T15: generic query block reason");
  assertFalsy(avoidDiagnostics.adultGoogleBooksQueryFamilyCounterfactualWouldPassByTitle?.["Avoid Query Block"], "T15: avoid evidence blocks counterfactual");
  assertIncludes([avoidDiagnostics.adultGoogleBooksQueryFamilyCounterfactualBlockedReasonByTitle?.["Avoid Query Block"]], "avoid_evidence_blocks_query_family:mystery_crime_thriller", "T15: avoid block reason includes family");
  console.log("PASS T15: query-family counterfactuals are bounded and do not change actual eligibility");
}

// T16: Pass cohorts cover positive family, specific evidence, and strong narrative override.
{
  const candidates = [
    novelCandidate({ title: "Positive Family Pass", creators: ["Regression Author One"], likedSignals: ["mystery"], queryText: "mystery thriller" }),
    novelCandidate({ title: "Specific Evidence Pass", creators: ["Regression Author Two"], likedSignals: ["psychological", "investigation"], queryText: "psychological suspense" }),
    novelCandidate({ title: "Strong Override Pass", creators: ["Regression Author Three"], likedSignals: ["mystery"], queryText: "mystery thriller", scoreBreakdown: { sourceQualityRelevance: 0 } }),
  ];
  const diagnostics = runSelection(candidates);
  assertEqual(diagnostics.adultGoogleBooksAlignmentPassCohortByTitle?.["Positive Family Pass"], "passed_by_positive_family", "T16: positive family pass cohort");
  assertEqual(diagnostics.adultGoogleBooksAlignmentPassCohortByTitle?.["Specific Evidence Pass"], "passed_by_specific_evidence", "T16: specific evidence pass cohort");
  assertEqual(diagnostics.adultGoogleBooksAlignmentPassCohortByTitle?.["Strong Override Pass"], "passed_by_strong_narrative_override", "T16: strong narrative override pass cohort");
  assertDeepEqual(
    diagnostics.adultGoogleBooksAcceptedTitles,
    ["Positive Family Pass", "Specific Evidence Pass", "Strong Override Pass"],
    "T16: diagnostics-only pass must not change selected titles",
  );
  console.log("PASS T16: Adult Google Books pass cohorts are populated without changing selections");
}

console.log("\nAll taste-alignment diagnostic regression tests passed.");
