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
const adminSource = readFileSync(resolve(ROOT, "app", "app_admin-web.tsx"), "utf8");
const localSource = readFileSync(resolve(ROOT, "app", "recommender-v2", "sources", "localLibrarySource.ts"), "utf8");

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
  assert(localSource.includes("coverUrl: record.coverUrl"), "source must forward coverUrl");
  assert(localSource.includes("callNumber: record.callNumber"), "source must forward callNumber");
  assert(localSource.includes("subLocation: record.localPlacement || record.shelvingLocation"), "source must forward subLocation alias");
  assert(localSource.includes("shelvingLocation: record.shelvingLocation"), "source must forward shelvingLocation");
});
check("S1-b SwipeDeckScreen maps local metadata onto displayed doc", () => {
  assert(swipeDeckSource.includes("candidate.coverUrl ??"), "normalizeRecommenderV2Items must prefer candidate.coverUrl");
  assert(swipeDeckSource.includes("localCollectionCallNumber"), "display doc must preserve localCollectionCallNumber");
  assert(swipeDeckSource.includes("localCollectionPlacement"), "display doc must preserve localCollectionPlacement");
  assert(swipeDeckSource.includes("shelvingLocation"), "display doc must preserve shelvingLocation");
});
check("S1-c recommendation card chyron uses subLocation • callNumber order", () => {
  assert(swipeDeckSource.includes("if (subLocation && callNumber) return `${subLocation} • ${callNumber}`;"), "chyron must show subLocation • callNumber");
  assert(swipeDeckSource.includes("if (subLocation) return subLocation;"), "chyron must support only subLocation");
  assert(swipeDeckSource.includes("if (callNumber) return callNumber;"), "chyron must support only callNumber");
});
check("S1-d cover fallback path remains intact", () => {
  assert(swipeDeckSource.includes("const fromCoverId = coverUrlFromCoverId(doc.cover_i || doc.coverId, \"L\");"), "cover fallback must still try coverId");
  assert(swipeDeckSource.includes("doc?.imageLinks?.thumbnail"), "cover fallback must still try imageLinks thumbnail");
  assert(swipeDeckSource.includes("raw?.thumbnail"), "cover fallback must still try raw thumbnail");
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
    publicationYear: 2021,
    audience: "Adult",
    readingLevel: "Adult",
    shelvingLocation: "Stacks West",
    localPlacement: "Horror Alcove",
    callNumber: "FIC GHO",
    availability: "available",
    coverUrl: "https://cdn.example.test/ghost-shelf.jpg",
    copies: 2,
    isbn10: "0123456789",
    isbn13: "9780123456789",
  },
];

const sourceResult = await runAdapter(fixtureRecords);
check("B1 source rows keep cover and local holdings metadata", () => {
  const row = sourceResult.rawItems[0] || {};
  assert(row.coverUrl === "https://cdn.example.test/ghost-shelf.jpg", `expected coverUrl, got ${row.coverUrl}`);
  assert(row.callNumber === "FIC GHO", `expected callNumber, got ${row.callNumber}`);
  assert(row.localCollectionCallNumber === "FIC GHO", `expected localCollectionCallNumber, got ${row.localCollectionCallNumber}`);
  assert(row.localCollectionPlacement === "Horror Alcove", `expected localCollectionPlacement, got ${row.localCollectionPlacement}`);
  assert(row.subLocation === "Horror Alcove", `expected subLocation alias, got ${row.subLocation}`);
  assert(row.shelvingLocation === "Stacks West", `expected shelvingLocation, got ${row.shelvingLocation}`);
});

const normalized = normalizeSourceResults([sourceResult]);
check("B2 normalized candidate preserves cover/call/sub-location fields", () => {
  const candidate = normalized[0] || {};
  assert(candidate.coverUrl === "https://cdn.example.test/ghost-shelf.jpg", `normalized coverUrl missing: ${candidate.coverUrl}`);
  assert(candidate.callNumber === "FIC GHO", `normalized callNumber missing: ${candidate.callNumber}`);
  assert(candidate.localCollectionCallNumber === "FIC GHO", `normalized localCollectionCallNumber missing: ${candidate.localCollectionCallNumber}`);
  assert(candidate.subLocation === "Horror Alcove", `normalized subLocation missing: ${candidate.subLocation}`);
  assert(candidate.localCollectionPlacement === "Horror Alcove", `normalized localCollectionPlacement missing: ${candidate.localCollectionPlacement}`);
  assert(candidate.shelvingLocation === "Stacks West", `normalized shelvingLocation missing: ${candidate.shelvingLocation}`);
});

const selected = selectRecommendations(scoreCandidates(normalized, makeProfile()), makeProfile(), 10).selected;
check("B3 selected recommendation still preserves local display metadata", () => {
  const candidate = selected[0] || {};
  assert(candidate.coverUrl === "https://cdn.example.test/ghost-shelf.jpg", `selected coverUrl missing: ${candidate.coverUrl}`);
  assert(candidate.callNumber === "FIC GHO", `selected callNumber missing: ${candidate.callNumber}`);
  assert(candidate.subLocation === "Horror Alcove", `selected subLocation missing: ${candidate.subLocation}`);
  assert(candidate.localCollectionPlacement === "Horror Alcove", `selected localCollectionPlacement missing: ${candidate.localCollectionPlacement}`);
  assert(candidate.shelvingLocation === "Stacks West", `selected shelvingLocation missing: ${candidate.shelvingLocation}`);
});

console.log(`\nLocal library display metadata regressions: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
