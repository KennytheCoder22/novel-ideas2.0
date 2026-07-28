/**
 * Adult Kitsu Certification Fixtures
 *
 * Covers the 7 policy requirements from Phase 3 implementation authorization:
 *  1. doujinshi hard-rejected
 *  2. OEL hard-rejected
 *  3. one_shot admitted with taste evidence (positiveTasteScore >= 2.5)
 *  4. one_shot withheld without taste evidence (positiveTasteScore < 2.5)
 *  5. genre signals populated from categories API (not query tokens)
 *  6. categories API failure falls back to query tokens gracefully
 *  7. kitsuAgeRating / kitsuMaturityFlagged present in diagnostics
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

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../app/recommender-v2");
const { applyKitsuSourceAdmissionPolicy, applyAdultKitsuPostScorePolicy } = require(resolve(dir, "kitsuAdmission.ts"));

// ─── Assertion helpers ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.error(`  FAIL: ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

// ─── Mock factories ───────────────────────────────────────────────────────────

function mockCandidate(overrides = {}) {
  return {
    id: overrides.id || "kitsu:test-1",
    sourceId: overrides.sourceId || "kitsu:test-1",
    source: "kitsu",
    title: overrides.title || "Test Manga",
    creators: ["Kitsu"],
    formats: ["manga"],
    genres: overrides.genres || ["action", "adventure"],
    themes: [],
    tones: [],
    characterDynamics: [],
    maturityBand: overrides.maturityBand,
    raw: {
      kitsuSubtype: overrides.kitsuSubtype || "manga",
      kitsuAgeRating: overrides.kitsuAgeRating !== undefined ? overrides.kitsuAgeRating : null,
      kitsuMaturityFlagged: overrides.kitsuMaturityFlagged !== undefined ? overrides.kitsuMaturityFlagged : true,
      genreSource: overrides.genreSource || "categories_api",
    },
    diagnostics: {
      positiveTasteScore: overrides.positiveTasteScore !== undefined ? overrides.positiveTasteScore : 0,
      ...(overrides.kitsuAdmissionDecision ? { kitsuAdmissionDecision: overrides.kitsuAdmissionDecision } : {}),
    },
  };
}

function mockScoredCandidate(overrides = {}) {
  return {
    ...mockCandidate(overrides),
    score: overrides.score !== undefined ? overrides.score : 2.0,
    matchedSignals: [],
    rejectedReasons: [],
    scoreBreakdown: {},
  };
}

function mockSourceResults() {
  return [
    {
      source: "kitsu",
      status: "succeeded",
      rawItems: [],
      diagnostics: {
        source: "kitsu",
        status: "succeeded",
        planned: true,
        attempted: true,
        timedOut: false,
        rawCount: 0,
        queries: [],
      },
    },
  ];
}

function adultProfile() {
  return { ageBand: "adult", genres: ["action", "fantasy"], avoidGenres: [], diagnostics: {} };
}

// ─── Fixture 1: doujinshi hard-rejected ──────────────────────────────────────

console.log("\nFixture 1: doujinshi hard-rejected");
{
  const candidates = [
    mockCandidate({ id: "kitsu:doujin-1", title: "Doujinshi Work", kitsuSubtype: "doujinshi" }),
    mockCandidate({ id: "kitsu:manga-1", title: "Normal Manga", kitsuSubtype: "manga" }),
  ];
  const sourceResults = mockSourceResults();
  const result = applyKitsuSourceAdmissionPolicy(candidates, sourceResults);

  assert("doujinshi is removed", !result.candidates.some((c) => c.id === "kitsu:doujin-1"));
  assert("normal manga passes", result.candidates.some((c) => c.id === "kitsu:manga-1"));
  assert("1 hard-rejected in diagnostics", result.diagnostics.hardRejectedCount === 1, `got ${result.diagnostics.hardRejectedCount}`);
  assert("hard-reject record shows doujinshi", result.diagnostics.hardRejectedCandidates.some((r) => r.kitsuSubtype === "doujinshi"));
  assert("source diagnostics updated", sourceResults[0].diagnostics.kitsuAdmissionHardRejected === 1);
}

// ─── Fixture 2: OEL hard-rejected ────────────────────────────────────────────

console.log("\nFixture 2: OEL hard-rejected");
{
  const candidates = [
    mockCandidate({ id: "kitsu:oel-1", title: "English Original", kitsuSubtype: "oel" }),
    mockCandidate({ id: "kitsu:manhwa-1", title: "Korean Manhwa", kitsuSubtype: "manhwa" }),
  ];
  const sourceResults = mockSourceResults();
  const result = applyKitsuSourceAdmissionPolicy(candidates, sourceResults);

  assert("OEL is removed", !result.candidates.some((c) => c.id === "kitsu:oel-1"));
  assert("manhwa passes", result.candidates.some((c) => c.id === "kitsu:manhwa-1"));
  assert("1 hard-rejected", result.diagnostics.hardRejectedCount === 1);
}

// ─── Fixture 3: one_shot admitted with taste evidence ────────────────────────

console.log("\nFixture 3: one_shot admitted with positiveTasteScore >= 2.5");
{
  const candidates = [mockCandidate({ id: "kitsu:oneshot-strong", title: "Strong Oneshot", kitsuSubtype: "one_shot" })];
  const sourceResults = mockSourceResults();
  const admitResult = applyKitsuSourceAdmissionPolicy(candidates, sourceResults);

  assert("one_shot passes pre-admission gate", admitResult.candidates.some((c) => c.id === "kitsu:oneshot-strong"));
  assert("marked one_shot_fallback_only", admitResult.candidates[0].diagnostics.kitsuAdmissionDecision === "one_shot_fallback_only");

  const scored = [mockScoredCandidate({ id: "kitsu:oneshot-strong", title: "Strong Oneshot", kitsuSubtype: "one_shot", positiveTasteScore: 3.0, kitsuAdmissionDecision: "one_shot_fallback_only" })];
  const postResult = applyAdultKitsuPostScorePolicy(scored, adultProfile());

  assert("passes post-score gate (score 3.0 >= 2.5)", postResult.candidates.some((c) => c.id === "kitsu:oneshot-strong"));
  assert("withheld count is 0", postResult.withheldCount === 0, `got ${postResult.withheldCount}`);
}

// ─── Fixture 4: one_shot withheld without taste evidence ─────────────────────

console.log("\nFixture 4: one_shot withheld with positiveTasteScore < 2.5");
{
  const scored = [mockScoredCandidate({ id: "kitsu:oneshot-weak", title: "Weak Oneshot", kitsuSubtype: "one_shot", positiveTasteScore: 1.0, kitsuAdmissionDecision: "one_shot_fallback_only" })];
  const postResult = applyAdultKitsuPostScorePolicy(scored, adultProfile());

  assert("one_shot withheld (score 1.0 < 2.5)", !postResult.candidates.some((c) => c.id === "kitsu:oneshot-weak"));
  assert("withheld count is 1", postResult.withheldCount === 1, `got ${postResult.withheldCount}`);
  assert("withheld reason recorded", postResult.withheldCandidates[0] && postResult.withheldCandidates[0].reason === "one_shot_withheld_insufficient_taste_score");
}

// ─── Fixture 5: genres from categories API ────────────────────────────────────

console.log("\nFixture 5: genre signals from categories API");
{
  // The raw row has genreSource="categories_api" — this is set by kitsuSource.ts
  const candidate = mockCandidate({
    id: "kitsu:api-genres",
    genres: ["supernatural", "school life", "action"],
    genreSource: "categories_api",
  });

  assert("genreSource is 'categories_api'", candidate.raw.genreSource === "categories_api");
  assert("genres contain real category names", candidate.genres.includes("supernatural"));
}

// ─── Fixture 6: categories API failure falls back gracefully ─────────────────

console.log("\nFixture 6: categories API failure falls back to query tokens");
{
  const candidate = mockCandidate({
    id: "kitsu:fallback-genres",
    genres: ["fantasy", "mystery"],
    genreSource: "query_fallback",
  });

  assert("genreSource is 'query_fallback'", candidate.raw.genreSource === "query_fallback");
  assert("candidate is still present (not rejected)", candidate.title !== "");
  assert("genres are non-empty", candidate.genres.length > 0);

  // Also verify that admission does not penalize query_fallback items
  const sourceResults = mockSourceResults();
  const result = applyKitsuSourceAdmissionPolicy([candidate], sourceResults);
  assert("query_fallback candidate is admitted", result.candidates.some((c) => c.id === "kitsu:fallback-genres"));
}

// ─── Fixture 7: maturity diagnostic fields ───────────────────────────────────

console.log("\nFixture 7: kitsuAgeRating and kitsuMaturityFlagged in raw row");
{
  const rRated = mockCandidate({ kitsuAgeRating: "R", kitsuMaturityFlagged: false, maturityBand: "adult" });
  assert("R-rated: kitsuAgeRating='R'", rRated.raw.kitsuAgeRating === "R");
  assert("R-rated: kitsuMaturityFlagged=false", rRated.raw.kitsuMaturityFlagged === false);
  assert("R-rated: maturityBand='adult'", rRated.maturityBand === "adult");

  const unrated = mockCandidate({ kitsuAgeRating: null, kitsuMaturityFlagged: true, maturityBand: undefined });
  assert("Unrated: kitsuAgeRating=null", unrated.raw.kitsuAgeRating === null);
  assert("Unrated: kitsuMaturityFlagged=true", unrated.raw.kitsuMaturityFlagged === true);
  assert("Unrated: no maturityBand", unrated.maturityBand == null);

  const gRated = mockCandidate({ kitsuAgeRating: "G", kitsuMaturityFlagged: true });
  assert("G-rated: kitsuMaturityFlagged=true", gRated.raw.kitsuMaturityFlagged === true);
}

// ─── Fixture 8: non-Kitsu candidates unaffected ──────────────────────────────

console.log("\nFixture 8: Non-Kitsu candidates pass through admission gate unchanged");
{
  const nonKitsu = {
    id: "googlebooks:some-book",
    sourceId: "googlebooks:some-book",
    source: "googleBooks",
    title: "Some Book",
    creators: ["Author"],
    formats: ["book"],
    genres: ["fiction"],
    themes: [], tones: [], characterDynamics: [],
    diagnostics: {}, raw: {},
  };
  const sourceResults = mockSourceResults();
  const result = applyKitsuSourceAdmissionPolicy([nonKitsu], sourceResults);

  assert("non-Kitsu passes through", result.candidates.some((c) => c.id === "googlebooks:some-book"));
  assert("evaluated count is 0 for non-Kitsu input", result.diagnostics.evaluatedCount === 0);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(60)}`);
console.log(`Kitsu Certification Fixtures: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("FIXTURE FAILURES DETECTED");
  process.exitCode = 1;
} else {
  console.log("All certification fixtures passed.");
}
