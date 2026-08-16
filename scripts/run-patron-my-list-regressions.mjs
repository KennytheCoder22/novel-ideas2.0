#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resetPatronIdentity } from "../lib/patronIdentity.mjs";

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
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  module._compile(output, filename);
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const {
  addSavedRecommendation,
  clearAllPatronMyLists,
  patronMyListStorageKey,
  readPatronMyList,
  removeSavedRecommendation,
  writePatronMyList,
} = require(resolve(root, "lib", "patronMyList.ts"));
const homeSource = readFileSync(resolve(root, "app", "(tabs)", "index.tsx"), "utf8");
const swipeSource = readFileSync(resolve(root, "screens", "SwipeDeckScreen.tsx"), "utf8");
const modalSource = readFileSync(resolve(root, "components", "MyListModal.tsx"), "utf8");

class MemoryStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
  }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  get length() { return this.values.size; }
  key(index) { return Array.from(this.values.keys())[index] ?? null; }
}

const localBook = {
  title: "The Library Book",
  author: "Susan Orlean",
  coverUrl: "https://example.test/library-book.jpg",
  subLocation: "Adult Nonfiction",
  callNumber: "027.479 ORL",
  source: "localLibrary",
  sourceId: "local-42",
};
const secondBook = {
  title: "Five Minds",
  author: "Guy Morpuss",
  source: "googleBooks",
  sourceId: "gb-five-minds",
};

function test(name, fn) {
  fn();
  process.stdout.write(`PASS ${name}\n`);
}

test("1. recommendation + control saves through the bookmark callback", () => {
  assert.match(swipeSource, /accessibilityLabel=\{currentRecommendationSaved \? "Saved to My List" : "Save recommendation to My List"\}/);
  assert.match(swipeSource, /props\.onSaveRecommendation\?\.\(currentSavedRecommendation\)/);
  assert.match(swipeSource, /saveRecommendationButton[\s\S]*position: "absolute"[\s\S]*top: 8[\s\S]*right: 8/);
});

test("2. duplicate books are rejected by normalized title and author", () => {
  const first = addSavedRecommendation([], localBook);
  const duplicate = addSavedRecommendation(first.items, {
    ...localBook,
    title: "  THE LIBRARY BOOK ",
    author: "Susan   Orlean",
    sourceId: "another-edition",
  });
  assert.equal(first.added, true);
  assert.equal(duplicate.added, false);
  assert.equal(duplicate.items.length, 1);
});

test("3. list survives a new session and storage reload", () => {
  const storage = new MemoryStorage();
  const saved = addSavedRecommendation([], localBook).items;
  writePatronMyList(storage, "patron-a", "library-a", saved);
  assert.deepEqual(readPatronMyList(storage, "patron-a", "library-a"), saved);
});

test("4. different patron identities cannot share saved books", () => {
  assert.notEqual(
    patronMyListStorageKey("patron-a", "library-a"),
    patronMyListStorageKey("patron-b", "library-a"),
  );
  const storage = new MemoryStorage();
  writePatronMyList(storage, "patron-a", "library-a", addSavedRecommendation([], localBook).items);
  assert.equal(readPatronMyList(storage, "patron-b", "library-a").length, 0);
});

test("5. hosted libraries use independent list scopes", () => {
  assert.notEqual(
    patronMyListStorageKey("patron-a", "library-a"),
    patronMyListStorageKey("patron-a", "library-b"),
  );
  const storage = new MemoryStorage();
  writePatronMyList(storage, "patron-a", "library-a", addSavedRecommendation([], localBook).items);
  assert.equal(readPatronMyList(storage, "patron-a", "library-b").length, 0);
});

test("6. Reset User clears the old list without removing library configuration", () => {
  const storage = new MemoryStorage({
    novelideas_patron_id_v1: "patron-old",
    lib_config_library_a: JSON.stringify({ branding: { libraryName: "Library A" } }),
    "novelideas_local_collection_recommendation_v1:library-a": JSON.stringify({ records: [localBook] }),
  });
  writePatronMyList(storage, "patron-old", "library-a", addSavedRecommendation([], localBook).items);
  writePatronMyList(storage, "patron-old", "library-b", addSavedRecommendation([], secondBook).items);
  clearAllPatronMyLists(storage, "patron-old");
  const reset = resetPatronIdentity(storage, () => "patron-new");
  assert.equal(readPatronMyList(storage, reset.previousId, "library-a").length, 0);
  assert.equal(readPatronMyList(storage, reset.previousId, "library-b").length, 0);
  assert.equal(readPatronMyList(storage, reset.nextId, "library-a").length, 0);
  assert.match(storage.getItem("lib_config_library_a"), /Library A/);
  assert.match(storage.getItem("novelideas_local_collection_recommendation_v1:library-a"), /Library Book/);
});

test("7. local holdings metadata survives serialization and renders in My List", () => {
  const storage = new MemoryStorage();
  writePatronMyList(storage, "patron-a", "library-a", addSavedRecommendation([], localBook).items);
  const [reloaded] = readPatronMyList(storage, "patron-a", "library-a");
  assert.equal(reloaded.subLocation, "Adult Nonfiction");
  assert.equal(reloaded.callNumber, "027.479 ORL");
  assert.match(modalSource, /\[item\.subLocation, item\.callNumber\]/);
});

test("8. removal deletes only the selected saved item", () => {
  const first = addSavedRecommendation([], localBook).items;
  const both = addSavedRecommendation(first, secondBook).items;
  const remaining = removeSavedRecommendation(both, first[0].id);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].title, "Five Minds");
  assert.match(modalSource, /Remove from List/);
});

test("9. bookmark operations are isolated from taste and scoring state", () => {
  const recommendationState = {
    tasteProfile: { genres: ["science fiction"] },
    swipeHistory: ["like:Cryptonomicon"],
    scores: { "Five Minds": 42 },
  };
  const before = structuredClone(recommendationState);
  const saved = addSavedRecommendation([], secondBook).items;
  removeSavedRecommendation(saved, saved[0].id);
  assert.deepEqual(recommendationState, before);

  const saveHandler = homeSource.slice(
    homeSource.indexOf("async function saveRecommendationToMyList"),
    homeSource.indexOf("function removeRecommendationFromMyList"),
  );
  assert.doesNotMatch(saveHandler, /taste|swipe|feedback|score/i);
  assert.doesNotMatch(readFileSync(resolve(root, "lib", "patronMyList.ts"), "utf8"), /recommender-v2|tasteProfile|recordFeedback/);
});

assert.match(homeSource, />My List</);
assert.match(homeSource, /clearAllPatronMyLists/);
process.stdout.write("\nPatron My List regressions passed.\n");
