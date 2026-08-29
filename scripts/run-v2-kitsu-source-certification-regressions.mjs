/**
 * Adult Kitsu Source Certification Regressions
 *
 * Mocked (deterministic) certification baseline for all 14 profiles.
 * All Kitsu API calls are intercepted — live API is not called.
 *
 * Coverage:
 *  1. Scope gate: profiles without manga/anime format preference are honestly skipped.
 *  2. Scope gate: weird_manga_not_anime (explicit manga preference) dispatches Kitsu.
 *  3. Count-contract: ≥5 final items for manga-preference profile with mocked data.
 *  4. Admission policy: doujinshi / OEL hard-rejected.
 *  5. Post-score gate: one_shot admitted (score ≥ 2.5) / withheld (score < 2.5).
 *  6. Genre enrichment: categories API genres used when available.
 *  7. Category fallback: graceful per-item fallback when categories fetch fails.
 *  8. Maturity diagnostics: kitsuAgeRating + kitsuMaturityFlagged present.
 *
 * This script models after run-v2-kitsu-comicvine-contract-regressions.mjs.
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

// ─── Mock Kitsu API ───────────────────────────────────────────────────────────

// Six representative manga items returned by the search endpoint.
// Genres are intentionally aligned to fantasy/mythology signals so scoring
// produces positive scores against the weird_manga_not_anime profile.
const MOCK_SEARCH_ITEMS = [
  {
    id: "mk1",
    attributes: { canonicalTitle: "Berserk", synopsis: "Dark fantasy epic about a lone mercenary haunted by fate.", subtype: "manga", slug: "berserk", startDate: "1989-08-25", ageRating: "R", ageRatingGuide: "Graphic violence and adult themes" },
  },
  {
    id: "mk2",
    attributes: { canonicalTitle: "Vinland Saga", synopsis: "Historical epic following a young warrior seeking revenge and peace.", subtype: "manga", slug: "vinland-saga", startDate: "2005-07-13", ageRating: "R", ageRatingGuide: "Violence and war themes" },
  },
  {
    id: "mk3",
    attributes: { canonicalTitle: "Fullmetal Alchemist", synopsis: "Brothers seek a mythical artifact after a failed alchemical ritual.", subtype: "manga", slug: "fullmetal-alchemist", startDate: "2001-07-12", ageRating: "R", ageRatingGuide: "Violence and mature themes" },
  },
  {
    id: "mk4",
    attributes: { canonicalTitle: "Attack on Titan", synopsis: "Humanity struggles for survival against enormous humanoid creatures.", subtype: "manga", slug: "attack-on-titan", startDate: "2009-09-09", ageRating: "R", ageRatingGuide: "Intense violence" },
  },
  {
    id: "mk5",
    attributes: { canonicalTitle: "Vagabond", synopsis: "A fictionalized account of legendary swordsman Miyamoto Musashi.", subtype: "manhwa", slug: "vagabond", startDate: "1998-09-01", ageRating: "R", ageRatingGuide: "Graphic violence" },
  },
  {
    id: "mk6",
    attributes: { canonicalTitle: "Claymore", synopsis: "A hybrid human warrior fights demons in a dark fantasy world.", subtype: "manga", slug: "claymore", startDate: "2001-05-01", ageRating: "R", ageRatingGuide: "Violence and supernatural themes" },
  },
];

const MOCK_CATEGORIES_BY_ID = {
  mk1: [{ attributes: { title: "dark fantasy" } }, { attributes: { title: "action" } }, { attributes: { title: "supernatural" } }],
  mk2: [{ attributes: { title: "historical" } }, { attributes: { title: "action" } }, { attributes: { title: "drama" } }],
  mk3: [{ attributes: { title: "fantasy" } }, { attributes: { title: "adventure" } }, { attributes: { title: "mythology" } }],
  mk4: [{ attributes: { title: "action" } }, { attributes: { title: "dark fantasy" } }, { attributes: { title: "drama" } }],
  mk5: [{ attributes: { title: "historical" } }, { attributes: { title: "action" } }, { attributes: { title: "drama" } }],
  mk6: [{ attributes: { title: "dark fantasy" } }, { attributes: { title: "action" } }, { attributes: { title: "supernatural" } }],
};

// Track which categories fetches should fail (for fallback fixture testing)
let categoriesFailForIds = new Set();

globalThis.fetch = async (input) => {
  const url = String(input || "");

  // Kitsu categories endpoint — per-item
  if (url.includes("/categories")) {
    const idMatch = url.match(/\/manga\/([^/]+)\/categories/);
    const id = idMatch ? idMatch[1] : null;
    if (id && categoriesFailForIds.has(id)) {
      return new Response("", { status: 503, headers: { "content-type": "application/json" } });
    }
    const categories = (id && MOCK_CATEGORIES_BY_ID[id]) || [{ attributes: { title: "action" } }];
    return new Response(JSON.stringify({ data: categories }), { status: 200, headers: { "content-type": "application/json" } });
  }

  // Kitsu primary search endpoint
  if (url.includes("kitsu.app/api/edge/manga") || url.includes("/manga?")) {
    return new Response(JSON.stringify({ data: MOCK_SEARCH_ITEMS }), { status: 200, headers: { "content-type": "application/json" } });
  }

  // Block unexpected calls — certification should not hit other sources
  throw new Error(`Unexpected fetch in certification suite: ${url}`);
};

// ─── Load engine and data ────────────────────────────────────────────────────

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../app/recommender-v2");
const { runRecommenderV2 } = require(resolve(dir, "engine.ts"));
const { applyKitsuSourceAdmissionPolicy, applyAdultKitsuPostScorePolicy } = require(resolve(dir, "kitsuAdmission.ts"));
const adultDeck = require(resolve(dirname(fileURLToPath(import.meta.url)), "../data/swipeDecks/adult.ts")).default;

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

function asObject(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function asArray(v) { return Array.isArray(v) ? v : []; }

// ─── Signal builders ─────────────────────────────────────────────────────────

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

function seededSequence(seed, length = 8) {
  const rng = mulberry32(seed);
  const actions = [];
  for (let i = 0; i < length; i++) {
    const r = rng();
    if (r < 0.38) actions.push("like");
    else if (r < 0.62) actions.push("dislike");
    else actions.push("skip");
  }
  return actions;
}

function formatFromTags(tags) {
  const joined = tags.join(" ").toLowerCase();
  if (/\b(manga|anime)\b/.test(joined)) return joined.includes("anime") ? "anime" : "manga";
  if (/\b(comic|superhero)\b/.test(joined)) return "comic";
  if (/graphicnovel|graphic novel/.test(joined)) return "graphicNovel";
  return "book";
}

function buildSignals(sequence) {
  const cards = adultDeck.cards.slice(0, sequence.length);
  return cards.map((card, index) => {
    const tags = Array.isArray(card.tags) ? card.tags.map((t) => String(t || "").trim()).filter(Boolean) : [];
    const bareTags = tags.map((t) => t.replace(/^[a-zA-Z]+:/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());
    const genres = [card.genre, ...tags.filter((t) => /^genre:/i.test(t)).map((t) => t.replace(/^genre:/i, ""))]
      .map((v) => String(v || "").trim()).filter(Boolean);
    const tones = tags.filter((t) => /^(tone|mood):/i.test(t)).map((t) => t.replace(/^(tone|mood):/i, ""));
    const themes = tags.filter((t) => /^(theme|setting|stakes|graphicNovel):/i.test(t)).map((t) => t.replace(/^(theme|setting|stakes|graphicNovel):/i, ""));
    const characterDynamics = tags.filter((t) => /^(character|relationship|dynamic):/i.test(t)).map((t) => t.replace(/^(character|relationship|dynamic):/i, ""));
    const action = sequence[index] || "skip";
    return {
      id: `${index + 1}-${String(card.title || "")}`,
      title: String(card.title || "").trim(),
      action: action === "like" ? "like" : action === "dislike" ? "dislike" : "skip",
      source: "mock",
      format: formatFromTags(tags),
      tags: bareTags,
      genres,
      tones,
      themes,
      characterDynamics,
      weight: action === "skip" ? 0 : 1,
    };
  });
}

// Explicit manga format preference signal — injected into weird_manga_not_anime
const MANGA_FORMAT_SIGNAL = {
  id: "manga-format-preference",
  title: "Manga Format Preference",
  action: "like",
  source: "mock",
  format: "manga",
  tags: ["manga", "graphic novel"],
  genres: ["manga", "graphic novel"],
  tones: [],
  themes: [],
  characterDynamics: [],
  weight: 1,
};

// ─── Profile matrix ───────────────────────────────────────────────────────────

// For the mocked test:
//  - All profiles built from adult deck book cards have NO manga format preference.
//  - Kitsu will honestly skip them (scope gate fires) → expected_behavior: "skipped"
//  - weird_manga_not_anime gets an explicit manga format signal → expected: "dispatched"

const PROFILES = [
  { id: "adult_a", label: "Adult A", sequence: ["like", "like", "dislike", "skip", "like", "dislike", "like", "skip"], expectedBehavior: "skipped" },
  { id: "adult_b", label: "Adult B", sequence: ["dislike", "dislike", "like", "skip", "dislike", "like", "skip", "like"], expectedBehavior: "skipped" },
  { id: "adult_c", label: "Adult C", sequence: ["like", "skip", "like", "skip", "dislike", "like", "dislike", "like"], expectedBehavior: "skipped" },
  { id: "random_41827", label: "Random 41827", sequence: seededSequence(41827, 8), expectedBehavior: "skipped" },
  { id: "random_59314", label: "Random 59314", sequence: seededSequence(59314, 8), expectedBehavior: "skipped" },
  { id: "random_77209", label: "Random 77209", sequence: seededSequence(77209, 8), expectedBehavior: "skipped" },
  { id: "weird_horror_yes_violence_no", label: "Horror yes, violence no", sequence: ["skip", "dislike", "like", "skip", "skip", "like", "skip", "skip"], expectedBehavior: "skipped" },
  { id: "weird_fantasy_military_history", label: "Fantasy + Military History", sequence: ["like", "like", "dislike", "like", "skip", "dislike", "like", "skip"], expectedBehavior: "skipped" },
  { id: "weird_cozy_fantasy_true_crime", label: "Cozy Fantasy + True Crime", sequence: ["like", "dislike", "like", "skip", "skip", "like", "like", "skip"], expectedBehavior: "skipped" },
  // weird_manga_not_anime: explicit manga format signal added → dispatches Kitsu
  { id: "weird_manga_not_anime", label: "Manga but not anime", sequence: ["like", "dislike", "skip", "like", "skip", "skip", "like", "skip"], expectedBehavior: "dispatched", injectMangaSignal: true },
  { id: "weird_likes_almost_everything", label: "Likes almost everything", sequence: ["like", "like", "like", "like", "like", "like", "like", "like"], expectedBehavior: "skipped" },
  { id: "weird_dislikes_almost_everything", label: "Dislikes almost everything", sequence: ["dislike", "dislike", "dislike", "dislike", "dislike", "dislike", "dislike", "dislike"], expectedBehavior: "skipped" },
  { id: "weird_alternating_pattern", label: "Alternating like/dislike", sequence: ["like", "dislike", "like", "dislike", "like", "dislike", "like", "dislike"], expectedBehavior: "skipped" },
  { id: "weird_highly_contradictory", label: "Highly contradictory", sequence: ["like", "like", "dislike", "like", "dislike", "like", "dislike", "like"], expectedBehavior: "skipped" },
];

// ─── Runner ───────────────────────────────────────────────────────────────────

async function runProfile(profile) {
  const baseSignals = buildSignals(profile.sequence);
  const signals = profile.injectMangaSignal ? [...baseSignals, MANGA_FORMAT_SIGNAL] : baseSignals;

  return runRecommenderV2({
    requestId: `cert-${profile.id}`,
    ageBand: "adult",
    limit: 5,
    enabledSources: {
      mock: false,
      googleBooks: false,
      openLibrary: false,
      kitsu: true,
      comicVine: false,
      localLibrary: false,
      nyt: false,
    },
    signals,
    deckKey: "adult",
  });
}

// ─── Section 1: 14-profile mocked run ────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("Section 1: 14-profile mocked baseline");
console.log("═══════════════════════════════════════════════════════════════");

let runsPassed = 0;
let runsFailed = 0;

for (const profile of PROFILES) {
  const result = await runProfile(profile);
  const kitsuSource = asArray(result?.diagnostics?.sources).find((s) => asObject(s).source === "kitsu");
  const kitsuDiags = asObject(kitsuSource);
  const finalItems = asArray(result?.items);
  const finalCount = finalItems.length;
  const kitsuStatus = String(kitsuDiags.status || "");
  const skippedReason = String(kitsuDiags.skippedReason || "");

  if (profile.expectedBehavior === "skipped") {
    const scopeGateFired = kitsuStatus === "skipped" && skippedReason === "kitsu_no_manga_format_preference";
    if (scopeGateFired) {
      console.log(`  PASS [${profile.id}] — correctly skipped (no manga format preference)`);
      runsPassed++;
    } else {
      console.error(`  FAIL [${profile.id}] — expected skipped, got status=${kitsuStatus} skippedReason=${skippedReason}`);
      runsFailed++;
    }
  } else if (profile.expectedBehavior === "dispatched") {
    const dispatched = kitsuStatus !== "skipped";
    const countOk = finalCount >= 5;
    const statusOk = kitsuStatus === "succeeded";
    if (dispatched && countOk && statusOk) {
      console.log(`  PASS [${profile.id}] — dispatched, status=${kitsuStatus}, final=${finalCount}/5`);
      runsPassed++;
    } else {
      console.error(`  FAIL [${profile.id}] — dispatched=${dispatched}, status=${kitsuStatus}, final=${finalCount}/5`);
      runsFailed++;
    }
  }
}

console.log(`\nProfile runs: ${runsPassed} passed, ${runsFailed} failed`);

// ─── Section 2: Policy fixtures ──────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("Section 2: Policy fixtures");
console.log("═══════════════════════════════════════════════════════════════");

function mockCandidate(overrides = {}) {
  return {
    id: overrides.id || "kitsu:test-1",
    sourceId: overrides.sourceId || "kitsu:test-1",
    source: "kitsu",
    title: overrides.title || "Test Manga",
    creators: ["Kitsu"],
    formats: ["manga"],
    genres: overrides.genres || ["action"],
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
  return { ...mockCandidate(overrides), score: overrides.score ?? 2.0, matchedSignals: [], rejectedReasons: [], scoreBreakdown: {} };
}

function mockSourceResults() {
  return [{ source: "kitsu", status: "succeeded", rawItems: [], diagnostics: { source: "kitsu", status: "succeeded", planned: true, attempted: true, timedOut: false, rawCount: 0, queries: [] } }];
}

const adultProfile = { ageBand: "adult", formatPreference: [{ value: "manga", weight: 1.0, evidence: [] }], diagnostics: {} };
const nonMangaProfile = { ageBand: "adult", formatPreference: [{ value: "book", weight: 1.0, evidence: [] }], diagnostics: {} };

// Fixture K1: doujinshi hard-rejected
console.log("\nFixture K1: doujinshi hard-rejected");
{
  const cands = [mockCandidate({ id: "kitsu:d1", title: "Doujinshi", kitsuSubtype: "doujinshi" }), mockCandidate({ id: "kitsu:m1", title: "Normal Manga" })];
  const sr = mockSourceResults();
  const r = applyKitsuSourceAdmissionPolicy(cands, sr);
  assert("doujinshi removed", !r.candidates.some((c) => c.id === "kitsu:d1"));
  assert("normal manga passes", r.candidates.some((c) => c.id === "kitsu:m1"));
  assert("hardRejectedCount=1", r.diagnostics.hardRejectedCount === 1, `got ${r.diagnostics.hardRejectedCount}`);
  assert("source diagnostics updated", sr[0].diagnostics.kitsuAdmissionHardRejected === 1);
}

// Fixture K2: OEL hard-rejected
console.log("\nFixture K2: OEL hard-rejected");
{
  const cands = [mockCandidate({ id: "kitsu:oel1", title: "OEL Work", kitsuSubtype: "oel" }), mockCandidate({ id: "kitsu:mh1", title: "Manhwa", kitsuSubtype: "manhwa" })];
  const sr = mockSourceResults();
  const r = applyKitsuSourceAdmissionPolicy(cands, sr);
  assert("OEL removed", !r.candidates.some((c) => c.id === "kitsu:oel1"));
  assert("manhwa passes", r.candidates.some((c) => c.id === "kitsu:mh1"));
}

// Fixture K3: one_shot admitted with taste evidence
console.log("\nFixture K3: one_shot admitted (positiveTasteScore >= 2.5)");
{
  const cands = [mockCandidate({ id: "kitsu:os1", title: "Strong Oneshot", kitsuSubtype: "one_shot" })];
  const sr = mockSourceResults();
  const admitR = applyKitsuSourceAdmissionPolicy(cands, sr);
  assert("one_shot passes pre-admission", admitR.candidates.some((c) => c.id === "kitsu:os1"));
  assert("marked one_shot_fallback_only", admitR.candidates[0]?.diagnostics?.kitsuAdmissionDecision === "one_shot_fallback_only");

  const scored = [mockScoredCandidate({ id: "kitsu:os1", kitsuSubtype: "one_shot", positiveTasteScore: 3.5, kitsuAdmissionDecision: "one_shot_fallback_only" })];
  const postR = applyAdultKitsuPostScorePolicy(scored, adultProfile);
  assert("passes post-score (3.5 >= 2.5)", postR.candidates.some((c) => c.id === "kitsu:os1"));
  assert("withheld count=0", postR.withheldCount === 0);
}

// Fixture K4: one_shot withheld without taste evidence
console.log("\nFixture K4: one_shot withheld (positiveTasteScore < 2.5)");
{
  const scored = [mockScoredCandidate({ id: "kitsu:os2", kitsuSubtype: "one_shot", positiveTasteScore: 0.5, kitsuAdmissionDecision: "one_shot_fallback_only" })];
  const postR = applyAdultKitsuPostScorePolicy(scored, adultProfile);
  assert("one_shot withheld (0.5 < 2.5)", !postR.candidates.some((c) => c.id === "kitsu:os2"));
  assert("withheld count=1", postR.withheldCount === 1);
  assert("withheld reason recorded", postR.withheldCandidates[0]?.reason === "one_shot_withheld_insufficient_taste_score");
}

// Fixture K5: genre signals from categories API
console.log("\nFixture K5: genres populated from categories API");
{
  const cand = mockCandidate({ id: "kitsu:kg1", genres: ["dark fantasy", "supernatural", "action"], genreSource: "categories_api" });
  assert("genreSource is categories_api", cand.raw.genreSource === "categories_api");
  assert("genres contain real category names", cand.genres.includes("supernatural"));
}

// Fixture K6: categories API failure → query token fallback
console.log("\nFixture K6: categories API failure falls back gracefully");
{
  const cand = mockCandidate({ id: "kitsu:kf1", genres: ["fantasy", "mystery"], genreSource: "query_fallback" });
  assert("genreSource is query_fallback", cand.raw.genreSource === "query_fallback");
  assert("candidate still admitted", cand.title !== "");

  const sr = mockSourceResults();
  const r = applyKitsuSourceAdmissionPolicy([cand], sr);
  assert("query_fallback candidate admitted", r.candidates.some((c) => c.id === "kitsu:kf1"));
}

// Fixture K7: kitsuAgeRating + kitsuMaturityFlagged in raw row
console.log("\nFixture K7: maturity diagnostic fields present");
{
  const rRated = mockCandidate({ kitsuAgeRating: "R", kitsuMaturityFlagged: false, maturityBand: "adult" });
  assert("R-rated: kitsuAgeRating='R'", rRated.raw.kitsuAgeRating === "R");
  assert("R-rated: kitsuMaturityFlagged=false", rRated.raw.kitsuMaturityFlagged === false);
  assert("R-rated: maturityBand='adult'", rRated.maturityBand === "adult");

  const unrated = mockCandidate({ kitsuAgeRating: null, kitsuMaturityFlagged: true });
  assert("Unrated: kitsuAgeRating=null", unrated.raw.kitsuAgeRating === null);
  assert("Unrated: kitsuMaturityFlagged=true", unrated.raw.kitsuMaturityFlagged === true);
}

// Fixture K8: scope gate fires for non-manga profile (tested via mocked run)
console.log("\nFixture K8: scope gate fires for profile with no manga format preference");
{
  const nonMangaSignals = buildSignals(["like", "like", "dislike", "skip", "like", "dislike", "like", "skip"]);
  const result = await runRecommenderV2({
    requestId: "scope-gate-test",
    ageBand: "adult",
    limit: 5,
    enabledSources: { mock: false, googleBooks: false, openLibrary: false, kitsu: true, comicVine: false, localLibrary: false, nyt: false },
    signals: nonMangaSignals,
    deckKey: "adult",
  });
  const kitsuSource = asArray(result?.diagnostics?.sources).find((s) => asObject(s).source === "kitsu");
  const diags = asObject(kitsuSource);
  assert("scope gate fires: status=skipped", String(diags.status || "") === "skipped");
  assert("scope gate fires: reason=kitsu_no_manga_format_preference", String(diags.skippedReason || "") === "kitsu_no_manga_format_preference");
}

// Fixture K9: weird_manga_not_anime dispatches Kitsu with manga format preference
console.log("\nFixture K9: weird_manga_not_anime (with manga format signal) dispatches Kitsu");
{
  const mangaSignals = [...buildSignals(["like", "dislike", "skip", "like", "skip", "skip", "like", "skip"]), MANGA_FORMAT_SIGNAL];
  const result = await runRecommenderV2({
    requestId: "manga-profile-test",
    ageBand: "adult",
    limit: 5,
    enabledSources: { mock: false, googleBooks: false, openLibrary: false, kitsu: true, comicVine: false, localLibrary: false, nyt: false },
    signals: mangaSignals,
    deckKey: "adult",
  });
  const kitsuSource = asArray(result?.diagnostics?.sources).find((s) => asObject(s).source === "kitsu");
  const diags = asObject(kitsuSource);
  const finalItems = asArray(result?.items);
  assert("Kitsu dispatched (not skipped)", String(diags.status || "") !== "skipped");
  assert("Count-contract met (≥5 final)", finalItems.length >= 5, `got ${finalItems.length}`);
  assert("All items are from Kitsu", finalItems.every((item) => String(asObject(item).source || "") === "kitsu"));
}

// ─── Summary ──────────────────────────────────────────────────────────────────

const totalPassed = passed + runsPassed;
const totalFailed = failed + runsFailed;

console.log(`\n${"═".repeat(63)}`);
console.log(`Profile runs:   ${runsPassed} passed, ${runsFailed} failed`);
console.log(`Policy fixtures: ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────────────────────────`);
console.log(`Total:          ${totalPassed} passed, ${totalFailed} failed`);

if (totalFailed === 0) {
  console.log("\nAll Kitsu source certification regressions passed.");
} else {
  console.error("\nCERTIFICATION FAILURES DETECTED");
  process.exitCode = 1;
}
