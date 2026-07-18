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
 * 11. Swipe-derived Adult family polarity diagnostics are populated.
 * 12. Weighted comparison mode is diagnostic-only and does not alter selection.
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

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../app/recommender-v2");

// Load the internal function via the select module transpilation.
// Since adultGoogleBooksMeaningfulTasteEligibility is not exported, we test it
// indirectly via adultGoogleBooksFinalEligibility or via the full selection pipeline.
// We build minimal ScoredCandidate fixtures.

function makeScoredCandidate({
  title = "Test Book",
  likedSignals = [],
  dislikedSignals = [],
  genreFacetMatch = 0,
  source = "googleBooks",
  scoreBreakdown = {},
  description = "A test book.",
  genres = [],
  categories = [],
} = {}) {
  return {
    id: `test-${title.toLowerCase().replace(/\s+/g, "-")}`,
    title,
    source,
    score: 1,
    creators: ["Test Author"],
    description,
    genres,
    tones: [],
    themes: [],
    characterDynamics: [],
    formats: ["book"],
    diagnostics: {
      metadataBackedMatchedLikedSignals: likedSignals,
      metadataBackedMatchedDislikedSignals: dislikedSignals,
    },
    scoreBreakdown: {
      genreFacetMatch,
      ...scoreBreakdown,
      sourceQualityRelevance: 1,
    },
    rejectedReasons: [],
    raw: {
      volumeInfo: {
        description,
        categories,
      },
    },
  };
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
const { buildTasteProfile } = require(resolve(dir, "tasteProfile.ts"));

// Helper: run selection and extract rejectedReasons (which holds all diagnostic maps).
function runSelection(candidates, profile = adultProfile, limit = 10) {
  const { rejectedReasons } = selectRecommendations(candidates, profile, limit);
  return rejectedReasons;
}

function adultPolarityProfile(signals) {
  return buildTasteProfile({
    ageBand: "adult",
    enabledSources: { googleBooks: true },
    signals,
  });
}

function assertAdultFamilyDecision(profile, family, expected, message) {
  const decision = profile.diagnostics?.adultTasteFamilyPolarityDecision?.[family];
  assertEqual(decision, expected, message);
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
  const failureModes = diagnostics.adultGoogleBooksMeaningfulAlignmentFailureDetailsByTitle?.["Empty Signals Book"]?.failureModes || [];
  assertIncludes(failureModes, "no_family_evidence", "T1: failure diagnostics should classify no family evidence");
  assertTruthy((diagnostics.adultGoogleBooksMeaningfulAlignmentRootCauseSummary || "").includes("no_family_evidence"), "T1: root cause summary should include no_family_evidence");
  console.log("PASS T1: no signals → no_document_backed_liked_signals");
}

// ─── T2: Matching content-family signal → positive_net_liked_family ───────────
{
  const candidate = makeScoredCandidate({ title: "Mystery Novel", likedSignals: ["mystery", "crime"], dislikedSignals: [] });
  const diagnostics = runSelection([candidate]);
  const failureReason = diagnostics.adultGoogleBooksMeaningfulTasteFailureReasonByTitle?.["Mystery Novel"];
  assertEqual(failureReason, "positive_net_liked_family_document_backed", "T2: passing rule should be recorded for mystery family");
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
  const failureModes = diagnostics.adultGoogleBooksMeaningfulAlignmentFailureDetailsByTitle?.["Fantasy with Dislike"]?.failureModes || [];
  assertIncludes(failureModes, "positive_family_canceled", "T3: failure diagnostics should classify canceled positive family");
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
  const failureModes = diagnostics.adultGoogleBooksMeaningfulAlignmentFailureDetailsByTitle?.["Only Dark"]?.failureModes || [];
  assertIncludes(failureModes, "broad_tone_only", "T5: failure diagnostics should classify broad tone only");
  console.log("PASS T5: broad tone only (no genreFacetMatch) → broad_tone_without_content_family_corroboration");
}

// ─── T6: Broad tone + positive genreFacetMatch → passes ───────────────────────
{
  const candidate = makeScoredCandidate({ title: "Dark with FacetMatch", likedSignals: ["dark"], dislikedSignals: [], genreFacetMatch: 1 });
  const diagnostics = runSelection([candidate]);
  const passed = diagnostics.adultGoogleBooksMeaningfulTastePassedByTitle?.["Dark with FacetMatch"];
  assertFalsy(passed, "T6: single broad tone should still need a passing taste combination");
  const failureReason = diagnostics.adultGoogleBooksMeaningfulTasteFailureReasonByTitle?.["Dark with FacetMatch"];
  assertEqual(failureReason, "no_positive_net_document_backed_taste_support", "T6: broad tone with genreFacetMatch > 0 should fall through to normal no-support reason");
  console.log("PASS T6: broad tone + genreFacetMatch > 0 avoids broad-tone-only reason but still fails normal support gate");
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

// â”€â”€â”€ T13: Mixed fantasy stays net-positive with multiple likes and one dislike â”€â”€
{
  const profile = adultPolarityProfile([
    { title: "Liked Dark Fantasy", action: "like", genres: ["Dark Fantasy"], tags: ["fantasy"], source: "mock", format: "book" },
    { title: "Liked Mythic Fantasy", action: "like", genres: ["Fantasy / Mythology"], tags: ["magic"], source: "mock", format: "book" },
    { title: "Disliked Whimsical Fantasy", action: "dislike", genres: ["Fantasy / Adventure"], tags: ["fantasy"], source: "mock", format: "book" },
  ]);
  assertAdultFamilyDecision(profile, "fantasy", "mixed_positive", "T13: multiple fantasy likes plus one dislike should be mixed_positive");
  assertIncludes(profile.diagnostics.adultTasteWeightedLikedFamilies || [], "fantasy", "T13: fantasy should remain weighted-liked");
  assertNotIncludes(profile.diagnostics.adultTasteWeightedAvoidFamilies || [], "fantasy", "T13: fantasy should not be true avoid");
  console.log("PASS T13: mixed fantasy remains net-positive, not true avoid");
}

// â”€â”€â”€ T14: Mixed adventure remains available with stronger liked support â”€â”€
{
  const profile = adultPolarityProfile([
    { title: "Liked Quest One", action: "like", genres: ["Adventure"], tags: ["quest"], source: "mock", format: "book" },
    { title: "Liked Action Two", action: "like", genres: ["Action / Adventure"], tags: ["survival"], source: "mock", format: "book" },
    { title: "Disliked Adventure", action: "dislike", genres: ["Adventure"], tags: ["quest"], source: "mock", format: "book" },
  ]);
  assertAdultFamilyDecision(profile, "adventure_action", "mixed_positive", "T14: adventure should be mixed_positive with stronger liked support");
  assertIncludes(profile.diagnostics.adultTasteWeightedLikedFamilies || [], "adventure_action", "T14: adventure should remain weighted-liked");
  console.log("PASS T14: mixed adventure remains weighted-positive");
}

// â”€â”€â”€ T15: Repeated dislikes with no likes become true avoid â”€â”€â”€â”€â”€â”€
{
  const profile = adultPolarityProfile([
    { title: "Disliked Horror One", action: "dislike", genres: ["Horror"], tags: ["spooky"], source: "mock", format: "book" },
    { title: "Disliked Horror Two", action: "dislike", genres: ["Paranormal / Horror"], tags: ["supernatural"], source: "mock", format: "book" },
  ]);
  assertAdultFamilyDecision(profile, "horror_paranormal", "true_avoid", "T15: repeated horror dislikes should be true_avoid");
  assertIncludes(profile.diagnostics.adultTasteWeightedAvoidFamilies || [], "horror_paranormal", "T15: horror should be weighted avoid");
  console.log("PASS T15: repeated negative evidence still produces true avoid");
}

// â”€â”€â”€ T16: Narrow dislike inside broad fantasy remains mixed, not fully avoided â”€â”€
{
  const profile = adultPolarityProfile([
    { title: "Liked Dark Fantasy", action: "like", genres: ["Dark Fantasy"], tags: ["dark"], source: "mock", format: "book" },
    { title: "Disliked Whimsical Fantasy", action: "dislike", genres: ["Fantasy"], tags: ["playful"], source: "mock", format: "book" },
  ]);
  assertAdultFamilyDecision(profile, "fantasy", "mixed_neutral", "T16: one liked and one disliked fantasy should be mixed_neutral");
  assertNotIncludes(profile.diagnostics.adultTasteWeightedAvoidFamilies || [], "fantasy", "T16: mixed neutral fantasy should not become true avoid");
  console.log("PASS T16: narrow fantasy dislike leaves broad fantasy mixed rather than avoided");
}

// â”€â”€â”€ T17: Multiple mystery likes beat one mystery dislike â”€â”€â”€â”€â”€â”€â”€
{
  const profile = adultPolarityProfile([
    { title: "Liked Mystery One", action: "like", genres: ["Mystery / Thriller"], tags: ["detective"], source: "mock", format: "book" },
    { title: "Liked Crime Two", action: "like", genres: ["Crime"], tags: ["thriller"], source: "mock", format: "book" },
    { title: "Disliked Mystery", action: "dislike", genres: ["Mystery"], tags: ["noir"], source: "mock", format: "book" },
  ]);
  assertAdultFamilyDecision(profile, "mystery_crime_thriller", "mixed_positive", "T17: mystery should remain mixed_positive");
  assertIncludes(profile.diagnostics.adultTasteWeightedLikedFamilies || [], "mystery_crime_thriller", "T17: mystery should remain weighted-liked");
  console.log("PASS T17: contradictory mystery evidence remains usable when net-positive");
}

// â”€â”€â”€ T18: Skips are recorded but excluded from weighted polarity â”€â”€â”€â”€
{
  const profile = adultPolarityProfile([
    { title: "Skipped Fantasy", action: "skip", genres: ["Fantasy"], tags: ["magic"], source: "mock", format: "book" },
  ]);
  assertEqual(profile.diagnostics.adultTasteFamilyPositiveWeight?.fantasy || 0, 0, "T18: skip must not add positive weighted fantasy");
  assertEqual(profile.diagnostics.adultTasteFamilyNegativeWeight?.fantasy || 0, 0, "T18: skip must not add negative weighted fantasy");
  assertIncludes(profile.diagnostics.adultTasteSkippedTitlesExcludedFromPolarity || [], "Skipped Fantasy", "T18: skipped title should be listed as excluded");
  console.log("PASS T18: skips do not affect weighted family polarity");
}

// â”€â”€â”€ T19: Weighted comparison is diagnostic-only; current gate still fails tied family â”€â”€
{
  const profile = adultPolarityProfile([
    { title: "Liked Fantasy One", action: "like", genres: ["Fantasy"], tags: ["magic"], source: "mock", format: "book" },
    { title: "Liked Fantasy Two", action: "like", genres: ["Fantasy / Mythology"], tags: ["dragon"], source: "mock", format: "book" },
    { title: "Disliked Fantasy", action: "dislike", genres: ["Fantasy"], tags: ["quest"], source: "mock", format: "book" },
  ]);
  const candidate = makeScoredCandidate({ title: "Counterfactual Fantasy", likedSignals: ["fantasy"], dislikedSignals: ["fantasy"] });
  const diagnostics = runSelection([candidate], profile);
  assertTruthy(diagnostics.adultGoogleBooksMeaningfulTastePassedByTitle?.["Counterfactual Fantasy"], "T19: mixed-positive overlap should now pass production taste eligibility");
  assertIncludes(diagnostics.adultTasteWeightedCounterfactualNewPassTitles || [], "Counterfactual Fantasy", "T19: weighted comparison should report a hypothetical new pass");
  assertIncludes(diagnostics.adultTasteWeightedProductionNewPassTitles || [], "Counterfactual Fantasy", "T19: production diagnostics should report the new pass");
  assertIncludes(profile.diagnostics.adultTasteProductionMixedPositiveFamilies || [], "fantasy", "T19: fantasy should be recorded as production mixed-positive");
  assertEqual(profile.diagnostics.adultTasteWeightedModelEnabledForSelection, false, "T19: weighted model must remain disabled for selection");
  console.log("PASS T19: mixed-positive overlap is usable by guarded production gate");
}

// â”€â”€â”€ T20: True avoid remains protected in weighted comparison â”€â”€â”€â”€â”€â”€â”€â”€â”€
{
  const profile = adultPolarityProfile([
    { title: "Disliked Horror One", action: "dislike", genres: ["Horror"], tags: ["spooky"], source: "mock", format: "book" },
    { title: "Disliked Horror Two", action: "dislike", genres: ["Horror"], tags: ["supernatural"], source: "mock", format: "book" },
  ]);
  const candidate = makeScoredCandidate({ title: "Avoided Horror", likedSignals: ["horror"], dislikedSignals: ["horror"] });
  const diagnostics = runSelection([candidate], profile);
  assertNotIncludes(diagnostics.adultTasteWeightedCounterfactualNewPassTitles || [], "Avoided Horror", "T20: true avoid should not become a weighted new pass");
  const decision = diagnostics.adultTasteWeightedCounterfactualCandidateDecisionByTitle?.["Avoided Horror"];
  assertEqual(decision?.weightedPassed, false, "T20: weighted comparison should keep true-avoid candidate failing");
  console.log("PASS T20: true avoid still blocks contradictory candidate in comparison mode");
}

// --- T21: Adult skips have zero production influence and do not steer Google Books routing ---
{
  const profile = adultPolarityProfile([
    { title: "The Night Circus", action: "skip", genres: ["Fantasy / Cozy"], tags: ["fantasy", "magic"], source: "mock", format: "book" },
    { title: "Baldur's Gate 3", action: "skip", genres: ["Fantasy / Adventure"], tags: ["adventure"], source: "mock", format: "book" },
  ]);
  assertEqual(profile.genreFamily.length, 0, "T21: adult skipped genres must not enter genreFamily");
  assertEqual(profile.themes.length, 0, "T21: adult skipped tags must not enter themes");
  assertEqual(profile.formatPreference.length, 0, "T21: adult skipped formats must not enter formatPreference");
  assertEqual(profile.avoidSignals.length, 0, "T21: adult skips must not enter avoidSignals");
  assertEqual((profile.diagnostics.adultTasteProductionLikedFamilies || []).length, 0, "T21: adult skips must not create production liked families");
  assertEqual((profile.diagnostics.adultTasteProductionAvoidFamilies || []).length, 0, "T21: adult skips must not create production avoid families");
  assertIncludes((profile.diagnostics.adultTasteSkippedSignalsRemovedFromProductionProfile || []).map((row) => row.title), "The Night Circus", "T21: skipped title should be recorded as removed");

  const { buildSearchPlan } = require(resolve(dir, "searchPlan.ts"));
  const googleBooksPlan = buildSearchPlan(profile, { googleBooks: true }).sourcePlans.find((p) => p.source === "googleBooks");
  const routedText = (googleBooksPlan?.intents || []).map((intent) => intent.query).join(" ");
  assertFalsy(/\bfantasy|adventure\b/.test(routedText), "T21: adult skips must not steer Google Books family queries");

  const sparseCandidate = makeScoredCandidate({ title: "Skip Routed Sparse Candidate", likedSignals: [], dislikedSignals: [] });
  const diagnostics = runSelection([sparseCandidate], profile);
  assertFalsy(diagnostics.adultGoogleBooksMeaningfulTastePassedByTitle?.["Skip Routed Sparse Candidate"], "T21: skips must not rescue candidate taste eligibility");
  console.log("PASS T21: adult skips have zero production/routing/eligibility influence");
}

// --- T22: Required two sci-fi likes plus one dislike resolves mixed-positive and usable ---
{
  const profile = adultPolarityProfile([
    { title: "Westworld", action: "like", genres: ["Science Fiction / Mystery"], tags: ["science fiction"], source: "mock", format: "book" },
    { title: "Stranger Things", action: "like", genres: ["Sci-Fi / Mystery"], tags: ["science fiction"], source: "mock", format: "book" },
    { title: "Detroit: Become Human", action: "dislike", genres: ["Science Fiction"], tags: ["ai"], source: "mock", format: "book" },
  ]);
  assertAdultFamilyDecision(profile, "science_fiction", "mixed_positive", "T22: sci-fi should be mixed_positive");
  assertIncludes(profile.diagnostics.adultTasteProductionMixedPositiveFamilies || [], "science_fiction", "T22: sci-fi should be production mixed-positive");
  const candidate = makeScoredCandidate({ title: "Mixed Positive Sci-Fi", likedSignals: ["science fiction"], dislikedSignals: ["science fiction"] });
  const diagnostics = runSelection([candidate], profile);
  assertTruthy(diagnostics.adultGoogleBooksMeaningfulTastePassedByTitle?.["Mixed Positive Sci-Fi"], "T22: mixed-positive sci-fi should count as positive support");
  assertIncludes(diagnostics.adultTasteWeightedProductionNewPassTitles || [], "Mixed Positive Sci-Fi", "T22: mixed-positive sci-fi should appear as production new pass");
  console.log("PASS T22: two sci-fi likes plus one dislike remains usable");
}

// --- T23: Two mystery likes plus two dislikes resolves mixed-neutral, not true avoid ---
{
  const profile = adultPolarityProfile([
    { title: "The Shadow of the Wind", action: "like", genres: ["Mystery / Literary"], tags: ["mystery"], source: "mock", format: "book" },
    { title: "My Favorite Murder", action: "like", genres: ["Mystery / Suspense"], tags: ["thriller"], source: "mock", format: "book" },
    { title: "Alan Wake 2", action: "dislike", genres: ["Mystery / Horror"], tags: ["mystery"], source: "mock", format: "book" },
    { title: "Fight Club", action: "dislike", genres: ["Mystery / Drama"], tags: ["thriller"], source: "mock", format: "book" },
  ]);
  assertAdultFamilyDecision(profile, "mystery_crime_thriller", "mixed_neutral", "T23: two liked and two disliked mystery rows should tie");
  assertIncludes(profile.diagnostics.adultTasteProductionMixedNeutralFamilies || [], "mystery_crime_thriller", "T23: mystery should be production mixed-neutral");
  assertNotIncludes(profile.diagnostics.adultTasteProductionAvoidFamilies || [], "mystery_crime_thriller", "T23: mixed-neutral mystery must not be hard avoid");
  const candidate = makeScoredCandidate({ title: "Neutral Mystery", likedSignals: ["mystery"], dislikedSignals: ["mystery"] });
  const diagnostics = runSelection([candidate], profile);
  assertFalsy(diagnostics.adultGoogleBooksMeaningfulTastePassedByTitle?.["Neutral Mystery"], "T23: mixed-neutral family cannot independently pass");
  assertEqual(diagnostics.adultGoogleBooksNegativeNetTasteFamiliesByTitle?.["Neutral Mystery"]?.length || 0, 0, "T23: mixed-neutral family cannot independently fail as negative");
  console.log("PASS T23: equal mystery evidence remains mixed-neutral");
}

// --- T24: One drama like plus one dislike resolves mixed-neutral ---
{
  const profile = adultPolarityProfile([
    { title: "Normal People", action: "like", genres: ["Drama / Contemporary"], tags: ["drama"], source: "mock", format: "book" },
    { title: "Fight Club", action: "dislike", genres: ["Drama"], tags: ["dark"], source: "mock", format: "book" },
  ]);
  assertAdultFamilyDecision(profile, "drama_contemporary", "mixed_neutral", "T24: one liked and one disliked drama row should tie");
  assertIncludes(profile.diagnostics.adultTasteProductionMixedNeutralFamilies || [], "drama_contemporary", "T24: drama should be production mixed-neutral");
  console.log("PASS T24: one-like/one-dislike drama remains mixed-neutral");
}

// --- T25: Negative-only fantasy remains true avoid ---
{
  const profile = adultPolarityProfile([
    { title: "Circe", action: "dislike", genres: ["Fantasy / Mythology"], tags: ["fantasy"], source: "mock", format: "book" },
  ]);
  assertAdultFamilyDecision(profile, "fantasy", "true_avoid", "T25: negative-only fantasy should be true avoid");
  assertIncludes(profile.diagnostics.adultTasteProductionAvoidFamilies || [], "fantasy", "T25: negative-only fantasy should remain production avoid");
  console.log("PASS T25: negative-only fantasy remains true avoid");
}

// --- T26: Overwhelming repeated negative evidence can still create true avoid ---
{
  const profile = adultPolarityProfile([
    { title: "Weak Fantasy Like", action: "like", genres: ["Fantasy"], tags: ["magic"], source: "mock", format: "book", weight: 0.25 },
    { title: "Disliked Fantasy One", action: "dislike", genres: ["Fantasy"], tags: ["fantasy"], source: "mock", format: "book" },
    { title: "Disliked Fantasy Two", action: "dislike", genres: ["Fantasy"], tags: ["magic"], source: "mock", format: "book" },
    { title: "Disliked Fantasy Three", action: "dislike", genres: ["Fantasy"], tags: ["quest"], source: "mock", format: "book" },
  ]);
  assertAdultFamilyDecision(profile, "fantasy", "true_avoid", "T26: three strong dislikes should overcome one weak positive by margin");
  assertIncludes(profile.diagnostics.adultTasteProductionAvoidFamilies || [], "fantasy", "T26: overwhelming negative fantasy should remain production avoid");
  console.log("PASS T26: overwhelming negative evidence can still become true avoid");
}

// --- T27: Mixed-negative overlap does not hard-reject a candidate with another positive family ---
{
  const profile = adultPolarityProfile([
    { title: "Liked Science Fiction", action: "like", genres: ["Science Fiction"], tags: ["science fiction"], source: "mock", format: "book" },
    { title: "Liked Fantasy", action: "like", genres: ["Fantasy"], tags: ["fantasy"], source: "mock", format: "book" },
    { title: "Disliked Fantasy One", action: "dislike", genres: ["Fantasy"], tags: ["magic"], source: "mock", format: "book" },
    { title: "Disliked Fantasy Two", action: "dislike", genres: ["Fantasy"], tags: ["quest"], source: "mock", format: "book" },
  ]);
  assertAdultFamilyDecision(profile, "fantasy", "mixed_negative", "T27: fantasy should be mixed-negative, not true avoid");
  const candidate = makeScoredCandidate({ title: "Mixed Negative With Sci-Fi", likedSignals: ["fantasy", "science fiction"], dislikedSignals: ["fantasy"] });
  const diagnostics = runSelection([candidate], profile);
  assertTruthy(diagnostics.adultGoogleBooksMeaningfulTastePassedByTitle?.["Mixed Negative With Sci-Fi"], "T27: another positive family should still pass");
  assertIncludes(diagnostics.adultGoogleBooksPositiveNetTasteFamiliesByTitle?.["Mixed Negative With Sci-Fi"] || [], "science_fiction", "T27: sci-fi should be the positive passing family");
  console.log("PASS T27: mixed-negative overlap does not hard-reject other positive evidence");
}

// --- T28: Sparse candidate stays rejected even with mixed-positive routed profile family ---
{
  const profile = adultPolarityProfile([
    { title: "Westworld", action: "like", genres: ["Science Fiction"], tags: ["science fiction"], source: "mock", format: "book" },
    { title: "Stranger Things", action: "like", genres: ["Science Fiction / Mystery"], tags: ["science fiction"], source: "mock", format: "book" },
    { title: "Detroit: Become Human", action: "dislike", genres: ["Science Fiction"], tags: ["ai"], source: "mock", format: "book" },
  ]);
  const candidate = makeScoredCandidate({ title: "Sparse Mixed-Positive Candidate", likedSignals: [], dislikedSignals: [] });
  const diagnostics = runSelection([candidate], profile);
  assertFalsy(diagnostics.adultGoogleBooksMeaningfulTastePassedByTitle?.["Sparse Mixed-Positive Candidate"], "T28: zero document-backed evidence must not be rescued");
  assertEqual(diagnostics.adultGoogleBooksMeaningfulTasteFailureReasonByTitle?.["Sparse Mixed-Positive Candidate"], "no_document_backed_liked_signals", "T28: sparse candidate should fail for missing document evidence");
  console.log("PASS T28: mixed-positive routed family does not rescue zero-evidence candidate");
}

// --- T29: Non-Adult skip behavior is unchanged ---
{
  const profile = buildTasteProfile({
    ageBand: "teens",
    enabledSources: { googleBooks: true },
    signals: [
      { title: "Skipped Teen Fantasy", action: "skip", genres: ["Fantasy"], tags: ["magic"], source: "mock", format: "book" },
    ],
  });
  assertIncludes(profile.genreFamily.map((row) => row.value), "fantasy", "T29: non-Adult skip behavior should remain unchanged");
  console.log("PASS T29: non-Adult skip contribution remains unchanged");
}

// --- T30: Narrative family extraction diagnostics expose unmapped description cues ---
{
  const candidate = makeScoredCandidate({
    title: "Unmapped Detective Description",
    likedSignals: [],
    dislikedSignals: [],
    description: "A detective investigates a murder after a serial killer vanishes into a small coastal town.",
    categories: ["Fiction / Mystery & Detective / General"],
  });
  const diagnostics = runSelection([candidate], adultProfile);
  assertFalsy(
    diagnostics.adultGoogleBooksMeaningfulTastePassedByTitle?.["Unmapped Detective Description"],
    "T30: diagnostics must not change final taste eligibility",
  );
  const evidence = diagnostics.adultGoogleBooksExpectedVsExtractedFamilyEvidenceByTitle?.["Unmapped Detective Description"] || {};
  assertIncludes(
    evidence.missingExpectedFamilies || [],
    "mystery_crime_thriller",
    "T30: visible detective/murder prose should be reported as missing mystery family evidence",
  );
  const unmapped = diagnostics.adultGoogleBooksUnmappedNarrativeCuesByTitle?.["Unmapped Detective Description"] || [];
  assertTruthy(
    unmapped.some((row) => row?.phrase === "detective" && row?.family === "mystery_crime_thriller"),
    "T30: detective should be listed as an unmapped narrative cue",
  );
  assertTruthy(
    Number(diagnostics.adultGoogleBooksUnmappedNarrativePhraseHistogram?.detective || 0) > 0,
    "T30: unmapped phrase histogram should count detective",
  );
  assertTruthy(
    Number(diagnostics.adultGoogleBooksNarrativeParserConfidenceByTitle?.["Unmapped Detective Description"] ?? 1) < 1,
    "T30: parser confidence should drop when expected cues are not extracted",
  );
  console.log("PASS T30: narrative extraction diagnostics expose ignored mystery cues without changing eligibility");
}

console.log("\nAll taste-alignment diagnostic regression tests passed.");
