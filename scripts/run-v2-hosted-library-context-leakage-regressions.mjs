/**
 * Regression suite for hosted-library context leakage prevention.
 *
 * Covers:
 *   L1  /yvhs loads YVHS config (personalized route passes libraryId to HomeScreen)
 *   L2  / loads generic NovelIdeas (root route passes no libraryId)
 *   L3  Navigating / after /yvhs clears runtime library context
 *   L4  Refreshing / remains generic (root config initializer never reads admin draft)
 *   L5  Opening / in a new tab remains generic (no sessionStorage bleed)
 *   L6  Navigating back to /yvhs restores YVHS (shared-config re-fetched on libraryId change)
 *   L7  Unknown slugs fail honestly and do not reuse the last valid library
 *   L8  Admin local draft state does not automatically determine the public root configuration
 *   L9  Root config initializer uses configFile default, never admin draft
 *   L10 HomeScreen has no admin-draft sync callbacks or event listeners
 *   L11 runtimeLibraryName is gated behind props.libraryId in HomeScreen
 *   L12 Runtime context cleared synchronously when libraryId is absent
 *   L13 Hosted configured library name overrides slug-derived runtime fallback
 *   L14 Hosted custom highlight/main/font colors are applied from saved config
 *   L15 Hosted logo and age-band config fields remain mapped
 *
 * All tests are pure-logic or structural (source-text) checks.
 * No React rendering required.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

const homeSrc         = readFileSync(resolve(repoRoot, "app", "(tabs)", "index.tsx"), "utf8");
const libraryIdSrc    = readFileSync(resolve(repoRoot, "app", "(tabs)", "[libraryId].tsx"), "utf8");
const landingSrc      = readFileSync(resolve(repoRoot, "app", "c", "[libraryId].tsx"), "utf8");
const layoutSrc       = readFileSync(resolve(repoRoot, "app", "(tabs)", "_layout.tsx"), "utf8");
const adminWebSrc     = readFileSync(resolve(repoRoot, "app", "app_admin-web.tsx"), "utf8");
const runtimeCfgSrc   = readFileSync(resolve(repoRoot, "constants", "runtimeConfig.ts"), "utf8");

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function check(name, fn) {
  try {
    fn();
    return { name, pass: true };
  } catch (err) {
    return { name, pass: false, error: err.message };
  }
}

function isValidHex(hex) {
  return /^#[0-9a-fA-F]{6}$/.test(String(hex || ""));
}

function resolveHostedLibraryName(runtimeLibraryName, cfg) {
  const configured = String(cfg?.branding?.libraryName ?? cfg?.library?.name ?? "").trim();
  return configured || runtimeLibraryName || "";
}

function resolveHostedTheme(cfg) {
  const mainColorHex = isValidHex(cfg?.branding?.mainColorHex)
    ? cfg.branding.mainColorHex
    : "#0b1e33";
  const highlightColorHex = isValidHex(cfg?.branding?.highlightColorHex)
    ? cfg.branding.highlightColorHex
    : "#fbbf24";
  const fontColorHex = isValidHex(cfg?.branding?.fontColorHex)
    ? cfg.branding.fontColorHex
    : "#ffffff";
  return {
    accent: mainColorHex,
    highlight: highlightColorHex,
    titleText: fontColorHex,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const checks = [];

// L1 – /yvhs loads YVHS config (personalized route passes libraryId to HomeScreen)
checks.push(check("L1_personalized_route_passes_libraryId_to_HomeScreen", () => {
  // [libraryId].tsx must render HomeScreen with libraryId prop
  assert(
    libraryIdSrc.includes("<HomeScreen libraryId={libraryId}"),
    "[libraryId].tsx must pass libraryId prop to HomeScreen"
  );
  // HomeScreen must accept and use libraryId prop
  assert(
    homeSrc.includes("props.libraryId"),
    "HomeScreen must read props.libraryId"
  );
  // Personalized route must load from shared API when libraryId is set
  assert(
    homeSrc.includes("loadSharedLibraryConfigWithDiagnostics(props.libraryId"),
    "HomeScreen must call loadSharedLibraryConfigWithDiagnostics with props.libraryId"
  );
}));

// L2 – / loads generic NovelIdeas (root route passes no libraryId)
checks.push(check("L2_root_route_renders_HomeScreen_without_libraryId", () => {
  // The default export of index.tsx IS HomeScreen; it should not be called with libraryId
  // Verify that the default export is HomeScreen and it's called without libraryId from root
  assert(
    homeSrc.includes("export default HomeScreen"),
    "index.tsx must export HomeScreen as default"
  );
  // When libraryId prop is absent, runtimeLibraryName must be empty string
  assert(
    homeSrc.includes("props.libraryId ? getRuntimeLibraryName() : \"\""),
    "runtimeLibraryName must be empty string when props.libraryId is falsy"
  );
}));

// L3 – Navigating / after /yvhs clears runtime library context
checks.push(check("L3_navigation_to_root_clears_runtime_library_context", () => {
  // When props.libraryId is falsy, HomeScreen must call setRuntimeLibraryId("") and setRuntimeLibraryName("")
  const noLibraryIdBlock = homeSrc.slice(
    homeSrc.indexOf("if (!props.libraryId)"),
    homeSrc.indexOf("if (!props.libraryId)") + 300
  );
  assert(
    noLibraryIdBlock.includes('setRuntimeLibraryId("")'),
    "HomeScreen must clear runtimeLibraryId when props.libraryId is absent"
  );
  assert(
    noLibraryIdBlock.includes('setRuntimeLibraryName("")'),
    "HomeScreen must clear runtimeLibraryName when props.libraryId is absent"
  );
}));

// L4 – Refreshing / remains generic (root config initializer never reads admin draft)
checks.push(check("L4_root_config_initializer_never_reads_admin_draft", () => {
  // Config state initializer must not call tryLoadDesktopAdminDraft
  assert(
    !homeSrc.includes("tryLoadDesktopAdminDraft"),
    "HomeScreen config initializer must not call tryLoadDesktopAdminDraft"
  );
  // The initializer must use configFile as the source of truth
  assert(
    homeSrc.includes("deepClone(configFile)"),
    "HomeScreen config initializer must deepClone configFile"
  );
  // The comment must document the intent
  assert(
    homeSrc.includes("Root route always starts from the default config file") ||
    homeSrc.includes("never determines the public root configuration"),
    "HomeScreen config initializer must document that admin draft does not apply"
  );
}));

// L5 – Opening / in a new tab remains generic (no sessionStorage bleed)
checks.push(check("L5_new_tab_at_root_stays_generic", () => {
  // runtimeConfig reads from sessionStorage, but HomeScreen clears it immediately when libraryId absent
  assert(
    runtimeCfgSrc.includes("sessionStorage"),
    "runtimeConfig must use sessionStorage (scoped to tab, not persisted across new tabs)"
  );
  // runtimeConfig must provide setRuntimeLibraryId and setRuntimeLibraryName for clearing
  assert(
    runtimeCfgSrc.includes("export function setRuntimeLibraryId"),
    "runtimeConfig must export setRuntimeLibraryId"
  );
  assert(
    runtimeCfgSrc.includes("export function setRuntimeLibraryName"),
    "runtimeConfig must export setRuntimeLibraryName"
  );
  // HomeScreen must import and call these clearers
  assert(
    homeSrc.includes("setRuntimeLibraryId, setRuntimeLibraryName"),
    "HomeScreen must import setRuntimeLibraryId and setRuntimeLibraryName for clearing"
  );
}));

// L6 – Navigating back to /yvhs restores YVHS (shared-config re-fetched on libraryId change)
checks.push(check("L6_navigating_to_personalized_route_restores_config", () => {
  // The useEffect that loads shared config must depend on props.libraryId
  const sharedConfigEffect = homeSrc.slice(
    homeSrc.indexOf("async function loadSharedConfig"),
    homeSrc.indexOf("async function loadSharedConfig") + 500
  );
  assert(
    sharedConfigEffect.includes("loadSharedLibraryConfigWithDiagnostics"),
    "loadSharedConfig must call loadSharedLibraryConfigWithDiagnostics"
  );
  // The effect dep array must include props.libraryId so it re-runs on navigation
  const effectBlock = homeSrc.slice(
    homeSrc.indexOf("void loadSharedConfig()"),
    homeSrc.indexOf("void loadSharedConfig()") + 200
  );
  assert(
    effectBlock.includes("[props.libraryId]"),
    "loadSharedConfig effect must re-run when props.libraryId changes (dep array must include it)"
  );
}));

// L7 – Unknown slugs fail honestly and do not reuse the last valid library
checks.push(check("L7_unknown_slug_does_not_reuse_last_valid_library", () => {
  // When shared config fetch returns null for an unknown slug, HomeScreen must not apply stale config
  const loadSharedConfigBlock = homeSrc.slice(
    homeSrc.indexOf("async function loadSharedConfig"),
    homeSrc.indexOf("async function loadSharedConfig") + 1500
  );
  // The config is only set when shared config is non-null
  assert(
    loadSharedConfigBlock.includes("if (shared)") && loadSharedConfigBlock.includes("setConfig(next)"),
    "HomeScreen must only setConfig when shared config is non-null (not for unknown slugs)"
  );
  // There must be no fallback to last-used library config on null
  assert(
    !loadSharedConfigBlock.includes("getRuntimeLibraryId()") &&
    !loadSharedConfigBlock.includes("getLastLibraryId"),
    "HomeScreen must not fall back to last-used library on null shared config"
  );
  // personalizedConfigLoading must clear even on failed fetch
  assert(
    loadSharedConfigBlock.includes("finally") &&
    loadSharedConfigBlock.includes("setPersonalizedConfigLoading(false)"),
    "personalizedConfigLoading must be cleared even when shared config returns null"
  );
}));

// L8 – Admin local draft state does not automatically determine the public root configuration
checks.push(check("L8_admin_draft_does_not_determine_root_configuration", () => {
  // HomeScreen must not read ADMIN_CONFIG_STORAGE_KEY
  assert(
    !homeSrc.includes("ADMIN_CONFIG_STORAGE_KEY"),
    "HomeScreen must not read ADMIN_CONFIG_STORAGE_KEY"
  );
  // HomeScreen must not import tryLoadDesktopAdminDraft or equivalent
  assert(
    !homeSrc.includes("tryLoadDesktopAdminDraft"),
    "HomeScreen must not define or call tryLoadDesktopAdminDraft"
  );
  // HomeScreen must not listen for admin config changed events
  assert(
    !homeSrc.includes("ADMIN_CONFIG_CHANGED_EVENT"),
    "HomeScreen must not listen for ADMIN_CONFIG_CHANGED_EVENT"
  );
  // HomeScreen must not listen for storage events that update config from admin draft
  const hasAdminStorageListener = homeSrc.includes("ADMIN_CONFIG_STORAGE_KEY") ||
    (homeSrc.includes("event.key") && homeSrc.includes("ADMIN_CONFIG"));
  assert(
    !hasAdminStorageListener,
    "HomeScreen must not have storage event listeners that apply admin draft"
  );
}));

// L9 – Root config initializer uses configFile default, never admin draft
checks.push(check("L9_config_initializer_uses_configFile_not_admin_draft", () => {
  // Find the config state initialization block
  const stateInitIdx = homeSrc.indexOf("const [config, setConfig] = useState<any>(() => {");
  assert(stateInitIdx >= 0, "HomeScreen must have a config state initializer");
  const stateInitBlock = homeSrc.slice(stateInitIdx, stateInitIdx + 1200);
  // Must reference configFile as the base
  assert(
    stateInitBlock.includes("configFile"),
    "config initializer must use configFile as the default source"
  );
  // Must NOT reference admin draft storage
  assert(
    !stateInitBlock.includes("ADMIN_CONFIG_STORAGE_KEY"),
    "config initializer must not read ADMIN_CONFIG_STORAGE_KEY"
  );
  assert(
    !stateInitBlock.includes("tryLoadDesktopAdminDraft"),
    "config initializer must not call tryLoadDesktopAdminDraft"
  );
  // Library name must start empty so root shows "NovelIdeas" not a personalized name
  assert(
    stateInitBlock.includes('init.library.name = ""') &&
    stateInitBlock.includes('init.branding.libraryName = ""'),
    "config initializer must set empty library name for generic root route"
  );
}));

// L10 – HomeScreen has no admin-draft sync callbacks or event listeners
checks.push(check("L10_HomeScreen_has_no_admin_draft_sync", () => {
  assert(
    !homeSrc.includes("refreshConfigFromDesktopAdminDraft"),
    "HomeScreen must not define or call refreshConfigFromDesktopAdminDraft"
  );
  assert(
    !homeSrc.includes("tryLoadDesktopAdminDraft"),
    "HomeScreen must not define or call tryLoadDesktopAdminDraft"
  );
  assert(
    !homeSrc.includes("ADMIN_CONFIG_CHANGED_EVENT"),
    "HomeScreen must not import or use ADMIN_CONFIG_CHANGED_EVENT"
  );
  assert(
    !homeSrc.includes("ADMIN_CONFIG_STORAGE_KEY"),
    "HomeScreen must not import or use ADMIN_CONFIG_STORAGE_KEY"
  );
}));

// L11 – runtimeLibraryName is gated behind props.libraryId in HomeScreen
checks.push(check("L11_runtimeLibraryName_gated_behind_libraryId", () => {
  assert(
    homeSrc.includes("props.libraryId ? getRuntimeLibraryName() : \"\""),
    "runtimeLibraryName must only be read from runtime context when props.libraryId is set"
  );
}));

// L12 – Runtime context cleared synchronously when libraryId is absent
checks.push(check("L12_runtime_context_cleared_when_libraryId_absent", () => {
  // The useEffect that clears runtime context must come before the loadSharedConfig effect
  const clearCtxIdx = homeSrc.indexOf('setRuntimeLibraryId("")');
  const loadCfgIdx = homeSrc.indexOf("loadSharedLibraryConfig");
  assert(clearCtxIdx >= 0, "HomeScreen must clear runtimeLibraryId when libraryId is absent");
  assert(loadCfgIdx >= 0, "HomeScreen must call loadSharedLibraryConfig for personalized routes");
  // Both must be inside the same useEffect (the one guarded by props.libraryId)
  const sharedEffect = homeSrc.slice(
    homeSrc.indexOf("useEffect(() => {", homeSrc.indexOf("setPersonalizedConfigLoading")),
    homeSrc.indexOf("}, [props.libraryId])") + 20
  );
  assert(
    sharedEffect.includes('setRuntimeLibraryId("")') &&
    sharedEffect.includes('setRuntimeLibraryName("")'),
    "runtime context must be cleared in the props.libraryId useEffect"
  );
  assert(
    sharedEffect.includes("loadSharedLibraryConfig"),
    "shared config load must also be inside the props.libraryId useEffect"
  );
}));

// Structural: personalized route sets runtime library identity before HomeScreen mounts
checks.push(check("structural_personalized_route_sets_runtime_identity", () => {
  // [libraryId].tsx must call setRuntimeLibraryId and setRuntimeLibraryName
  assert(
    libraryIdSrc.includes("setRuntimeLibraryId(raw || \"\")") ||
    libraryIdSrc.includes("setRuntimeLibraryId("),
    "[libraryId].tsx must call setRuntimeLibraryId"
  );
  assert(
    libraryIdSrc.includes("setRuntimeLibraryName("),
    "[libraryId].tsx must call setRuntimeLibraryName"
  );
  assert(
    libraryIdSrc.includes("setLibraryId(raw || \"\")"),
    "[libraryId].tsx must preserve full slug string (no truncation)"
  );
  assert(
    !libraryIdSrc.includes("slice(0, 1)") && !libraryIdSrc.includes("charAt(0)"),
    "[libraryId].tsx must not truncate libraryId to one character"
  );
}));

// Structural: landing redirect route seeds runtime identity before redirect
checks.push(check("structural_landing_route_seeds_runtime_before_redirect", () => {
  // c/[libraryId].tsx must set runtime identity before router.replace
  assert(
    landingSrc.includes("setRuntimeLibraryId(slug || \"\")"),
    "landing route must call setRuntimeLibraryId before redirecting"
  );
  assert(
    landingSrc.includes("setRuntimeLibraryName("),
    "landing route must call setRuntimeLibraryName before redirecting"
  );
  assert(
    landingSrc.includes("router.replace("),
    "landing route must redirect to the personalized route"
  );
}));

// Structural: personalized route must show loading state while config fetches
checks.push(check("structural_personalized_route_shows_loading_state", () => {
  assert(
    homeSrc.includes("personalizedConfigLoading"),
    "HomeScreen must have personalizedConfigLoading state"
  );
  assert(
    homeSrc.includes("props.libraryId && personalizedConfigLoading"),
    "HomeScreen must show loading UI while personalized config is fetching"
  );
  assert(
    homeSrc.includes("Loading your library"),
    "HomeScreen must display 'Loading your library' text while config fetches"
  );
}));

// Structural: HomeScreen must import loadSharedLibraryConfig for cross-device config
checks.push(check("structural_HomeScreen_imports_shared_config_loader", () => {
  assert(
    homeSrc.includes("loadSharedLibraryConfig"),
    "HomeScreen must import and use loadSharedLibraryConfig for cross-device config hydration"
  );
}));

// Structural: opening Customize passes route-scoped libraryId only on personalized routes.
checks.push(check("structural_customize_route_is_scoped_by_path_libraryId", () => {
  assert(
    homeSrc.includes("props.libraryId") &&
    homeSrc.includes("/app_admin-web?libraryId="),
    "Customize navigation must pass libraryId query only when path has a hosted slug"
  );
  assert(
    adminWebSrc.includes("explicitLibraryIdParam") &&
    adminWebSrc.includes("runtimeLibraryId") &&
    adminWebSrc.includes("resolveAdminDraftScopeId"),
    "Admin screen must derive draft scope from path libraryId or runtime library context"
  );
  assert(
    adminWebSrc.includes("adminDraftStorageKey"),
    "Admin screen must use a scoped storage key instead of one global key"
  );
}));

checks.push(check("L13_hosted_configured_library_name_beats_slug_runtime_name", () => {
  const cfg = {
    branding: { libraryName: "Mel's Books" },
    library: { name: "Mel's Books" },
  };
  assert(
    resolveHostedLibraryName("M", cfg) === "Mel's Books",
    "hosted title must prefer configured libraryName over slug-derived runtime name"
  );
  assert(
    homeSrc.includes("hostedBranding.libraryName || runtimeLibraryName || \"\""),
    "HomeScreen must prefer hosted config libraryName before runtime slug fallback"
  );
}));

checks.push(check("L14_hosted_custom_colors_survive_save_load_render", () => {
  const cfg = {
    branding: {
      mainColorHex: "#224466",
      highlightColorHex: "#12ab34",
      fontColorHex: "#fefefe",
      autoFontColor: false,
    },
  };
  const theme = resolveHostedTheme(cfg);
  assert(theme.accent === "#224466", "hosted main color hex must drive theme accent");
  assert(theme.highlight === "#12ab34", "hosted highlight color hex must drive theme highlight");
  assert(theme.titleText === "#fefefe", "hosted font color hex must drive title text");
  assert(
    homeSrc.includes("accent: mainColorHex") &&
    homeSrc.includes("highlight: highlightColorHex") &&
    homeSrc.includes("titleText: fontColorHex"),
    "HomeScreen theme must apply saved hex colors directly"
  );
}));

checks.push(check("L15_hosted_logo_and_age_band_fields_remain_mapped", () => {
  assert(
    homeSrc.includes("const logoDataUrl: string | null = config?.branding?.logoDataUrl ?? null;"),
    "hosted logo must still come from branding.logoDataUrl"
  );
  assert(
    homeSrc.includes("config?.enabledDecks ?? config?.decks?.enabled ?? {}"),
    "hosted age-band deck availability must still come from enabledDecks/decks.enabled"
  );
}));

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const failed = checks.filter((c) => !c.pass);

console.log(JSON.stringify({
  pass: failed.length === 0,
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
}, null, 2));

if (failed.length > 0) {
  process.exitCode = 1;
}
