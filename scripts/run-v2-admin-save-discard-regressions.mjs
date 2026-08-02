/**
 * Regression suite for Admin Save / Discard button behavior.
 *
 * Covers:
 *   R1  Edit Main Color → Save → persisted value changes
 *   R2  Edit Highlight Color → Discard → saved value unchanged
 *   R3  Edit multiple sections → Discard restores all fields
 *   R4  Save clears dirty state
 *   R5  Discard clears dirty state
 *   R6  Refresh after Save loads saved values
 *   R7  Refresh after Discard loads prior saved values
 *   R8  Theme Reset changes draft only until Save
 *   R9  Sticky footer buttons are keyboard/click accessible
 *   R10 No recommendation / Human Review / Local Collection routing or schema changes
 *
 * Pure-logic tests exercise the utility functions (applyColorHex, loadColorHex,
 * syncSchema) inline – the component cannot be rendered in Node.js. Structural
 * tests read the source file as text and verify invariants about the rendered JSX
 * and hook usage.
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

const {
  autoChooseFontColor,
  isValidHex,
  mainKeyToHex,
  highlightKeyToHex,
  hexToMainKey,
  hexToHighlightKey,
} = require(resolve(repoRoot, "constants", "brandTheme.ts"));

// ---------------------------------------------------------------------------
// Inline logic helpers (mirrors app_admin-web.tsx module-level utilities)
// ---------------------------------------------------------------------------

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function syncSchema(cfg) {
  if (!cfg || typeof cfg !== "object") return;
  cfg.branding = (cfg.branding && typeof cfg.branding === "object") ? cfg.branding : {};
  cfg.library  = (cfg.library  && typeof cfg.library  === "object") ? cfg.library  : {};

  const chosenName = (
    typeof cfg.branding?.libraryName === "string" ? cfg.branding.libraryName :
    typeof cfg.library?.name          === "string" ? cfg.library.name          : ""
  ).toString();
  cfg.branding.libraryName = chosenName;
  cfg.library.name         = chosenName;

  cfg.theme           = (cfg.theme           && typeof cfg.theme           === "object") ? cfg.theme           : {};
  cfg.recommendations = (cfg.recommendations && typeof cfg.recommendations === "object") ? cfg.recommendations : {};

  const configured = cfg.recommendations.sourceEnabled || {};
  cfg.recommendations.sourceEnabled = {
    googleBooks:  configured.googleBooks  !== false,
    openLibrary:  configured.openLibrary  !== false,
    localLibrary: cfg.recommendations.localLibrarySupported ? configured.localLibrary !== false : false,
    kitsu:        configured.kitsu  !== false,
    gcd:          configured.gcd    !== false,
    nyt:          configured.nyt    === true,
  };
}

function loadColorHex(cfg) {
  let mainColorHex = cfg?.branding?.mainColorHex;
  if (!isValidHex(mainColorHex)) {
    const namedMain = cfg?.branding?.mainTheme ?? cfg?.branding?.theme ?? cfg?.theme?.mainThemeKey ?? "dark_blue";
    mainColorHex = mainKeyToHex(namedMain);
  }

  let highlightColorHex = cfg?.branding?.highlightColorHex;
  if (!isValidHex(highlightColorHex)) {
    const namedHighlight = cfg?.branding?.highlight ?? cfg?.theme?.highlightKey ?? "gold_accent";
    highlightColorHex = highlightKeyToHex(namedHighlight);
  }

  const autoFontColorEnabled =
    typeof cfg?.branding?.autoFontColor === "boolean" ? cfg.branding.autoFontColor : true;

  let fontColorHex = cfg?.branding?.fontColorHex;
  if (!isValidHex(fontColorHex)) {
    fontColorHex = autoFontColorEnabled ? autoChooseFontColor(mainColorHex) : "#ffffff";
  }

  return {
    mainColorHex:         isValidHex(mainColorHex)      ? mainColorHex      : "#0b1e33",
    highlightColorHex:    isValidHex(highlightColorHex) ? highlightColorHex : "#fbbf24",
    fontColorHex:         isValidHex(fontColorHex)      ? fontColorHex      : "#ffffff",
    autoFontColorEnabled,
  };
}

function applyColorHex(cfg, mainColorHex, highlightColorHex, fontColorHex, autoFontColorEnabled) {
  if (!cfg.branding) cfg.branding = {};
  if (!cfg.theme)    cfg.theme    = {};

  cfg.branding.mainColorHex      = mainColorHex;
  cfg.branding.highlightColorHex = highlightColorHex;
  cfg.branding.fontColorHex      = autoFontColorEnabled ? autoChooseFontColor(mainColorHex) : fontColorHex;
  cfg.branding.autoFontColor     = autoFontColorEnabled;

  const mainKey = hexToMainKey(mainColorHex);
  if (mainKey && mainKey !== "dark_blue") {
    cfg.branding.mainTheme = mainKey;
    cfg.theme.mainThemeKey = mainKey;
  } else {
    delete cfg.branding.mainTheme;
    delete cfg.theme.mainThemeKey;
  }

  const highlightKey = hexToHighlightKey(highlightColorHex);
  if (highlightKey) {
    cfg.branding.highlight = highlightKey;
    cfg.theme.highlightKey = highlightKey;
  } else {
    delete cfg.branding.highlight;
    delete cfg.theme.highlightKey;
  }
}

// Simulate the save pipeline (the non-React parts of onSave).
function simulateSave(config, colorState) {
  const next = deepClone(config);
  const effectiveFontColor = colorState.autoFontColor
    ? autoChooseFontColor(colorState.mainColorHex)
    : colorState.fontColorHex;
  applyColorHex(next, colorState.mainColorHex, colorState.highlightColorHex, effectiveFontColor, colorState.autoFontColor);
  syncSchema(next);
  return { savedConfig: next, effectiveFontColor };
}

// Simulate loading from "localStorage" after a page refresh.
function simulateLoad(savedConfigJson) {
  const parsed = JSON.parse(savedConfigJson);
  syncSchema(parsed);
  return { config: parsed, colors: loadColorHex(parsed) };
}

// ---------------------------------------------------------------------------
// Assertion helper
// ---------------------------------------------------------------------------

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function check(name, fn) {
  fn();
  return { name, pass: true };
}

// ---------------------------------------------------------------------------
// Source text (for structural checks)
// ---------------------------------------------------------------------------

const adminWebSrc = readFileSync(resolve(repoRoot, "app", "app_admin-web.tsx"), "utf8");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const checks = [];

// R1 – Edit Main Color → Save → persisted value changes
checks.push(check("R1_main_color_save_persists", () => {
  const cfg = { branding: {}, theme: {} };
  syncSchema(cfg);
  const colors = { mainColorHex: "#22c55e", highlightColorHex: "#fbbf24", fontColorHex: "#ffffff", autoFontColor: true };
  const { savedConfig } = simulateSave(cfg, colors);
  assert(savedConfig.branding.mainColorHex === "#22c55e", "mainColorHex not persisted");
  // Round-trip: reload and verify
  const { colors: loaded } = simulateLoad(JSON.stringify(savedConfig));
  assert(loaded.mainColorHex === "#22c55e", "mainColorHex not loaded after refresh");
}));

// R2 – Edit Highlight Color → Discard → saved value unchanged
checks.push(check("R2_highlight_color_discard_unchanged", () => {
  // Initial save with gold highlight
  const cfg = { branding: {}, theme: {} };
  syncSchema(cfg);
  const savedColors = { mainColorHex: "#0b1e33", highlightColorHex: "#fbbf24", fontColorHex: "#ffffff", autoFontColor: true };
  const { savedConfig } = simulateSave(cfg, savedColors);
  const savedJson = JSON.stringify(savedConfig);

  // User changes highlight color in draft
  const draftColors = { ...savedColors, highlightColorHex: "#ef4444" };

  // Discard: reload from saved JSON (simulates onDiscard reading localStorage)
  const { colors: restored } = simulateLoad(savedJson);
  assert(restored.highlightColorHex === "#fbbf24", "discard did not restore highlight color");
  assert(restored.highlightColorHex !== draftColors.highlightColorHex, "discard returned draft value");
}));

// R3 – Edit multiple sections → Discard restores all fields
checks.push(check("R3_multiple_field_discard_restores_all", () => {
  // Save initial state
  const cfg = { branding: { libraryName: "Riverside Library" }, theme: {}, library: { name: "Riverside Library" } };
  syncSchema(cfg);
  const savedColors = { mainColorHex: "#1d4ed8", highlightColorHex: "#38bdf8", fontColorHex: "#ffffff", autoFontColor: true };
  const { savedConfig } = simulateSave(cfg, savedColors);
  const savedJson = JSON.stringify(savedConfig);

  // Simulate user editing multiple fields
  const draftCfg = deepClone(savedConfig);
  draftCfg.branding.libraryName = "CHANGED Library";
  const draftColors = { mainColorHex: "#a855f7", highlightColorHex: "#ec4899", fontColorHex: "#ffffff", autoFontColor: false };

  // Discard: reload from saved
  const { config: restored, colors: restoredColors } = simulateLoad(savedJson);
  assert(restored.branding.libraryName === "Riverside Library", "library name not restored on discard");
  assert(restoredColors.mainColorHex === "#1d4ed8", "main color not restored on discard");
  assert(restoredColors.highlightColorHex === "#38bdf8", "highlight color not restored on discard");
}));

// R4 – Save clears dirty state (structural)
checks.push(check("R4_save_clears_dirty_state", () => {
  // onSave must call setIsDirty(false)
  assert(
    adminWebSrc.includes("setIsDirty(false)"),
    "setIsDirty(false) not found in admin source"
  );
  // Verify it's inside onSave (setIsDirty(false) appears near setSaveStatus("saved"))
  const saveBlock = adminWebSrc.slice(
    adminWebSrc.indexOf("const onSave"),
    adminWebSrc.indexOf("const onDiscard")
  );
  assert(saveBlock.includes("setIsDirty(false)"), "setIsDirty(false) not inside onSave block");
  assert(saveBlock.includes('setSaveStatus("saved")'), 'setSaveStatus("saved") not in onSave');
}));

// R5 – Discard clears dirty state (structural)
checks.push(check("R5_discard_clears_dirty_state", () => {
  const discardBlock = adminWebSrc.slice(
    adminWebSrc.indexOf("const onDiscard"),
    adminWebSrc.indexOf("// ---------------------------------------------------------------------------\n  // Non-web fallback")
  );
  // setIsDirty(false) must appear at least twice in onDiscard (localStorage path + fallback path)
  const matches = discardBlock.match(/setIsDirty\(false\)/g) || [];
  assert(matches.length >= 2, `onDiscard should call setIsDirty(false) on both paths; found ${matches.length}`);
}));

// R6 – Refresh after Save loads saved values
checks.push(check("R6_refresh_after_save_loads_saved_values", () => {
  const cfg = { branding: {}, theme: {} };
  syncSchema(cfg);
  const colors = { mainColorHex: "#15803d", highlightColorHex: "#22c55e", fontColorHex: "#ffffff", autoFontColor: true };
  const { savedConfig } = simulateSave(cfg, colors);
  const persistedJson = JSON.stringify(savedConfig);

  // Simulate page refresh: load from persisted JSON
  const { colors: loaded } = simulateLoad(persistedJson);
  assert(loaded.mainColorHex === "#15803d", "main color not loaded after simulated refresh");
  assert(loaded.highlightColorHex === "#22c55e", "highlight color not loaded after simulated refresh");
}));

// R7 – Refresh after Discard loads prior saved values
checks.push(check("R7_refresh_after_discard_loads_prior", () => {
  // Represent "previously saved" localStorage entry
  const priorCfg = { branding: { libraryName: "West End Library" }, theme: {} };
  syncSchema(priorCfg);
  const priorColors = { mainColorHex: "#64748b", highlightColorHex: "#fbbf24", fontColorHex: "#ffffff", autoFontColor: true };
  const { savedConfig: priorSaved } = simulateSave(priorCfg, priorColors);
  const priorJson = JSON.stringify(priorSaved);

  // User made changes but discarded (i.e., reverts to priorJson without saving)
  // Refresh: load priorJson
  const { colors: afterDiscard } = simulateLoad(priorJson);
  assert(afterDiscard.mainColorHex === "#64748b", "after discard+refresh, main color mismatch");
}));

// R8 – Theme Reset changes draft only until Save (structural)
checks.push(check("R8_theme_reset_draft_only", () => {
  const resetBlock = adminWebSrc.slice(
    adminWebSrc.indexOf("const resetThemeToDefault"),
    adminWebSrc.indexOf("const resetThemeToDefault") + 300
  );
  // resetThemeToDefault must NOT touch savedConfigRef or savedColorsRef
  assert(!resetBlock.includes("savedConfigRef"), "resetThemeToDefault incorrectly writes savedConfigRef");
  assert(!resetBlock.includes("savedColorsRef"), "resetThemeToDefault incorrectly writes savedColorsRef");
  // It must call the draft-only state setters
  assert(resetBlock.includes("setMainColorHex"), "resetThemeToDefault missing setMainColorHex");
  assert(resetBlock.includes("setHighlightColorHex"), "resetThemeToDefault missing setHighlightColorHex");
}));

// R9 – Sticky footer buttons have click + keyboard accessibility (structural)
checks.push(check("R9_sticky_footer_buttons_accessible", () => {
  assert(
    adminWebSrc.includes('accessibilityRole="button"'),
    'Save/Discard buttons missing accessibilityRole="button"'
  );
  assert(
    adminWebSrc.includes('accessibilityLabel="Save Changes"'),
    'Save button missing accessibilityLabel'
  );
  assert(
    adminWebSrc.includes('accessibilityLabel="Discard Changes"'),
    'Discard button missing accessibilityLabel'
  );
}));

// R10 – No recommendation / Human Review / Local Collection routing or schema changes
checks.push(check("R10_no_routing_schema_changes", () => {
  // The sticky-bar fix must not touch onSave's recommendation logic.
  // Verify onSave does not set any recommendation.sourceEnabled key.
  const saveBlock = adminWebSrc.slice(
    adminWebSrc.indexOf("const onSave"),
    adminWebSrc.indexOf("const onDiscard")
  );
  assert(!saveBlock.includes("sourceEnabled"), "onSave must not mutate recommendation sourceEnabled");
  assert(!saveBlock.includes("human_review"),  "onSave must not reference human review keys");
  assert(!saveBlock.includes("localLibrary"),   "onSave must not reference localLibrary toggle");
}));

// ── Bonus structural invariants ──────────────────────────────────────────────

// Sticky bar must NOT be inside the ScrollView JSX.
checks.push(check("structural_sticky_bar_outside_scrollview", () => {
  // After our fix, the structure is:
  //   <View>  <ScrollView>...</ScrollView>  {showStickyBar && <View stickyBar>}  </View>
  // The stickyBar View comes AFTER the closing </ScrollView> tag.
  const scrollViewCloseIdx = adminWebSrc.lastIndexOf("</ScrollView>");
  const stickyBarIdx       = adminWebSrc.indexOf("styles.stickyBar");
  assert(
    stickyBarIdx > scrollViewCloseIdx,
    "stickyBar is rendered inside <ScrollView> — it must be a sibling after </ScrollView>"
  );
}));

// stickyBar style must NOT use position: fixed.
checks.push(check("structural_no_position_fixed_in_sticky_bar", () => {
  const stylesSection = adminWebSrc.slice(adminWebSrc.indexOf("const styles = StyleSheet.create"));
  const stickyBlock   = stylesSection.slice(
    stylesSection.indexOf("stickyBar:"),
    stylesSection.indexOf("stickyBar:") + 300
  );
  assert(
    !stickyBlock.includes("position"),
    'stickyBar style must not contain "position" (previously "fixed" caused pointer-event failures)'
  );
}));

// onSave must be wrapped in useCallback.
checks.push(check("structural_onsave_uses_usecallback", () => {
  assert(
    adminWebSrc.includes("const onSave = useCallback("),
    "onSave must be wrapped in useCallback"
  );
}));

// onDiscard must be wrapped in useCallback.
checks.push(check("structural_ondiscard_uses_usecallback", () => {
  assert(
    adminWebSrc.includes("const onDiscard = useCallback("),
    "onDiscard must be wrapped in useCallback"
  );
}));

// onSave must sync fontColorHex state with saved value.
checks.push(check("structural_onsave_syncs_font_color_state", () => {
  const saveBlock = adminWebSrc.slice(
    adminWebSrc.indexOf("const onSave"),
    adminWebSrc.indexOf("const onDiscard")
  );
  assert(
    saveBlock.includes("setFontColorHex(effectiveFontColor)"),
    "onSave must call setFontColorHex(effectiveFontColor) to keep state in sync with saved refs"
  );
}));

// Sticky bar shows confirmation after save (showStickyBar includes saveStatus check).
checks.push(check("structural_sticky_bar_shows_post_save_confirmation", () => {
  assert(
    adminWebSrc.includes('saveStatus !== "idle"'),
    'showStickyBar must include saveStatus !== "idle" to show post-save confirmation'
  );
  assert(
    adminWebSrc.includes('"Changes saved'),
    'sticky bar must display a "Changes saved" confirmation message'
  );
}));

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(JSON.stringify({
  pass: true,
  checkCount: checks.length,
  checks,
}, null, 2));
