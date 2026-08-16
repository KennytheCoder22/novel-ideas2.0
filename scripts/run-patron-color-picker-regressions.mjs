#!/usr/bin/env node
import assert from "node:assert/strict";
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

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { colorContrastRatio, hexToHsv, hsvToHex } = require(resolve(root, "lib", "colorSelection.ts"));
const {
  readPatronCustomization,
  resolvePatronAppearance,
  writePatronCustomization,
} = require(resolve(root, "lib", "patronCustomization.ts"));
const pageSource = readFileSync(resolve(root, "app", "customize-my-experience.tsx"), "utf8");
const pickerSource = readFileSync(resolve(root, "components", "PatronColorPickerField.tsx"), "utf8");
const previewSource = readFileSync(resolve(root, "components", "admin", "ThemePreviewPanel.tsx"), "utf8");

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

const inherited = {
  name: "YVHS",
  logoDataUrl: null,
  mainColorHex: "#0b1e33",
  highlightColorHex: "#fbbf24",
  fontColorHex: "#ffffff",
};

function test(name, fn) {
  fn();
  process.stdout.write(`PASS ${name}\n`);
}

test("1. visual picker changes Main color", () => {
  assert.equal(hsvToHex({ hue: 0, saturation: 1, value: 1 }), "#ff0000");
  assert.match(pageSource, /label="Main color"[\s\S]*onChange=\{\(value\) => setAppearance\("mainColorHex", value\)\}/);
  assert.match(pickerSource, /testID=\{`\$\{testID\}-hue`\}/);
});

test("2. visual picker changes Highlight color", () => {
  assert.equal(hsvToHex({ hue: 120, saturation: 1, value: 1 }), "#00ff00");
  assert.match(pageSource, /label="Highlight color"[\s\S]*onChange=\{\(value\) => setAppearance\("highlightColorHex", value\)\}/);
  assert.match(pickerSource, /linear-gradient\(90deg/);
  assert.match(pickerSource, /className="patron-hue-spectrum"/);
  assert.doesNotMatch(pickerSource, /Visual hue choices|HUE_STOPS|hueChoice/);
});

test("3. visual picker changes Font color", () => {
  assert.equal(hsvToHex({ hue: 240, saturation: 1, value: 1 }), "#0000ff");
  assert.deepEqual(hexToHsv("#0000ff"), { hue: 240, saturation: 1, value: 1 });
  assert.match(pageSource, /label="Font color"[\s\S]*onChange=\{\(value\) => setAppearance\("fontColorHex", value\)\}/);
  assert.match(pickerSource, /Saturation[\s\S]*Brightness/);
  assert.match(pickerSource, /lastEmittedHex/);
  assert.match(pickerSource, /setHsv\(nextHsv\)/);
  assert.match(pickerSource, /accessibilityLabel=\{`\$\{props\.fieldLabel\} \$\{props\.label\.toLowerCase\(\)\} slider`\}/);
});

test("4. selected colors persist after save and reload", () => {
  const storage = new MemoryStorage();
  const colors = { mainColorHex: "#123456", highlightColorHex: "#abcdef", fontColorHex: "#fedcba" };
  writePatronCustomization(storage, "patron-a", "library-a", { appearance: colors });
  assert.deepEqual(readPatronCustomization(storage, "patron-a", "library-a").appearance, colors);
});

test("5. Use inherited color removes only that override", () => {
  const overrides = { mainColorHex: "#123456", highlightColorHex: "#abcdef", fontColorHex: "#fedcba" };
  const withoutMain = { ...overrides };
  delete withoutMain.mainColorHex;
  const effective = resolvePatronAppearance(inherited, withoutMain);
  assert.equal(effective.mainColorHex, inherited.mainColorHex);
  assert.equal(effective.highlightColorHex, overrides.highlightColorHex);
  assert.equal(effective.fontColorHex, overrides.fontColorHex);
  assert.match(pickerSource, />Use inherited</);
  assert.match(pageSource, /onUseInherited=\{\(\) => setAppearance\("mainColorHex"\)\}/);
});

test("6. poor font/background contrast produces a non-blocking warning", () => {
  assert.ok(colorContrastRatio("#777777", "#777777") < 4.5);
  assert.ok(colorContrastRatio("#ffffff", "#000000") >= 4.5);
  assert.match(pageSource, /fontMainContrast < 4\.5/);
  assert.match(pageSource, /Low contrast warning/);
  assert.match(pageSource, /You can still save this choice/);
});

test("7. patron colors do not modify librarian/default colors", () => {
  const storage = new MemoryStorage({
    lib_config_library_a: JSON.stringify({ branding: inherited }),
  });
  const before = storage.getItem("lib_config_library_a");
  writePatronCustomization(storage, "patron-a", "library-a", { appearance: { mainColorHex: "#123456" } });
  assert.equal(storage.getItem("lib_config_library_a"), before);
  assert.doesNotMatch(pageSource, /saveSharedLibraryConfig|lib_config_/);
});

test("8. another patron does not inherit personal color choices", () => {
  const storage = new MemoryStorage();
  writePatronCustomization(storage, "patron-a", "library-a", { appearance: { mainColorHex: "#123456" } });
  assert.equal(readPatronCustomization(storage, "patron-b", "library-a").appearance, undefined);
});

assert.match(pageSource, /ThemePreviewPanel/);
assert.match(pickerSource, /type="color"/);
assert.match(pickerSource, /style=\{styles\.hexInput\}/);
assert.match(pickerSource, /width: 34, height: 34/);
assert.match(pickerSource, /height: 8px/);
assert.match(pageSource, /preferenceRow: \{ width: "100%", maxWidth: "100%", minWidth: 0, minHeight: 46/);
assert.match(pickerSource, /compactHeader: \{ width: "100%", maxWidth: "100%", minWidth: 0/);
assert.match(pickerSource, /hexInput: \{ width: 78, maxWidth: 78, flexShrink: 1/);
assert.match(pickerSource, /touchAction: "none"/);
assert.match(pageSource, /directionalLockEnabled/);
assert.match(pageSource, /alwaysBounceHorizontal=\{false\}/);
assert.match(pageSource, /overscrollBehaviorX: "none"/);
assert.match(pageSource, /horizontal=\{false\}/);
assert.match(pageSource, /showsHorizontalScrollIndicator=\{false\}/);
assert.match(pageSource, /safe: \{ flex: 1, width: "100%", maxWidth: "100%", minWidth: 0/);
assert.match(pageSource, /section: \{ width: "100%", maxWidth: "100%", minWidth: 0/);
assert.match(previewSource, /width: "100%"[\s\S]*maxWidth: 400[\s\S]*minWidth: 0/);
process.stdout.write("\nPatron color picker regressions passed.\n");
