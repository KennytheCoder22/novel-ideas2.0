/**
 * Main-page navigation/admin-state regressions.
 *
 * Verifies:
 *   N1  — legacy Customize overlay is removed
 *   N2  — header overflow menu stays in header right slot (swipe + search)
 *   N3  — menu trigger is plain (no border/chip styling)
 *   N4  — dropdown is right-anchored and opens downward
 *   N5  — Help Improve item routes directly to /testing and closes menu
 *   N6  — public menu includes Customize + Help Improve + How/Feedback/Privacy/About
 *   N7  — admin menu section is unlock-gated
 *   N8  — admin unlock intent is tracked separately from menu Customize opens
 *   N9  — admin route visit alone is not treated as unlock
 *   N10 — failed/cancelled PIN flow clears pending unlock
 *   N11 — successful unlock can enable admin menu items
 *   N12 — status diagnostics are hidden from public and gated by isAdminMode
 *   N13 — Test A/B/C controls are hidden from public non-admin render
 *   N14 — Diagnostics/Review/Fresh User controls are hidden from public non-admin render
 *   N15 — /testing remains isTestingMode public experience and never passes isAdminMode
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
  const openTestingEnd = indexSource.indexOf("const showAdminMenuItems", openTestingStart);
  const openTestingSource =
    openTestingStart >= 0 && openTestingEnd > openTestingStart ? indexSource.slice(openTestingStart, openTestingEnd) : "";
  assertIncludes(openTestingSource, "closeHeaderMenu();", "N5: menu should close before testing navigation");
  assertIncludes(openTestingSource, 'router.replace("/testing");', "N5: Help Improve should route directly to /testing");
  assertNotIncludes(openTestingSource, "Alert.alert(", "N5: Help Improve should navigate directly, not stall in a local alert");
  console.log("PASS N5: Help Improve routes directly to /testing and closes menu");
}

// N6
{
  for (const item of ["Customize", "Help Improve NovelIdeas", "How NovelIdeas Works", "Send Feedback", "Privacy", "About"]) {
    assertIncludes(indexSource, item, `N6: public menu must include ${item}`);
  }
  assertIncludes(indexSource, "headerMenuDivider", "N6: menu should include section divider(s)");
  console.log("PASS N6: public menu structure is present");
}

// N7
{
  assertIncludes(indexSource, "const [adminMenuUnlocked, setAdminMenuUnlocked] = useState(false);", "N7: admin menu unlock state must exist");
  assertIncludes(indexSource, "const showAdminMenuItems = adminMenuUnlocked || adminUnlocked;", "N7: admin menu section must be gated");
  console.log("PASS N7: admin menu section is unlock-gated");
}

// N8
{
  assertIncludes(indexSource, "const [pendingAdminMenuUnlock, setPendingAdminMenuUnlock] = useState(false);", "N8: pending unlock intent state must exist");
  assertIncludes(indexSource, 'function openAdminEntry(source: "menu" | "easter_egg" = "menu")', "N8: openAdminEntry should track caller source");
  assertIncludes(indexSource, 'const unlockMenu = source === "easter_egg";', "N8: easter egg should define menu unlock intent");
  assertIncludes(indexSource, "setPendingAdminMenuUnlock(unlockMenu);", "N8: PIN flow should record unlock intent");
  console.log("PASS N8: unlock intent is separated from generic Customize access");
}

// N9
{
  assert(openAdminEntrySource.length > 0, "N9: openAdminEntry source must be extractable");
  assertNotIncludes(
    openAdminEntrySource,
    "setAdminMenuUnlocked(true);\n        router.push(\"/app_admin-web\");",
    "N9: visiting /app_admin-web should not itself mark admin menu unlocked"
  );
  assertIncludes(openAdminEntrySource, "if (unlockMenu) {", "N9: admin menu unlock should be conditional");
  console.log("PASS N9: admin route visit alone is not treated as unlock");
}

// N10
{
  assertIncludes(indexSource, "setPendingAdminMenuUnlock(false);", "N10: cancel/back actions should clear pending unlock");
  assertIncludes(indexSource, "setAdminMenuUnlocked(pendingAdminMenuUnlock);", "N10: unlock should depend on successful pending intent");
  console.log("PASS N10: failed/cancelled PIN paths clear pending unlock");
}

// N11
{
  assertIncludes(indexSource, "setAdminMenuUnlocked(pendingAdminMenuUnlock);", "N11: successful PIN unlock should enable admin menu when intended");
  assertIncludes(indexSource, 'openAdminEntry("easter_egg");', "N11: explicit easter-egg unlock path should exist");
  console.log("PASS N11: successful unlock path can enable admin menu");
}

// N12
{
  assertIncludes(swipeDeckSource, "{isAdminMode ? (", "N12: status diagnostics should be behind isAdminMode");
  assertIncludes(swipeDeckSource, "<View style={styles.statusRow}>", "N12: status row should still exist for admin mode");
  console.log("PASS N12: status diagnostics are admin-gated");
}

// N13
{
  assert(controlsStart >= 0, "N13: controls branch must exist");
  assert(adminDivider > controlsStart, "N13: controls must gate non-testing controls behind isAdminMode");
  assertIncludes(swipeDeckSource, ") : null}", "N13: non-admin non-testing controls should render null");
  assertIncludes(adminBranchSource, "testSessionPresets.map((preset) => (", "N13: admin branch should keep test presets");
  console.log("PASS N13: Test A/B/C controls gated off public render");
}

// N14
{
  for (const required of ["Diagnostics", "Review This Slate", "Fresh User"]) {
    assertIncludes(adminBranchSource, required, `N14: admin branch should keep ${required}`);
  }
  assertIncludes(swipeDeckSource, ") : isAdminMode ? (", "N14: admin-only controls must be behind isAdminMode branch");
  console.log("PASS N14: Diagnostics/Review/Fresh User hidden from public non-admin render");
}

// N15
{
  assertIncludes(testingSource, "isTestingMode={true}", "N15: /testing route must keep isTestingMode={true}");
  assertNotIncludes(testingSource, "isAdminMode={true}", "N15: /testing must not enable admin mode");
  console.log("PASS N15: /testing stays public testing experience");
}

console.log("All nav-restructure regressions passed (15/15).");
