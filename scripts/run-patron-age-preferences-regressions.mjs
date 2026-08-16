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
  clearAllPatronAgePreferences,
  effectivePatronAgeBands,
  patronAgePreferencesStorageKey,
  readPatronAgePreferences,
  writePatronAgePreferences,
} = require(resolve(root, "lib", "patronAgePreferences.ts"));
const homeSource = readFileSync(resolve(root, "app", "(tabs)", "index.tsx"), "utf8");
const customizationSource = readFileSync(resolve(root, "app", "customize-my-experience.tsx"), "utf8");
const adminSource = readFileSync(resolve(root, "app", "app_admin-web.tsx"), "utf8");

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

function test(name, fn) {
  fn();
  process.stdout.write(`PASS ${name}\n`);
}

test("1. a default patron can save Adults-only without a Library ID", () => {
  const storage = new MemoryStorage();
  writePatronAgePreferences(storage, "patron-a", undefined, adultsOnly);
  assert.deepEqual(readPatronAgePreferences(storage, "patron-a", undefined, allBands), adultsOnly);
  assert.equal(patronAgePreferencesStorageKey("patron-a", undefined).endsWith(":default"), true);
});

test("2. Adults-only preferences leave only the Adult experience visible", () => {
  assert.deepEqual(effectivePatronAgeBands(allBands, adultsOnly), adultsOnly);
  assert.match(homeSource, /enabledDecks=\{enabledDecks\}/);
  assert.match(customizationSource, /Kids[\s\S]*Pre-Teens[\s\S]*Teens[\s\S]*Adults/);
});

test("3. preferences survive storage reloads and new sessions", () => {
  const storage = new MemoryStorage();
  writePatronAgePreferences(storage, "patron-a", undefined, adultsOnly);
  assert.deepEqual(readPatronAgePreferences(storage, "patron-a", undefined, allBands), adultsOnly);
  assert.match(homeSource, /readPatronAgePreferences(?:Async)?/);
});

test("4. one patron's preferences do not affect another patron", () => {
  const storage = new MemoryStorage();
  writePatronAgePreferences(storage, "patron-a", "library-a", adultsOnly);
  assert.equal(readPatronAgePreferences(storage, "patron-b", "library-a", allBands), null);
  assert.notEqual(
    patronAgePreferencesStorageKey("patron-a", "library-a"),
    patronAgePreferencesStorageKey("patron-b", "library-a"),
  );
});

test("5. personal age-band changes do not mutate library configuration", () => {
  const storage = new MemoryStorage({
    lib_config_library_a: JSON.stringify({ enabledDecks: allBands }),
  });
  const before = storage.getItem("lib_config_library_a");
  writePatronAgePreferences(storage, "patron-a", "library-a", adultsOnly);
  assert.equal(storage.getItem("lib_config_library_a"), before);
  assert.match(homeSource, /enabledDecks=\{libraryEnabledDecks\}/);
});

test("6. hosted patrons cannot enable a library-disabled band", () => {
  const hostedBands = { k2: false, "36": true, ms_hs: true, adult: true };
  const attempted = { k2: true, "36": false, ms_hs: false, adult: true };
  assert.deepEqual(
    effectivePatronAgeBands(hostedBands, attempted),
    { k2: false, "36": false, ms_hs: false, adult: true },
  );
  const storage = new MemoryStorage();
  writePatronAgePreferences(storage, "patron-a", "library-a", attempted);
  assert.deepEqual(
    readPatronAgePreferences(storage, "patron-a", "library-a", hostedBands),
    { k2: false, "36": false, ms_hs: false, adult: true },
  );
});

test("7. Reset User clears preferences and restores library defaults", () => {
  const storage = new MemoryStorage({
    novelideas_patron_id_v1: "patron-old",
    lib_config_library_a: JSON.stringify({ enabledDecks: allBands }),
  });
  writePatronAgePreferences(storage, "patron-old", "library-a", adultsOnly);
  writePatronAgePreferences(storage, "patron-old", "library-b", adultsOnly);
  clearAllPatronAgePreferences(storage, "patron-old");
  const reset = resetPatronIdentity(storage, () => "patron-new");
  assert.equal(readPatronAgePreferences(storage, reset.previousId, "library-a", allBands), null);
  assert.equal(readPatronAgePreferences(storage, reset.previousId, "library-b", allBands), null);
  assert.deepEqual(effectivePatronAgeBands(allBands, null), allBands);
  assert.match(storage.getItem("lib_config_library_a"), /enabledDecks/);
});

test("8. personal preference saves never call a library-admin save path", () => {
  const handler = customizationSource.slice(
    customizationSource.indexOf("async function save()"),
    customizationSource.indexOf("async function resetCustomizations"),
  );
  assert.match(handler, /writePatronCustomization/);
  assert.doesNotMatch(handler, /saveSettings|saveSharedLibraryConfig|setConfig|setInConfig/);
});

test("9. Create and Edit Library administration remain separate and available", () => {
  assert.match(homeSource, />Librarian Settings</);
  assert.match(homeSource, /openAdminEntry\(\)/);
  assert.match(adminSource, /Create New Library/);
  assert.match(adminSource, />Librarian Settings</);
  assert.match(adminSource, /adminDraftScopeId !== ADMIN_CONFIG_DEFAULT_SCOPE/);
});

assert.match(homeSource, />Customize My Experience</);
assert.match(customizationSource, /Age Band Preferences/);
assert.match(homeSource, /clearAllPatronAgePreferences/);
process.stdout.write("\nPatron age preference regressions passed.\n");
