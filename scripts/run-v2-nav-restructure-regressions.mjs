/**
 * Main-page navigation restructure regressions.
 *
 * Verifies:
 *   N1  — legacy Customize overlay text/button is removed from main swipe screen
 *   N2  — header ellipsis menu button exists
 *   N3  — Test A/B/C controls are hidden from public non-admin render
 *   N4  — Diagnostics is hidden from public non-admin render
 *   N5  — Fresh User is hidden from public non-admin render
 *   N6  — Review This Slate is hidden from public non-admin render
 *   N7  — isAdminMode prop source-level gating exists
 *   N8  — /testing route still uses isTestingMode and does not enable admin mode
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");

function assert(condition, msg) {
  if (!condition) throw new Error(`FAIL: ${msg}`);
}
function assertIncludes(content, fragment, msg) {
  if (!content.includes(fragment)) {
    throw new Error(`FAIL: ${msg}\n  Expected to find: ${JSON.stringify(fragment)}`);
  }
}
function assertNotIncludes(content, fragment, msg) {
  if (content.includes(fragment)) {
    throw new Error(`FAIL: ${msg}\n  Expected NOT to find: ${JSON.stringify(fragment)}`);
  }
}

const indexSource = readFileSync(resolve(ROOT, "app/(tabs)/index.tsx"), "utf8");
const swipeDeckSource = readFileSync(resolve(ROOT, "screens/SwipeDeckScreen.tsx"), "utf8");
const testingSource = readFileSync(resolve(ROOT, "app/testing.tsx"), "utf8");

const controlsStart = swipeDeckSource.indexOf("{isTestingMode ? (");
const adminDivider = swipeDeckSource.indexOf(") : isAdminMode ? (", controlsStart);
const adminBranchEnd = swipeDeckSource.indexOf("</>", adminDivider);
const adminBranchSource =
  adminDivider >= 0 && adminBranchEnd > adminDivider ? swipeDeckSource.slice(adminDivider, adminBranchEnd + 3) : "";

// N1: old overlay Customize button is removed from main swipe surface
{
  assertNotIncludes(indexSource, "showCustomizeButton", "N1: legacy showCustomizeButton flag should be removed");
  assertNotIncludes(indexSource, "customizeOverlay", "N1: legacy customize overlay style should be removed");
  assertNotIncludes(
    indexSource,
    "<Text style={[styles.chipText, { color: theme.text }]}>Customize</Text>",
    "N1: legacy Customize chip label should be removed"
  );
  console.log("PASS N1: legacy Customize overlay removed");
}

// N2: header ellipsis menu button exists
{
  assertIncludes(indexSource, 'accessibilityLabel="Open main menu"', "N2: header menu button should be accessible");
  assertIncludes(indexSource, "⋮", "N2: header menu should render a vertical ellipsis trigger");
  console.log("PASS N2: header ellipsis menu trigger exists");
}

// N3: Test A/B/C controls are hidden from public non-admin mode by explicit isAdminMode gating
{
  assert(controlsStart >= 0, "N3: controls branch must exist");
  assert(adminDivider > controlsStart, "N3: controls must gate non-testing controls behind isAdminMode");
  assertIncludes(swipeDeckSource, ") : null}", "N3: non-admin non-testing controls should render null");
  assertIncludes(adminBranchSource, "testSessionPresets.map((preset) => (", "N3: admin branch should keep test presets");
  console.log("PASS N3: Test A/B/C controls gated off public render");
}

// N4: Diagnostics hidden from public non-admin mode
{
  assertIncludes(adminBranchSource, "<Text style={styles.debugToggleText}>Diagnostics</Text>", "N4: admin branch keeps Diagnostics");
  assertIncludes(swipeDeckSource, ") : isAdminMode ? (", "N4: Diagnostics must be behind isAdminMode branch");
  console.log("PASS N4: Diagnostics hidden from public non-admin render");
}

// N5: Fresh User hidden from public non-admin mode (outside testing route)
{
  assertIncludes(adminBranchSource, "<Text style={styles.debugToggleText}>Fresh User</Text>", "N5: admin branch keeps Fresh User");
  assertIncludes(swipeDeckSource, ") : null}", "N5: non-admin non-testing branch must render null");
  console.log("PASS N5: Fresh User hidden from public non-admin render");
}

// N6: Review This Slate hidden from public non-admin mode
{
  assertIncludes(adminBranchSource, "<Text style={styles.debugToggleText}>Review This Slate</Text>", "N6: admin branch keeps Review This Slate");
  assertIncludes(swipeDeckSource, ") : isAdminMode ? (", "N6: Review This Slate must be behind isAdminMode branch");
  console.log("PASS N6: Review This Slate hidden from public non-admin render");
}

// N7: isAdminMode prop exists and is wired from main screen to SwipeDeckScreen
{
  assertIncludes(swipeDeckSource, "isAdminMode?: boolean", "N7: SwipeDeckScreen Props must include isAdminMode");
  assertIncludes(swipeDeckSource, "const isAdminMode = props.isAdminMode === true;", "N7: SwipeDeckScreen must derive isAdminMode flag");
  assertIncludes(swipeDeckSource, "{isAdminMode ? (", "N7: recommendation debug metadata must be gated by isAdminMode");
  assertIncludes(indexSource, "isAdminMode={adminUnlocked}", "N7: Home screen must pass isAdminMode from adminUnlocked");
  console.log("PASS N7: isAdminMode source-level gating wired correctly");
}

// N8: /testing remains testing-mode driven and does not enable admin mode
{
  assertIncludes(testingSource, "isTestingMode={true}", "N8: /testing route must keep isTestingMode={true}");
  assertNotIncludes(testingSource, "isAdminMode={true}", "N8: /testing route must not enable admin mode");
  console.log("PASS N8: /testing behavior remains testing-mode driven");
}

console.log("All nav-restructure regressions passed (8/8).");
