/**
 * Main-page navigation restructure regressions.
 *
 * Verifies:
 *   N1  — legacy Customize overlay text/button is removed from main swipe screen
 *   N2  — ellipsis menu is rendered in the header right slot (swipe + search)
 *   N3  — menu trigger is plain (no border/background chip styling)
 *   N4  — dropdown is right-anchored and opens down/left
 *   N5  — public menu includes Customize + Help Improve NovelIdeas
 *   N6  — public menu includes How NovelIdeas Works, Send Feedback, Privacy, About (with divider)
 *   N7  — Help Improve NovelIdeas copy and /testing navigation path exist
 *   N8  — admin-only menu stubs are present and gated by admin unlock state
 *   N9  — public status row diagnostics are hidden behind isAdminMode
 *   N10 — Test A/B/C controls are hidden from public non-admin render
 *   N11 — Diagnostics/Review/Fresh User controls are hidden from public non-admin render
 *   N12 — /testing route still uses isTestingMode and does not enable admin mode
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

// N2: menu appears in header right slot for both swipe/search
{
  const renderHeaderMenuCount = (indexSource.match(/\{renderHeaderMenu\(\)\}/g) || []).length;
  assert(renderHeaderMenuCount >= 2, "N2: renderHeaderMenu should appear in both swipe and search headers");
  assertNotIncludes(indexSource, "contentMenuRow", "N2: contentMenuRow should not exist after moving menu back into header");
  console.log("PASS N2: ellipsis menu rendered in header right slot");
}

// N3: trigger style is plain with generous tap target (no outlined chip)
{
  assertIncludes(indexSource, "width: 44", "N3: menu trigger should keep a 44px tap target");
  assertIncludes(indexSource, "height: 44", "N3: menu trigger should keep a 44px tap target");
  assertIncludes(indexSource, 'backgroundColor: "transparent"', "N3: menu trigger should have no filled chip background");
  assertNotIncludes(indexSource, "headerMenuButton, { borderColor:", "N3: menu trigger should not be rendered with border styling");
  console.log("PASS N3: menu trigger is plain and tap-friendly");
}

// N4: dropdown anchor is right edge and opens downward-left
{
  assertIncludes(indexSource, "position: \"absolute\"", "N4: popover should be absolutely positioned");
  assertIncludes(indexSource, "top: 44", "N4: popover should open downward from trigger");
  assertIncludes(indexSource, "right: 0", "N4: popover should be right-anchored");
  assertIncludes(indexSource, "minWidth: 230", "N4: popover should have stable width for viewport-safe layout");
  console.log("PASS N4: dropdown is right-anchored and opens down/left");
}

// N5: public menu includes Customize + Help Improve NovelIdeas
{
  assertIncludes(indexSource, ">Customize<", "N5: public menu must include Customize");
  assertIncludes(indexSource, "Help Improve NovelIdeas", "N5: public menu must include Help Improve NovelIdeas");
  console.log("PASS N5: public menu includes Customize and Help Improve NovelIdeas");
}

// N6: public menu includes How NovelIdeas Works, Send Feedback, Privacy, About (+ divider)
{
  for (const item of ["How NovelIdeas Works", "Send Feedback", "Privacy", ">About<"]) {
    assertIncludes(indexSource, item, `N6: public menu must include ${item}`);
  }
  assertIncludes(indexSource, "headerMenuDivider", "N6: public menu should include divider styling before About");
  console.log("PASS N6: public menu includes How NovelIdeas Works, Send Feedback, Privacy, and About");
}

// N7: Help Improve copy + route to /testing exists
{
  assertIncludes(
    indexSource,
    "NovelIdeas is continually improving its recommendations.",
    "N7: Help Improve dialog copy should describe participatory improvement"
  );
  assertIncludes(indexSource, 'router.push("/testing")', "N7: Help Improve flow must route to /testing");
  console.log("PASS N7: Help Improve flow includes copy and /testing navigation");
}

// N8: admin-only menu stubs are present and gated by admin unlock state
{
  for (const item of ["Diagnostics", "Human Review Dashboard", "Recommendation tuning", "Library management", "Import / Export", "Developer tools"]) {
    assertIncludes(indexSource, item, `N8: admin menu must include ${item}`);
  }
  assertIncludes(indexSource, "const [adminMenuUnlocked, setAdminMenuUnlocked] = useState(false);", "N8: should track admin menu unlock state");
  assertIncludes(indexSource, "const showAdminMenuItems = adminMenuUnlocked || adminUnlocked;", "N8: admin menu must be unlock-gated");
  console.log("PASS N8: admin-only menu stubs are present and unlock-gated");
}

// N9: status diagnostics are hidden from public and gated by isAdminMode
{
  assertIncludes(swipeDeckSource, "{isAdminMode ? (", "N9: status diagnostics should be behind isAdminMode");
  assertIncludes(swipeDeckSource, "<View style={styles.statusRow}>", "N9: status row should still exist for admin mode");
  assertIncludes(swipeDeckSource, "20Q:", "N9: status row content should remain available in admin mode");
  console.log("PASS N9: status diagnostics are admin-gated");
}

// N10: Test A/B/C controls are hidden from public non-admin mode by explicit isAdminMode gating
{
  assert(controlsStart >= 0, "N10: controls branch must exist");
  assert(adminDivider > controlsStart, "N10: controls must gate non-testing controls behind isAdminMode");
  assertIncludes(swipeDeckSource, ") : null}", "N10: non-admin non-testing controls should render null");
  assertIncludes(adminBranchSource, "testSessionPresets.map((preset) => (", "N10: admin branch should keep test presets");
  console.log("PASS N10: Test A/B/C controls gated off public render");
}

// N11: Diagnostics / Review / Fresh User hidden from public non-admin mode
{
  for (const required of ["Diagnostics", "Review This Slate", "Fresh User"]) {
    assertIncludes(adminBranchSource, required, `N11: admin branch should keep ${required}`);
  }
  assertIncludes(swipeDeckSource, ") : isAdminMode ? (", "N11: admin-only controls must be behind isAdminMode branch");
  console.log("PASS N11: Diagnostics, Review This Slate, and Fresh User hidden from public non-admin render");
}

// N12: /testing remains testing-mode driven and does not enable admin mode
{
  assertIncludes(testingSource, "isTestingMode={true}", "N12: /testing route must keep isTestingMode={true}");
  assertNotIncludes(testingSource, "isAdminMode={true}", "N12: /testing route must not enable admin mode");
  console.log("PASS N12: /testing behavior remains testing-mode driven");
}

console.log("All nav-restructure regressions passed (12/12).");
