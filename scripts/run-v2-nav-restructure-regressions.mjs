/**
 * Main-page navigation/admin-auth contract regressions.
 *
 * Verifies:
 *   N1  — legacy Customize overlay is removed
 *   N2  — header overflow menu stays in header right slot (swipe + search)
 *   N3  — menu trigger is plain (no border/chip styling)
 *   N4  — dropdown is right-anchored and opens downward
 *   N5  — Help Improve stays public, closes menu, and routes directly to /testing
 *   N6  — public menu structure includes Customize/Help Improve/How/Feedback/Privacy/About
 *   N7  — admin-only menu section is gated by authenticated state
 *   N8  — no-PIN personal install keeps Customize public without auto-unlocking admin section
 *   N9  — PIN-enabled flow prompts for PIN and route visitation alone is not treated as auth
 *   N10 — failed/cancelled PIN does not unlock
 *   N11 — successful PIN authentication unlocks admin section
 *   N12 — explicit lock/exit de-auths and hides admin section
 *   N13 — status diagnostics are hidden from public and gated by isAdminMode
 *   N14 — Test A/B/C controls are hidden from public non-admin render
 *   N15 — Diagnostics/Review/Fresh User controls are hidden from public non-admin render
 *   N16 — /testing remains isTestingMode public experience and never passes isAdminMode
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

const controlsStart = swipeDeckSource.indexOf("<View style={styles.tempButtonsWrap}>");
const adminDivider = swipeDeckSource.indexOf("{!isTestingMode && isAdminMode ? (", controlsStart);
const adminBranchEnd = swipeDeckSource.indexOf("visible={showHumanReviewPanel", adminDivider);
const adminBranchSource =
  adminDivider >= 0 && adminBranchEnd > adminDivider ? swipeDeckSource.slice(adminDivider, adminBranchEnd) : "";

const openAdminEntryStart = indexSource.indexOf('function openAdminEntry(source: "menu" | "easter_egg" = "menu") {');
const openAdminEntryEnd = indexSource.indexOf("function handleTitleTap()", openAdminEntryStart);
const openAdminEntrySource =
  openAdminEntryStart >= 0 && openAdminEntryEnd > openAdminEntryStart
    ? indexSource.slice(openAdminEntryStart, openAdminEntryEnd)
    : "";

// N1
{
  assertNotIncludes(indexSource, "showCustomizeButton", "N1: legacy showCustomizeButton flag should be removed");
  assertNotIncludes(indexSource, "customizeOverlay", "N1: legacy customize overlay style should be removed");
  console.log("PASS N1: legacy Customize overlay removed");
}

// N2
{
  const renderHeaderMenuCount = (indexSource.match(/\{renderHeaderMenu\(\)\}/g) || []).length;
  assert(renderHeaderMenuCount >= 2, "N2: renderHeaderMenu should appear in both swipe and search headers");
  assertNotIncludes(indexSource, "contentMenuRow", "N2: contentMenuRow should not be present");
  console.log("PASS N2: header overflow menu stays in header right slot");
}

// N3
{
  assertIncludes(indexSource, "width: 44", "N3: trigger should keep 44px tap target");
  assertIncludes(indexSource, "height: 44", "N3: trigger should keep 44px tap target");
  assertIncludes(indexSource, 'backgroundColor: "transparent"', "N3: trigger should be visually plain");
  assertNotIncludes(indexSource, "headerMenuButton, { borderColor:", "N3: trigger should not use bordered chip styling");
  console.log("PASS N3: menu trigger is plain with large tap target");
}

// N4
{
  assertIncludes(indexSource, "position: \"absolute\"", "N4: popover should be absolute");
  assertIncludes(indexSource, "top: 44", "N4: popover should open below trigger");
  assertIncludes(indexSource, "right: 0", "N4: popover should anchor to right edge");
  console.log("PASS N4: dropdown anchor positioning is correct");
}

// N5
{
  const openTestingStart = indexSource.indexOf("function openTestingInvite()");
  const openTestingEnd = indexSource.indexOf("function openDeveloperTip()", openTestingStart);
  const openTestingSource =
    openTestingStart >= 0 && openTestingEnd > openTestingStart ? indexSource.slice(openTestingStart, openTestingEnd) : "";
  assertIncludes(openTestingSource, "closeHeaderMenu();", "N5: Help Improve should close menu");
  assertIncludes(openTestingSource, 'router.replace("/testing");', "N5: Help Improve should route directly to /testing");
  console.log("PASS N5: Help Improve remains public and routes directly to /testing");
}

// N6
{
  for (const item of ["Customize", "Help Improve NovelIdeas", "How to Use NovelIdeas", "Send Feedback", "Privacy", "About"]) {
    assertIncludes(indexSource, item, `N6: public menu must include ${item}`);
  }
  assertIncludes(indexSource, "headerMenuDivider", "N6: menu should include section divider(s)");
  console.log("PASS N6: public menu structure is present");
}

// N7
{
  assert(!indexSource.includes(">Human Review Dashboard</Text>"), "N7: owner dashboard must not render in patron/librarian menus");
  assertIncludes(indexSource, "ownerLogoTapCountRef.current < 7", "N7: hidden owner entry must require seven logo taps");
  console.log("PASS N7: owner analytics is absent from normal menus and uses hidden logo entry");
}

// N8
{
  assertIncludes(indexSource, 'function openAdminEntry(source: "menu" | "easter_egg" = "menu")', "N8: openAdminEntry should distinguish source");
  assertIncludes(openAdminEntrySource, 'router.push(adminRoute as any)', "N8: librarian entry still routes to Librarian Settings");
  assert(!openAdminEntrySource.includes("/admin/human-review"), "N8: librarian entry must remain separate from owner analytics");
  console.log("PASS N8: librarian entry remains separate from owner analytics");
}

// N9
{
  assertIncludes(openAdminEntrySource, "if (adminPinReady) {", "N9: PIN-enabled managed install should require PIN path");
  assertIncludes(openAdminEntrySource, "setShowAdminPinPrompt(true);", "N9: PIN path should display prompt");
  assertNotIncludes(
    openAdminEntrySource,
    "setAdminMenuUnlocked(true);\n        router.push(\"/app_admin-web\");",
    "N9: route visitation alone must not be treated as authentication"
  );
  console.log("PASS N9: PIN flow is required and route visitation alone does not authenticate");
}

// N10
{
  assertIncludes(indexSource, "setShowAdminPinPrompt(false);", "N10: cancel/back paths should close PIN prompt");
  assertIncludes(indexSource, "if (adminPinEntry !== adminPin)", "N10: incorrect PIN should be rejected");
  assertIncludes(indexSource, "setAdminPinError(\"Incorrect PIN.\");", "N10: failed PIN path should surface explicit error");
  console.log("PASS N10: failed/cancelled PIN does not unlock admin");
}

// N11
{
  assertIncludes(indexSource, "if (Platform.OS === \"web\") {", "N11: successful PIN authentication should route web librarians");
  assertIncludes(indexSource, "setAdminUnlocked(true);", "N11: successful PIN authentication should unlock native librarian settings");
  assertIncludes(indexSource, 'openAdminEntry("easter_egg");', "N11: easter-egg entry path should still exist");
  console.log("PASS N11: successful PIN authentication opens librarian settings");
}

// N12
{
  assertIncludes(indexSource, "onExit={() => {", "N12: admin exit handler should exist");
  assertIncludes(indexSource, "setAdminUnlocked(false);", "N12: admin exit should clear admin screen state");
  assertNotIncludes(indexSource, "setAdminMenuUnlocked", "N12: no analytics-capable librarian menu state should remain");
  console.log("PASS N12: explicit exit closes librarian settings without exposing owner analytics");
}

// N13
{
  assertIncludes(swipeDeckSource, "{isAdminMode ? (", "N13: status diagnostics should be behind isAdminMode");
  assertIncludes(swipeDeckSource, "<View style={styles.statusRow}>", "N13: status row should still exist for admin mode");
  console.log("PASS N13: status diagnostics are admin-gated");
}

// N14
{
  assert(controlsStart >= 0, "N14: controls branch must exist");
  assert(adminDivider > controlsStart, "N14: controls must gate non-testing controls behind isAdminMode");
  assertIncludes(swipeDeckSource, ") : null}", "N14: non-admin non-testing controls should render null");
  assertIncludes(adminBranchSource, "testSessionPresets.map((preset) => (", "N14: admin branch should keep test presets");
  console.log("PASS N14: Test A/B/C controls gated off public render");
}

// N15
{
  for (const required of ["Diagnostics", "Review This Slate", "Fresh User"]) {
    assertIncludes(adminBranchSource, required, `N15: admin branch should keep ${required}`);
  }
  assertIncludes(adminBranchSource, "{!isTestingMode && isAdminMode ? (", "N15: admin-only controls must be hidden from testing mode");
  console.log("PASS N15: Diagnostics/Review/Fresh User hidden from public non-admin render");
}

// N16
{
  assertIncludes(testingSource, "isTestingMode={true}", "N16: /testing route must keep isTestingMode={true}");
  assertNotIncludes(testingSource, "isAdminMode={true}", "N16: /testing must not enable admin mode");
  console.log("PASS N16: /testing stays public testing experience");
}

console.log("All nav-restructure regressions passed (16/16).");
