/**
 * Local library display metadata regressions.
 *
 * Verifies:
 *  - localLibrary source rows carry cover/call/sublocation metadata
 *  - V2 normalization preserves that metadata onto candidates
 *  - selection preserves it onto final selected recommendations
 *  - SwipeDeckScreen maps it into the displayed doc and uses subLocation • callNumber
 *  - cover fallback logic remains intact when no direct local cover exists
 *  - Admin text renames Open Library -> Go To Library without behavior changes
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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  PASS ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`  FAIL ${name}`);
    console.error(`       ${error instanceof Error ? error.message : String(error)}`);
    failed += 1;
  }
}

const Module = require("module");
const originalLoad = Module._load;
let stubbedRecords = [];

Module._load = function (request, parent, isMain) {
  if (request.endsWith("storage") || request.includes("localCollection/storage")) {
    return {
      loadLocalCollectionRecommendationArtifact: async () => ({
        schemaVersion: "local_collection_recommendation_v1",
        createdAt: new Date().toISOString(),
        metadata: {
          schemaVersion: "local_collection_import_v1",
          importTimestamp: new Date().toISOString(),
          sourceFilename: "fixture.csv",
        },
        deterministicContentHash: "fixture-hash",
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

const { localLibrarySourceAdapter } = require(resolve(ROOT, "app", "recommender-v2", "sources", "localLibrarySource.ts"));
const { normalizeSourceResults } = require(resolve(ROOT, "app", "recommender-v2", "normalize.ts"));
const { scoreCandidates } = require(resolve(ROOT, "app", "recommender-v2", "score.ts"));
const { selectRecommendations } = require(resolve(ROOT, "app", "recommender-v2", "select.ts"));

Module._load = originalLoad;

const swipeDeckSource = readFileSync(resolve(ROOT, "screens", "SwipeDeckScreen.tsx"), "utf8");
const openLibraryFromTagsSource = readFileSync(resolve(ROOT, "screens", "swipe", "openLibraryFromTags.ts"), "utf8");
const adminSource = readFileSync(resolve(ROOT, "app", "app_admin-web.tsx"), "utf8");
const localSource = readFileSync(resolve(ROOT, "app", "recommender-v2", "sources", "localLibrarySource.ts"), "utf8");
const localPresentationSource = readFileSync(resolve(ROOT, "lib", "localCollection", "presentation.ts"), "utf8");
const swipeDeckFile = ts.createSourceFile("SwipeDeckScreen.tsx", swipeDeckSource, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TSX);

function extractFunctionText(sourceFile, name) {
  let found = "";
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      found = node.getFullText(sourceFile);
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (!found) throw new Error(`Missing function ${name}`);
  return found;
}

const swipeDeckHelpersSource = [
  "normalizeImageUrl",
  "uniqueCoverCandidates",
  "normalizeIsbn",
  "uniqueIsbnCandidates",
  "recommendationCoverUrl",
  "coverUrlFromIsbn",
  "recommendationIsbnCandidates",
  "recommendationCoverCandidates",
  "recommendationCallNumber",
  "canonicalLocalDisplayValue",
  "recommendationSubLocationCandidates",
  "recommendationSubLocation",
  "formatRecommendationLocationLine",
].map((name) => extractFunctionText(swipeDeckFile, name)).join("\n\n");

const swipeDeckHelperModule = { exports: {} };
const swipeDeckHelperFactory = new Function("module", "exports", `${ts.transpileModule(`
function coverUrlFromCoverId() { return null; }
${swipeDeckHelpersSource}
module.exports = {
  recommendationIsbnCandidates,
  recommendationCoverCandidates,
  recommendationCallNumber,
  recommendationSubLocation,
  formatRecommendationLocationLine,
};
`, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText}`);
swipeDeckHelperFactory(swipeDeckHelperModule, swipeDeckHelperModule.exports);
const {
  recommendationIsbnCandidates,
  recommendationCoverCandidates,
  recommendationCallNumber,
  recommendationSubLocation,
  formatRecommendationLocationLine,
} = swipeDeckHelperModule.exports;

function makeProfile() {
  return {
    ageBand: "adult",
    maturityBand: "adult",
    tone: [{ value: "dark", weight: 2, evidence: [] }],
    pacing: [],
    genreFamily: [{ value: "horror", weight: 3, evidence: [] }],
    themes: [{ value: "ghost", weight: 1.5, evidence: [] }],
    characterDynamics: [],
    formatPreference: [],
    avoidSignals: [],
    sourceHints: [],
    diagnostics: {},
  };
}

async function runAdapter(records) {
  stubbedRecords = records;
  Module._load = function (request, parent, isMain) {
    if (request.endsWith("storage") || request.includes("localCollection/storage")) {
      return {
        loadLocalCollectionRecommendationArtifact: async () => ({
          schemaVersion: "local_collection_recommendation_v1",
          createdAt: new Date().toISOString(),
          metadata: {
            schemaVersion: "local_collection_import_v1",
            importTimestamp: new Date().toISOString(),
            sourceFilename: "fixture.csv",
          },
          deterministicContentHash: "fixture-hash",
          summary: { totalRows: records.length, acceptedTitles: records.length },
          records,
        }),
      };
    }
    if (request.endsWith("runtimeConfig") || request.includes("runtimeConfig")) {
      return { getRuntimeLibraryId: () => "yvhs-library" };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    return await localLibrarySourceAdapter.search(
      {
        source: "localLibrary",
        enabled: true,
        status: "planned",
        timeoutMs: 1000,
        intents: [{ id: "primary", query: "ghost horror", facets: ["ghost", "horror"], priority: 1, rationale: ["fixture"] }],
      },
      { profile: makeProfile() },
    );
  } finally {
    Module._load = originalLoad;
  }
}

console.log("\nS1: structural UI/admin checks");
check("S1-a source adapter forwards shelving + call + sub-location aliases", () => {
  assert(localSource.includes("adaptLocalCollectionSourceRecord"), "source must use the shared Local Collection adapter");
  assert(localPresentationSource.includes("coverUrl: record.coverUrl"), "source must forward coverUrl");
  assert(localPresentationSource.includes("description: record.description"), "source must forward normalized local description");
  assert(localPresentationSource.includes("callNumber: record.callNumber"), "source must forward callNumber");
  assert(localPresentationSource.includes("subLocation: record.shelvingLocation || record.localPlacement"), "source must prefer shelvingLocation for student-facing shelf label");
  assert(localPresentationSource.includes("shelvingLocation: record.shelvingLocation"), "source must forward shelvingLocation");
  assert(localPresentationSource.includes("isbn13: record.isbn13"), "source must forward isbn13 for presentation-only cover enrichment");
  assert(localPresentationSource.includes("marcHoldings: record.marcHoldings"), "source must preserve MARC holdings metadata");
});
check("S1-b SwipeDeckScreen maps local metadata onto displayed doc", () => {
  assert(swipeDeckSource.includes("candidate.coverUrl ??"), "normalizeRecommenderV2Items must prefer candidate.coverUrl");
  assert(swipeDeckSource.includes("localCollectionCallNumber"), "display doc must preserve localCollectionCallNumber");
  assert(swipeDeckSource.includes("localCollectionPlacement"), "display doc must preserve localCollectionPlacement");
  assert(swipeDeckSource.includes("shelvingLocation"), "display doc must preserve shelvingLocation");
});
check("S1-c recommendation card chyron uses deduped location-line helper", () => {
  assert(swipeDeckSource.includes("return formatRecommendationLocationLine(currentRec.doc);"), "card must use shared location-line formatter");
  assert(swipeDeckSource.includes("function formatRecommendationLocationLine(doc: any): string"), "location-line formatter must exist");
});
check("S1-d cover fallback path remains intact", () => {
  assert(swipeDeckSource.includes("const fromCoverId = coverUrlFromCoverId(doc.cover_i || doc.coverId, \"L\");"), "cover fallback must still try coverId");
  assert(swipeDeckSource.includes("doc?.imageLinks?.thumbnail"), "cover fallback must still try imageLinks thumbnail");
  assert(swipeDeckSource.includes("raw?.thumbnail"), "cover fallback must still try raw thumbnail");
  assert(
    !swipeDeckSource.includes("(process as any)?.env?.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY"),
    "recommendation cover lookups must use Expo-inlinable API key access",
  );
  assert(
    !openLibraryFromTagsSource.includes("(process as any)?.env?.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY"),
    "tag-based Google Books lookups must use Expo-inlinable API key access",
  );
  assert(
    swipeDeckSource.includes("const viewCover = await lookupGoogleBooksViewCover(safeIsbn);"),
    "missing Open Library ISBN covers must try the keyless Google Books view lookup before REST search",
  );
  assert(
    swipeDeckSource.includes("jscmd=viewapi&bibkeys="),
    "keyless Google Books cover lookup must use the documented view API",
  );
});
check("S1-e Admin text uses Go To Library", () => {
  assert(adminSource.includes('if (s === "openLibrary") return "Go To Library";'), "source label must read Go To Library");
  assert(adminSource.includes(">Go To Library</Text>"), "button text must read Go To Library");
});

console.log("\nB1-B3: runtime metadata preservation");
const fixtureRecords = [
  {
    localId: "loc-001",
    title: "Ghost Shelf",
    author: "Shelley Reader",
    description: "A haunted library tests one reader's courage.",
    publicationYear: 2021,
    audience: "Adult",
    readingLevel: "Adult",
    shelvingLocation: "Adventure, Mystery, & Suspense",
    localPlacement: "FIC REI",
    callNumber: "FIC REI",
    availability: "available",
    coverUrl: "https://cdn.example.test/ghost-shelf.jpg",
    copies: 2,
    isbn10: "0123456789",
    isbn13: "9780123456789",
    marcHoldings: [{ collection: "Adventure, Mystery, & Suspense", callNumber: "FIC REI", locationCode: "YVHS" }],
  },
];

const sourceResult = await runAdapter(fixtureRecords);
check("B1 source rows keep cover and local holdings metadata", () => {
  const row = sourceResult.rawItems[0] || {};
  assert(row.coverUrl === "https://cdn.example.test/ghost-shelf.jpg", `expected coverUrl, got ${row.coverUrl}`);
  assert(row.description === "A haunted library tests one reader's courage.", `expected description, got ${row.description}`);
  assert(row.callNumber === "FIC REI", `expected callNumber, got ${row.callNumber}`);
  assert(row.localCollectionCallNumber === "FIC REI", `expected localCollectionCallNumber, got ${row.localCollectionCallNumber}`);
  assert(row.localCollectionPlacement === "FIC REI", `expected localCollectionPlacement, got ${row.localCollectionPlacement}`);
  assert(row.subLocation === "Adventure, Mystery, & Suspense", `expected shelvingLocation-backed subLocation, got ${row.subLocation}`);
  assert(row.shelvingLocation === "Adventure, Mystery, & Suspense", `expected shelvingLocation, got ${row.shelvingLocation}`);
  assert(row.isbn13 === "9780123456789", `expected isbn13 for cover lookup, got ${row.isbn13}`);
  assert(Array.isArray(row.marcHoldings) && row.marcHoldings[0]?.collection === "Adventure, Mystery, & Suspense", "expected marcHoldings preservation");
});

const normalized = normalizeSourceResults([sourceResult]);
check("B2 normalized candidate preserves cover/call/sub-location fields", () => {
  const candidate = normalized[0] || {};
  assert(candidate.coverUrl === "https://cdn.example.test/ghost-shelf.jpg", `normalized coverUrl missing: ${candidate.coverUrl}`);
  assert(candidate.description === undefined, "local display description must not enter scoring metadata");
  assert(candidate.displayDescription === "A haunted library tests one reader's courage.", `normalized display description missing: ${candidate.displayDescription}`);
  assert(candidate.callNumber === "FIC REI", `normalized callNumber missing: ${candidate.callNumber}`);
  assert(candidate.localCollectionCallNumber === "FIC REI", `normalized localCollectionCallNumber missing: ${candidate.localCollectionCallNumber}`);
  assert(candidate.subLocation === "Adventure, Mystery, & Suspense", `normalized subLocation missing: ${candidate.subLocation}`);
  assert(candidate.localCollectionPlacement === "FIC REI", `normalized localCollectionPlacement missing: ${candidate.localCollectionPlacement}`);
  assert(candidate.shelvingLocation === "Adventure, Mystery, & Suspense", `normalized shelvingLocation missing: ${candidate.shelvingLocation}`);
});

const selected = selectRecommendations(scoreCandidates(normalized, makeProfile()), makeProfile(), 10).selected;
check("B3 selected recommendation still preserves local display metadata", () => {
  const candidate = selected[0] || {};
  assert(candidate.coverUrl === "https://cdn.example.test/ghost-shelf.jpg", `selected coverUrl missing: ${candidate.coverUrl}`);
  assert(candidate.description === undefined, "selected local description must remain presentation-only");
  assert(candidate.displayDescription === "A haunted library tests one reader's courage.", `selected display description missing: ${candidate.displayDescription}`);
  assert(candidate.callNumber === "FIC REI", `selected callNumber missing: ${candidate.callNumber}`);
  assert(candidate.subLocation === "Adventure, Mystery, & Suspense", `selected subLocation missing: ${candidate.subLocation}`);
  assert(candidate.localCollectionPlacement === "FIC REI", `selected localCollectionPlacement missing: ${candidate.localCollectionPlacement}`);
  assert(candidate.shelvingLocation === "Adventure, Mystery, & Suspense", `selected shelvingLocation missing: ${candidate.shelvingLocation}`);
});

console.log("\nB4-B8: UI helper behavior with real-shaped local records");
const displayDoc = {
  title: "Ghost Shelf",
  coverUrl: "https://cdn.example.test/ghost-shelf.jpg",
  callNumber: "FIC REI",
  subLocation: "Adventure, Mystery, & Suspense",
  shelvingLocation: "Adventure, Mystery, & Suspense",
  localCollectionPlacement: "FIC REI",
  isbn13: "9780123456789",
  raw: {
    callNumber: "FIC REI",
    localPlacement: "FIC REI",
    localCollectionPlacement: "FIC REI",
    shelvingLocation: "Adventure, Mystery, & Suspense",
    localCollectionIsbn13: "9780123456789",
    marcHoldings: [{ collection: "Adventure, Mystery, & Suspense", callNumber: "FIC REI", locationCode: "YVHS" }],
  },
};
check("B4 shelf-location helper prefers real 852$b collection over placement-like 900$a", () => {
  assert(recommendationSubLocation(displayDoc) === "Adventure, Mystery, & Suspense", `unexpected subLocation: ${recommendationSubLocation(displayDoc)}`);
});
check("B5 location line renders genre shelf plus call number without duplication", () => {
  assert(formatRecommendationLocationLine(displayDoc) === "Adventure, Mystery, & Suspense • FIC REI", `unexpected location line: ${formatRecommendationLocationLine(displayDoc)}`);
});
check("B6 placement-like local field does not render twice when it matches call number", () => {
  const placementOnlyDoc = {
    callNumber: "FIC REI",
    localCollectionPlacement: "FIC REI",
    raw: { callNumber: "FIC REI", localPlacement: "FIC REI" },
  };
  assert(recommendationSubLocation(placementOnlyDoc) === "", `expected empty duplicate location, got ${recommendationSubLocation(placementOnlyDoc)}`);
  assert(formatRecommendationLocationLine(placementOnlyDoc) === "FIC REI", `expected single call number, got ${formatRecommendationLocationLine(placementOnlyDoc)}`);
});
check("B7 ISBN-first cover enrichment candidates survive when no local cover exists", () => {
  const noLocalCoverDoc = {
    title: "Ghost Shelf",
    raw: {
      localCollectionIsbn13: "9780123456789",
    },
  };
  const candidates = recommendationCoverCandidates(noLocalCoverDoc);
  const isbnCover = "https://covers.openlibrary.org/b/isbn/9780123456789-L.jpg?default=false";
  const enrichedCover = "https://books.google.test/enriched-cover.jpg";
  assert(
    candidates.includes(isbnCover),
    `expected non-placeholder ISBN cover candidate, got ${JSON.stringify(candidates)}`,
  );
  assert(recommendationIsbnCandidates(noLocalCoverDoc)[0] === "9780123456789", `expected ISBN candidate, got ${JSON.stringify(recommendationIsbnCandidates(noLocalCoverDoc))}`);
  const candidatesAfterMissingCover = recommendationCoverCandidates(noLocalCoverDoc, enrichedCover)
    .filter((candidate) => candidate.toLowerCase() !== isbnCover.toLowerCase());
  assert(candidatesAfterMissingCover[0] === enrichedCover, "missing ISBN cover must yield to the asynchronously enriched cover");
});
check("B8 UI still renders safely when no cover and no shelf metadata exist", () => {
  const bareDoc = { title: "Bare Record", raw: {} };
  assert(formatRecommendationLocationLine(bareDoc) === "", `expected empty location line, got ${formatRecommendationLocationLine(bareDoc)}`);
  assert(Array.isArray(recommendationCoverCandidates(bareDoc)) && recommendationCoverCandidates(bareDoc).length === 0, "expected no cover candidates");
});

console.log(`\nLocal library display metadata regressions: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
