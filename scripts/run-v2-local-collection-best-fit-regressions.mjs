/**
 * run-v2-local-collection-best-fit-regressions.mjs
 *
 * Proves the Local Collection "best-available-fit" selection philosophy:
 *   S1-S3: structural checks (select.ts bucket, source suppression, types)
 *   B1: sparse-metadata collection returns candidates (not zero)
 *   B2: two profiles produce different ranked results from genre-labelled collection
 *   B3: explicit adult content still blocked in teen profile
 *   B4: localLibraryCurationTrusted suppresses maturityBand; single-age-band library works
 *   B5: external sources not affected by best-fit rescue
 *   B6: production-shaped missing artifact reports the pre-selection zero stage
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
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(output, filename);
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

// ---------------------------------------------------------------------------
// Stubs for external I/O
// ---------------------------------------------------------------------------

const Module = require("module");
const originalLoad = Module._load;
let stubbedRecords = [];

Module._load = function (request, parent, isMain) {
  if (request.endsWith("storage") || request.includes("localCollection/storage")) {
    return {
      loadLocalCollectionRecommendationArtifact: async () => ({
        schemaVersion: "local_collection_recommendation_v1",
        createdAt: new Date().toISOString(),
        metadata: { schemaVersion: "local_collection_import_v1", importTimestamp: new Date().toISOString(), sourceFilename: "fixture.csv" },
        deterministicContentHash: "fixture",
        summary: { totalRows: stubbedRecords.length, acceptedTitles: stubbedRecords.length },
        records: stubbedRecords,
      }),
    };
  }
  if (request.endsWith("runtimeConfig") || request.includes("runtimeConfig")) {
    return { getRuntimeLibraryId: () => "yvhs-library" };
  }
  return originalLoad.apply(this, arguments);
};

const { localLibrarySourceAdapter } = require(resolve(repoRoot, "app", "recommender-v2", "sources", "localLibrarySource.ts"));
const { scoreCandidates } = require(resolve(repoRoot, "app", "recommender-v2", "score.ts"));
const { selectRecommendations } = require(resolve(repoRoot, "app", "recommender-v2", "select.ts"));
const { normalizeSourceResults } = require(resolve(repoRoot, "app", "recommender-v2", "normalize.ts"));

Module._load = originalLoad;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function w(value, weight) { return { value, weight, evidence: [] }; }

function makeAdultHorrorProfile() {
  return {
    ageBand: "adult", maturityBand: "adult",
    genreFamily: [w("horror", 3), w("thriller", 2), w("dark fiction", 1.5)],
    tone: [w("dark", 2), w("atmospheric", 1.5)],
    themes: [w("supernatural", 1)],
    characterDynamics: [], formatPreference: [],
    avoidSignals: [w("romance", 2)],
    sourceHints: [], diagnostics: {},
  };
}

function makeAdultRomanceProfile() {
  return {
    ageBand: "adult", maturityBand: "adult",
    genreFamily: [w("romance", 3), w("contemporary fiction", 2)],
    tone: [w("warm", 2), w("heartwarming", 1.5)],
    themes: [w("love story", 1)],
    characterDynamics: [], formatPreference: [],
    avoidSignals: [w("horror", 2), w("dark fiction", 1.5)],
    sourceHints: [], diagnostics: {},
  };
}

function makeTeenProfile(trusted) {
  return {
    ageBand: "teens", maturityBand: "teens",
    genreFamily: [w("fantasy", 2.5), w("adventure", 2), w("science fiction", 1.5)],
    tone: [w("exciting", 1.5)],
    themes: [w("magic", 1), w("quest", 1)],
    characterDynamics: [], formatPreference: [],
    avoidSignals: [],
    sourceHints: [], diagnostics: {},
    localLibraryCurationTrusted: Boolean(trusted),
  };
}

function makeLocalCandidate(localId, title, genres, themes, opts) {
  const authorName = (opts && opts.author) || `Author ${localId}`;
  return {
    id: `localLibrary:${localId}`, sourceId: localId, title,
    subtitle: "", description: "",
    authors: [authorName],
    creators: [authorName],
    genres: genres || ["Adult Fiction", "Adult"],
    themes: themes || [],
    tones: [], characterDynamics: [], subjects: [],
    source: "localLibrary",
    sourceUrl: "local://test",
    sourceId: localId,
    coverUrl: undefined,
    publicationYear: (opts && opts.year) || 2018,
    maturityBand: opts && opts.maturityBand !== undefined ? opts.maturityBand : undefined,
    audienceBand: opts && opts.maturityBand !== undefined ? opts.maturityBand : undefined,
    format: "book", formats: ["book"], language: "en",
    raw: {},
    diagnostics: { queryText: "local collection" },
    pacing: [], tags: [],
  };
}

async function runAdapterForRecords(records, profile) {
  stubbedRecords = records;
  Module._load = function (req, parent, isMain) {
    if (req.endsWith("storage") || req.includes("localCollection/storage")) {
      return {
        loadLocalCollectionRecommendationArtifact: async () => ({
          schemaVersion: "local_collection_recommendation_v1",
          createdAt: new Date().toISOString(),
          metadata: { schemaVersion: "local_collection_import_v1", importTimestamp: new Date().toISOString(), sourceFilename: "fixture.csv" },
          deterministicContentHash: "fixture",
          summary: { totalRows: records.length, acceptedTitles: records.length },
          records,
        }),
      };
    }
    if (req.endsWith("runtimeConfig") || req.includes("runtimeConfig")) {
      return { getRuntimeLibraryId: () => "yvhs-library" };
    }
    return originalLoad.apply(this, arguments);
  };
  const plan = {
    source: "localLibrary", enabled: true, status: "planned", timeoutMs: 5000,
    intents: [{ id: "primary", query: "local collection", facets: [], priority: 1, rationale: ["test"] }],
  };
  const result = await localLibrarySourceAdapter.search(plan, { profile });
  Module._load = originalLoad;
  return result;
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message || "assertion failed");
}

function check(label, fn) {
  try {
    fn();
    console.log(`  ✅  ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ❌  ${label}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// S1 — Structural: select.ts localLibraryBestFit bucket and rescue
// ---------------------------------------------------------------------------
console.log("\nS1: select.ts structural checks");
{
  const src = readFileSync(resolve(repoRoot, "app", "recommender-v2", "select.ts"), "utf8");
  check("S1-a: localLibraryBestFit bucket declared", () => assert(src.includes("localLibraryBestFit"), "localLibraryBestFit bucket missing"));
  check("S1-b: accepted_local_library_best_fit rescue present", () => assert(src.includes("accepted_local_library_best_fit"), "rescue reason missing"));
  check("S1-c: localLibrary routes to best-fit bucket", () => assert(src.includes("source === \"localLibrary\"") && src.includes("localLibraryBestFit.push"), "routing missing"));
}

// ---------------------------------------------------------------------------
// S2 — Structural: localLibrarySource.ts suppresses maturityBand when trusted
// ---------------------------------------------------------------------------
console.log("\nS2: localLibrarySource.ts structural checks");
{
  const src = readFileSync(resolve(repoRoot, "app", "recommender-v2", "sources", "localLibrarySource.ts"), "utf8");
  check("S2-a: localLibraryCurationTrusted referenced in source", () => assert(src.includes("localLibraryCurationTrusted"), "curation trust check missing from source"));
  check("S2-b: maturityBand suppressed to undefined when trusted (via audienceBand conditional)", () => {
    // Normalize CRLF before checking — source may use Windows line endings
    const normalized = src.replace(/\r\n/g, "\n");
    assert(
      normalized.includes("localLibraryCurationTrusted\n        ? undefined") ||
      normalized.includes("localLibraryCurationTrusted ? undefined"),
      "conditional undefined suppression missing from source"
    );
  });
}

// ---------------------------------------------------------------------------
// S3 — Structural: types.ts carries new flags
// ---------------------------------------------------------------------------
console.log("\nS3: types.ts structural checks");
{
  const src = readFileSync(resolve(repoRoot, "app", "recommender-v2", "types.ts"), "utf8");
  check("S3-a: SwipeSessionV2 has localLibraryCurationTrusted", () => assert(src.includes("localLibraryCurationTrusted"), "field missing from types.ts"));
  check("S3-b: TasteProfile also has localLibraryCurationTrusted", () => {
    const idx = src.indexOf("interface TasteProfile");
    assert(idx >= 0, "TasteProfile not found");
    const slice = src.slice(idx, idx + 700);
    assert(slice.includes("localLibraryCurationTrusted"), "TasteProfile missing localLibraryCurationTrusted");
  });
}

// ---------------------------------------------------------------------------
// B1 — Sparse-metadata collection returns best-fit candidates (not zero)
// ---------------------------------------------------------------------------
console.log("\nB1: Sparse-metadata collection → best-fit candidates returned");
{
  const candidates = Array.from({ length: 15 }, (_, i) => makeLocalCandidate(`s${i}`, `Sparse Book ${i + 1}`, ["Adult Fiction", "Adult"], [], { year: 2005 + i }));
  const profile = makeAdultHorrorProfile();
  const scored = scoreCandidates(candidates, profile);
  const result = selectRecommendations(scored, profile, 10);
  const bestFit = Number(result.rejectedReasons.accepted_local_library_best_fit || 0);

  check("B1-a: at least 1 recommendation returned (not empty)", () => assert(result.selected.length >= 1, `Got ${result.selected.length}`));
  check("B1-b: accepted_local_library_best_fit rescue triggered", () => assert(bestFit >= 1, `bestFit=${bestFit}, selected=${result.selected.length}`));
  check("B1-c: fills up to limit of 10", () => assert(result.selected.length === 10, `Expected 10, got ${result.selected.length}`));
  check("B1-d: selection-stage diagnostics account for best-fit rescue", () => {
    assert(result.rejectedReasons.local_library_candidates_after_ranking === 15, JSON.stringify(result.rejectedReasons));
    assert(result.rejectedReasons.local_library_best_fit_entering_count === 15, JSON.stringify(result.rejectedReasons));
    assert(result.rejectedReasons.local_library_hard_eligible_count === 15, JSON.stringify(result.rejectedReasons));
    assert(result.rejectedReasons.local_library_selected_during_best_fit === 10, JSON.stringify(result.rejectedReasons));
    assert(result.rejectedReasons.local_library_selection_output_count === 10, JSON.stringify(result.rejectedReasons));
  });
}

// ---------------------------------------------------------------------------
// B2 — Genre-labelled collection: different profiles rank differently
// ---------------------------------------------------------------------------
console.log("\nB2: Different profiles → different ranked results from genre-labelled collection");
{
  const candidates = [
    makeLocalCandidate("h1", "Haunting Ground", ["Horror Fiction", "Adult"], ["supernatural horror"]),
    makeLocalCandidate("h2", "Dark Spirits", ["Horror Fiction", "Adult"], ["ghost stories"]),
    makeLocalCandidate("r1", "Love in Paris", ["Romance Fiction", "Adult"], ["love story"]),
    makeLocalCandidate("r2", "Heartfelt Bonds", ["Romance Fiction", "Adult"], ["relationships"]),
    makeLocalCandidate("g1", "Generic One", ["Adult Fiction", "Adult"]),
    makeLocalCandidate("g2", "Generic Two", ["Adult Fiction", "Adult"]),
    makeLocalCandidate("g3", "Generic Three", ["Adult Fiction", "Adult"]),
  ];

  const scoredH = scoreCandidates(candidates, makeAdultHorrorProfile());
  const scoredR = scoreCandidates(candidates, makeAdultRomanceProfile());
  const resultH = selectRecommendations(scoredH, makeAdultHorrorProfile(), 10);
  const resultR = selectRecommendations(scoredR, makeAdultRomanceProfile(), 10);

  const topH = new Set(resultH.selected.slice(0, 4).map((c) => c.title));
  const topR = new Set(resultR.selected.slice(0, 4).map((c) => c.title));

  check("B2-a: horror titles appear in horror profile top-4", () => {
    const count = ["Haunting Ground", "Dark Spirits"].filter((t) => topH.has(t)).length;
    assert(count >= 1, `Expected >= 1 horror title in top-4; got 0. Top-4: ${[...topH].join(", ")}`);
  });
  check("B2-b: romance titles appear in romance profile top-4", () => {
    const count = ["Love in Paris", "Heartfelt Bonds"].filter((t) => topR.has(t)).length;
    assert(count >= 1, `Expected >= 1 romance title in top-4; got 0. Top-4: ${[...topR].join(", ")}`);
  });
  check("B2-c: top-4 overlap <= 2 (profiles produce different rankings)", () => {
    const overlap = [...topH].filter((t) => topR.has(t)).length;
    assert(overlap <= 2, `Overlap too high: ${overlap}/4. Horror: ${[...topH].join(", ")}. Romance: ${[...topR].join(", ")}`);
  });
}

// ---------------------------------------------------------------------------
// B3 — Explicit adult content still blocked in teen profile
// ---------------------------------------------------------------------------
console.log("\nB3: Explicit adult content still blocked in teen profile");
{
  const teenProfile = makeTeenProfile(false);
  const explicitCand = makeLocalCandidate("expl-1", "Erotic Thriller Novel", ["Adult Romance Fiction", "Adult"], ["erotic fiction", "forbidden desire"], { year: 2020 });
  const [scored] = scoreCandidates([explicitCand], teenProfile);
  const ageSuit = Number(scored.scoreBreakdown?.ageTeenSuitability || 0);

  check("B3-a: explicit content scores age suitability <= -3 in teen profile", () => assert(ageSuit <= -3, `Expected <= -3, got ${ageSuit.toFixed(2)}`));
  check("B3-b: explicit content excluded from best-fit rescue", () => {
    const result = selectRecommendations([scored], teenProfile, 10);
    const bf = Number(result.rejectedReasons.accepted_local_library_best_fit || 0);
    assert(bf === 0, `Explicit content should not be best-fit rescued; bf=${bf}`);
  });
}

// ---------------------------------------------------------------------------
// B4 — localLibraryCurationTrusted: suppresses maturityBand in adapter output
// ---------------------------------------------------------------------------
console.log("\nB4: localLibraryCurationTrusted — maturityBand suppressed in adapter");
(async () => {
  const adultShelfRecords = [
    { localId: "yvhs-1", title: "Book Alpha", author: "Author A", audience: "Adult", readingLevel: "Adult", shelvingLocation: "Adult Fiction", localPlacement: "General", callNumber: "FIC A", copies: 1, publicationYear: 2018 },
    { localId: "yvhs-2", title: "Book Beta", author: "Author B", audience: "Adult", readingLevel: "Adult", shelvingLocation: "Adult Fiction", localPlacement: "General", callNumber: "FIC B", copies: 1, publicationYear: 2019 },
    { localId: "yvhs-3", title: "Book Gamma", author: "Author C", audience: "Adult", readingLevel: "Adult", shelvingLocation: "Adult Fiction", localPlacement: "General", callNumber: "FIC C", copies: 1, publicationYear: 2020 },
  ];

  const untrustedResult = await runAdapterForRecords(adultShelfRecords, makeTeenProfile(false));
  const trustedResult = await runAdapterForRecords(adultShelfRecords, makeTeenProfile(true));

  check("B4-a: without trust, 'Adult Fiction' items get maturityBand='adult'", () => {
    const hasAdultBand = untrustedResult.rawItems.some((item) => item.maturityBand === "adult");
    assert(hasAdultBand, `Expected at least one maturityBand='adult'; got: ${JSON.stringify(untrustedResult.rawItems.map((i) => i.maturityBand))}`);
  });

  check("B4-b: with trust, all items have maturityBand undefined", () => {
    const allUndefined = trustedResult.rawItems.every((item) => item.maturityBand == null);
    assert(allUndefined, `Expected all maturityBand=undefined when trusted; got: ${JSON.stringify(trustedResult.rawItems.map((i) => i.maturityBand))}`);
  });

  const scoredTrusted = scoreCandidates(normalizeSourceResults([trustedResult]), makeTeenProfile(true));
  const selectionTrusted = selectRecommendations(scoredTrusted, makeTeenProfile(true), 10);
  check("B4-c: trusted curation → Adult Fiction books selectable for teen profile", () => {
    assert(selectionTrusted.selected.length >= 1, `Expected >= 1 selected; got ${selectionTrusted.selected.length}. Reasons: ${JSON.stringify(selectionTrusted.rejectedReasons)}`);
  });
})();

// ---------------------------------------------------------------------------
// B5 — External sources not affected by best-fit rescue
// ---------------------------------------------------------------------------
console.log("\nB5: External sources not affected by best-fit rescue");
{
  const extCandidate = {
    id: "gb:ext-001", sourceId: "gb-ext",
    title: "External Horror Novel",
    subtitle: "", description: "A terrifying horror novel with dark atmosphere.",
    authors: ["Horror Author"], creators: [{ name: "Horror Author", role: "author" }],
    genres: ["Horror Fiction", "Dark Fiction", "Thriller"],
    themes: ["supernatural horror", "survival"], tones: ["dark", "atmospheric"],
    characterDynamics: [], subjects: ["horror", "thriller"],
    source: "googleBooks",
    sourceUrl: "https://books.google.com/test", sourceId: "gb-test",
    coverUrl: undefined, publicationYear: 2020,
    maturityBand: "adult", audienceBand: "adult",
    format: "book", formats: ["book"], language: "en",
    raw: { description: "A terrifying horror novel" },
    diagnostics: { queryText: "horror fiction" },
  };

  const profile = makeAdultHorrorProfile();
  const [scored] = scoreCandidates([extCandidate], profile);
  const result = selectRecommendations([scored], profile, 10);

  check("B5-a: selectRecommendations returns expected shape", () => {
    assert(Array.isArray(result.selected) && typeof result.rejectedReasons === "object", "wrong shape");
  });
  check("B5-b: external candidate does NOT trigger local library best-fit rescue", () => {
    const bf = Number(result.rejectedReasons.accepted_local_library_best_fit || 0);
    assert(bf === 0, `External candidate should not trigger best-fit rescue; bf=${bf}`);
  });
}

// ---------------------------------------------------------------------------
// B6 — Production-shaped missing shared artifact fails before selection
// ---------------------------------------------------------------------------
console.log("\nB6: Missing shared artifact → explicit pre-selection diagnostics");
(async () => {
  const profile = makeTeenProfile(true);
  const sourceResult = await runAdapterForRecords([], profile);
  const scored = scoreCandidates(normalizeSourceResults([sourceResult]), profile);
  const selection = selectRecommendations(scored, profile, 10);

  check("B6-a: missing artifact is identified at the source stage", () => {
    assert(sourceResult.diagnostics.emptyReason === "local_collection_not_imported", JSON.stringify(sourceResult.diagnostics));
    assert(sourceResult.diagnostics.localCollectionRecordCount === 0, JSON.stringify(sourceResult.diagnostics));
  });
  check("B6-b: zero-result selection diagnostics show no candidates reached ranking or rescue", () => {
    assert(selection.rejectedReasons.local_library_candidates_after_ranking === 0, JSON.stringify(selection.rejectedReasons));
    assert(selection.rejectedReasons.local_library_best_fit_entering_count === 0, JSON.stringify(selection.rejectedReasons));
    assert(selection.rejectedReasons.selection_output_count === 0, JSON.stringify(selection.rejectedReasons));
  });
})();

// ---------------------------------------------------------------------------
// Summary (allow async B4 to complete first)
// ---------------------------------------------------------------------------
setTimeout(() => {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Local Collection best-fit regressions: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}, 600);
