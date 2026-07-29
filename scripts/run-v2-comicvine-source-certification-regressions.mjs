/**
 * ComicVine source certification regressions (phase 1 + phase 2 admission policy).
 *
 * Coverage:
 * 1) Retrieval lineage diagnostics for successful ComicVine-only runs
 * 2) Abort vs timeout vs valid-empty distinction
 * 3) Source-disabled distinction from starvation
 * 4) Internal count consistency across raw/converted/normalized/final stages
 * 5) Diagnostic-only publication identity classification coverage
 * 6) Test A zero-result reproducibility with explicit stage reasoning
 * 7) Test B/Test C behavior guard (40 raw / 25 raw, 5 returned)
 * 8) Source admission policy: hard rejects, preferred admits, deterministic collapse, fallback-only release
 * 9) Entity-policy guardrails: restricted-category handling, scorer invariance, non-ComicVine invariance
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

process.env.EXPO_PUBLIC_COMICVINE_PROXY_URL = "undefined";
process.env.COMICVINE_PROXY_URL = "https://proxy.localhost/api/comicvine";

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

function assertTruthy(value, message) {
  if (!value) throw new Error(`${message}: expected truthy, got ${JSON.stringify(value)}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertGte(actual, expected, message) {
  if (Number(actual) < Number(expected)) throw new Error(`${message}: expected >= ${expected}, got ${actual}`);
}

function assertNotIncludes(haystack, needle, message) {
  if (Array.isArray(haystack) && haystack.includes(needle)) {
    throw new Error(`${message}: expected ${JSON.stringify(haystack)} to exclude ${JSON.stringify(needle)}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message}: expected ${b}, got ${a}`);
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../app/recommender-v2");
const { runRecommenderV2 } = require(resolve(dir, "engine.ts"));
const { classifyComicVineIdentity } = require(resolve(dir, "comicVineIdentity.ts"));
const { normalizeSourceResults } = require(resolve(dir, "normalize.ts"));
const { buildTasteProfile } = require(resolve(dir, "tasteProfile.ts"));
const { scoreCandidates } = require(resolve(dir, "score.ts"));
const { applyComicVineSourceAdmissionPolicy } = require(resolve(dir, "comicVineAdmission.ts"));
const adultDeck = require(resolve(dirname(fileURLToPath(import.meta.url)), "../data/swipeDecks/adult.ts")).default;

function formatFromTagsForV2(tags) {
  const joined = tags.join(" ").toLowerCase();
  if (/\b(manga|anime)\b/.test(joined)) return joined.includes("anime") ? "anime" : "manga";
  if (/\b(comic|superhero)\b/.test(joined)) return "comic";
  if (/graphicnovel|graphic novel/.test(joined)) return "graphicNovel";
  return "book";
}

function buildSignalsFromPreset(sequence) {
  const cards = adultDeck.cards.slice(0, sequence.length);
  return cards.map((card, index) => {
    const tags = Array.isArray(card.tags) ? card.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [];
    const bareTags = tags.map((tag) => tag.replace(/^[a-zA-Z]+:/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());
    const genres = [card.genre, ...tags.filter((tag) => /^genre:/i.test(tag)).map((tag) => tag.replace(/^genre:/i, ""))]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const tones = tags.filter((tag) => /^(tone|mood):/i.test(tag)).map((tag) => tag.replace(/^(tone|mood):/i, ""));
    const themes = tags.filter((tag) => /^(theme|setting|stakes|graphicNovel):/i.test(tag)).map((tag) => tag.replace(/^(theme|setting|stakes|graphicNovel):/i, ""));
    const characterDynamics = tags.filter((tag) => /^(character|relationship|dynamic):/i.test(tag)).map((tag) => tag.replace(/^(character|relationship|dynamic):/i, ""));
    const action = sequence[index] || "skip";
    return {
      id: `${index + 1}-${String(card.title || "")}`,
      title: String(card.title || "").trim(),
      action: action === "like" ? "like" : action === "dislike" ? "dislike" : "skip",
      source: "mock",
      format: formatFromTagsForV2(tags),
      tags: bareTags,
      genres,
      tones,
      themes,
      characterDynamics,
      weight: action === "skip" ? 0.25 : 1,
    };
  });
}

function makeComicRows(query, count, startId = 1, options = {}) {
  const tag = String(options.tag || "Standard");
  const issuePrefix = String(options.issuePrefix || "Issue");
  return Array.from({ length: count }, (_unused, index) => ({
    id: startId + index,
    resource_type: "issue",
    name: `${tag} ${query} ${issuePrefix} ${index + 1}`,
    deck: `A ${query} comic storyline.`,
    description: `Collected comic narrative around ${query}.`,
    issue_number: String(index + 1),
    cover_date: `20${String((10 + (index % 10))).padStart(2, "0")}-01-01`,
    site_detail_url: `https://comicvine.gamespot.com/${tag.toLowerCase()}-${index + 1}/4000-${startId + index}/`,
    volume: { id: 900 + index, name: `${tag} ${query}` },
    person_credits: [{ name: "Writer A" }, { name: "Artist B" }],
  }));
}

function makeComicRow(overrides = {}) {
  return {
    id: 9999,
    resource_type: "issue",
    name: "Default Comic Row",
    deck: "Default deck",
    description: "Default description",
    issue_number: "1",
    cover_date: "2019-01-01",
    site_detail_url: "https://comicvine.gamespot.com/default/4000-9999/",
    volume: { id: 999, name: "Default Volume" },
    person_credits: [{ name: "Writer A" }],
    ...overrides,
  };
}

async function runComicVineOnly(requestId, sequence, fetchImpl) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await runRecommenderV2({
      requestId,
      ageBand: "adult",
      limit: 5,
      enabledSources: {
        mock: false,
        googleBooks: false,
        openLibrary: false,
        kitsu: false,
        comicVine: true,
        localLibrary: false,
        nyt: false,
      },
      signals: buildSignalsFromPreset(sequence),
      deckKey: "adult",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function runMockOnly(requestId, sequence) {
  return runRecommenderV2({
    requestId,
    ageBand: "adult",
    limit: 5,
    enabledSources: {
      mock: true,
      googleBooks: false,
      openLibrary: false,
      kitsu: false,
      comicVine: false,
      localLibrary: false,
      nyt: false,
    },
    signals: buildSignalsFromPreset(sequence),
    deckKey: "adult",
  });
}

function comicDiag(result) {
  return asObject((result?.diagnostics?.sources || []).find((source) => source.source === "comicVine"));
}

async function main() {
  const testASequence = ["like", "like", "dislike", "skip", "like", "dislike", "like", "skip"];
  const testBSequence = ["dislike", "dislike", "like", "skip", "dislike", "like", "skip", "like"];
  const testCSequence = ["like", "skip", "like", "skip", "dislike", "like", "dislike", "like"];

  const successB = await runComicVineOnly("comicvine-test-b-success", testBSequence, async (input) => {
    const url = String(input || "");
    if (!url.includes("proxy.localhost/api/comicvine")) return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } });
    const query = new URL(url).searchParams.get("q") || "query";
    const rows = makeComicRows(query, 20, query.includes("format") ? 2001 : 1001, { tag: "B" });
    return new Response(JSON.stringify({ results: rows }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const successBDiag = comicDiag(successB);

  assertEqual(String(successBDiag.status || ""), "succeeded", "T1 success status");
  assertEqual(Number(successBDiag.rawApiResultCount || 0), 40, "T1 raw api count");
  assertGte(Number(successBDiag.rawCount || 0), 20, "T1 deduped raw count");
  assertEqual(Number(successBDiag.convertedCount || 0), 40, "T1 converted count");
  assertEqual(Number(successBDiag.duplicateCount || 0), 20, "T1 duplicate count");
  assertEqual(Number(successBDiag.normalizedCount || 0), Number(successBDiag.rawCount || 0), "T1 normalized matches deduped raw");
  assertEqual(Number(successBDiag.scoringHandoffCount || 0), Number(successBDiag.normalizedCount || 0), "T1 scoring handoff matches normalized");
  assertGte(Number(successBDiag.finalEligibleCount || 0), 5, "T1 final eligible count");
  assertEqual(Number(successBDiag.selectedCount || 0), 5, "T1 selected count");
  assertEqual(Number(successBDiag.renderedCount || 0), 5, "T1 rendered count");
  assertEqual(successB.items.length, 5, "T1 final returned count");
  assertTruthy(Array.isArray(successBDiag.fetches) && successBDiag.fetches.length >= 2, "T1 fetch diagnostics present");
  assertTruthy((successBDiag.fetches || []).every((fetch) => fetch.requestDispatched === true), "T1 request dispatched markers");
  assertTruthy((successBDiag.fetches || []).every((fetch) => typeof fetch.requestStart === "string" && typeof fetch.requestEnd === "string"), "T1 request timing markers");
  assertTruthy((successBDiag.fetches || []).every((fetch) => Number(fetch.normalizedCandidateCount || 0) >= 0), "T1 per-query normalized count markers");
  assertTruthy((successBDiag.fetches || []).every((fetch) => Number(fetch.scoringHandoffCount || 0) >= Number(fetch.selectedCount || 0)), "T1 per-query count consistency");
  assertTruthy(successB.items.every((item) => item.source === "comicVine"), "T1 source purity");
  assertTruthy(successB.items.every((item) => asObject(item.diagnostics?.sourceProvenance).source === "comicVine"), "T1 source provenance present");
  assertTruthy(successB.items.every((item) => !Object.keys(asObject(item.scoreBreakdown || {})).some((key) => /identity/i.test(key))), "T1 identity diagnostics not in scoring breakdown");
  console.log("PASS T1: successful ComicVine-only lineage and count consistency");

  let testCFetchCount = 0;
  const successC = await runComicVineOnly("comicvine-test-c-success", testCSequence, async (input) => {
    const url = String(input || "");
    if (!url.includes("proxy.localhost/api/comicvine")) return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } });
    const query = new URL(url).searchParams.get("q") || "query";
    testCFetchCount += 1;
    const rows = testCFetchCount === 1
      ? makeComicRows(query, 20, 4001, { tag: "C" })
      : makeComicRows(query, 5, 5001, { tag: "C" });
    return new Response(JSON.stringify({ results: rows }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const successCDiag = comicDiag(successC);
  assertEqual(String(successCDiag.status || ""), "succeeded", "T2 success status");
  assertEqual(Number(successCDiag.rawApiResultCount || 0), 25, "T2 raw api count");
  assertGte(Number(successCDiag.rawCount || 0), 20, "T2 deduped raw count");
  assertEqual(Number(successCDiag.selectedCount || 0), 5, "T2 selected count");
  assertEqual(successC.items.length, 5, "T2 final returned count");
  console.log("PASS T2: Test C guard (25 raw -> 5 returned)");

  const abortedA = await runComicVineOnly("comicvine-test-a-aborted", testASequence, async () => {
    const error = new Error("The operation was aborted.");
    error.name = "AbortError";
    throw error;
  });
  const abortedDiag = comicDiag(abortedA);
  assertEqual(Number(abortedDiag.rawCount || 0), 0, "T3 raw zero");
  assertEqual(Number(abortedDiag.normalizedCount || 0), 0, "T3 normalized zero");
  assertEqual(Number(abortedDiag.selectedCount || 0), 0, "T3 selected zero");
  assertEqual(String(abortedDiag.failedReason || ""), "request_aborted", "T3 explicit abort reason");
  assertEqual(String(abortedDiag.emptyReason || ""), "request_aborted", "T3 empty reason classified as abort");
  assertTruthy((abortedDiag.fetches || []).every((fetch) => fetch.status === "aborted"), "T3 per-query abort status");
  assertTruthy((abortedDiag.fetches || []).every((fetch) => fetch.emptyResultReason === "request_aborted"), "T3 per-query abort empty reason");
  console.log("PASS T3: Test A zero-result path reproducible and diagnosed as request_aborted");

  const timedOut = await runComicVineOnly("comicvine-timeout", testASequence, async () => {
    const error = new Error("source_timeout aborted by parent controller");
    error.name = "AbortError";
    throw error;
  });
  const timedOutDiag = comicDiag(timedOut);
  assertEqual(String(timedOutDiag.status || ""), "timed_out", "T4 timeout status");
  assertEqual(String(timedOutDiag.failedReason || ""), "request_timed_out", "T4 timeout reason");
  assertEqual(String(timedOutDiag.emptyReason || ""), "request_timed_out", "T4 timeout empty reason");
  assertTruthy((timedOutDiag.fetches || []).every((fetch) => fetch.status === "timed_out"), "T4 per-query timeout status");
  console.log("PASS T4: timeout distinguished from abort");

  const validEmpty = await runComicVineOnly("comicvine-valid-empty", testASequence, async (input) => {
    const url = String(input || "");
    if (!url.includes("proxy.localhost/api/comicvine")) return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const validEmptyDiag = comicDiag(validEmpty);
  assertEqual(String(validEmptyDiag.status || ""), "empty", "T5 valid-empty status");
  assertEqual(String(validEmptyDiag.emptyReason || ""), "valid_empty_response", "T5 valid-empty reason");
  assertTruthy((validEmptyDiag.fetches || []).every((fetch) => fetch.status === "empty"), "T5 per-query empty status");
  assertTruthy((validEmptyDiag.fetches || []).every((fetch) => fetch.emptyResultReason === "valid_empty_response"), "T5 per-query empty reason");
  console.log("PASS T5: valid empty distinguished from abort/timeout");

  const sourceDisabled = await runRecommenderV2({
    requestId: "comicvine-source-disabled",
    ageBand: "adult",
    limit: 5,
    enabledSources: {
      mock: false,
      googleBooks: false,
      openLibrary: false,
      kitsu: false,
      comicVine: false,
      localLibrary: false,
      nyt: false,
    },
    signals: buildSignalsFromPreset(testASequence),
    deckKey: "adult",
  });
  const sourceDisabledDiag = comicDiag(sourceDisabled);
  assertEqual(String(sourceDisabledDiag.status || ""), "skipped", "T6 disabled status");
  assertEqual(String(sourceDisabledDiag.skippedReason || ""), "source_disabled", "T6 disabled reason");
  assertEqual(Boolean(sourceDisabledDiag.attempted), false, "T6 disabled attempted false");
  assertEqual(String(sourceDisabledDiag.emptyReason || ""), "source_disabled", "T6 disabled not source starvation");
  console.log("PASS T6: source-disabled path distinguished from starvation");

  const identityFixtures = [
    [{ title: "Batman Vol. 1: Court of Owls", resourceType: "volume", description: "Collects issues #1-7" }, "collected_edition"],
    [{ title: "Saga TPB Vol. 2", resourceType: "volume" }, "trade_paperback"],
    [{ title: "X-Men Omnibus", resourceType: "volume" }, "omnibus"],
    [{ title: "Detective Comics", issueNumber: "1040", resourceType: "issue" }, "single_issue"],
    [{ title: "Action Comics Annual 2024", issueNumber: "1", resourceType: "issue" }, "annual"],
    [{ title: "The Art of Spider-Man #1", issueNumber: "1", resourceType: "issue" }, "art_book"],
    [{ title: "Character Guide #1", issueNumber: "1", resourceType: "issue", description: "Official guide to the cast." }, "companion_guide"],
    [{ title: "Hulk: The Movie Adaptation #1", issueNumber: "1", resourceType: "issue" }, "movie_or_tv_tie_in"],
    [{ title: "Marvel Coloring Book", resourceType: "volume" }, "coloring_book"],
    [{ title: "Zxyq Primary Listing", resourceType: "thing" }, "unknown"],
  ];
  for (const [input, expected] of identityFixtures) {
    const classification = classifyComicVineIdentity(input);
    assertEqual(classification.identity, expected, `T7 identity classification for ${input.title}`);
    assertTruthy(Array.isArray(classification.evidence) && classification.evidence.length > 0, `T7 evidence present for ${input.title}`);
  }
  assertTruthy(asObject(successBDiag.comicVineSourceIdentityReport).histogram != null, "T7 identity report present");
  console.log("PASS T7: identity classification/report coverage");

  const hardRejectAndSuppressionRun = await runComicVineOnly("comicvine-admission-hard-reject-and-suppression", testBSequence, async (input) => {
    const url = String(input || "");
    if (!url.includes("proxy.localhost/api/comicvine")) {
      return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const rows = [
      makeComicRow({
        id: 7101,
        resource_type: "issue",
        name: "Saga #1",
        issue_number: "1",
        deck: "Opening issue for Saga.",
        description: "Saga issue one.",
        volume: { id: 701, name: "Saga" },
      }),
      makeComicRow({
        id: 7102,
        resource_type: "volume",
        name: "Saga Vol. 1",
        issue_number: "",
        deck: "Collects issues #1-6.",
        description: "Collected edition of Saga.",
        volume: { id: 701, name: "Saga" },
      }),
      makeComicRow({
        id: 7103,
        resource_type: "volume",
        name: "Marvel Coloring Book",
        issue_number: "",
        deck: "Coloring activity collection.",
        description: "Coloring pages.",
        volume: { id: 702, name: "Marvel Coloring Book" },
      }),
      makeComicRow({
        id: 7104,
        resource_type: "volume",
        name: "Compendium of Saga",
        issue_number: "",
        deck: "Compendium release.",
        description: "Compendium edition.",
        volume: { id: 703, name: "Saga Compendium" },
      }),
    ];
    return new Response(JSON.stringify({ results: rows }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const hardRejectSuppressionDiag = comicDiag(hardRejectAndSuppressionRun);
  const hardRejected = hardRejectSuppressionDiag.comicVineHardRejectedCandidates || [];
  const suppressedIssues = hardRejectSuppressionDiag.comicVineSuppressedIssues || [];
  const reachingScorer = hardRejectSuppressionDiag.comicVineCandidatesReachingScorerAfterAdmission || [];
  assertTruthy(hardRejected.length >= 1, "T8 hard-reject candidates captured");
  assertTruthy(hardRejected.every((row) => row.decision === "hard_reject"), "T8 hard-reject decision state");
  assertTruthy(hardRejected.every((row) => row.identity && row.sourceId && row.sourceQuery !== undefined && Array.isArray(row.reasonCodes) && Array.isArray(row.evidence)), "T8 hard-reject provenance complete");
  assertTruthy(Array.isArray(suppressedIssues) && suppressedIssues.some((row) => row.reasonCodes.includes("collection_defeats_component_issue")), "T8 component issue suppression captured");
  assertTruthy(reachingScorer.every((row) => row.identity !== "coloring_book"), "T8 hard-reject identity blocked before scorer");
  assertTruthy(reachingScorer.some((row) => row.identity === "trade_paperback" || row.identity === "collected_edition" || row.identity === "compendium"), "T8 preferred identities remain scorer-eligible");
  const sagaIssueSuppressed = suppressedIssues.find((row) => String(row.title || "").toLowerCase().includes("saga #1"));
  assertTruthy(Boolean(sagaIssueSuppressed), "T8 Saga issue suppressed by collection representative");
  assertTruthy(String(sagaIssueSuppressed.representativeId || "").length > 0, "T8 suppressed issue representedBy populated");
  assertNotIncludes(hardRejectAndSuppressionRun.items.map((item) => item.title), "Saga #1", "T8 suppressed issue excluded from final recommendations");
  console.log("PASS T8: hard rejects + complete provenance + high-confidence suppression");

  const duplicateEditionRun = await runComicVineOnly("comicvine-admission-duplicate-edition-collapse", testASequence, async (input) => {
    const url = String(input || "");
    if (!url.includes("proxy.localhost/api/comicvine")) {
      return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const rows = [
      makeComicRow({
        id: 8101,
        resource_type: "volume",
        name: "Batman Omnibus",
        issue_number: "",
        deck: "Collects issues #1-12.",
        description: "Omnibus collection",
        volume: { id: 801, name: "Batman" },
      }),
      makeComicRow({
        id: 8102,
        resource_type: "volume",
        name: "Batman Deluxe Edition",
        issue_number: "",
        deck: "Collects issues #1-12.",
        description: "Deluxe collection",
        volume: { id: 801, name: "Batman" },
      }),
    ];
    return new Response(JSON.stringify({ results: rows }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const duplicateDiag = comicDiag(duplicateEditionRun);
  const duplicateSuppressed = duplicateDiag.comicVineSuppressedIssues || [];
  assertTruthy(duplicateSuppressed.some((row) => row.reasonCodes.includes("duplicate_collection_family_collapsed_by_issue_range")), "T9 duplicate collection family collapse captured");
  assertEqual(duplicateEditionRun.items.length, 1, "T9 one duplicate-edition representative survives");
  console.log("PASS T9: duplicate editions collapse to one representative");

  const firstIssueFallbackRun = await runComicVineOnly("comicvine-fallback-first-issue", testCSequence, async (input) => {
    const url = String(input || "");
    if (!url.includes("proxy.localhost/api/comicvine")) {
      return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const rows = [
      makeComicRow({
        id: 9101,
        resource_type: "issue",
        name: "Lone Detective #1",
        issue_number: "1",
        deck: "No collection available.",
        description: "Drama historical fantasy adult dark mystery book first issue.",
        volume: { id: 901, name: "Lone Detective" },
      }),
    ];
    return new Response(JSON.stringify({ results: rows }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const firstIssueCandidate = firstIssueFallbackRun.items.find((item) => item.title === "Lone Detective #1");
  const firstIssueProvenance = asObject(firstIssueCandidate?.diagnostics?.sourceProvenance);
  assertTruthy(Boolean(firstIssueCandidate), "T10 first issue released as fallback");
  assertEqual(String(firstIssueProvenance.fallbackState || ""), "released", "T10 first issue marked as released fallback");
  console.log("PASS T10: first issue fallback releases when no stronger unit exists");

  const restrictedRun = await runComicVineOnly("comicvine-restricted-categories", testASequence, async (input) => {
    const url = String(input || "");
    if (!url.includes("proxy.localhost/api/comicvine")) {
      return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const rows = [
      makeComicRow({ id: 10101, resource_type: "volume", name: "The Art of Gotham", issue_number: "", deck: "Art book", description: "Art of series", volume: { id: 1001, name: "Gotham Art" } }),
      makeComicRow({ id: 10102, resource_type: "volume", name: "Character Handbook", issue_number: "", deck: "Reference guide", description: "Reference handbook", volume: { id: 1002, name: "Character Handbook" } }),
      makeComicRow({ id: 10103, resource_type: "volume", name: "Movie Tie-In Novel", issue_number: "", deck: "Movie tie in", description: "Tie-in release", volume: { id: 1003, name: "Movie Tie-In Novel" } }),
      makeComicRow({ id: 10104, resource_type: "thing", name: "Primary Listing Artifact", issue_number: "", deck: "Unclear identity", description: "Unknown object", volume: { id: 1004, name: "Primary Listing Artifact" } }),
    ];
    return new Response(JSON.stringify({ results: rows }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const restrictedDiag = comicDiag(restrictedRun);
  const withheldPostScore = restrictedDiag.comicVineWithheldPostScoreCandidates || [];
  assertEqual(restrictedRun.items.length, 0, "T11 restricted categories do not pad the slate");
  assertTruthy(withheldPostScore.some((row) => row.reason === "restricted_category_lacks_direct_taste_evidence"), "T11 restricted-category withholding reason recorded");
  console.log("PASS T11: restricted categories require direct supporting evidence");

  const sourceForScoreParity = {
    source: "comicVine",
    status: "succeeded",
    rawItems: [
      {
        id: "comicVine:score-parity-1",
        sourceId: "comicVine:score-parity-1",
        title: "Score Parity Vol. 1",
        subtitle: "Score Parity",
        creators: ["Writer A"],
        description: "Collects issues #1-4",
        formats: ["comic"],
        genres: ["comics", "graphic novels"],
        themes: ["adventure"],
        tones: ["dramatic"],
        characterDynamics: ["team"],
        publicationYear: 2018,
        sourceUrl: "https://comicvine.gamespot.com/score-parity-1/",
        queryText: "score parity",
        queryFamily: "core",
        queryCascadeIndex: 0,
        facets: [],
        routingReason: "comicvine_v2_intent_adapter",
        raw: makeComicRow({
          id: 11101,
          resource_type: "volume",
          name: "Score Parity Vol. 1",
          issue_number: "",
          deck: "Collects issues #1-4",
          description: "Collected edition",
          volume: { id: 1101, name: "Score Parity" },
        }),
      },
      {
        id: "comicVine:score-parity-2",
        sourceId: "comicVine:score-parity-2",
        title: "Score Parity Art Book",
        subtitle: "Score Parity",
        creators: ["Writer B"],
        description: "Art book reference",
        formats: ["comic"],
        genres: ["comics"],
        themes: ["art"],
        tones: ["informative"],
        characterDynamics: [],
        publicationYear: 2019,
        sourceUrl: "https://comicvine.gamespot.com/score-parity-2/",
        queryText: "score parity",
        queryFamily: "core",
        queryCascadeIndex: 0,
        facets: [],
        routingReason: "comicvine_v2_intent_adapter",
        raw: makeComicRow({
          id: 11102,
          resource_type: "volume",
          name: "Score Parity Art Book",
          issue_number: "",
          deck: "Art book reference",
          description: "Reference art book",
          volume: { id: 1102, name: "Score Parity Art Book" },
        }),
      },
    ],
    diagnostics: {
      source: "comicVine",
      status: "succeeded",
      planned: true,
      attempted: true,
      timedOut: false,
      rawCount: 2,
      queries: ["score parity"],
    },
  };
  const sourceResultsForScoreParity = [sourceForScoreParity];
  const normalizedScoreParity = normalizeSourceResults(sourceResultsForScoreParity);
  const profileForScoreParity = buildTasteProfile({
    requestId: "score-parity-profile",
    ageBand: "adult",
    limit: 5,
    signals: buildSignalsFromPreset(testASequence),
    enabledSources: { comicVine: true },
    deckKey: "adult",
  });
  const baselineScores = scoreCandidates(normalizedScoreParity, profileForScoreParity);
  const gatedScoreParity = applyComicVineSourceAdmissionPolicy(normalizedScoreParity, sourceResultsForScoreParity);
  const gatedScores = scoreCandidates(gatedScoreParity.candidates, profileForScoreParity);
  const baselineById = Object.fromEntries(baselineScores.map((candidate) => [candidate.sourceId || candidate.id, candidate.score]));
  const gatedById = Object.fromEntries(gatedScores.map((candidate) => [candidate.sourceId || candidate.id, candidate.score]));
  assertDeepEqual(gatedById, baselineById, "T12 admission policy does not alter shared score values");
  console.log("PASS T12: admission policy leaves shared scores unchanged for retained entities");

  const mockOnlyA = await runMockOnly("non-comicvine-source-control-a", testASequence);
  const mockOnlyB = await runMockOnly("non-comicvine-source-control-b", testASequence);
  assertDeepEqual(
    mockOnlyA.items.map((item) => ({ title: item.title, source: item.source, score: item.score })),
    mockOnlyB.items.map((item) => ({ title: item.title, source: item.source, score: item.score })),
    "T13 policy does not change non-ComicVine source behavior",
  );
  const mockOnlyComicDiag = asObject((mockOnlyA.diagnostics.sources || []).find((diag) => diag.source === "comicVine"));
  assertEqual(String(mockOnlyComicDiag.status || ""), "skipped", "T13 comicvine remains skipped when disabled");
  assertEqual(Number(asObject(mockOnlyComicDiag.comicVineAdmissionStateCounts).hard_reject || 0), 0, "T13 no comicvine admission mutations when disabled");
  console.log("PASS T13: non-ComicVine behavior unchanged");

  console.log("\nAll ComicVine source certification regressions passed.");
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
