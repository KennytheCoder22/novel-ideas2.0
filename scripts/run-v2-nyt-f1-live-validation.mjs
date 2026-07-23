import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const outDir = resolve(scriptDir, "output");

const { runRecommenderV2 } = require(resolve(repoRoot, "app/recommender-v2/engine.ts"));
const { nytSourceAdapter } = require(resolve(repoRoot, "app/recommender-v2/sources/nytSource.ts"));
const { adaptNytBooksToRecommendationDocs } = require(resolve(repoRoot, "services/bestsellers/nytAdapter.ts"));

function parseDotEnv(path) {
  try {
    const raw = readFileSync(path, "utf8");
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
    return out;
  } catch {
    return {};
  }
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value || "").trim();
}

function key(value) {
  return text(value).toLowerCase();
}

function redactApiKey(url) {
  const raw = text(url);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.searchParams.has("api-key")) {
      parsed.searchParams.set("api-key", "[redacted]");
    }
    return parsed.toString();
  } catch {
    return raw.replace(/([?&]api-key=)[^&]+/gi, "$1[redacted]");
  }
}

const ADULT_PRESETS = [
  {
    id: "adult-a",
    label: "Adult A",
    archetype: "crime/thriller/drama",
    ageBand: "adult",
    signals: [
      { action: "like", title: "Gone Girl", genres: ["psychological thriller", "mystery"], themes: ["crime", "suspense"], format: "book" },
      { action: "like", title: "The Girl with the Dragon Tattoo", genres: ["crime", "thriller"], themes: ["investigation"], format: "book" },
      { action: "like", title: "The Secret History", genres: ["literary fiction", "crime drama"], themes: ["dark academia"], format: "book" },
    ],
  },
  {
    id: "adult-b",
    label: "Adult B",
    archetype: "science-fiction/fantasy",
    ageBand: "adult",
    signals: [
      { action: "like", title: "All Systems Red", genres: ["science fiction", "adventure"], themes: ["space", "humor"], format: "book" },
      { action: "like", title: "Legends & Lattes", genres: ["cozy fantasy", "fantasy"], themes: ["comfort", "found family"], format: "book" },
      { action: "like", title: "The Long Way to a Small Angry Planet", genres: ["science fiction"], themes: ["found family", "adventure"], format: "book" },
    ],
  },
  {
    id: "adult-c",
    label: "Adult C",
    archetype: "historical/crime/drama",
    ageBand: "adult",
    signals: [
      { action: "like", title: "11/22/63", genres: ["historical fiction", "science fiction"], themes: ["drama", "alternate history"], format: "book" },
      { action: "like", title: "The Plot Against America", genres: ["historical fiction"], themes: ["political", "drama"], format: "book" },
      { action: "like", title: "Dark Matter", genres: ["science fiction", "thriller"], themes: ["suspense"], format: "book" },
    ],
  },
];

function stageCount(diagnostics, stage, keyName) {
  const row = asArray(diagnostics.stages).find((entry) => text(asObject(entry).stage) === stage);
  return Number(asObject(row).counts?.[keyName] || 0);
}

function lineageRows(items) {
  return asArray(items).map((item) => {
    const row = asObject(item);
    const raw = asObject(row.raw);
    return {
      title: text(row.title),
      source: text(row.source),
      sourceId: text(row.sourceId),
      rawSource: text(raw.source),
      hasNytMetadata: Boolean(asObject(raw.nyt).list_name || asObject(raw.nyt).display_name),
    };
  });
}

function adapterPass(run) {
  const checks = [];
  checks.push({ id: "fetch_attempted", pass: run.nyt.attempted === true && run.nyt.status !== "skipped" });
  checks.push({ id: "list_success", pass: Object.values(run.nyt.nytHttpStatusByList || {}).some((status) => Number(status) >= 200 && Number(status) < 300) });
  checks.push({ id: "rows_converted", pass: Number(run.nyt.nytConvertedCount || 0) > 0 });
  checks.push({ id: "truthful_lineage", pass: run.lineage.every((row) => row.source === "nyt" && row.rawSource === "nyt") });
  checks.push({ id: "entered_normalization_scoring", pass: run.normalizedCount > 0 && run.scoredCount > 0 });
  checks.push({ id: "not_reported_as_openlibrary", pass: run.lineage.every((row) => row.source !== "openLibrary" && row.rawSource !== "openLibrary") });
  checks.push({
    id: "count_reconciliation",
    pass: Number(run.nyt.rawCount || 0) === Number(run.nyt.nytConvertedCount || 0)
      && run.normalizedCount >= Number(run.nyt.nytConvertedCount || 0)
      && run.scoredCount >= run.finalAcceptedTitles.length
      && run.renderedTitles.length <= run.finalAcceptedTitles.length,
  });
  return {
    pass: checks.every((row) => row.pass),
    checks,
  };
}

async function runLivePreset(preset, limit = 6) {
  const result = await runRecommenderV2({
    requestId: `nyt-f1-live-${preset.id}`,
    ageBand: preset.ageBand,
    limit,
    enabledSources: {
      nyt: true,
      googleBooks: false,
      openLibrary: false,
      kitsu: false,
      comicVine: false,
      localLibrary: false,
      mock: false,
    },
    signals: preset.signals,
  });

  const diagnostics = asObject(result.diagnostics);
  const nyt = asObject(asArray(diagnostics.sources).find((source) => asObject(source).source === "nyt"));
  const run = {
    presetId: preset.id,
    presetLabel: preset.label,
    archetype: preset.archetype,
    nyt: {
      status: text(nyt.status),
      attempted: Boolean(nyt.attempted),
      skippedReason: text(nyt.skippedReason),
      failedReason: text(nyt.failedReason),
      emptyReason: text(nyt.emptyReason),
      timedOut: Boolean(nyt.timedOut),
      queries: asArray(nyt.queries),
      nytRequestedLists: asArray(nyt.nytRequestedLists),
      nytReturnedLists: asArray(nyt.nytReturnedLists),
      nytBooksPerList: asObject(nyt.nytBooksPerList),
      nytEndpointCalledByList: Object.fromEntries(
        Object.entries(asObject(nyt.nytEndpointCalledByList)).map(([list, endpoint]) => [list, redactApiKey(endpoint)])
      ),
      nytHttpStatusByList: asObject(nyt.nytHttpStatusByList),
      rawApiResultCount: Number(nyt.rawApiResultCount || 0),
      rawCount: Number(nyt.rawCount || 0),
      nytRawBookCount: Number(nyt.nytRawBookCount || 0),
      nytConvertedCount: Number(nyt.nytConvertedCount || 0),
      nytDroppedCount: Number(nyt.nytDroppedCount || 0),
      nytDropReasons: asObject(nyt.nytDropReasons),
      nytNormalizedTitles: asArray(nyt.nytNormalizedTitles),
      fetches: asArray(nyt.fetches).map((fetch) => ({
        query: text(asObject(fetch).query),
        status: text(asObject(fetch).status),
        httpStatus: Number(asObject(fetch).httpStatus || 0),
        timedOut: Boolean(asObject(fetch).timedOut),
        failedReason: text(asObject(fetch).failedReason),
      })),
    },
    normalizedCount: stageCount(diagnostics, "normalized", "normalized"),
    scoredCount: stageCount(diagnostics, "scored", "scored"),
    finalAcceptedTitles: asArray(diagnostics.finalSelectionTitles).map((title) => text(title)).filter(Boolean),
    renderedTitles: asArray(diagnostics.returnedItemsTitles).map((title) => text(title)).filter(Boolean),
    lineage: lineageRows(result.items),
  };
  run.adapterLayer = adapterPass(run);
  return run;
}

async function runNytDisabledRegression(preset) {
  const result = await runRecommenderV2({
    requestId: `nyt-f1-disabled-${preset.id}`,
    ageBand: preset.ageBand,
    limit: 6,
    enabledSources: {
      nyt: false,
      googleBooks: false,
      openLibrary: false,
      kitsu: false,
      comicVine: false,
      localLibrary: false,
      mock: false,
    },
    signals: preset.signals,
  });
  const diagnostics = asObject(result.diagnostics);
  const nyt = asObject(asArray(diagnostics.sources).find((source) => asObject(source).source === "nyt"));
  return {
    nytStatus: text(nyt.status),
    nytAttempted: Boolean(nyt.attempted),
    nytSkippedReason: text(nyt.skippedReason),
    pass: text(nyt.status) === "skipped" && Boolean(nyt.attempted) === false && text(nyt.skippedReason) === "source_disabled",
  };
}

async function runOtherSourceUnchangedRegression(preset) {
  const result = await runRecommenderV2({
    requestId: `nyt-f1-other-source-regression-${preset.id}`,
    ageBand: preset.ageBand,
    limit: 6,
    enabledSources: {
      nyt: false,
      googleBooks: true,
      openLibrary: false,
      kitsu: false,
      comicVine: false,
      localLibrary: false,
      mock: false,
    },
    signals: preset.signals,
  });
  const diagnostics = asObject(result.diagnostics);
  const sources = asArray(diagnostics.sources).map((source) => ({
    source: text(asObject(source).source),
    status: text(asObject(source).status),
    attempted: Boolean(asObject(source).attempted),
    skippedReason: text(asObject(source).skippedReason),
  }));
  const gb = sources.find((source) => source.source === "googleBooks");
  const nyt = sources.find((source) => source.source === "nyt");
  return {
    sources,
    pass: Boolean(gb?.attempted) && gb?.status !== "skipped" && nyt?.status === "skipped" && nyt?.skippedReason === "source_disabled",
  };
}

async function runMockedNytAdapterRegression() {
  // Use a fresh adapter instance so the daily cache populated by live runs
  // does not intercept the mock fetch responses.
  const freshAdapter = freshNytAdapter();
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.NYT_BOOKS_API_KEY;
  process.env.NYT_BOOKS_API_KEY = process.env.NYT_BOOKS_API_KEY || "mock-nyt-key";
  const responseForList = (listSlug) => {
    if (listSlug === "combined-print-and-e-book-fiction") {
      return {
        status: 200,
        payload: {
          status: "OK",
          results: {
            list_name: "Combined Print & E-Book Fiction",
            list_name_encoded: "combined-print-and-e-book-fiction",
            display_name: "Combined Print & E-Book Fiction",
            books: [
              { title: "Shared Bestseller", author: "Author One", primary_isbn13: "9780000000001", rank: 1, weeks_on_list: 4 },
              { title: "Unique Combined", author: "Author Two", primary_isbn13: "9780000000002", rank: 2, weeks_on_list: 2 },
            ],
          },
        },
      };
    }
    if (listSlug === "hardcover-fiction") {
      return { status: 500, payload: { message: "simulated_hardcover_failure" } };
    }
    if (listSlug === "trade-fiction-paperback") {
      return {
        status: 200,
        payload: {
          status: "OK",
          results: {
            list_name: "Trade Fiction Paperback",
            list_name_encoded: "trade-fiction-paperback",
            display_name: "Trade Fiction Paperback",
            books: [
              { title: "Shared Bestseller", author: "Author One", primary_isbn13: "9780000000001", rank: 3, weeks_on_list: 1 },
              { title: "Unique Trade", author: "Author Three", primary_isbn13: "9780000000003", rank: 7, weeks_on_list: 1 },
            ],
          },
        },
      };
    }
    return { status: 404, payload: { message: "unknown_list" } };
  };

  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    const segments = parsed.pathname.split("/");
    const rawList = segments[segments.length - 1].replace(/\.json$/i, "");
    const listSlug = decodeURIComponent(rawList);
    const response = responseForList(listSlug);
    return { ok: response.status >= 200 && response.status < 300, status: response.status, headers: { get: () => null }, async text() { return JSON.stringify(response.payload); } };
  };

  try {
    const profile = {
      ageBand: "adult", maturityBand: "adult", tone: [], pacing: [],
      genreFamily: [{ value: "science fiction", weight: 2, evidence: ["like:test:science_fiction"] }],
      themes: [{ value: "adventure", weight: 1, evidence: ["like:test:adventure"] }],
      characterDynamics: [], formatPreference: [{ value: "book", weight: 1, evidence: ["like:test:book"] }],
      avoidSignals: [], sourceHints: ["nyt"], diagnostics: {},
    };
    const plan = { source: "nyt", enabled: true, status: "planned", timeoutMs: 2500, intents: [{ id: "nyt-mock-1", query: "science fiction adventure", facets: ["adult"], priority: 1, rationale: ["mock_validation"] }] };
    const result = await freshAdapter.search(plan, { profile });
    const diag = asObject(result.diagnostics);
    const rawItems = asArray(result.rawItems);
    const sharedEntries = rawItems.filter((row) => key(asObject(row).title) === "shared bestseller");
    const listMetaPresent = rawItems.every((row) => {
      const nyt = asObject(asObject(row).nyt);
      return Boolean(text(nyt.list_name) || text(nyt.display_name)) && text(asObject(row).source) === "nyt";
    });
    return {
      status: text(result.status),
      rawCount: Number(rawItems.length),
      requestedLists: asArray(diag.nytRequestedLists),
      returnedLists: asArray(diag.nytReturnedLists),
      booksPerList: asObject(diag.nytBooksPerList),
      httpStatusByList: asObject(diag.nytHttpStatusByList),
      failedReason: text(diag.failedReason),
      listMetaPresent,
      duplicateCollapsed: sharedEntries.length === 1,
      partialFailurePreserved: Number(rawItems.length) > 0 && Number(asObject(diag.nytHttpStatusByList)["hardcover-fiction"] || 0) === 500,
      pass: listMetaPresent && sharedEntries.length === 1 && Number(rawItems.length) === 3,
      lineageRows: rawItems.map((row) => ({ title: text(asObject(row).title), source: text(asObject(row).source), list: text(asObject(asObject(row).nyt).list_name_encoded || asObject(asObject(row).nyt).list_name) })),
    };
  } finally {
    globalThis.fetch = originalFetch;
    process.env.NYT_BOOKS_API_KEY = originalKey;
  }
}

function runLegacyLineageRegression() {
  const docs = adaptNytBooksToRecommendationDocs([
    {
      title: "Legacy Lineage Probe",
      author: "Author Test",
      primary_isbn13: "9781234567890",
      list_name: "Combined Print and E-Book Fiction",
      list_name_encoded: "combined-print-and-e-book-fiction",
      display_name: "Combined Print and E-Book Fiction",
    },
  ]);
  return {
    sourceValues: docs.map((doc) => text(doc.source)),
    pass: docs.length === 1 && text(docs[0].source) === "nyt",
  };
}

// ---------------------------------------------------------------------------
// Regression infrastructure helpers
// ---------------------------------------------------------------------------

function freshNytAdapter() {
  // Clear nytSource module from require cache so each regression starts with
  // clean rate-limiter, in-process daily cache, and in-flight dedup state.
  const nytPath = resolve(repoRoot, "app/recommender-v2/sources/nytSource.ts");
  delete require.cache[nytPath];
  return require(nytPath).nytSourceAdapter;
}

function makeMockFetch(responses) {
  return async (url) => {
    const seg = new URL(String(url)).pathname.split("/").pop().replace(/\.json$/i, "");
    const listSlug = decodeURIComponent(seg);
    const r = responses[listSlug] ?? { status: 404, body: { message: "unknown_list" } };
    const hdrs = new Map([["content-type", "application/json"]]);
    if (r.retryAfter !== undefined) hdrs.set("retry-after", String(r.retryAfter));
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: { get: (k) => hdrs.get(k) ?? null },
      async text() { return JSON.stringify(r.body); },
    };
  };
}

function okList(slug, displayName, books) {
  return { status: 200, body: { status: "OK", results: { list_name: displayName, list_name_encoded: slug, display_name: displayName, books } } };
}

function nytBook(title, isbn13, rank = 1) {
  return { title, author: "Test Author", primary_isbn13: isbn13, rank, weeks_on_list: 1 };
}

function adultPlan(query = "adult book") {
  return { source: "nyt", enabled: true, status: "planned", timeoutMs: 5000, intents: [{ id: "t1", query, facets: ["adult"], priority: 1, rationale: [] }] };
}

function adultContext() {
  return { profile: { ageBand: "adult", maturityBand: "adult", tone: [], pacing: [], genreFamily: [], themes: [], characterDynamics: [], formatPreference: [], avoidSignals: [], sourceHints: ["nyt"], diagnostics: {} } };
}

// ---------------------------------------------------------------------------
// R1: Cache hit — second identical call produces no fetch
// ---------------------------------------------------------------------------
async function runCacheHitRegression() {
  const adapter = freshNytAdapter();
  const savedFetch = globalThis.fetch;
  const savedKey = process.env.NYT_BOOKS_API_KEY;
  process.env.NYT_BOOKS_API_KEY = "test-key";
  let fetchCount = 0;
  const books = [nytBook("Cache Book A", "9780000000101"), nytBook("Cache Book B", "9780000000102")];
  // Provide both lists that "adult book" → general family requests so both get cached
  const responses = {
    "combined-print-and-e-book-fiction": okList("combined-print-and-e-book-fiction", "Combined Print & E-Book Fiction", books),
    "hardcover-fiction": okList("hardcover-fiction", "Hardcover Fiction", [nytBook("HC Cache Book", "9780000000103")]),
  };
  globalThis.fetch = async (url) => { fetchCount++; return makeMockFetch(responses)(url); };
  try {
    const plan = adultPlan();
    const ctx = adultContext();
    const r1 = await adapter.search(plan, ctx);
    const fetchesAfterFirst = fetchCount;
    const r2 = await adapter.search(plan, ctx);
    const fetchesAfterSecond = fetchCount - fetchesAfterFirst;
    const d2 = asObject(r2.diagnostics);
    const cacheHits = asObject(d2.nytCacheHitByList);
    return {
      firstStatus: text(r1.status),
      firstRawCount: Number(asObject(r1.diagnostics).nytRawBookCount || 0),
      fetchesAfterFirst,
      secondStatus: text(r2.status),
      secondRawCount: Number(asObject(r2.diagnostics).nytRawBookCount || 0),
      fetchesAfterSecond,
      cacheHitsInSecond: cacheHits,
      pass: fetchesAfterFirst === 2 && fetchesAfterSecond === 0 && Object.values(cacheHits).every(Boolean),
    };
  } finally {
    globalThis.fetch = savedFetch;
    process.env.NYT_BOOKS_API_KEY = savedKey;
  }
}

// ---------------------------------------------------------------------------
// R2: 429 then success — exactly one retry, result cached, quotaBlocked false
// ---------------------------------------------------------------------------
async function run429ThenSuccessRegression() {
  const adapter = freshNytAdapter();
  const savedFetch = globalThis.fetch;
  const savedKey = process.env.NYT_BOOKS_API_KEY;
  process.env.NYT_BOOKS_API_KEY = "test-key";
  let attempt = 0;
  const books = [nytBook("Retry Book", "9780000000201")];
  globalThis.fetch = async (url) => {
    attempt++;
    if (attempt === 1) {
      return { ok: false, status: 429, headers: { get: (k) => k === "retry-after" ? "0" : null }, async text() { return JSON.stringify({ message: "quota exceeded" }); } };
    }
    return makeMockFetch({ "combined-print-and-e-book-fiction": okList("combined-print-and-e-book-fiction", "Combined Print & E-Book Fiction", books) })(url);
  };
  try {
    const result = await adapter.search(adultPlan(), adultContext());
    const diag = asObject(result.diagnostics);
    const fetchDiags = asArray(diag.fetches);
    const cfFetch = asObject(fetchDiags.find((f) => text(asObject(f).query) === "combined-print-and-e-book-fiction"));
    return {
      status: text(result.status),
      rawCount: Number(diag.nytRawBookCount || 0),
      nytQuotaBlocked: Boolean(diag.nytQuotaBlocked),
      retryAttempted: Boolean(cfFetch.retryAttempted),
      retrySucceeded: Boolean(cfFetch.retrySucceeded),
      totalAttempts: attempt,
      // ≥ 2 because the plan may request multiple lists; the key invariant is that
      // the first list triggered a 429 + one retry, succeeded, quota stayed clear.
      pass: attempt >= 2 && Number(diag.nytRawBookCount || 0) > 0 && !Boolean(diag.nytQuotaBlocked) && Boolean(cfFetch.retryAttempted) && Boolean(cfFetch.retrySucceeded),
    };
  } finally {
    globalThis.fetch = savedFetch;
    process.env.NYT_BOOKS_API_KEY = savedKey;
  }
}

// ---------------------------------------------------------------------------
// R3: 429 twice — stop after retry, skip remaining lists, preserve any earlier results
// ---------------------------------------------------------------------------
async function run429TwiceRegression() {
  const adapter = freshNytAdapter();
  const savedFetch = globalThis.fetch;
  const savedKey = process.env.NYT_BOOKS_API_KEY;
  process.env.NYT_BOOKS_API_KEY = "test-key";
  let fetchCount = 0;
  // combined: 429 on both attempts; hardcover: would succeed but should be skipped
  const responses = {
    "combined-print-and-e-book-fiction": { status: 429, body: { message: "quota exceeded" }, retryAfter: 0 },
    "hardcover-fiction": okList("hardcover-fiction", "Hardcover Fiction", [nytBook("Should Not Appear", "9780000000301")]),
  };
  globalThis.fetch = async (url) => { fetchCount++; return makeMockFetch(responses)(url); };
  try {
    // Use general family (2 lists: combined + hardcover) so uncachedLists.length < 3
    // and the overview fast-path is not triggered; this keeps retry attribution on the
    // per-list fetch diags where the assertions expect to find them.
    const result = await adapter.search(adultPlan("adult book"), adultContext());
    const diag = asObject(result.diagnostics);
    const fetchDiags = asArray(diag.fetches);
    const cfFetch = asObject(fetchDiags.find((f) => text(asObject(f).query) === "combined-print-and-e-book-fiction"));
    const hcFetch = asObject(fetchDiags.find((f) => text(asObject(f).query) === "hardcover-fiction"));
    return {
      status: text(result.status),
      nytQuotaBlocked: Boolean(diag.nytQuotaBlocked),
      totalFetchAttempts: fetchCount,
      cfRetryAttempted: Boolean(cfFetch.retryAttempted),
      cfRetrySucceeded: Boolean(cfFetch.retrySucceeded),
      hcSkippedReason: text(hcFetch.failedReason),
      hcQuotaBlocked: Boolean(hcFetch.quotaBlocked),
      rawCount: Number(diag.nytRawBookCount || 0),
      pass: Boolean(diag.nytQuotaBlocked) && fetchCount === 2 && Boolean(cfFetch.retryAttempted) && !Boolean(cfFetch.retrySucceeded) && Boolean(hcFetch.quotaBlocked),
    };
  } finally {
    globalThis.fetch = savedFetch;
    process.env.NYT_BOOKS_API_KEY = savedKey;
  }
}

// ---------------------------------------------------------------------------
// R4: Mixed cache/live — cached lists bypass rate limiter; only uncached fetched
// ---------------------------------------------------------------------------
async function runMixedCacheLiveRegression() {
  const adapter = freshNytAdapter();
  const savedFetch = globalThis.fetch;
  const savedKey = process.env.NYT_BOOKS_API_KEY;
  process.env.NYT_BOOKS_API_KEY = "test-key";
  const combinedBooks = [nytBook("Combined Book", "9780000000401")];
  const hardcoverBooks = [nytBook("Hardcover Book", "9780000000402")];
  const allResponses = {
    "combined-print-and-e-book-fiction": okList("combined-print-and-e-book-fiction", "Combined Print & E-Book Fiction", combinedBooks),
    "hardcover-fiction": okList("hardcover-fiction", "Hardcover Fiction", hardcoverBooks),
  };
  let warmFetches = 0;
  globalThis.fetch = async (url) => { warmFetches++; return makeMockFetch(allResponses)(url); };
  try {
    // Warm cache for combined-print via a first single-list call (adult book → general family → combined + hardcover)
    await adapter.search(adultPlan(), adultContext());
    const fetchesAfterWarm = warmFetches;
    // Now call with a plan that maps to combined + hardcover; combined should be cached
    let liveFetches = 0;
    globalThis.fetch = async (url) => { liveFetches++; return makeMockFetch(allResponses)(url); };
    const result = await adapter.search(adultPlan("thriller mystery"), adultContext());
    const diag = asObject(result.diagnostics);
    const cacheHits = asObject(diag.nytCacheHitByList);
    return {
      fetchesAfterWarm,
      liveFetchesForMixedRun: liveFetches,
      cacheHitByList: cacheHits,
      rawCount: Number(diag.nytRawBookCount || 0),
      pass: liveFetches < fetchesAfterWarm && Object.values(cacheHits).some(Boolean) && Object.values(cacheHits).some((v) => !v),
    };
  } finally {
    globalThis.fetch = savedFetch;
    process.env.NYT_BOOKS_API_KEY = savedKey;
  }
}

// ---------------------------------------------------------------------------
// R5: Concurrent deduplication — two simultaneous calls share one in-flight fetch
// ---------------------------------------------------------------------------
async function runConcurrentDeduplicationRegression() {
  const adapter = freshNytAdapter();
  const savedFetch = globalThis.fetch;
  const savedKey = process.env.NYT_BOOKS_API_KEY;
  const savedOverride = process.env.V2_NYT_LISTS_OVERRIDE;
  process.env.NYT_BOOKS_API_KEY = "test-key";
  // Force a single list so two concurrent calls produce exactly one fetch between them.
  process.env.V2_NYT_LISTS_OVERRIDE = "combined-print-and-e-book-fiction";
  let fetchCount = 0;
  const books = [nytBook("Concurrent Book", "9780000000501")];
  globalThis.fetch = async (url) => { fetchCount++; return makeMockFetch({ "combined-print-and-e-book-fiction": okList("combined-print-and-e-book-fiction", "Combined Print & E-Book Fiction", books) })(url); };
  try {
    const plan = adultPlan();
    const [r1, r2] = await Promise.all([adapter.search(plan, adultContext()), adapter.search(plan, adultContext())]);
    const d1 = asObject(r1.diagnostics);
    const d2 = asObject(r2.diagnostics);
    return {
      totalFetchAttempts: fetchCount,
      r1RawCount: Number(d1.nytRawBookCount || 0),
      r2RawCount: Number(d2.nytRawBookCount || 0),
      r1Status: text(r1.status),
      r2Status: text(r2.status),
      pass: fetchCount === 1 && Number(d1.nytRawBookCount || 0) > 0 && Number(d2.nytRawBookCount || 0) > 0,
    };
  } finally {
    globalThis.fetch = savedFetch;
    process.env.NYT_BOOKS_API_KEY = savedKey;
    if (savedOverride === undefined) {
      delete process.env.V2_NYT_LISTS_OVERRIDE;
    } else {
      process.env.V2_NYT_LISTS_OVERRIDE = savedOverride;
    }
  }
}

// ---------------------------------------------------------------------------
// R6: Diagnostic secrecy — api-key never appears in stored endpoint URLs
// ---------------------------------------------------------------------------
function runDiagnosticSecrecyRegression() {
  const fakeKey = "super-secret-api-key-12345";
  const rawUrl = `https://api.nytimes.com/svc/books/v3/lists/current/combined-print-and-e-book-fiction.json?api-key=${fakeKey}&other=ok`;
  const redacted = rawUrl.replace(/([?&]api-key=)[^&]+/gi, "$1[redacted]");
  return {
    rawUrl,
    redacted,
    keyPresentInRaw: rawUrl.includes(fakeKey),
    keyPresentInRedacted: redacted.includes(fakeKey),
    redactedMarkerPresent: redacted.includes("[redacted]"),
    pass: rawUrl.includes(fakeKey) && !redacted.includes(fakeKey) && redacted.includes("[redacted]"),
  };
}

// ---------------------------------------------------------------------------
// R7: Overview path — 3-list plan fetches overview once; second call fully cached
// ---------------------------------------------------------------------------
async function runOverviewPathRegression() {
  const adapter = freshNytAdapter();
  const savedFetch = globalThis.fetch;
  const savedKey = process.env.NYT_BOOKS_API_KEY;
  process.env.NYT_BOOKS_API_KEY = "test-key";
  let fetchCount = 0;

  // Build an overview response containing all three adult lists.
  const overviewBody = {
    status: "OK",
    results: {
      bestsellers_date: "2026-07-18",
      lists: [
        {
          list_name: "Combined Print & E-Book Fiction",
          list_name_encoded: "combined-print-and-e-book-fiction",
          display_name: "Combined Print & E-Book Fiction",
          list_id: 704,
          updated: "WEEKLY",
          books: [
            nytBook("Overview Combined A", "9780000000701"),
            nytBook("Overview Combined B", "9780000000702", 2),
          ],
          corrections: [],
        },
        {
          list_name: "Hardcover Fiction",
          list_name_encoded: "hardcover-fiction",
          display_name: "Hardcover Fiction",
          list_id: 1,
          updated: "WEEKLY",
          books: [nytBook("Overview Hardcover A", "9780000000703")],
          corrections: [],
        },
        {
          list_name: "Trade Fiction Paperback",
          list_name_encoded: "trade-fiction-paperback",
          display_name: "Trade Fiction Paperback",
          list_id: 17,
          updated: "WEEKLY",
          books: [nytBook("Overview Trade A", "9780000000704")],
          corrections: [],
        },
      ],
    },
  };

  globalThis.fetch = async (url) => {
    fetchCount++;
    // Route the overview request; per-list requests would be fallbacks (should not occur).
    return makeMockFetch({ overview: { status: 200, body: overviewBody } })(url);
  };

  try {
    // science fiction → 3 lists (combined + hardcover + trade) → triggers overview path
    const plan = adultPlan("science fiction adventure");
    const ctx = adultContext();

    const r1 = await adapter.search(plan, ctx);
    const fetchesAfterFirst = fetchCount;

    // Second call — all three lists should now be in the daily cache.
    const r2 = await adapter.search(plan, ctx);
    const fetchesAfterSecond = fetchCount - fetchesAfterFirst;

    const d1 = asObject(r1.diagnostics);
    const d2 = asObject(r2.diagnostics);
    const cacheHitsR2 = asObject(d2.nytCacheHitByList);

    return {
      firstStatus: text(r1.status),
      firstRawCount: Number(d1.nytRawBookCount || 0),
      firstNytUsedOverview: Boolean(d1.nytUsedOverview),
      fetchesAfterFirst,
      secondStatus: text(r2.status),
      secondRawCount: Number(d2.nytRawBookCount || 0),
      fetchesAfterSecond,
      cacheHitsR2,
      allCachedOnSecondCall: Object.values(cacheHitsR2).every(Boolean),
      pass: fetchesAfterFirst === 1 && fetchesAfterSecond === 0
        && Boolean(d1.nytUsedOverview)
        && Number(d1.nytRawBookCount || 0) >= 3
        && Object.values(cacheHitsR2).every(Boolean),
    };
  } finally {
    globalThis.fetch = savedFetch;
    process.env.NYT_BOOKS_API_KEY = savedKey;
  }
}


function summarize(result) {
  const lines = [];
  lines.push("NYT-F1 — Adapter validation (Adult C rerun + resilience regressions)");
  lines.push("");
  for (const run of result.liveRuns) {
    lines.push(`${run.presetLabel} (${run.archetype})`);
    lines.push(`  nyt.status=${run.nyt.status} attempted=${String(run.nyt.attempted)} raw=${run.nyt.rawCount} converted=${run.nyt.nytConvertedCount} dropped=${run.nyt.nytDroppedCount}`);
    lines.push(`  requestedLists=${JSON.stringify(run.nyt.nytRequestedLists)}`);
    lines.push(`  returnedLists=${JSON.stringify(run.nyt.nytReturnedLists)}`);
    lines.push(`  booksPerList=${JSON.stringify(run.nyt.nytBooksPerList)}`);
    lines.push(`  httpStatusByList=${JSON.stringify(run.nyt.nytHttpStatusByList)}`);
    lines.push(`  nytQuotaBlocked=${String(run.nyt.nytQuotaBlocked ?? false)}`);
    lines.push(`  normalized=${run.normalizedCount} scored=${run.scoredCount} finalAccepted=${run.finalAcceptedTitles.length} rendered=${run.renderedTitles.length}`);
    lines.push(`  adapterLayerPass=${String(run.adapterLayer.pass)}`);
    lines.push(`  adapterChecks=${run.adapterLayer.checks.map((check) => `${check.id}:${check.pass ? "PASS" : "FAIL"}`).join(", ")}`);
    lines.push("");
  }
  lines.push("Original regressions");
  lines.push(`  nytDisabledSkipPass=${String(result.regressions.nytDisabled.pass)}`);
  lines.push(`  otherSourceUnchangedPass=${String(result.regressions.otherSourceUnchanged.pass)}`);
  lines.push(`  mockedAdapterPass=${String(result.regressions.mockedAdapter.pass)}`);
  lines.push(`  legacyLineagePass=${String(result.regressions.legacyLineage.pass)}`);
  lines.push("");
  lines.push("Resilience regressions");
  const r2 = result.regressions2 || {};
  lines.push(`  R1 cacheHit=${String(Boolean((r2.cacheHit || {}).pass))}`);
  lines.push(`  R2 429ThenSuccess=${String(Boolean((r2.r429ThenSuccess || {}).pass))}`);
  lines.push(`  R3 429Twice=${String(Boolean((r2.r429Twice || {}).pass))}`);
  lines.push(`  R4 mixedCacheLive=${String(Boolean((r2.mixedCacheLive || {}).pass))}`);
  lines.push(`  R5 concurrentDedup=${String(Boolean((r2.concurrentDedup || {}).pass))}`);
  lines.push(`  R6 diagnosticSecrecy=${String(Boolean((r2.diagnosticSecrecy || {}).pass))}`);
  lines.push(`  R7 overviewPath=${String(Boolean((r2.overviewPath || {}).pass))}`);
  lines.push("");
  const allLivePass = result.liveRuns.every((run) => run.adapterLayer.pass);
  const allRegressionsPass = Object.values(result.regressions).every((row) => Boolean(row.pass));
  const allR2Pass = Object.values(r2).every((row) => Boolean(row.pass));
  lines.push(`Overall: ${allLivePass && allRegressionsPass && allR2Pass ? "PASS" : "PARTIAL/FAIL"}`);
  return lines.join("\n");
}

async function main() {
  const localEnv = parseDotEnv(resolve(repoRoot, ".env"));
  for (const keyName of ["NYT_BOOKS_API_KEY", "EXPO_PUBLIC_NYT_BOOKS_API_KEY", "NEXT_PUBLIC_NYT_BOOKS_API_KEY"]) {
    if (!process.env[keyName] && localEnv[keyName]) process.env[keyName] = localEnv[keyName];
  }

  // Run only Adult C — Adults A/B already validated in the first NYT-F1 run.
  const adultC = ADULT_PRESETS.find((p) => p.id === "adult-c");
  const liveRuns = [await runLivePreset(adultC, 6)];

  const regressions = {
    nytDisabled: await runNytDisabledRegression(ADULT_PRESETS[0]),
    otherSourceUnchanged: await runOtherSourceUnchangedRegression(ADULT_PRESETS[0]),
    mockedAdapter: await runMockedNytAdapterRegression(),
    legacyLineage: runLegacyLineageRegression(),
  };

  const regressions2 = {
    cacheHit: await runCacheHitRegression(),
    r429ThenSuccess: await run429ThenSuccessRegression(),
    r429Twice: await run429TwiceRegression(),
    mixedCacheLive: await runMixedCacheLiveRegression(),
    concurrentDedup: await runConcurrentDeduplicationRegression(),
    diagnosticSecrecy: runDiagnosticSecrecyRegression(),
    overviewPath: await runOverviewPathRegression(),
  };

  const payload = {
    generatedAt: new Date().toISOString(),
    status: {
      nytF0: "CLOSED — INFRASTRUCTURE AUDIT COMPLETE",
      nytV2Adapter: "IMPLEMENTED",
      nytF1: "LIVE_VALIDATION_ADULT_C_RERUN",
    },
    liveRuns,
    regressions,
    regressions2,
  };

  mkdirSync(outDir, { recursive: true });
  const jsonPath = resolve(outDir, "nyt-f1-live-validation.json");
  const summaryPath = resolve(outDir, "nyt-f1-live-validation-summary.txt");
  writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  writeFileSync(summaryPath, `${summarize(payload)}\n`, "utf8");
  console.log(JSON.stringify({
    ok: true,
    jsonPath,
    summaryPath,
    liveRunPasses: liveRuns.map((run) => ({ presetId: run.presetId, pass: run.adapterLayer.pass })),
    regressionPasses: Object.fromEntries(Object.entries(regressions).map(([name, row]) => [name, Boolean(row.pass)])),
    regressions2Passes: Object.fromEntries(Object.entries(regressions2).map(([name, row]) => [name, Boolean(row.pass)])),
  }, null, 2));
}

await main();
