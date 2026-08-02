/**
 * Main-page navigation restructure regressions.
 *
 * Verifies:
 *   N1  — legacy Customize overlay text/button is removed from main swipe screen
 *   N2  — ellipsis menu is rendered in content area (below header), not in header slot
 *   N3  — public menu includes Customize + Help Improve NovelIdeas
 *   N4  — public menu includes How NovelIdeas Works, Send Feedback, Privacy
 *   N5  — Help Improve NovelIdeas copy and /testing navigation path exist
 *   N6  — admin-only menu stubs are present
 *   N7  — public status row diagnostics are hidden behind isAdminMode
 *   N8  — Test A/B/C controls are hidden from public non-admin render
 *   N9  — Diagnostics/Review/Fresh User controls are hidden from public non-admin render
 *   N10 — /testing route still uses isTestingMode and does not enable admin mode
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

// N2: menu appears below header in content area
{
  assertIncludes(indexSource, "<View style={styles.headerRight} />", "N2: header should keep an empty right slot");
  assertIncludes(indexSource, "<View style={styles.contentMenuRow}>{renderHeaderMenu()}</View>", "N2: swipe mode should render menu in content area");
  assertIncludes(indexSource, "styles.contentMenuRow", "N2: content menu row style should exist");
  console.log("PASS N2: ellipsis menu moved below header");
}

// N3: public menu includes Customize + Help Improve NovelIdeas
{
  assertIncludes(indexSource, ">Customize<", "N3: public menu must include Customize");
  assertIncludes(indexSource, "Help Improve NovelIdeas", "N3: public menu must include Help Improve NovelIdeas");
  console.log("PASS N3: public menu includes Customize and Help Improve NovelIdeas");
}

// N4: public menu includes How NovelIdeas Works, Send Feedback, Privacy
{
  for (const item of ["How NovelIdeas Works", "Send Feedback", "Privacy"]) {
    assertIncludes(indexSource, item, `N4: public menu must include ${item}`);
  }
  console.log("PASS N4: public menu includes How NovelIdeas Works, Send Feedback, and Privacy");
}

// N5: Help Improve copy + route to /testing exists
{
  assertIncludes(
    indexSource,
    "NovelIdeas is continually improving its recommendations.",
    "N5: Help Improve dialog copy should describe participatory improvement"
  );
  assertIncludes(indexSource, 'router.push("/testing")', "N5: Help Improve flow must route to /testing");
  console.log("PASS N5: Help Improve flow includes copy and /testing navigation");
}

// N6: admin-only menu stubs are present
{
  for (const item of ["Diagnostics", "Human Review Dashboard", "Recommendation tuning", "Library management", "Import / Export", "Developer tools"]) {
    assertIncludes(indexSource, item, `N6: admin menu must include ${item}`);
  }
  console.log("PASS N6: admin-only menu stubs are present");
}

// N7: status diagnostics are hidden from public and gated by isAdminMode
{
  assertIncludes(swipeDeckSource, "{isAdminMode ? (", "N7: status diagnostics should be behind isAdminMode");
  assertIncludes(swipeDeckSource, "<View style={styles.statusRow}>", "N7: status row should still exist for admin mode");
  assertIncludes(swipeDeckSource, "20Q:", "N7: status row content should remain available in admin mode");
  console.log("PASS N7: status diagnostics are admin-gated");
}

// N8: Test A/B/C controls are hidden from public non-admin mode by explicit isAdminMode gating
{
  assert(controlsStart >= 0, "N8: controls branch must exist");
  assert(adminDivider > controlsStart, "N8: controls must gate non-testing controls behind isAdminMode");
  assertIncludes(swipeDeckSource, ") : null}", "N8: non-admin non-testing controls should render null");
  assertIncludes(adminBranchSource, "testSessionPresets.map((preset) => (", "N8: admin branch should keep test presets");
  console.log("PASS N8: Test A/B/C controls gated off public render");
}

// N9: Diagnostics / Review / Fresh User hidden from public non-admin mode
{
  for (const required of ["Diagnostics", "Review This Slate", "Fresh User"]) {
    assertIncludes(adminBranchSource, required, `N9: admin branch should keep ${required}`);
  }
  assertIncludes(swipeDeckSource, ") : isAdminMode ? (", "N9: admin-only controls must be behind isAdminMode branch");
  console.log("PASS N9: Diagnostics, Review This Slate, and Fresh User hidden from public non-admin render");
}

// N10: /testing remains testing-mode driven and does not enable admin mode
{
  assertIncludes(testingSource, "isTestingMode={true}", "N10: /testing route must keep isTestingMode={true}");
  assertNotIncludes(testingSource, "isAdminMode={true}", "N10: /testing route must not enable admin mode");
  console.log("PASS N10: /testing behavior remains testing-mode driven");
}

console.log("All nav-restructure regressions passed (10/10).");
