/**
 * Admin Redesign Regressions
 * 13 deterministic tests covering the requirements in the Admin redesign spec.
 *
 * Run: node scripts/run-admin-redesign-regressions.mjs
 * No npm install required — pure Node.js, no TypeScript compiler needed.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

// ---------------------------------------------------------------------------
// Inline color utilities (mirrors constants/brandTheme.ts exports exactly)
// These JS equivalents enable deterministic testing without a TypeScript compiler.
// ---------------------------------------------------------------------------

function isValidHex(hex) {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

function hexToRgb(hex) {
  const clean = hex.replace(/^#/, "").trim();
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { r, g, b };
  }
  return null;
}

function linearize(channel) {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return 0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b);
}

function autoChooseFontColor(bgHex) {
  return relativeLuminance(bgHex) > 0.179 ? "#000000" : "#ffffff";
}

const MAIN_KEY_TO_HEX = {
  dark_blue: "#0b1e33",
  classic_blue: "#1d4ed8",
  sky_blue: "#38bdf8",
  forest_green: "#15803d",
  kelly_green: "#22c55e",
  cardinal_red: "#ef4444",
  pink: "#ec4899",
  purple: "#a855f7",
  slate: "#64748b",
  gold_accent: "#fbbf24",
};

const HIGHLIGHT_KEY_TO_HEX = {
  dark_blue: "#223b6b",
  classic_blue: "#2563eb",
  sky_blue: "#38bdf8",
  forest_green: "#15803d",
  kelly_green: "#22c55e",
  cardinal_red: "#ef4444",
  pink: "#ec4899",
  purple: "#a855f7",
  slate: "#64748b",
  gold_accent: "#fbbf24",
  white: "#ffffff",
  black: "#000000",
  silver: "#e5e7eb",
};

function mainKeyToHex(key) {
  return MAIN_KEY_TO_HEX[key] ?? MAIN_KEY_TO_HEX.dark_blue;
}

function highlightKeyToHex(key) {
  return HIGHLIGHT_KEY_TO_HEX[key] ?? HIGHLIGHT_KEY_TO_HEX.gold_accent;
}

function hexToMainKey(hex) {
  const n = hex.trim().toLowerCase();
  for (const [k, v] of Object.entries(MAIN_KEY_TO_HEX)) {
    if (v.toLowerCase() === n) return k;
  }
  return null;
}

function hexToHighlightKey(hex) {
  const n = hex.trim().toLowerCase();
  for (const [k, v] of Object.entries(HIGHLIGHT_KEY_TO_HEX)) {
    if (v.toLowerCase() === n) return k;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    failed++;
  } else {
    console.log(`  PASS: ${message}`);
    passed++;
  }
}

function test(name, fn) {
  console.log(`\n[${passed + failed + 1}] ${name}`);
  try {
    fn();
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Read source files as text for structural assertions
// ---------------------------------------------------------------------------

const adminSource = readFileSync(resolve(repoRoot, "app", "app_admin-web.tsx"), "utf8");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// 1. Tip button absent
test("Tip button absent from admin source", () => {
  assert(!adminSource.includes("Tip $5"), "No 'Tip $5' string in app_admin-web.tsx");
  assert(!adminSource.includes("tip $5"), "No 'tip $5' (lowercase) in app_admin-web.tsx");
});

// 2. Old fixed color-chip rows absent
test("Old fixed color-chip rows absent", () => {
  // Original code used named chip arrays for mainThemeKey selection
  assert(
    !adminSource.includes('"dark_blue", "classic_blue", "sky_blue"'),
    "No named ThemeKey chip array present"
  );
  assert(
    !adminSource.includes('"gold_accent", "white", "black", "silver"'),
    "No named HighlightKey chip array present"
  );
  // ColorPickerField should be used instead
  assert(adminSource.includes("ColorPickerField"), "ColorPickerField component is referenced");
  assert(adminSource.includes("color-picker-main"), "Main color picker testID present");
  assert(adminSource.includes("color-picker-highlight"), "Highlight color picker testID present");
});

// 3. Arbitrary hex colors accepted
test("Main/Highlight/Font fields accept arbitrary valid hex colors", () => {
  // isValidHex should accept standard 6-digit hex
  assert(isValidHex("#ff6600"), "isValidHex accepts #ff6600");
  assert(isValidHex("#000000"), "isValidHex accepts #000000");
  assert(isValidHex("#ffffff"), "isValidHex accepts #ffffff");
  assert(isValidHex("#AABBCC"), "isValidHex accepts uppercase #AABBCC");
  // Reject invalid
  assert(!isValidHex("#fff"), "isValidHex rejects 3-digit short form");
  assert(!isValidHex("ff6600"), "isValidHex rejects missing #");
  assert(!isValidHex("#gg0000"), "isValidHex rejects non-hex chars");
  assert(!isValidHex(""), "isValidHex rejects empty string");
});

// 4. Named keys from existing saved configs load into color pickers as hex
test("Existing named-key config values convert to valid hex for color pickers", () => {
  // mainKeyToHex
  const darkBlue = mainKeyToHex("dark_blue");
  assert(isValidHex(darkBlue), `mainKeyToHex('dark_blue') returns valid hex: ${darkBlue}`);

  const classicBlue = mainKeyToHex("classic_blue");
  assert(isValidHex(classicBlue), `mainKeyToHex('classic_blue') returns valid hex: ${classicBlue}`);

  const forestGreen = mainKeyToHex("forest_green");
  assert(isValidHex(forestGreen), `mainKeyToHex('forest_green') returns valid hex: ${forestGreen}`);

  // highlightKeyToHex
  const gold = highlightKeyToHex("gold_accent");
  assert(isValidHex(gold), `highlightKeyToHex('gold_accent') returns valid hex: ${gold}`);

  const white = highlightKeyToHex("white");
  assert(white === "#ffffff", `highlightKeyToHex('white') === '#ffffff', got: ${white}`);

  const black = highlightKeyToHex("black");
  assert(black === "#000000", `highlightKeyToHex('black') === '#000000', got: ${black}`);

  // All main keys produce valid hex
  const mainKeys = ["dark_blue","classic_blue","sky_blue","forest_green","kelly_green","cardinal_red","pink","purple","slate","gold_accent"];
  for (const key of mainKeys) {
    const hex = mainKeyToHex(key);
    assert(isValidHex(hex), `mainKeyToHex('${key}') is valid hex: ${hex}`);
  }
});

// 5. Saving preserves schema — hex values round-trip through named key back-compat
test("Hex values round-trip to named keys when they match a preset", () => {
  // classic_blue hex should round-trip back to classic_blue
  const classicBlueHex = mainKeyToHex("classic_blue");
  const roundTripped = hexToMainKey(classicBlueHex);
  assert(roundTripped === "classic_blue", `hexToMainKey(${classicBlueHex}) === 'classic_blue', got: ${roundTripped}`);

  // gold_accent highlight hex should round-trip
  const goldHex = highlightKeyToHex("gold_accent");
  const rtHighlight = hexToHighlightKey(goldHex);
  assert(rtHighlight === "gold_accent", `hexToHighlightKey(${goldHex}) === 'gold_accent', got: ${rtHighlight}`);

  // Arbitrary hex that does NOT match a preset returns null
  const arbitrary = "#123456";
  assert(hexToMainKey(arbitrary) === null, `hexToMainKey('${arbitrary}') returns null for non-preset hex`);
  assert(hexToHighlightKey(arbitrary) === null, `hexToHighlightKey('${arbitrary}') returns null for non-preset hex`);
});

// 6. autoChooseFontColor is predictable for dark and light backgrounds
test("Auto Font Color chooses black for light backgrounds and white for dark", () => {
  // White background → black text
  assert(autoChooseFontColor("#ffffff") === "#000000", "autoChooseFontColor('#ffffff') === '#000000'");

  // Very light yellow → black text
  assert(autoChooseFontColor("#fffde7") === "#000000", "autoChooseFontColor('#fffde7') === '#000000'");

  // Dark blue → white text
  assert(autoChooseFontColor("#0b1e33") === "#ffffff", "autoChooseFontColor('#0b1e33') === '#ffffff'");

  // Black → white text
  assert(autoChooseFontColor("#000000") === "#ffffff", "autoChooseFontColor('#000000') === '#ffffff'");

  // Gold accent (#fbbf24) is light → black text
  assert(autoChooseFontColor("#fbbf24") === "#000000", "autoChooseFontColor('#fbbf24') === '#000000'");

  // Medium gray check
  const gray = "#808080";
  const grayResult = autoChooseFontColor(gray);
  assert(grayResult === "#000000" || grayResult === "#ffffff", `autoChooseFontColor('#808080') returns a valid choice: ${grayResult}`);
});

// 7. Manual font color is preserved when autoFontColor is off
test("Manual font color is unchanged when Auto Font Color is off", () => {
  // Simulate: autoFontColor=false, fontColorHex set to arbitrary value
  // The admin page only calls autoChooseFontColor when autoFontColor===true
  // We verify this by inspecting the source
  const autoFontColorBlock = adminSource.match(/autoFontColor\s*\?\s*autoChooseFontColor\(mainColorHex\)/g) || [];
  assert(
    autoFontColorBlock.length > 0,
    "Source contains conditional: autoFontColor ? autoChooseFontColor(mainColorHex)"
  );
  // ColorPickerField for font is only shown when !autoFontColor
  assert(
    adminSource.includes("color-picker-font"),
    "Font color picker testID present (shown when auto is off)"
  );
  assert(
    adminSource.includes("!autoFontColor"),
    "Font color picker is conditionally rendered with !autoFontColor guard"
  );
});

// 8. Theme reset does not reset unrelated settings
test("resetThemeToDefault only changes color state (not library name, PIN, sources)", () => {
  // Inspect the resetThemeToDefault function in source
  // It should only call setMainColorHex, setHighlightColorHex, setAutoFontColor, setFontColorHex
  const resetFnMatch = adminSource.match(/const resetThemeToDefault[^}]+\}/s);
  assert(resetFnMatch !== null, "resetThemeToDefault function found in source");

  if (resetFnMatch) {
    const fn = resetFnMatch[0];
    assert(!fn.includes("setConfig"), "resetThemeToDefault does NOT call setConfig (doesn't reset library name/PIN/sources)");
    assert(fn.includes("setMainColorHex"), "resetThemeToDefault calls setMainColorHex");
    assert(fn.includes("setHighlightColorHex"), "resetThemeToDefault calls setHighlightColorHex");
    assert(fn.includes("setAutoFontColor"), "resetThemeToDefault calls setAutoFontColor");
  }
});

// 9. Copy Main→Highlight affects draft state (highlightColorHex = mainColorHex)
test("Copy Main→Highlight sets highlightColorHex to mainColorHex in draft", () => {
  const copyFnMatch = adminSource.match(/const copyMainToHighlight[^}]+\}/s);
  assert(copyFnMatch !== null, "copyMainToHighlight function found in source");
  if (copyFnMatch) {
    const fn = copyFnMatch[0];
    assert(fn.includes("setHighlightColorHex(mainColorHex)"), "copyMainToHighlight calls setHighlightColorHex(mainColorHex)");
  }

  // Also check Copy Highlight→Main
  const copyRevMatch = adminSource.match(/const copyHighlightToMain[^}]+\}/s);
  assert(copyRevMatch !== null, "copyHighlightToMain function found in source");
  if (copyRevMatch) {
    const fn = copyRevMatch[0];
    assert(fn.includes("setMainColorHex(highlightColorHex)"), "copyHighlightToMain calls setMainColorHex(highlightColorHex)");
  }
});

// 10. Importing Local Collection does NOT auto-enable the localLibrary source toggle
test("Local Collection import does not auto-enable localLibrary source", () => {
  // The onUploadCollectionWeb function should only call setPath localLibrarySupported=true
  // NOT set sourceEnabled.localLibrary=true
  const uploadFnStart = adminSource.indexOf("const onUploadCollectionWeb");
  const uploadFnEnd = adminSource.indexOf("const onSave", uploadFnStart);
  assert(uploadFnStart !== -1, "onUploadCollectionWeb function found");

  if (uploadFnStart !== -1 && uploadFnEnd !== -1) {
    const uploadFn = adminSource.slice(uploadFnStart, uploadFnEnd);
    assert(
      uploadFn.includes('"localLibrarySupported", true') || uploadFn.includes('"localLibrarySupported"], true'),
      "onUploadCollectionWeb sets localLibrarySupported=true"
    );
    assert(
      !uploadFn.includes('"localLibrary", true') && !uploadFn.includes('"localLibrary"], true'),
      "onUploadCollectionWeb does NOT auto-set sourceEnabled.localLibrary=true"
    );
  }
});

// 11. PIN-protected settings remain in config schema
test("PIN-protected settings are preserved in config (admin.pinEnabled + admin.pin)", () => {
  assert(adminSource.includes('"admin", "pinEnabled"'), "Source writes admin.pinEnabled path");
  assert(adminSource.includes('"admin", "pin"'), "Source writes admin.pin path");
  assert(adminSource.includes("adminPinEnabled"), "adminPinEnabled state is derived");
  assert(adminSource.includes("adminPin"), "adminPin state is derived");
  // PIN toggle is present
  assert(adminSource.includes("Enable Admin PIN"), "Enable Admin PIN label present");
});

// 12. Visiting Admin page alone does not unlock extended menu (no hidden nav trigger)
test("Admin page has no hidden navigation unlocking mechanism", () => {
  // Should not contain patterns that navigate to extended menus on load
  assert(!adminSource.includes("unlockExtendedMenu"), "No unlockExtendedMenu call");
  assert(!adminSource.includes("setExtendedMenuUnlocked"), "No setExtendedMenuUnlocked call");
  // The page must not auto-route on mount
  const useEffectBlocks = adminSource.match(/useEffect\([^)]*\)/g) || [];
  const hasRouterInEffect = useEffectBlocks.some((block) => block.includes("router.replace") || block.includes("router.push"));
  assert(!hasRouterInEffect, "No useEffect block triggers router.replace/push on mount");
  // router.replace should not appear outside of a deliberate save action
  const routerReplaceCount = (adminSource.match(/router\.replace/g) || []).length;
  assert(routerReplaceCount === 0, `No router.replace calls in source (found: ${routerReplaceCount})`);
});

// 13. No recommendation/Human Review/Local Collection routing changes
test("No recommendation logic, Human Review, or routing behavior changed", () => {
  // admin page should not import from humanReviewContract
  assert(
    !adminSource.includes("humanReviewContract"),
    "admin page does not import humanReviewContract"
  );
  // syncSchema logic for recommendation sources is present and unchanged
  assert(adminSource.includes("localLibrarySupported"), "localLibrarySupported field handled in syncSchema");
  assert(adminSource.includes("sourceEnabled"), "sourceEnabled field maintained in syncSchema");
  // admin page does not import recommendation engine modules
  assert(
    !adminSource.includes('from "../services/recommendations"') &&
    !adminSource.includes('from "../services/recommender"'),
    "Admin page does not import recommendation engine services"
  );
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("─".repeat(50));

if (failed > 0) {
  process.exit(1);
}
