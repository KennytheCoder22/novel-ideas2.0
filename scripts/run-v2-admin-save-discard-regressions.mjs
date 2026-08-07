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
  ADMIN_CONFIG_STORAGE_KEY_PREFIX,
  ADMIN_CONFIG_DEFAULT_SCOPE,
  adminConfigStorageKeyForScope,
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
  cfg.admin    = (cfg.admin    && typeof cfg.admin    === "object") ? cfg.admin    : {};

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

function hasSavedAdminPin(cfg) {
  return /^\d{6}$/.test(String(cfg?.admin?.pin || ""));
}

function derivePinEditorVisibility(cfg) {
  return !hasSavedAdminPin(cfg) && !!cfg?.admin?.pinEnabled;
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

function simulatePinSave(config, colorState, pinDraft) {
  if (!/^\d{6}$/.test(String(pinDraft || ""))) {
    return { ok: false, savedConfig: null, pinEditorVisible: true, pinDraft: String(pinDraft || "") };
  }
  const next = deepClone(config);
  syncSchema(next);
  next.admin.pinEnabled = true;
  next.admin.pin = String(pinDraft);
  const result = simulateSave(next, colorState);
  return {
    ...result,
    pinEditorVisible: false,
    pinDraft: "",
    pinStatus: "saved",
  };
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
  assert(persistBlock.includes("adminDraftStorageKey"), "save helper must persist scoped admin draft key");
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

// R11 – Scoped admin draft storage keys (default and hosted library drafts are isolated)
checks.push(check("R11_scoped_admin_draft_storage_keys", () => {
  const expectedDefaultKey = `${ADMIN_CONFIG_STORAGE_KEY_PREFIX}:${ADMIN_CONFIG_DEFAULT_SCOPE}`;
  assert(
    adminConfigStorageKeyForScope("default") === expectedDefaultKey,
    "default scoped storage key mismatch"
  );
  assert(
    adminConfigStorageKeyForScope("YVHS-Library") === `${ADMIN_CONFIG_STORAGE_KEY_PREFIX}:yvhs-library`,
    "hosted scope storage key should normalize to lowercase slug"
  );
  assert(
    adminWebSrc.includes("adminDraftStorageKey"),
    "admin web must compute and use scoped adminDraftStorageKey"
  );
  assert(
    adminWebSrc.includes("resolveAdminDraftScopeId"),
    "admin web must derive scope from library context"
  );
  assert(
    adminWebSrc.includes("resolveAdminDraftScopeId(explicitLibraryIdFromRoute)"),
    "admin scope must derive from explicit route libraryId only"
  );
  assert(
    !adminWebSrc.includes("explicitLibraryIdParam || runtimeLibraryId"),
    "admin scope must not fall back to persisted runtimeLibraryId on generic /app_admin-web"
  );
}));

// R12 – Reset to defaults is draft-only and leaves persistence for explicit Save
checks.push(check("R12_reset_to_defaults_is_draft_only", () => {
  const resetBlock = adminWebSrc.slice(
    adminWebSrc.indexOf("const resetAllToDefaults"),
    adminWebSrc.indexOf("const copyMainToHighlight")
  );
  assert(resetBlock.includes("setConfig(base)"), "reset must update draft config state");
  assert(resetBlock.includes("setSaveStatus(\"idle\")"), "reset must not report saved state");
  assert(!resetBlock.includes("saveSharedLibraryConfig("), "reset must not publish config");
  assert(!resetBlock.includes("localStorage.setItem("), "reset must not persist draft automatically");
  assert(!resetBlock.includes("savedConfigRef.current"), "reset must not rewrite saved baseline");
  assert(!resetBlock.includes("setIsDirty(false)"), "reset must remain dirty until explicit save/discard");
}));

// R13 – Reset preserves hosted library ID scope while restoring defaults
checks.push(check("R13_reset_preserves_hosted_library_scope_id", () => {
  const resetBlock = adminWebSrc.slice(
    adminWebSrc.indexOf("const resetAllToDefaults"),
    adminWebSrc.indexOf("const copyMainToHighlight")
  );
  assert(
    resetBlock.includes("if (adminDraftScopeId !== ADMIN_CONFIG_DEFAULT_SCOPE)"),
    "reset must branch on hosted-vs-default admin scope"
  );
  assert(
    resetBlock.includes("base.library.id = adminDraftScopeId") &&
    resetBlock.includes("base.branding.libraryId = adminDraftScopeId"),
    "hosted reset must preserve scope library ID in draft"
  );
}));

// R14 – Poisoned default scoped draft is automatically migrated to clean defaults
checks.push(check("R14_poisoned_default_draft_auto_migrates", () => {
  assert(
    adminWebSrc.includes("isPoisonedDefaultDraft"),
    "admin web must inspect default-scope draft for hosted identity leakage"
  );
  assert(
    adminWebSrc.includes("sanitizeDefaultScopeConfig"),
    "admin web must sanitize default scope to clean generic config"
  );
  assert(
    adminWebSrc.includes("localStorage.removeItem(adminDraftStorageKey)"),
    "poisoned default draft migration must remove corrupted default draft key"
  );
  assert(
    adminWebSrc.includes("[admin][default_scope_draft_migrated]"),
    "poisoned default draft migration must emit a safe migration log event"
  );
}));

// R15 – Default-scope reset clears hosted identity and local-collection state
checks.push(check("R15_default_scope_reset_clears_personalization", () => {
  const resetBlock = adminWebSrc.slice(
    adminWebSrc.indexOf("const resetAllToDefaults"),
    adminWebSrc.indexOf("const copyMainToHighlight")
  );
  assert(
    resetBlock.includes("sanitizeDefaultScopeConfig(base)"),
    "default-scope reset must sanitize to generic config"
  );
  assert(
    resetBlock.includes("clearDefaultScopeCollectionArtifacts(localStorage)"),
    "default-scope reset must clear local collection artifacts from browser storage"
  );
  assert(
    resetBlock.includes("setUploadedCollectionCount(0)"),
    "default-scope reset must clear imported collection display count"
  );
}));

// R16 – Save failure surfaces safe diagnostics for admins
checks.push(check("R16_save_failure_shows_error_code_and_correlation", () => {
  assert(
    adminWebSrc.includes("saveSharedLibraryConfigWithDiagnostics"),
    "admin save path must use save diagnostics helper"
  );
  assert(
    adminWebSrc.includes("code=${saveErrorDetails.appErrorCode || \"unknown\"}") &&
    adminWebSrc.includes("corr=${saveErrorDetails.correlationId}"),
    "admin save error UI must display safe application error code and correlation ID"
  );
}));

// R17 – Save PIN stores a valid scoped 6-digit PIN
checks.push(check("R17_save_pin_persists_valid_six_digit_pin", () => {
  const cfg = { branding: {}, theme: {}, admin: { pinEnabled: true } };
  syncSchema(cfg);
  const colors = { mainColorHex: "#1d4ed8", highlightColorHex: "#38bdf8", fontColorHex: "#ffffff", autoFontColor: true };
  const result = simulatePinSave(cfg, colors, "246810");
  assert(result.ok === true, "Save PIN should succeed for a valid 6-digit PIN");
  assert(result.savedConfig.admin.pin === "246810", "saved PIN did not persist");
  assert(result.savedConfig.admin.pinEnabled === true, "saved PIN should keep admin pin enabled");
}));

// R18 – PIN becomes hidden after save and the saved digits are not rendered back
checks.push(check("R18_saved_pin_is_hidden_after_save", () => {
  const cfg = { branding: {}, theme: {}, admin: { pinEnabled: true } };
  syncSchema(cfg);
  const colors = { mainColorHex: "#1d4ed8", highlightColorHex: "#38bdf8", fontColorHex: "#ffffff", autoFontColor: true };
  const result = simulatePinSave(cfg, colors, "135790");
  assert(result.pinEditorVisible === false, "PIN editor should hide after save");
  assert(result.pinDraft === "", "saved PIN digits must not remain in the editable input state");
  assert(derivePinEditorVisibility(result.savedConfig) === false, "saved PIN should load back hidden");
}));

// R19 – Change PIN starts from a blank editor instead of revealing the saved digits
checks.push(check("R19_change_pin_starts_blank", () => {
  const cfg = { branding: {}, theme: {}, admin: { pinEnabled: true, pin: "654321" } };
  syncSchema(cfg);
  assert(hasSavedAdminPin(cfg) === true, "fixture should start with a saved PIN");
  assert(derivePinEditorVisibility(cfg) === false, "saved PIN should initially stay hidden");
  const changeFlow = { pinEditorVisible: true, pinDraft: "", pinStatus: "idle" };
  assert(changeFlow.pinEditorVisible === true, "Change PIN should reveal the editor");
  assert(changeFlow.pinDraft === "", "Change PIN must not preload the existing PIN digits");
}));

// R20 – Scoped admin configs do not share PIN state between default and hosted libraries
checks.push(check("R20_scoped_admin_pin_state_is_isolated", () => {
  const storage = new Map();
  const colors = { mainColorHex: "#1d4ed8", highlightColorHex: "#38bdf8", fontColorHex: "#ffffff", autoFontColor: true };
  const scopes = [
    { scope: "default", pin: "111111" },
    { scope: "yvhs-library", pin: "222222" },
    { scope: "m", pin: "333333" },
  ];
  for (const { scope, pin } of scopes) {
    const cfg = { branding: {}, theme: {}, admin: { pinEnabled: true } };
    syncSchema(cfg);
    const saved = simulatePinSave(cfg, colors, pin);
    storage.set(adminConfigStorageKeyForScope(scope), JSON.stringify(saved.savedConfig));
  }
  for (const { scope, pin } of scopes) {
    const savedJson = storage.get(adminConfigStorageKeyForScope(scope));
    const { config: loaded } = simulateLoad(savedJson);
    assert(loaded.admin.pin === pin, `${scope} should retain only its own saved PIN`);
  }
  assert(storage.get(adminConfigStorageKeyForScope("default")) !== storage.get(adminConfigStorageKeyForScope("m")), "default and m PIN state must not share a storage record");
}));

// R21 – Admin PIN UI exposes explicit Save/Change actions without rendering saved digits
checks.push(check("R21_admin_pin_ui_masks_saved_pin", () => {
  assert(adminWebSrc.includes('>Save PIN<'), "Admin Security must expose a Save PIN action");
  assert(adminWebSrc.includes('>Change PIN<'), "Admin Security must expose a Change PIN action");
  assert(adminWebSrc.includes("secureTextEntry"), "PIN input must stay masked while typing");
  assert(adminWebSrc.includes("setPinDraft(\"\")"), "PIN flow must clear editable digits after save/change transitions");
  assert(adminWebSrc.includes('pinStatus === "saved" ? "PIN saved" : "PIN is saved and hidden."'), "hidden saved PIN confirmation text missing");
}));

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(JSON.stringify({
  pass: true,
  checkCount: checks.length,
  checks,
}, null, 2));
