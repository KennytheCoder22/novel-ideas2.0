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
    },
  }).outputText;
  module._compile(output, filename);
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const {
  clearAllPatronCustomizations,
  clearPatronCustomization,
  effectivePatronSwipeCategories,
  normalizeAvailableSwipeCategories,
  patronCustomizationStorageKey,
  readPatronCustomization,
  resolvePatronAppearance,
  writePatronCustomization,
} = require(resolve(root, "lib", "patronCustomization.ts"));
const {
  effectivePatronAgeBands,
} = require(resolve(root, "lib", "patronAgePreferences.ts"));

const homeSource = readFileSync(resolve(root, "app", "(tabs)", "index.tsx"), "utf8");
const pageSource = readFileSync(resolve(root, "app", "customize-my-experience.tsx"), "utf8");
const adminSource = readFileSync(resolve(root, "app", "app_admin-web.tsx"), "utf8");
const layoutSource = readFileSync(resolve(root, "app", "_layout.tsx"), "utf8");

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

const allBands = { k2: true, "36": true, ms_hs: true, adult: true };
const adultsOnly = { k2: false, "36": false, ms_hs: false, adult: true };
const allCategories = { books: true, movies: true, tv: true, games: true, youtube: true, anime: true, podcasts: true };
const booksOnly = { books: true, movies: false, tv: false, games: false, youtube: false, anime: false, podcasts: false };
const inheritedAppearance = {
  name: "YVHS",
  logoDataUrl: "data:image/png;base64,library",
  mainColorHex: "#112233",
  highlightColorHex: "#abcdef",
  fontColorHex: "#ffffff",
};

function test(name, fn) {
  fn();
  process.stdout.write(`PASS ${name}\n`);
}

test("1. default users open Customize My Experience without a Library ID", () => {
  assert.match(homeSource, /pathname: "\/customize-my-experience"/);
  assert.match(homeSource, /params: props\.libraryId \? \{ libraryId: props\.libraryId \} : \{\}/);
  assert.match(layoutSource, /name="customize-my-experience"/);
  assert.doesNotMatch(pageSource, /adminPin|library_id_too_short/);
});

test("2-3. Adults-only is saved and becomes the only effective age band", () => {
  const storage = new MemoryStorage();
  writePatronCustomization(storage, "patron-a", undefined, { ageBands: adultsOnly });
  const loaded = readPatronCustomization(storage, "patron-a", undefined);
  assert.deepEqual(loaded.ageBands, adultsOnly);
  assert.deepEqual(effectivePatronAgeBands(allBands, loaded.ageBands), adultsOnly);
  assert.match(homeSource, /effectivePatronAgeBands\(availablePatronAgeBands, patronCustomization\.ageBands/);
});

test("4. personal Main, Highlight, and Font color overrides resolve independently", () => {
  const overrides = { mainColorHex: "#010203", highlightColorHex: "#aabbcc", fontColorHex: "#101010" };
  const effective = resolvePatronAppearance(inheritedAppearance, overrides);
  assert.equal(effective.mainColorHex, "#010203");
  assert.equal(effective.highlightColorHex, "#aabbcc");
  assert.equal(effective.fontColorHex, "#101010");
  assert.match(pageSource, /Main color[\s\S]*Highlight color[\s\S]*Font color/);
});

test("5. personal name and logo overrides resolve without changing inherited branding", () => {
  const effective = resolvePatronAppearance(inheritedAppearance, {
    name: "Ken's NovelIdeas",
    logoDataUrl: "data:image/png;base64,patron",
  });
  assert.equal(effective.name, "Ken's NovelIdeas");
  assert.equal(effective.logoDataUrl, "data:image/png;base64,patron");
  assert.equal(inheritedAppearance.name, "YVHS");
  assert.match(pageSource, /Upload personal image/);
});

test("6. patrons can narrow permitted swipe categories", () => {
  assert.deepEqual(effectivePatronSwipeCategories(allCategories, booksOnly), booksOnly);
  assert.match(homeSource, /effectivePatronSwipeCategories\(librarySwipeCategories, patronCustomization\.swipeCategories\)/);
});

test("7. personal customization survives storage reload and new sessions", () => {
  const storage = new MemoryStorage();
  const customization = { appearance: { name: "Personal" }, ageBands: adultsOnly, swipeCategories: booksOnly };
  writePatronCustomization(storage, "patron-a", "library-a", customization);
  assert.deepEqual(readPatronCustomization(storage, "patron-a", "library-a"), customization);
});

test("8. patron and hosted-library scopes are isolated", () => {
  const storage = new MemoryStorage();
  writePatronCustomization(storage, "patron-a", "library-a", { appearance: { name: "A at A" } });
  assert.deepEqual(readPatronCustomization(storage, "patron-b", "library-a"), {});
  assert.deepEqual(readPatronCustomization(storage, "patron-a", "library-b"), {});
  assert.notEqual(
    patronCustomizationStorageKey("patron-a", "library-a"),
    patronCustomizationStorageKey("patron-b", "library-a"),
  );
});

test("9. personal writes do not modify library configuration", () => {
  const storage = new MemoryStorage({
    lib_config_library_a: JSON.stringify({ branding: inheritedAppearance, enabledDecks: allBands }),
  });
  const before = storage.getItem("lib_config_library_a");
  writePatronCustomization(storage, "patron-a", "library-a", { appearance: { name: "Personal" } });
  assert.equal(storage.getItem("lib_config_library_a"), before);
});

test("10. patrons cannot enable an age band disabled by the library", () => {
  const available = { k2: false, "36": true, ms_hs: true, adult: true };
  const attempted = { k2: true, "36": false, ms_hs: false, adult: true };
  assert.deepEqual(
    effectivePatronAgeBands(available, attempted),
    { k2: false, "36": false, ms_hs: false, adult: true },
  );
});

test("11. patrons cannot enable a swipe category disabled by the library", () => {
  const available = { ...allCategories, movies: false };
  const attempted = { ...allCategories, movies: true };
  assert.equal(effectivePatronSwipeCategories(available, attempted).movies, false);
});

test("12. uncustomized values continue inheriting current library defaults", () => {
  const partial = resolvePatronAppearance(inheritedAppearance, { highlightColorHex: "#123456" });
  assert.equal(partial.name, inheritedAppearance.name);
  assert.equal(partial.logoDataUrl, inheritedAppearance.logoDataUrl);
  assert.equal(partial.mainColorHex, inheritedAppearance.mainColorHex);
  assert.equal(partial.highlightColorHex, "#123456");
  assert.deepEqual(effectivePatronAgeBands(allBands, null), allBands);
  assert.deepEqual(effectivePatronSwipeCategories(allCategories, undefined), allCategories);
  assert.deepEqual(
    normalizeAvailableSwipeCategories({ books: false }),
    { ...allCategories, books: false },
  );
  assert.match(pageSource, /ageBands: draft\.ageBands \? selectedAgeBands : undefined/);
  assert.match(pageSource, /swipeCategories: draft\.swipeCategories \? selectedSwipeCategories : undefined/);
});

test("13. Reset My Customizations preserves identity and unrelated patron state", () => {
  const storage = new MemoryStorage({
    novelideas_patron_id_v1: "patron-a",
    "novelideas_patron_my_list_v1:patron-a:library-a": "[{\"title\":\"Five Minds\"}]",
  });
  writePatronCustomization(storage, "patron-a", "library-a", { appearance: { name: "Personal" } });
  clearPatronCustomization(storage, "patron-a", "library-a");
  assert.equal(storage.getItem("novelideas_patron_id_v1"), "patron-a");
  assert.match(storage.getItem("novelideas_patron_my_list_v1:patron-a:library-a"), /Five Minds/);
  assert.deepEqual(readPatronCustomization(storage, "patron-a", "library-a"), {});
  assert.match(pageSource, /Reset My Customizations/);
});

test("14. Reset User removes all customization scopes for the previous patron", () => {
  const storage = new MemoryStorage({ novelideas_patron_id_v1: "patron-old" });
  writePatronCustomization(storage, "patron-old", "library-a", { appearance: { name: "A" } });
  writePatronCustomization(storage, "patron-old", "library-b", { appearance: { name: "B" } });
  clearAllPatronCustomizations(storage, "patron-old");
  const reset = resetPatronIdentity(storage, () => "patron-new");
  assert.deepEqual(readPatronCustomization(storage, reset.previousId, "library-a"), {});
  assert.deepEqual(readPatronCustomization(storage, reset.previousId, "library-b"), {});
  assert.match(homeSource, /clearAllPatronCustomizations/);
});

test("15. patron saves never use librarian/admin save operations", () => {
  const saveHandler = pageSource.slice(pageSource.indexOf("async function save()"), pageSource.indexOf("async function resetCustomizations"));
  assert.match(saveHandler, /writePatronCustomization/);
  assert.doesNotMatch(saveHandler, /saveSettings|saveSharedLibraryConfig|setConfig|lib_config_/);
});

test("16. Create/Edit library administration remains available", () => {
  assert.match(adminSource, /Create New Library/);
  assert.match(adminSource, />Librarian Settings</);
  assert.match(adminSource, /adminDraftScopeId !== ADMIN_CONFIG_DEFAULT_SCOPE/);
  assert.match(homeSource, /openAdminEntry\(\)/);
});

test("17. personal and librarian destinations are distinct", () => {
  assert.match(homeSource, />Customize My Experience</);
  assert.match(homeSource, />Librarian Settings</);
  assert.match(homeSource, /pathname: "\/customize-my-experience"/);
  assert.match(homeSource, /openAdminEntry\(\)/);
});

test("18. generic personalization never routes to Create New Library", () => {
  const personalHandler = homeSource.slice(homeSource.indexOf("function openPatronPreferences"), homeSource.indexOf("async function persistMyList"));
  assert.match(personalHandler, /customize-my-experience/);
  assert.doesNotMatch(personalHandler, /openAdminEntry|app_admin-web|Create New Library/);
});

process.stdout.write("\nPatron customization regressions passed.\n");
