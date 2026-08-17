#!/usr/bin/env node

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(output, filename);
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const {
  canonicalLibraryId,
  libraryIdReadCandidates,
} = await import(pathToFileURL(resolve(repoRoot, "lib", "libraryIdMigration.js")).href);
const {
  normalizeHostedLibraryRouteId,
  readPatronLibraries,
} = require(resolve(repoRoot, "lib", "savedLibraries.ts"));
const {
  readPatronAgePreferences,
  patronAgePreferencesStorageKey,
} = require(resolve(repoRoot, "lib", "patronAgePreferences.ts"));
const {
  readPatronCustomization,
  patronCustomizationStorageKey,
} = require(resolve(repoRoot, "lib", "patronCustomization.ts"));
const {
  readPatronMyList,
  patronMyListStorageKey,
} = require(resolve(repoRoot, "lib", "patronMyList.ts"));
const {
  parseRealSessionAuditEvent,
} = require(resolve(repoRoot, "lib", "realSessionOverlapAudit.ts"));
const {
  pipelineUserIdForPatron,
} = await import(pathToFileURL(resolve(repoRoot, "lib", "patronIdentity.mjs")).href);

class MemoryStorage {
  values = new Map();
  get length() {
    return this.values.size;
  }
  getItem(key) {
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
  }
  removeItem(key) {
    this.values.delete(key);
  }
  key(index) {
    return [...this.values.keys()][index] ?? null;
  }
}

assert.equal(canonicalLibraryId("y"), "yvhs");
assert.equal(canonicalLibraryId("Y"), "yvhs");
assert.equal(canonicalLibraryId("YVHS"), "yvhs");
assert.equal(canonicalLibraryId("m"), "m");
assert.deepEqual(libraryIdReadCandidates("yvhs"), ["yvhs", "y"]);
assert.equal(normalizeHostedLibraryRouteId("y"), "yvhs");

const savedStorage = new MemoryStorage();
savedStorage.setItem("novelideas_patron_libraries_v1", JSON.stringify([
  { libraryId: "y", libraryName: "YVHS Library", hostedPath: "/y" },
]));
assert.deepEqual(readPatronLibraries(savedStorage), [{
  libraryId: "yvhs",
  libraryName: "YVHS Library",
  hostedPath: "/yvhs",
}]);
assert.match(savedStorage.getItem("novelideas_patron_libraries_v1"), /"libraryId":"yvhs"/);

const patronId = "patron-test";
const patronStorage = new MemoryStorage();
const legacyAgeKey = "novelideas_patron_age_preferences_v1:patron-test:y";
patronStorage.setItem(legacyAgeKey, JSON.stringify({ k2: false, "36": false, ms_hs: true, adult: false }));
assert.equal(readPatronAgePreferences(
  patronStorage,
  patronId,
  "yvhs",
  { k2: false, "36": false, ms_hs: true, adult: false },
)?.ms_hs, true);
assert(patronStorage.getItem(patronAgePreferencesStorageKey(patronId, "yvhs")));

const legacyCustomizationKey = "novelideas_patron_customization_v1:patron-test:y";
patronStorage.setItem(legacyCustomizationKey, JSON.stringify({ appearance: { name: "My YVHS" } }));
assert.equal(readPatronCustomization(patronStorage, patronId, "yvhs").appearance?.name, "My YVHS");
assert(patronStorage.getItem(patronCustomizationStorageKey(patronId, "yvhs")));

const legacyListKey = "novelideas_patron_my_list_v1:patron-test:y";
patronStorage.setItem(legacyListKey, JSON.stringify([{
  title: "Saved Book",
  author: "Saved Author",
  savedAt: "2026-08-01T00:00:00.000Z",
}]));
assert.equal(readPatronMyList(patronStorage, patronId, "yvhs")[0]?.title, "Saved Book");
assert(patronStorage.getItem(patronMyListStorageKey(patronId, "yvhs")));

assert.equal(
  pipelineUserIdForPatron(patronId, "ms_hs", "y"),
  pipelineUserIdForPatron(patronId, "ms_hs", "yvhs"),
);

const audit = parseRealSessionAuditEvent({
  auditId: "audit-12345678",
  libraryId: "y",
  libraryScope: "hosted",
  patronHash: "12ab34cd",
  ageBand: "teens",
  likes: 1,
  dislikes: 1,
  skips: 1,
  dominantTaste: {},
  localQueries: [],
  searchPlan: {},
  finalRecommendations: [{ id: "book-1", title: "Book One", source: "localLibrary" }],
});
assert.equal(audit.libraryId, "yvhs");

const vercel = JSON.parse(readFileSync(resolve(repoRoot, "vercel.json"), "utf8"));
assert(vercel.redirects.some((entry) => entry.source === "/y" && entry.destination === "/yvhs" && entry.permanent));
assert(vercel.redirects.some((entry) => entry.source === "/c/y" && entry.destination === "/yvhs" && entry.permanent));

const route = readFileSync(resolve(repoRoot, "app", "(tabs)", "[libraryId].tsx"), "utf8");
const home = readFileSync(resolve(repoRoot, "app", "(tabs)", "index.tsx"), "utf8");
const admin = readFileSync(resolve(repoRoot, "app", "app_admin-web.tsx"), "utf8");
const sharedStorage = readFileSync(resolve(repoRoot, "lib", "librarySharing", "storage.ts"), "utf8");
const localStorageSource = readFileSync(resolve(repoRoot, "lib", "localCollection", "storage.ts"), "utf8");

assert.match(route, /router\.replace\(`\/\$\{encodeURIComponent\(normalized\)\}`/);
assert.match(home, /libraryIdReadCandidates\(props\.libraryId\)/);
assert.match(admin, /libraryIdReadCandidates\(adminDraftScopeId\)/);
assert.match(sharedStorage, /libraryIdReadCandidates\(id\)/);
assert.match(sharedStorage, /canonicalizeLibraryPayload\(payload, id\)/);
assert.match(sharedStorage, /verification = await diagnoseSharedLibraryConfigExact\(id, correlationId\)/);
assert.match(localStorageSource, /libraryIdReadCandidates\(scopeId\)/);
assert.match(localStorageSource, /persistRecommendationArtifactForScope\(artifact, summarySnapshotForArtifact\(artifact\), scopeId\)/);

console.log("YVHS library ID migration regressions passed.");
