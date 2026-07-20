/**
 * Regression tests for Pre-Teen Google Books query-family routing.
 *
 * These tests exercise buildSearchPlan() directly and prove:
 *  - mythology and superheroes map to richer genre anchors
 *  - the lookahead scanner finds valid anchors past unmapped top signals
 *  - the generic fallback is preserved when no signals are recognized
 *  - existing fantasy, mystery, horror, sci-fi, thriller routes are unchanged
 *  - diagnostic fields correctly distinguish scanned / discarded / skipped signals
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

let passed = 0;
let failed = 0;

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    console.error(`  FAIL  ${message}`);
    console.error(`        expected: ${JSON.stringify(expected)}`);
    console.error(`        got:      ${JSON.stringify(actual)}`);
    failed++;
  } else {
    console.log(`  pass  ${message}`);
    passed++;
  }
}

function assertIncludes(values, expected, message) {
  const arr = Array.isArray(values) ? values : [String(values)];
  if (!arr.includes(expected)) {
    console.error(`  FAIL  ${message}`);
    console.error(`        expected array to include: ${JSON.stringify(expected)}`);
    console.error(`        array was: ${JSON.stringify(arr)}`);
    failed++;
  } else {
    console.log(`  pass  ${message}`);
    passed++;
  }
}

function assertNotIncludes(values, unexpected, message) {
  const arr = Array.isArray(values) ? values : [String(values)];
  if (arr.includes(unexpected)) {
    console.error(`  FAIL  ${message}`);
    console.error(`        expected array NOT to include: ${JSON.stringify(unexpected)}`);
    console.error(`        array was: ${JSON.stringify(arr)}`);
    failed++;
  } else {
    console.log(`  pass  ${message}`);
    passed++;
  }
}

function assertStringContains(haystack, needle, message) {
  if (!String(haystack || "").includes(needle)) {
    console.error(`  FAIL  ${message}`);
    console.error(`        expected string to contain: ${JSON.stringify(needle)}`);
    console.error(`        string was: ${JSON.stringify(haystack)}`);
    failed++;
  } else {
    console.log(`  pass  ${message}`);
    passed++;
  }
}

function assertStringNotContains(haystack, needle, message) {
  if (String(haystack || "").includes(needle)) {
    console.error(`  FAIL  ${message}`);
    console.error(`        expected string NOT to contain: ${JSON.stringify(needle)}`);
    console.error(`        string was: ${JSON.stringify(haystack)}`);
    failed++;
  } else {
    console.log(`  pass  ${message}`);
    passed++;
  }
}

const { buildSearchPlan } = require(resolve("app/recommender-v2/searchPlan.ts"));

/**
 * Build a minimal Pre-Teen TasteProfile with ranked genre signals.
 * Signals are listed in descending priority order.
 */
function makePreteenProfile(genreSignals, extras = {}) {
  return {
    ageBand: "preteens",
    maturityBand: "preteens",
    genreFamily: genreSignals.map((value, i) => ({
      value,
      weight: 100 - i * 10,
      evidence: ["like:test-fixture"],
    })),
    tone: [],
    pacing: [],
    themes: [],
    characterDynamics: [],
    formatPreference: [],
    avoidSignals: [],
    sourceHints: [],
    diagnostics: {},
    ...extras,
  };
}

function getGoogleBooksQueries(profile) {
  const plan = buildSearchPlan(profile, { googleBooks: true });
  const gbPlan = plan.sourcePlans.find((p) => p.source === "googleBooks");
  return gbPlan?.intents.map((i) => i.query) || [];
}

function getPlanDiagnostics(profile) {
  const plan = buildSearchPlan(profile, { googleBooks: true });
  return plan.diagnostics;
}

const GENERIC_ONLY = "middle grade fiction novel";

// ---------------------------------------------------------------------------
// Section 1: New mythology and superheroes anchor mappings
// ---------------------------------------------------------------------------
console.log("\n[1] mythology anchor mapping");
{
  const queries = getGoogleBooksQueries(makePreteenProfile(["mythology"]));
  assertStringContains(queries.join(" "), "mythology", "mythology signal: queries must contain 'mythology'");
  // Primary query must not be the bare generic (which contains no genre anchor at all)
  assertNotIncludes([queries[0]], GENERIC_ONLY, "mythology signal: primary query must not be bare generic");
  // primary query should be the established middle-grade format
  assertEqual(queries[0], "middle grade mythology fantasy fiction novel", "mythology signal: primary query format");
}

console.log("\n[2] superheroes anchor mapping");
{
  const queries = getGoogleBooksQueries(makePreteenProfile(["superheroes"]));
  assertStringContains(queries.join(" "), "superhero", "superheroes signal: queries must contain 'superhero'");
  assertEqual(queries[0], "middle grade superhero adventure fiction novel", "superheroes signal: primary query format");
}

// ---------------------------------------------------------------------------
// Section 2: mythology + superheroes (the Run C profile signals)
// ---------------------------------------------------------------------------
console.log("\n[3] mythology + superheroes — must not produce generic-only planning");
{
  const queries = getGoogleBooksQueries(makePreteenProfile(["mythology", "superheroes"]));
  const allGeneric = queries.every((q) => q === GENERIC_ONLY);
  assertEqual(allGeneric, false, "mythology+superheroes: must not produce only generic query");
  assertStringContains(queries.join(" "), "mythology", "mythology+superheroes: queries must include mythology");
  assertStringContains(queries.join(" "), "superhero", "mythology+superheroes: queries must include superhero");
  assertEqual(queries[0], "middle grade mythology fantasy fiction novel", "mythology+superheroes: primary query");
  assertEqual(queries[1], "middle grade superhero adventure fiction novel", "mythology+superheroes: adjacent query");
}

// ---------------------------------------------------------------------------
// Section 3: mythology + adventure — both useful anchors resolved
// ---------------------------------------------------------------------------
console.log("\n[4] mythology + adventure — both anchors should resolve");
{
  const queries = getGoogleBooksQueries(makePreteenProfile(["mythology", "adventure"]));
  assertStringContains(queries.join(" "), "mythology", "mythology+adventure: mythology present");
  assertStringContains(queries.join(" "), "adventure", "mythology+adventure: adventure present");
  assertEqual(queries[0], "middle grade mythology fantasy fiction novel", "mythology+adventure: primary query");
}

// ---------------------------------------------------------------------------
// Section 4: Lookahead — two unmapped signals followed by a recognized one
// ---------------------------------------------------------------------------
console.log("\n[5] lookahead: unmapped + unmapped + adventure — must find adventure");
{
  // "nonfiction" and "friendship" have no anchor; "adventure" should be found
  const queries = getGoogleBooksQueries(makePreteenProfile(["nonfiction", "friendship", "adventure"]));
  assertStringContains(queries.join(" "), "adventure", "lookahead: should find adventure past two unmapped signals");
  const allGeneric = queries.every((q) => q === GENERIC_ONLY);
  assertEqual(allGeneric, false, "lookahead: must not collapse to generic when adventure is available");
}

console.log("\n[6] lookahead: unmapped + unmapped + mystery — must find mystery");
{
  const queries = getGoogleBooksQueries(makePreteenProfile(["superheroes_old_label", "media_movie", "mystery"]));
  assertStringContains(queries.join(" "), "mystery", "lookahead: should find mystery past two unmapped signals");
}

// ---------------------------------------------------------------------------
// Section 5: All unmapped — must preserve generic fallback
// ---------------------------------------------------------------------------
console.log("\n[7] all unmapped signals — must preserve generic fallback");
{
  const queries = getGoogleBooksQueries(makePreteenProfile(["nonfiction", "friendship"]));
  assertEqual(queries[0], GENERIC_ONLY, "all-unmapped: primary must be generic fallback");
  const diag = getPlanDiagnostics(makePreteenProfile(["nonfiction", "friendship"]));
  assertEqual(diag.preteenGoogleBooksGenericFallbackOccurred, true, "all-unmapped: genericFallbackOccurred must be true");
  assertEqual(diag.preteenGoogleBooksQueryPlanReason, "no_recognized_genre_anchors_generic_fallback", "all-unmapped: plan reason");
  assertEqual(diag.preteenGoogleBooksWinningMargin, "no_anchor_generic_fallback", "all-unmapped: winning margin");
}

// ---------------------------------------------------------------------------
// Section 6: Existing supported routes must be unchanged
// ---------------------------------------------------------------------------
console.log("\n[8] existing: fantasy primary");
{
  const queries = getGoogleBooksQueries(makePreteenProfile(["fantasy", "adventure"]));
  assertEqual(queries[0], "middle grade fantasy fiction novel", "fantasy: primary query unchanged");
}

console.log("\n[9] existing: mystery primary");
{
  const queries = getGoogleBooksQueries(makePreteenProfile(["mystery", "thriller"]));
  assertEqual(queries[0], "middle grade mystery fiction novel", "mystery: primary query unchanged");
}

console.log("\n[10] existing: horror primary");
{
  const queries = getGoogleBooksQueries(makePreteenProfile(["horror", "mystery"]));
  assertEqual(queries[0], "middle grade horror fiction novel", "horror: primary query unchanged");
}

console.log("\n[11] existing: science fiction primary — no double 'fiction'");
{
  const queries = getGoogleBooksQueries(makePreteenProfile(["science fiction", "adventure"]));
  // primaryGenre = "science fiction" already contains "fiction", so the standalone
  // "fiction" token must be suppressed — "science fiction fiction novel" is wrong.
  assertEqual(queries[0], "middle grade science fiction novel", "science fiction: primary query must not double 'fiction'");
  assertStringNotContains(queries[0], "fiction fiction", "science fiction: primary query must not contain 'fiction fiction'");
  assertNotIncludes(queries, GENERIC_ONLY, "science fiction: primary must not be bare generic");
}

console.log("\n[11b] science fiction only — fallback query no double 'fiction'");
{
  const queries = getGoogleBooksQueries(makePreteenProfile(["science fiction"]));
  // Primary: "middle grade science fiction novel"
  // Fallback: "middle grade science fiction contemporary novel" (no extra "fiction")
  assertEqual(queries[0], "middle grade science fiction novel", "science fiction only: primary query");
  assertStringNotContains(queries.join(" "), "fiction fiction", "science fiction only: no 'fiction fiction' anywhere in plan");
}

console.log("\n[12] existing: thriller primary");
{
  const queries = getGoogleBooksQueries(makePreteenProfile(["thriller", "mystery"]));
  assertEqual(queries[0], "middle grade thriller fiction novel", "thriller: primary query unchanged");
}

console.log("\n[13] existing: adventure primary");
{
  const queries = getGoogleBooksQueries(makePreteenProfile(["adventure", "fantasy"]));
  assertEqual(queries[0], "middle grade adventure fiction novel", "adventure: primary query unchanged");
}

// ---------------------------------------------------------------------------
// Section 7: Diagnostic field correctness
// ---------------------------------------------------------------------------
console.log("\n[14] diagnostics: mythology + superheroes — field correctness");
{
  const diag = getPlanDiagnostics(makePreteenProfile(["mythology", "superheroes"]));
  assertEqual(diag.preteenGoogleBooksGenericFallbackOccurred, false, "diag: genericFallbackOccurred should be false");
  assertEqual(diag.preteenGoogleBooksQueryPlanReason, "primary_family_resolved:mythology fantasy", "diag: plan reason");
  assertEqual(diag.preteenGoogleBooksWinningMargin, "tied_multi_anchor", "diag: winning margin");
  assertIncludes(diag.preteenGoogleBooksGenreAnchorsResolved, "mythology fantasy", "diag: resolved anchors includes mythology fantasy");
  assertIncludes(diag.preteenGoogleBooksGenreAnchorsResolved, "superhero adventure", "diag: resolved anchors includes superhero adventure");
  assertEqual(diag.preteenGoogleBooksDiscardedGenreSignals?.length, 0, "diag: no discarded signals when both map");
}

console.log("\n[15] diagnostics: lookahead — signals skipped after satisfied");
{
  // mythology (→ mythology fantasy), superheroes (→ superhero adventure) fill 2 anchors;
  // "adventure" at position 3 should be skipped-after-satisfied, not discarded
  const diag = getPlanDiagnostics(makePreteenProfile(["mythology", "superheroes", "adventure"]));
  assertIncludes(
    diag.preteenGoogleBooksSignalsSkippedAfterSatisfied,
    "adventure",
    "diag: adventure should be skipped-after-satisfied, not discarded",
  );
  assertEqual(diag.preteenGoogleBooksDiscardedGenreSignals?.length, 0, "diag: no discarded signals");
}

console.log("\n[16] diagnostics: lookahead — unmapped signals correctly classified as discarded");
{
  // nonfiction (unmapped), friendship (unmapped), adventure (resolved) → adventure found via lookahead
  const diag = getPlanDiagnostics(makePreteenProfile(["nonfiction", "friendship", "adventure"]));
  assertIncludes(diag.preteenGoogleBooksDiscardedGenreSignals, "nonfiction", "diag: nonfiction is discarded");
  assertIncludes(diag.preteenGoogleBooksDiscardedGenreSignals, "friendship", "diag: friendship is discarded");
  assertNotIncludes(diag.preteenGoogleBooksDiscardedGenreSignals, "adventure", "diag: adventure must NOT appear as discarded");
  assertEqual(diag.preteenGoogleBooksGenericFallbackOccurred, false, "diag: generic fallback not triggered when adventure resolves");
}

console.log("\n[17] diagnostics: all-unmapped — inspected signals present");
{
  const diag = getPlanDiagnostics(makePreteenProfile(["nonfiction", "friendship"]));
  assertIncludes(diag.preteenGoogleBooksRawSignalsInspected, "nonfiction", "diag: nonfiction appears in inspected");
  assertIncludes(diag.preteenGoogleBooksRawSignalsInspected, "friendship", "diag: friendship appears in inspected");
  assertEqual(diag.preteenGoogleBooksSignalsSkippedAfterSatisfied?.length, 0, "diag: no signals skipped when zero anchors found");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
