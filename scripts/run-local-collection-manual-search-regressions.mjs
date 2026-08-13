#!/usr/bin/env node

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
const { searchLocalCollection } = require(resolve(repoRoot, "lib", "localCollection", "search.ts"));

const yRecords = [
  {
    localId: "y-1",
    title: "The Night Library",
    author: "Avery Reader",
    isbn13: "9781234567897",
    shelvingLocation: "Mystery",
    localPlacement: "Second Floor",
    callNumber: "FIC REA",
    subjects: ["Libraries", "Secrets"],
    coverUrl: "https://example.test/night.jpg",
    copies: 1,
  },
  {
    localId: "y-2",
    title: "Dragon School",
    author: "Morgan Quill",
    genres: ["Fantasy"],
    shelvingLocation: "Fantasy",
    callNumber: "FIC QUI",
    copies: 1,
  },
];
const mRecords = [{ localId: "m-1", title: "Mel Only", author: "M. Author", copies: 1 }];

assert.equal(searchLocalCollection(yRecords, "Night Library")[0].localId, "y-1");
assert.equal(searchLocalCollection(yRecords, "Avery Reader")[0].localId, "y-1");
assert.equal(searchLocalCollection(yRecords, "978-1-23456-789-7")[0].localId, "y-1");
assert.equal(searchLocalCollection(yRecords, "fantasy")[0].localId, "y-2");
assert.equal(searchLocalCollection(yRecords, "FIC REA")[0].callNumber, "FIC REA");
assert.equal(searchLocalCollection(yRecords, "Second Floor")[0].localPlacement, "Second Floor");
assert.equal(searchLocalCollection(mRecords, "Night Library").length, 0);
assert.equal(searchLocalCollection([], "Night Library").length, 0);

const home = readFileSync(resolve(repoRoot, "app", "(tabs)", "index.tsx"), "utf8");
assert.match(home, /loadLocalCollectionRecommendationArtifact\(activeLibraryId\)/);
assert.match(home, /if \(localRecords\.length > 0\)/);
assert.match(home, /searchLocalCollection\(localRecords, q, maxResults\)/);
assert.match(home, /id: `local:\$\{activeLibraryId\}:\$\{record\.localId\}`/);
assert.match(home, /setManualSearchSource\("open_library"\)/);
assert.match(home, /if \(!sourceEnabled\.openLibrary\)/);
assert.match(home, /manualSearchRequestRef\.current === requestId/);
assert.match(home, /\/api\/openlibrary\?q=/);
assert.match(home, /Shelf: \{holdingLocation\}/);
assert.match(home, /Call number: \{d\.callNumber\}/);
assert.match(home, /\.filter\(\(dk\) => !!props\.enabledDecks\[dk\]\)/);
assert.match(home, /if \(enabledDecks\[deck\]\) return;/);
assert.doesNotMatch(home, /loadLocalCollectionRecommendationArtifact\(undefined\)/);

console.log("Local Collection manual search regressions passed.");
