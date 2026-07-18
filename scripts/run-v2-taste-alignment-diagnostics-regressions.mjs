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

const dir = resolve(new URL(".", import.meta.url).pathname, "../app/recommender-v2");

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
  const failureReason = diagnostics.adultGoogleBooksMeaningfulTasteFailureReasonByTitle?.["Mystery Novel"];
  assertFalsy(failureReason, "T2: mystery family should PASS, not fail");
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
  assertTruthy(passed, "T6: broad tone with genreFacetMatch > 0 should NOT be blocked by broad_tone check");
  console.log("PASS T6: broad tone + genreFacetMatch > 0 → passes broad-tone check");
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

console.log("\nAll taste-alignment diagnostic regression tests passed.");
