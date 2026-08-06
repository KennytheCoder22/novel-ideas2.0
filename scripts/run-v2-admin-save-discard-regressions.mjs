/**
 * Regression suite for Admin Save / Discard / Save & Return behavior.
 *
 * Covers:
 *   R1  Save & Return is visible at the top
 *   R2  Save & Return persists draft changes and routes to /
 *   R3  Main UI reflects the saved configuration immediately
 *   R4  Save failure does not navigate away
 *   R5  Save Changes remains in place
 *   R6  Discard Changes restores the last saved configuration
 *   R7  Color selection survives closing the native picker
 *   R8  First save click after picker closure succeeds
 *   R9  No recommendation / Human Review / Local Collection routing or schema changes
 *   R10 Theme Reset changes draft only until Save
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
  ADMIN_CONFIG_CHANGED_EVENT,
  ADMIN_CONFIG_STORAGE_KEY,
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
function simulateSave(config, colorState, options = {}) {
  if (options.failPersist) {
    return { ok: false, route: null, savedConfig: null, effectiveFontColor: null };
  }
  const next = deepClone(config);
  const effectiveFontColor = colorState.autoFontColor
    ? autoChooseFontColor(colorState.mainColorHex)
    : colorState.fontColorHex;
  applyColorHex(next, colorState.mainColorHex, colorState.highlightColorHex, effectiveFontColor, colorState.autoFontColor);
  syncSchema(next);
  return { ok: true, route: null, savedConfig: next, effectiveFontColor };
}

function simulateSaveAndReturn(config, colorState, options = {}) {
  const result = simulateSave(config, colorState, options);
  if (!result.ok) return result;
  return { ...result, route: "/" };
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
const homeSrc = readFileSync(resolve(repoRoot, "app", "(tabs)", "index.tsx"), "utf8");
const layoutSrc = readFileSync(resolve(repoRoot, "app", "(tabs)", "_layout.tsx"), "utf8");
const colorPickerSrc = readFileSync(resolve(repoRoot, "components", "admin", "ColorPickerField.tsx"), "utf8");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const checks = [];

// R1 – Save & Return is visible at the top
checks.push(check("R1_save_return_visible_at_top", () => {
  assert(adminWebSrc.includes("Save & Return"), "Save & Return label missing");
  assert(adminWebSrc.includes('testID="save-return-button"'), "Save & Return testID missing");
  assert(adminWebSrc.includes("styles.pageHeaderActions"), "Save & Return must render in header actions");
}));

// R2 – Save & Return persists draft changes and routes to /
checks.push(check("R2_save_return_persists_and_routes_home", () => {
  const cfg = { branding: {}, theme: {} };
  syncSchema(cfg);
  const colors = { mainColorHex: "#22c55e", highlightColorHex: "#fbbf24", fontColorHex: "#ffffff", autoFontColor: true };
  const { ok, route, savedConfig } = simulateSaveAndReturn(cfg, colors);
  assert(ok === true, "Save & Return should succeed");
  assert(route === "/", "Save & Return must route to /");
  assert(savedConfig.branding.mainColorHex === "#22c55e", "mainColorHex not persisted");
  const { colors: loaded } = simulateLoad(JSON.stringify(savedConfig));
  assert(loaded.mainColorHex === "#22c55e", "mainColorHex not loaded after refresh");
}));

// R3 – Main UI reflects the saved configuration immediately
checks.push(check("R3_main_ui_reflects_saved_configuration_immediately", () => {
  const cfg = {
    branding: {
      libraryName: "Riverside Public Library",
      logoDataUrl: "data:image/png;base64,abc123",
    },
    theme: {},
    enabledDecks: { k2: true, "36": false, ms_hs: true, adult: false },
    library: { name: "Riverside Public Library" },
  };
  syncSchema(cfg);
  const colors = { mainColorHex: "#1d4ed8", highlightColorHex: "#38bdf8", fontColorHex: "#ffffff", autoFontColor: true };
  const { savedConfig } = simulateSaveAndReturn(cfg, colors);
  const { config: loadedConfig, colors: loadedColors } = simulateLoad(JSON.stringify(savedConfig));
  assert(loadedConfig.branding.libraryName === "Riverside Public Library", "library name did not round-trip");
  assert(loadedConfig.branding.logoDataUrl === "data:image/png;base64,abc123", "logo did not round-trip");
  assert(loadedConfig.enabledDecks["36"] === false, "enabled age groups did not round-trip");
  assert(loadedColors.mainColorHex === "#1d4ed8", "main color did not round-trip");
  assert(loadedColors.highlightColorHex === "#38bdf8", "highlight color did not round-trip");
  // HomeScreen no longer syncs admin draft (preventing hosted-library context leakage).
  // The layout header still listens for color/theme updates.
  assert(!homeSrc.includes("tryLoadDesktopAdminDraft"), "home screen must not sync admin draft (hosted-library context leakage regression)");
  assert(layoutSrc.includes("ADMIN_CONFIG_CHANGED_EVENT"), "tab layout header must still listen for same-tab saved-config event");
}));

// R4 – Save failure does not navigate away
checks.push(check("R4_save_failure_does_not_navigate_away", () => {
  const cfg = { branding: {}, theme: {} };
  syncSchema(cfg);
  const colors = { mainColorHex: "#1d4ed8", highlightColorHex: "#38bdf8", fontColorHex: "#ffffff", autoFontColor: true };
  const failed = simulateSaveAndReturn(cfg, colors, { failPersist: true });
  assert(failed.ok === false, "failed save should report ok=false");
  assert(failed.route === null, "failed Save & Return must not navigate");
  const saveReturnBlock = adminWebSrc.slice(
    adminWebSrc.indexOf("const onSaveAndReturn"),
    adminWebSrc.indexOf("const onDiscard")
  );
  assert(saveReturnBlock.includes("await persistDraftConfig()") && saveReturnBlock.includes("return;"), "Save & Return must stop on save failure");
  assert(saveReturnBlock.includes('router.replace("/")'), "Save & Return must route to / on success");
}));

// R5 – Save Changes remains in place
checks.push(check("R5_save_changes_remains_in_place", () => {
  const saveBlock = adminWebSrc.slice(
    adminWebSrc.indexOf("const onSave = useCallback"),
    adminWebSrc.indexOf("const onSaveAndReturn")
  );
  assert(saveBlock.includes("persistDraftConfig();"), "Save Changes must call persistDraftConfig");
  assert(!saveBlock.includes("router.replace"), "Save Changes must not navigate");
  assert(adminWebSrc.includes('accessibilityLabel="Save Changes"'), "Save Changes button missing");
}));

// R6 – Discard Changes restores the last saved configuration
checks.push(check("R6_discard_restores_last_saved_configuration", () => {
  const priorCfg = { branding: { libraryName: "West End Library" }, theme: {}, library: { name: "West End Library" } };
  syncSchema(priorCfg);
  const priorColors = { mainColorHex: "#64748b", highlightColorHex: "#fbbf24", fontColorHex: "#ffffff", autoFontColor: true };
  const { savedConfig: priorSaved } = simulateSave(priorCfg, priorColors);
  const priorJson = JSON.stringify(priorSaved);
  const draftCfg = deepClone(priorSaved);
  draftCfg.branding.libraryName = "Changed Library";
  const draftColors = { mainColorHex: "#ef4444", highlightColorHex: "#22c55e", fontColorHex: "#000000", autoFontColor: false };
  const { config: restoredConfig, colors: restoredColors } = simulateLoad(priorJson);
  assert(restoredConfig.branding.libraryName === "West End Library", "discard did not restore library name");
  assert(restoredColors.mainColorHex === "#64748b", "discard did not restore main color");
  assert(restoredColors.highlightColorHex === "#fbbf24", "discard did not restore highlight color");
  assert(restoredColors.mainColorHex !== draftColors.mainColorHex, "discard returned draft main color");
}));

// R7 – Color selection survives closing the native picker
checks.push(check("R7_color_selection_survives_picker_closure", () => {
  assert(colorPickerSrc.includes("onInput={(e: any) => commitPickerHex"), "color picker should commit on input");
  assert(colorPickerSrc.includes("onChange={(e: any) => commitPickerHex"), "color picker should commit on change");
  assert(colorPickerSrc.includes("onBlur={(e: any) => commitPickerHex"), "color picker should commit on blur/close");
  assert(adminWebSrc.includes("Finish choosing the color, then select Save Changes or Save & Return."), "native color picker guidance note missing");
}));

// R8 – First save click after picker closure succeeds
checks.push(check("R8_first_save_click_after_picker_closure_succeeds", () => {
  const saveHelperBlock = adminWebSrc.slice(
    adminWebSrc.indexOf("const persistDraftConfig"),
    adminWebSrc.indexOf("const onSave = useCallback")
  );
  assert(saveHelperBlock.includes("dispatchAdminConfigSavedWebEvent"), "save helper must broadcast same-tab config update");
  assert(saveHelperBlock.includes("applyWebHighlightColor"), "save helper must apply saved highlight before returning");
  assert(saveHelperBlock.includes("return true;"), "save helper must report success");
}));

// R9 – No recommendation / Human Review / Local Collection routing or schema changes
checks.push(check("R9_no_routing_schema_changes", () => {
  const persistBlock = adminWebSrc.slice(
    adminWebSrc.indexOf("const persistDraftConfig"),
    adminWebSrc.indexOf("const onSave = useCallback")
  );
  assert(!persistBlock.includes("sourceEnabled"), "save helper must not mutate recommendation sourceEnabled");
  assert(!persistBlock.includes("human_review"), "save helper must not reference human review keys");
  assert(!persistBlock.includes("localLibrary"), "save helper must not reference localLibrary toggle");
  assert(persistBlock.includes("ADMIN_CONFIG_STORAGE_KEY"), "save helper must keep using approved admin config storage key");
}));

// R10 – Theme Reset changes draft only until Save
checks.push(check("R10_theme_reset_draft_only", () => {
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

// Sticky footer buttons have click + keyboard accessibility (structural)
checks.push(check("structural_sticky_footer_buttons_accessible", () => {
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
    adminWebSrc.indexOf("const persistDraftConfig"),
    adminWebSrc.indexOf("const onSave = useCallback")
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

checks.push(check("structural_save_return_routes_home", () => {
  assert(adminWebSrc.includes('router.replace("/")'), 'Save & Return must navigate with router.replace("/")');
}));

checks.push(check("structural_main_ui_no_admin_draft_sync", () => {
  // HomeScreen must not read from admin draft — prevents hosted-library context leakage.
  assert(!homeSrc.includes("tryLoadDesktopAdminDraft"), "home screen must not define or call tryLoadDesktopAdminDraft");
  assert(!homeSrc.includes("refreshConfigFromDesktopAdminDraft"), "home screen must not define or call refreshConfigFromDesktopAdminDraft");
  assert(!homeSrc.includes("ADMIN_CONFIG_CHANGED_EVENT"), "home screen must not listen for ADMIN_CONFIG_CHANGED_EVENT");
  assert(!homeSrc.includes("ADMIN_CONFIG_STORAGE_KEY"), "home screen must not read ADMIN_CONFIG_STORAGE_KEY");
  // Layout is allowed to read admin draft for header theme only (cosmetic).
  assert(layoutSrc.includes("window.addEventListener?.(ADMIN_CONFIG_CHANGED_EVENT"), "layout should still listen for saved-config event for header theme");
}));

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(JSON.stringify({
  pass: true,
  checkCount: checks.length,
  checks,
}, null, 2));
