/**
 * Contract regressions for Kitsu + ComicVine V2 integration.
 *
 * Coverage:
 * 1) Source-only execution (Kitsu-only, ComicVine-only)
 * 2) Mixed-source execution with GB/OL/NYT + Kitsu + ComicVine
 * 3) End-to-end lineage presence on rendered candidates
 * 4) Failure isolation when one source fails
 * 5) No hidden privilege: adult metadata-only evidence path remains active
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

process.env.EXPO_PUBLIC_COMICVINE_PROXY_URL = "undefined";
process.env.COMICVINE_PROXY_URL = "https://proxy.localhost/api/comicvine";
process.env.EXPO_PUBLIC_KITSU_API_BASE_URL = "https://kitsu.app/api/edge";
process.env.NYT_BOOKS_API_KEY = process.env.NYT_BOOKS_API_KEY || "test-key";

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

function assertIncludes(actual, expectedSubstring, message) {
  if (!String(actual || "").includes(expectedSubstring)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expectedSubstring)}`);
  }
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function stageCount(diagnostics, stage, key) {
  const row = asArray(diagnostics?.stages).find((entry) => String(asObject(entry).stage) === stage);
  return Number(asObject(row).counts?.[key] || 0);
}

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../app/recommender-v2");
const { sourceAdapters } = require(resolve(dir, "sources/index.ts"));
const { runRecommenderV2 } = require(resolve(dir, "engine.ts"));

const sessionSignals = [
  { action: "like", title: "Gone Girl", genres: ["psychological thriller", "mystery"], themes: ["crime", "suspense"], format: "book" },
  { action: "like", title: "The Girl with the Dragon Tattoo", genres: ["crime", "thriller"], themes: ["investigation"], format: "book" },
  { action: "like", title: "The Silent Patient", genres: ["mystery", "thriller"], themes: ["psychological"], format: "book" },
];

const originalFetch = globalThis.fetch;
let simulateComicVineFailure = false;

globalThis.fetch = async (input) => {
  const url = String(input || "");

  if (url.includes("/manga?")) {
    return new Response(JSON.stringify({
      data: [
        {
          id: "k1",
          attributes: {
            canonicalTitle: "Monster",
            synopsis: "A psychological thriller mystery about a surgeon and a fugitive serial killer.",
            subtype: "manga",
            slug: "monster",
            startDate: "1994-12-01",
            ageRating: "R",
            ageRatingGuide: "Violence and disturbing themes",
          },
        },
        {
          id: "k2",
          attributes: {
            canonicalTitle: "Naoki Urasawa's 20th Century Boys",
            synopsis: "Friends reconnect around an apocalyptic conspiracy and missing-person mystery.",
            subtype: "manga",
            slug: "20th-century-boys",
            startDate: "1999-09-27",
            ageRating: "R",
            ageRatingGuide: "Suspense and violence",
          },
        },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }

  if (url.includes("proxy.localhost/api/comicvine")) {
    if (simulateComicVineFailure) {
      return new Response(JSON.stringify({ error: "comicvine_proxy_down" }), { status: 503, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      results: [
        {
          id: 101,
          name: "Batman: The Long Halloween",
          deck: "A noir mystery story set in Gotham with a holiday killer.",
          cover_date: "1997-10-01",
          site_detail_url: "https://comicvine.gamespot.com/batman-the-long-halloween/4000-101/",
          volume: { name: "Batman: The Long Halloween", id: 99 },
          issue_number: "1",
          person_credits: [{ name: "Jeph Loeb" }, { name: "Tim Sale" }],
        },
        {
          id: 102,
          name: "The Fade Out",
          deck: "A Hollywood-era crime and conspiracy mystery.",
          cover_date: "2014-08-01",
          site_detail_url: "https://comicvine.gamespot.com/the-fade-out/4000-102/",
          volume: { name: "The Fade Out", id: 100 },
          issue_number: "1",
          person_credits: [{ name: "Ed Brubaker" }, { name: "Sean Phillips" }],
        },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }

  if (url.includes("googleapis.com/books/v1/volumes")) {
    return new Response(JSON.stringify({
      items: [
        {
          id: "gb-1",
          volumeInfo: {
            title: "The Silent Patient",
            authors: ["Alex Michaelides"],
            description: "A psychological thriller novel about obsession, silence, and murder.",
            categories: ["Fiction", "Psychological fiction", "Thrillers"],
            publishedDate: "2019-02-05",
            language: "en",
            industryIdentifiers: [{ type: "ISBN_13", identifier: "9781250301697" }],
            maturityRating: "NOT_MATURE",
          },
        },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }

  if (url.includes("openlibrary.org/search.json") || url.includes("/api/openlibrary")) {
    return new Response(JSON.stringify({
      docs: [
        {
          key: "/works/OL12345W",
          title: "The Cuckoo's Calling",
          author_name: ["Robert Galbraith"],
          first_publish_year: 2013,
          subject: ["mystery fiction", "private investigators", "crime"],
          cover_i: 12345,
        },
      ],
      numFound: 1,
    }), { status: 200, headers: { "content-type": "application/json" } });
  }

  if (url.includes("api.nytimes.com/svc/books/v3/lists/overview.json")) {
    return new Response(JSON.stringify({
      status: "OK",
      results: {
        lists: [
          {
            list_name: "Combined Print and E-Book Fiction",
            list_name_encoded: "combined-print-and-e-book-fiction",
            books: [
              {
                title: "The Women",
                author: "Kristin Hannah",
                description: "A historical fiction novel about a combat nurse in Vietnam.",
                publisher: "St. Martin's Press",
                primary_isbn13: "9781250178633",
              },
            ],
          },
        ],
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }

  if (url.includes("api.nytimes.com/svc/books/v3/lists/") && url.includes(".json")) {
    return new Response(JSON.stringify({
      status: "OK",
      results: {
        list_name: "Combined Print and E-Book Fiction",
        list_name_encoded: "combined-print-and-e-book-fiction",
        books: [
          {
            title: "The Women",
            author: "Kristin Hannah",
            description: "A historical fiction novel about a combat nurse in Vietnam.",
            publisher: "St. Martin's Press",
            primary_isbn13: "9781250178633",
            rank: 1,
          },
        ],
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }

  return new Response(JSON.stringify({ error: "unexpected_url", url }), { status: 404, headers: { "content-type": "application/json" } });
};

async function runSession(requestId, enabledSources) {
  return runRecommenderV2({
    requestId,
    ageBand: "adult",
    limit: 6,
    enabledSources,
    signals: sessionSignals,
  });
}

function sourceDiag(result, source) {
  return asObject(asArray(asObject(result).diagnostics?.sources).find((row) => asObject(row).source === source));
}

try {
  assertTruthy(sourceAdapters.kitsu, "T1 kitsu adapter must be wired");
  assertTruthy(sourceAdapters.comicVine, "T2 comicVine adapter must be wired");
  console.log("PASS T1-T2: source adapters are wired");

  const kitsuOnly = await runSession("kitsu-only", {
    kitsu: true,
    comicVine: false,
    googleBooks: false,
    openLibrary: false,
    nyt: false,
    localLibrary: false,
    mock: false,
  });
  const kitsuDiag = sourceDiag(kitsuOnly, "kitsu");
  assertEqual(String(kitsuDiag.status || ""), "succeeded", "T3 kitsu-only source status");
  assertGte(Number(kitsuDiag.rawCount || 0), 1, "T3 kitsu-only rawCount");
  assertGte(stageCount(kitsuOnly.diagnostics, "normalized", "normalized"), 1, "T3 kitsu-only normalized count");
  assertGte(stageCount(kitsuOnly.diagnostics, "scored", "scored"), 1, "T3 kitsu-only scored count");
  assertGte(kitsuOnly.items.length, 1, "T3 kitsu-only selected items");
  assertTruthy(kitsuOnly.items.every((item) => item.source === "kitsu"), "T3 kitsu-only selected source ownership");
  assertTruthy(kitsuOnly.items.some((item) => item.diagnostics?.adultKitsuMetadataOnlyEvidence === true), "T3 kitsu metadata-only evidence flag");
  console.log("PASS T3: source-only execution (kitsu)");

  const comicVineOnly = await runSession("comicvine-only", {
    kitsu: false,
    comicVine: true,
    googleBooks: false,
    openLibrary: false,
    nyt: false,
    localLibrary: false,
    mock: false,
  });
  const comicDiag = sourceDiag(comicVineOnly, "comicVine");
  assertEqual(String(comicDiag.status || ""), "succeeded", "T4 comicvine-only source status");
  assertGte(Number(comicDiag.rawCount || 0), 1, "T4 comicvine-only rawCount");
  assertEqual(Array.isArray(comicDiag.fetches) ? comicDiag.fetches.length : 0, 2, "T4 comicvine-only should keep per-intent isolation with one diagnostic per intent");
  const firstComicFetch = asObject((comicDiag.fetches || [])[0]);
  assertEqual(String(firstComicFetch.configuredProxyUrl || ""), "undefined", "T4 configured proxy should capture raw misconfigured public env");
  assertEqual(String(firstComicFetch.normalizedProxyUrl || ""), "https://proxy.localhost/api/comicvine", "T4 normalized proxy should fall back to server proxy URL");
  assertIncludes(String(firstComicFetch.finalRequestUrl || ""), "q=", "T4 final request must include q param");
  assertIncludes(String(firstComicFetch.finalRequestUrl || ""), "limit=20", "T4 final request must include limit param");
  assertTruthy(["results_array", "data_array", "nested_data_results_array", "issues_array", "resources_array", "unknown"].includes(String(firstComicFetch.proxyResponseShape || "unknown")), "T4 response shape should be recorded");
  assertTruthy(String(firstComicFetch.responseContentType || "").length > 0, "T4 response content-type should be recorded");
  assertGte(stageCount(comicVineOnly.diagnostics, "normalized", "normalized"), 1, "T4 comicvine-only normalized count");
  assertGte(stageCount(comicVineOnly.diagnostics, "scored", "scored"), 1, "T4 comicvine-only scored count");
  assertGte(comicVineOnly.items.length, 1, "T4 comicvine-only selected items");
  assertTruthy(comicVineOnly.items.every((item) => item.source === "comicVine"), "T4 comicvine-only selected source ownership");
  assertTruthy(comicVineOnly.items.some((item) => item.diagnostics?.adultComicVineMetadataOnlyEvidence === true), "T4 comicvine metadata-only evidence flag");
  console.log("PASS T4: source-only execution (comicvine)");

  const mixed = await runSession("mixed-all", {
    kitsu: true,
    comicVine: true,
    googleBooks: true,
    openLibrary: true,
    nyt: true,
    localLibrary: false,
    mock: false,
  });
  const mixedKitsu = sourceDiag(mixed, "kitsu");
  const mixedComic = sourceDiag(mixed, "comicVine");
  const mixedGb = sourceDiag(mixed, "googleBooks");
  const mixedOl = sourceDiag(mixed, "openLibrary");
  const mixedNyt = sourceDiag(mixed, "nyt");
  assertTruthy(["succeeded", "empty"].includes(String(mixedKitsu.status || "")), "T5 mixed kitsu attempted");
  assertTruthy(["succeeded", "empty"].includes(String(mixedComic.status || "")), "T5 mixed comicvine attempted");
  assertTruthy(["succeeded", "empty"].includes(String(mixedGb.status || "")), "T5 mixed googlebooks attempted");
  assertTruthy(["succeeded", "empty"].includes(String(mixedOl.status || "")), "T5 mixed openlibrary attempted");
  assertTruthy(["succeeded", "empty"].includes(String(mixedNyt.status || "")), "T5 mixed nyt attempted");
  assertGte(stageCount(mixed.diagnostics, "normalized", "normalized"), 1, "T5 mixed normalized count");
  assertGte(stageCount(mixed.diagnostics, "scored", "scored"), 1, "T5 mixed scored count");
  assertGte(mixed.items.length, 1, "T5 mixed selected items");
  assertTruthy(asArray(mixed.diagnostics.finalSelectionTitles).length >= mixed.items.length, "T5 mixed final selection diagnostics present");
  console.log("PASS T5: mixed-source execution");

  const lineageSample = mixed.items[0];
  assertTruthy(lineageSample, "T6 lineage sample exists");
  assertTruthy(String(lineageSample.source || "").trim(), "T6 lineage source present");
  assertTruthy(String(lineageSample.sourceId || "").trim(), "T6 lineage sourceId present");
  assertTruthy(String(asObject(lineageSample.diagnostics).queryText || "").trim(), "T6 lineage queryText present");
  assertTruthy(String(asObject(lineageSample.diagnostics).queryFamily || "").trim(), "T6 lineage queryFamily present");
  assertTruthy(String(lineageSample.title || "").trim(), "T6 lineage title present");
  console.log("PASS T6: lineage intent->adapter->normalize->score->select->render is present");

  simulateComicVineFailure = true;
  const failureIsolation = await runSession("mixed-comicvine-fails", {
    kitsu: true,
    comicVine: true,
    googleBooks: true,
    openLibrary: true,
    nyt: true,
    localLibrary: false,
    mock: false,
  });
  const failureComic = sourceDiag(failureIsolation, "comicVine");
  const failureGb = sourceDiag(failureIsolation, "googleBooks");
  const failureOl = sourceDiag(failureIsolation, "openLibrary");
  const failureNyt = sourceDiag(failureIsolation, "nyt");
  const failureKitsu = sourceDiag(failureIsolation, "kitsu");
  assertTruthy(["failed", "timed_out", "empty"].includes(String(failureComic.status || "")), "T7 comicvine should fail in isolation test");
  assertTruthy(["succeeded", "empty"].includes(String(failureGb.status || "")), "T7 googlebooks remains stable");
  assertTruthy(["succeeded", "empty"].includes(String(failureOl.status || "")), "T7 openlibrary remains stable");
  assertTruthy(["succeeded", "empty"].includes(String(failureNyt.status || "")), "T7 nyt remains stable");
  assertTruthy(["succeeded", "empty"].includes(String(failureKitsu.status || "")), "T7 kitsu remains stable");
  assertGte(failureIsolation.items.length, 1, "T7 mixed slate still returns recommendations");
  console.log("PASS T7: failure isolation");

  const noPrivilegeKitsu = kitsuOnly.items.some((item) => item.diagnostics?.adultKitsuExcludedRetrievalEvidence?.length > 0);
  const noPrivilegeComic = comicVineOnly.items.some((item) => item.diagnostics?.adultComicVineExcludedRetrievalEvidence?.length > 0);
  assertTruthy(noPrivilegeKitsu, "T8 kitsu excluded retrieval evidence is recorded");
  assertTruthy(noPrivilegeComic, "T8 comicvine excluded retrieval evidence is recorded");
  console.log("PASS T8: no hidden semantic privilege");

  console.log("\nAll Kitsu/ComicVine V2 contract regressions passed.");
} finally {
  globalThis.fetch = originalFetch;
}
