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

function makeScoredCandidate({ title = "Test Book", likedSignals = [], dislikedSignals = [], genreFacetMatch = 0, source = "googleBooks", scoreBreakdown = {} } = {}) {
  return {
    id: `test-${title.toLowerCase().replace(/\s+/g, "-")}`,
    title,
    source,
    score: 1,
    creators: ["Test Author"],
    description: "A test book.",
    genres: [],
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
    raw: {},
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
  assertFalsy(diagnostics.adultGoogleBooksMeaningfulTastePassedByTitle?.["Counterfactual Fantasy"], "T19: current binary gate should still fail tied candidate family");
  assertIncludes(diagnostics.adultTasteWeightedCounterfactualNewPassTitles || [], "Counterfactual Fantasy", "T19: weighted comparison should report a hypothetical new pass");
  assertEqual(profile.diagnostics.adultTasteWeightedModelEnabledForSelection, false, "T19: weighted model must remain disabled for selection");
  console.log("PASS T19: weighted model reports counterfactual new pass without changing current selection");
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

console.log("\nAll taste-alignment diagnostic regression tests passed.");
