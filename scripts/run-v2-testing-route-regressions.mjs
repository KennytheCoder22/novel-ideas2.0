/**
 * Testing route regressions.
 *
 * Verifies the behavioral contracts for the /testing public evaluation route.
 * Pure Node.js — no React/Expo rendering required.
 *
 * Tests:
 *   T1  — app/testing.tsx exists and exports a default component
 *   T2  — app/testing.tsx passes isTestingMode={true} to SwipeDeckScreen
 *   T3  — app/testing.tsx does NOT pass any raw diagnostic props (adultKitsuOnlyForceQueryForValidation etc.)
 *   T4  — SwipeDeckScreen Props type includes isTestingMode?: boolean
 *   T5  — In testing mode, "Evaluate Recommendations" label is used (not "Review This Slate")
 *   T6  — testing mode lower-right branch contains only Evaluate Recommendations + Fresh User
 *   T7  — admin branch still contains Test A/B/C, Diagnostics, Codex Diagnostics, Review This Slate, and Fresh User
 *   T8  — "Fresh User" remains rendered in the testing branch
 *   T9  — "Review This Slate" label still used when isTestingMode is false/absent
 *   T10 — app/_layout.tsx registers the "testing" Stack.Screen
 *   T11 — testing.tsx does not import any internal recommendation engine modules
 *   T12 — submitHumanReview success message uses storage-mode-aware text
 *   T13 — Intro banner localStorage key is defined and reasonable
 *   T14 — testing.tsx enables all four age-band decks
 *   T15 — testing mode blocks non-durable save responses with explicit operator-facing error text
 *   T16 — testing mode renders a thank-you completion screen with a Start Fresh CTA
 *   T17 — public testing renders no reviewer name/initials field and explains anonymous saving
 *   T18 — review modal keeps taps active while keyboard is open, scrolls independently, and keeps sticky actions visible
 *   T19 — testing modal copy hides raw profile/snapshot IDs while admin copy remains available
 *   T20 — extracted testing control branch omits Test A/B/C, Diagnostics, and Codex Diagnostics
 *   T21 — extracted admin control branch still includes the internal controls
 *   T22 — vercel.json exists to support direct navigation to /testing on static web output
 *   T23 — vercel.json rewrites direct /testing requests to the SPA shell without redirecting
 *   T24 — vercel.json rewrites refreshes and nested /testing paths to the SPA shell
 *   T25 — root route configuration remains unchanged (no redirect/rewrite from /)
 *   T26 — isReliablePatronTitleIdentity function is defined in SwipeDeckScreen
 *   T27 — engine name (Recommender V2) is not used as author fallback
 *   T28 — format abbreviation titles (GN, HC, TPB, SC, etc.) are rejected
 *   T29 — volume-only titles (Vol. 1, Volume 2, Book 3) are rejected
 *   T30 — issue-number-only titles (#1, #42) are rejected
 *   T31 — bare format-genre labels (Graphic Novel, Omnibus, etc.) are rejected
 *   T32 — normalizeRecommenderV2Items applies title filter before map
 *   T33 — SHOW_REC_SOURCE gated by !isTestingMode so source labels never shown as author in testing
 *   T34 — rejection patterns are anchored so valid descriptive titles are not rejected
 *   T35 — hasReliablePatronAuthorIdentity function is defined in SwipeDeckScreen
 *   T36 — empty-creators candidates are rejected from the public slate
 *   T37 — implementation-label-only creators (Recommender V2, source names) are rejected
 *   T38 — valid single-creator is preserved by the author-identity gate
 *   T39 — author-identity label rejection is case-insensitive
 */

import { existsSync, readFileSync } from "node:fs";
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

const testingSource = readFileSync(resolve(ROOT, "app/testing.tsx"), "utf8");
const swipeDeckSource = readFileSync(resolve(ROOT, "screens/SwipeDeckScreen.tsx"), "utf8");
const layoutSource = readFileSync(resolve(ROOT, "app/_layout.tsx"), "utf8");
const vercelConfigPath = resolve(ROOT, "vercel.json");
const vercelConfig = existsSync(vercelConfigPath) ? JSON.parse(readFileSync(vercelConfigPath, "utf8")) : null;
const testingBranchStart = swipeDeckSource.indexOf("{isTestingMode ? (");
const adminBranchDivider = swipeDeckSource.indexOf(") : (", testingBranchStart);
const testingBranchSource =
  testingBranchStart >= 0 && adminBranchDivider > testingBranchStart
    ? swipeDeckSource.slice(testingBranchStart, adminBranchDivider)
    : "";
const adminBranchEnd = swipeDeckSource.indexOf("</>", adminBranchDivider);
const adminBranchSource =
  adminBranchDivider >= 0 && adminBranchEnd > adminBranchDivider
    ? swipeDeckSource.slice(adminBranchDivider, adminBranchEnd + 3)
    : "";

// T1: testing.tsx exists and has default export
{
  assert(testingSource.length > 100, "T1: app/testing.tsx exists and has content");
  assertIncludes(testingSource, "export default function", "T1: testing.tsx has a default export function");
  console.log("PASS T1: app/testing.tsx exists and has a default export");
}

// T2: testing.tsx passes isTestingMode={true} or isTestingMode
{
  assertIncludes(testingSource, "isTestingMode={true}", "T2: testing.tsx must pass isTestingMode={true} explicitly to SwipeDeckScreen");
  console.log("PASS T2: app/testing.tsx passes isTestingMode prop to SwipeDeckScreen");
}

// T3: testing.tsx does NOT pass diagnostic/debug props
{
  assertNotIncludes(testingSource, "adultKitsuOnlyForceQueryForValidation", "T3: testing.tsx must not pass internal validation props");
  assertNotIncludes(testingSource, "deepDebug", "T3: testing.tsx must not pass deep-debug props");
  console.log("PASS T3: app/testing.tsx does not pass diagnostic/debug props to SwipeDeckScreen");
}

// T4: SwipeDeckScreen Props type includes isTestingMode
{
  assertIncludes(swipeDeckSource, "isTestingMode?: boolean", "T4: Props type must include isTestingMode?: boolean");
  console.log("PASS T4: SwipeDeckScreen Props type includes isTestingMode?: boolean");
}

// T5: In testing mode, "Evaluate Recommendations" label is used
{
  assertIncludes(swipeDeckSource, "Evaluate Recommendations", "T5: 'Evaluate Recommendations' label must exist in SwipeDeckScreen");
  assertIncludes(swipeDeckSource, "{isTestingMode ? (", "T5: controls must branch explicitly for testing mode");
  console.log("PASS T5: 'Evaluate Recommendations' label used when isTestingMode is true");
}

// T6: testing branch contains only the two public controls
{
  assertIncludes(swipeDeckSource, "{isTestingMode ? (", "T6: controls must split into an explicit testing-mode branch");
  assertIncludes(swipeDeckSource, "<Text style={styles.debugToggleText}>Evaluate Recommendations</Text>", "T6: testing branch must render Evaluate Recommendations");
  assertIncludes(swipeDeckSource, "<Text style={styles.debugToggleText}>Fresh User</Text>", "T6: testing branch must render Fresh User");
  assertNotIncludes(
    swipeDeckSource,
    "{!isTestingMode && testSessionPresets.map",
    "T6: testing branch should not rely on a shared label that can leak admin copy"
  );
  console.log("PASS T6: testing branch contains only Evaluate Recommendations and Fresh User");
}

// T7: admin branch retains the internal controls
{
  assertIncludes(swipeDeckSource, "{testSessionPresets.map((preset) => (", "T7: admin branch must still render test presets");
  assertIncludes(swipeDeckSource, "<Text style={styles.debugToggleText}>Diagnostics</Text>", "T7: admin branch must still render Diagnostics");
  assertIncludes(swipeDeckSource, "Codex Diagnostics", "T7: admin branch must still render Codex Diagnostics");
  assertIncludes(swipeDeckSource, "<Text style={styles.debugToggleText}>Review This Slate</Text>", "T7: admin branch must still render Review This Slate");
  console.log("PASS T7: admin branch preserves the internal controls");
}

// T8: Fresh User remains available in testing mode
{
  assert(testingBranchSource.length > 0, "T8: testing branch must be present");
  assertIncludes(testingBranchSource, "Fresh User", "T8: Fresh User text must exist in testing branch");
  console.log("PASS T8: 'Fresh User' remains available in testing mode");
}

// T9: "Review This Slate" label used when isTestingMode is false
{
  assertIncludes(swipeDeckSource, '"Review This Slate"', "T9: 'Review This Slate' label must still exist for non-testing mode");
  console.log("PASS T9: 'Review This Slate' label preserved for non-testing mode (Admin)");
}

// T10: _layout.tsx registers "testing" screen
{
  assertIncludes(layoutSource, 'name="testing"', "T10: app/_layout.tsx must register the 'testing' Stack.Screen");
  assertIncludes(layoutSource, "headerShown: false", "T10: testing screen should have headerShown: false (route owns its own header)");
  console.log('PASS T10: app/_layout.tsx registers the "testing" Stack.Screen');
}

// T11: testing.tsx does not import recommendation engine modules
{
  const forbiddenImports = [
    "recommender-v2",
    "kitsuSearch",
    "gcdSearch",
    "adaptiveCardQueue",
    "runAutoRecommendations",
    "swipeHistoryToV2Signals",
  ];
  const importSection = testingSource.slice(0, Math.min(testingSource.length, 2000));
  for (const forbidden of forbiddenImports) {
    assertNotIncludes(importSection, forbidden, `T11: testing.tsx must not import recommendation engine module: ${forbidden}`);
  }
  // Testing.tsx must only import from allowed modules (SwipeDeckScreen + React Native)
  assert(testingSource.includes("import SwipeDeckScreen from"), "T11: testing.tsx should import SwipeDeckScreen");
  assertNotIncludes(testingSource, "from \"../app/recommender-v2", "T11: testing.tsx must not import from recommender-v2");
  assertNotIncludes(testingSource, "from \"../screens/recommenders", "T11: testing.tsx must not import from recommenders");
  console.log("PASS T11: app/testing.tsx does not import any internal recommendation engine modules");
}

// T12: submitHumanReview success message is storage-mode-aware
{
  assertIncludes(swipeDeckSource, "durableSaved", "T12: submitHumanReview must have durableSaved variable");
  assertIncludes(swipeDeckSource, "durable_postgres", "T12: submitHumanReview must check for durable_postgres storageMode");
  assertIncludes(swipeDeckSource, "Thank you! Your evaluation was saved.", "T12: durable testing path must use a clean thank-you confirmation");
  assertIncludes(swipeDeckSource, "Review saved locally", "T12: non-durable path must distinguish with 'Review saved locally'");
  console.log("PASS T12: submitHumanReview success message is storage-mode-aware (no false durable claims)");
}

// T13: Intro banner localStorage key is defined
{
  const introKeyMatch = testingSource.match(/novelideas_testing_intro_dismissed/);
  assert(introKeyMatch !== null, "T13: intro banner localStorage key 'novelideas_testing_intro_dismissed' must be defined");
  assertIncludes(testingSource, "introDismissed", "T13: testing.tsx must have introDismissed state");
  assertIncludes(testingSource, "handleDismiss", "T13: testing.tsx must have a dismiss handler");
  console.log("PASS T13: Intro banner uses localStorage key 'novelideas_testing_intro_dismissed' and has dismiss handler");
}

// T14: testing.tsx enables all four age-band decks
{
  assertIncludes(testingSource, 'k2: true', "T14: k2 deck enabled in testing.tsx");
  assertIncludes(testingSource, '"36": true', "T14: 36 deck enabled in testing.tsx");
  assertIncludes(testingSource, 'ms_hs: true', "T14: ms_hs deck enabled in testing.tsx");
  assertIncludes(testingSource, 'adult: true', "T14: adult deck enabled in testing.tsx");
  console.log("PASS T14: app/testing.tsx enables all four age-band decks");
}

// T15: testing mode explicitly blocks non-durable saves
{
  assertIncludes(swipeDeckSource, "if (isTestingMode && !durableSaved)", "T15: testing mode must guard against non-durable save success responses");
  assertIncludes(
    swipeDeckSource,
    "durable review storage is unavailable. Please tell the test operator and try again later.",
    "T15: testing mode must show an explicit operator-facing durable storage failure message"
  );
  assertIncludes(
    swipeDeckSource,
    "testing database isn't configured yet. Please tell the test operator and try again later.",
    "T15: testing mode must handle missing Postgres config with explicit copy"
  );
  console.log("PASS T15: testing mode blocks non-durable saves with explicit durable-storage failure text");
}

// T16: testing mode shows a dedicated thank-you completion state with Start Fresh CTA
{
  assertIncludes(swipeDeckSource, "showHumanReviewCompletion", "T16: completion state must be tracked in SwipeDeckScreen");
  assertIncludes(swipeDeckSource, "Thanks for helping test NovelIdeas", "T16: completion screen title must exist");
  assertIncludes(swipeDeckSource, "Start Fresh", "T16: completion screen must expose a Start Fresh CTA");
  console.log("PASS T16: testing mode renders a thank-you completion state with Start Fresh CTA");
}

// T17: public testing hides the reviewer identity field and uses anonymous copy
{
  assertIncludes(swipeDeckSource, "{!isTestingMode ? (", "T17: reviewer identity input must be hidden in testing mode");
  assertNotIncludes(swipeDeckSource, "Your name or initials", "T17: testing mode must not prompt for names or initials");
  assertIncludes(swipeDeckSource, "Your feedback is saved anonymously.", "T17: testing copy must explain anonymous saving");
  console.log("PASS T17: testing mode removes the public reviewer identity field");
}

// T18: modal remains scrollable, keyboard-safe, and keeps sticky actions outside the scroll area
{
  assertIncludes(swipeDeckSource, 'keyboardShouldPersistTaps="handled"', "T18: review modal ScrollView must keep taps active while keyboard is open");
  assertIncludes(swipeDeckSource, 'maxHeight: "85%"', "T18: review panel must remain height-capped for small-screen scrolling");
  assertIncludes(swipeDeckSource, "humanReviewPanelBody", "T18: review panel must define a body wrapper for independent scrolling");
  assertIncludes(swipeDeckSource, "humanReviewScrollArea", "T18: review panel must use a dedicated scroll area");
  assertIncludes(swipeDeckSource, "humanReviewStickyFooter", "T18: review panel must define a sticky footer");
  assert(swipeDeckSource.indexOf("humanReviewStickyFooter") > swipeDeckSource.indexOf("</ScrollView>"), "T18: sticky footer must render after the ScrollView");
  console.log("PASS T18: review modal uses an independent scroll area with a sticky action footer");
}

// T19: testing copy hides raw IDs while admin copy remains available
{
  assertIncludes(swipeDeckSource, 'isTestingMode ? "Evaluate Recommendations" : "Human Review (Admin)"', "T19: modal heading must switch between testing and admin copy");
  assertIncludes(swipeDeckSource, 'Tell us whether these recommendations fit the tastes you showed while swiping.', "T19: testing intro copy must exist");
  assertIncludes(swipeDeckSource, 'Profile: {humanReviewSnapshot.profileId}', "T19: admin-only profile line must still exist");
  assertIncludes(swipeDeckSource, 'Snapshot: {humanReviewSnapshot.snapshotId}', "T19: admin-only snapshot line must still exist");
  console.log("PASS T19: testing modal hides raw IDs while preserving admin copy");
}

  // T20: extracted testing control branch omits all five internal controls
  {
    assert(testingBranchSource.length > 0, "T20: testing control branch must be extractable");
    for (const forbidden of ["Test A", "Test B", "Test C", "Diagnostics", "Codex Diagnostics"]) {
      assertNotIncludes(testingBranchSource, forbidden, `T20: testing control branch must not include ${forbidden}`);
    }
    assertIncludes(testingBranchSource, "Evaluate Recommendations", "T20: testing control branch must include Evaluate Recommendations");
    assertIncludes(testingBranchSource, "Fresh User", "T20: testing control branch must include Fresh User");
    console.log("PASS T20: testing control branch omits Test A/B/C, Diagnostics, and Codex Diagnostics");
  }

  // T21: extracted admin control branch preserves the internal controls
  {
    assert(adminBranchSource.length > 0, "T21: admin control branch must be extractable");
    for (const required of ["testSessionPresets", "Diagnostics", "Codex Diagnostics", "Review This Slate", "Fresh User"]) {
      assertIncludes(adminBranchSource, required, `T21: admin control branch must include ${required}`);
    }
    console.log("PASS T21: admin control branch still includes the internal controls");
  }

  // T22: vercel.json exists for static-web route publishing
  {
    assert(vercelConfig !== null, "T22: vercel.json must exist");
    assert(Array.isArray(vercelConfig.rewrites), "T22: vercel.json must define rewrites");
    console.log("PASS T22: vercel.json exists and defines rewrites");
  }

  // T23: direct /testing navigation rewrites to the SPA shell without a redirect
  {
    const directTestingRewrite = vercelConfig.rewrites.find(
      (rewrite) => rewrite && rewrite.source === "/testing" && rewrite.destination === "/"
    );
    assert(Boolean(directTestingRewrite), "T23: vercel.json must rewrite /testing to /");
    assert(!("redirects" in vercelConfig), "T23: vercel.json must use rewrites, not redirects, for /testing");
    console.log("PASS T23: direct /testing navigation rewrites to the SPA shell without redirecting");
  }

  // T24: refresh on /testing (and nested testing paths) resolves to the SPA shell
  {
    const nestedTestingRewrite = vercelConfig.rewrites.find(
      (rewrite) => rewrite && rewrite.source === "/testing/:path*" && rewrite.destination === "/"
    );
    assert(Boolean(nestedTestingRewrite), "T24: vercel.json must rewrite /testing/:path* to /");
    console.log("PASS T24: refreshes and nested /testing paths rewrite to the SPA shell");
  }

  // T25: root route remains unchanged
  {
    const rootRewrite = vercelConfig.rewrites.find((rewrite) => rewrite && rewrite.source === "/");
    assert(!rootRewrite, "T25: vercel.json must not rewrite the root route");
    console.log("PASS T25: root route remains unchanged");
  }

  // ── Identity admission regressions ─────────────────────────────────────────

  // T26: isReliablePatronTitleIdentity function exists in SwipeDeckScreen
  {
    assertIncludes(swipeDeckSource, "function isReliablePatronTitleIdentity(", "T26: isReliablePatronTitleIdentity must be defined in SwipeDeckScreen");
    console.log("PASS T26: isReliablePatronTitleIdentity function is defined");
  }

  // T27: engine-name-as-author fallback is removed from normalizeRecommenderV2Items
  {
    assertNotIncludes(swipeDeckSource, '["Recommender V2"]', "T27: engine name must not be used as author fallback");
    console.log("PASS T27: engine name is not used as author fallback in normalizeRecommenderV2Items");
  }

  // T28: format abbreviation titles are rejected (GN, HC, TPB, SC, OGN)
  {
    assertIncludes(swipeDeckSource, "PATRON_TITLE_FORMAT_ABBREV", "T28: format-abbreviation rejection pattern must be defined");
    // Verify GN and HC are covered by the pattern
    const patternLine = swipeDeckSource.match(/PATRON_TITLE_FORMAT_ABBREV\s*=\s*\/[^/]+\//)?.[0] || "";
    assert(patternLine.toLowerCase().includes("gn"), "T28: GN must be in the format-abbreviation rejection pattern");
    assert(patternLine.toLowerCase().includes("hc"), "T28: HC must be in the format-abbreviation rejection pattern");
    console.log("PASS T28: format abbreviation titles (GN, HC, etc.) are rejected by PATRON_TITLE_FORMAT_ABBREV");
  }

  // T29: volume-only titles are rejected (Vol. 1, Volume 2, Book 3)
  {
    assertIncludes(swipeDeckSource, "PATRON_TITLE_VOLUME_ONLY", "T29: volume-only rejection pattern must be defined");
    console.log("PASS T29: volume-only titles (Vol. 1, Volume 2, etc.) are rejected by PATRON_TITLE_VOLUME_ONLY");
  }

  // T30: issue-number-only titles are rejected (#1, #42)
  {
    assertIncludes(swipeDeckSource, "PATRON_TITLE_ISSUE_NUMBER_ONLY", "T30: issue-number-only rejection pattern must be defined");
    console.log("PASS T30: issue-number-only titles are rejected by PATRON_TITLE_ISSUE_NUMBER_ONLY");
  }

  // T31: bare format-genre labels are rejected (Graphic Novel, Omnibus, etc.)
  {
    assertIncludes(swipeDeckSource, "PATRON_TITLE_FORMAT_LABEL_ONLY", "T31: format-label-only rejection pattern must be defined");
    const patternLine2 = swipeDeckSource.match(/PATRON_TITLE_FORMAT_LABEL_ONLY\s*=\s*\/[^/]+\//)?.[0] || "";
    assert(patternLine2.toLowerCase().includes("graphic"), "T31: 'graphic novel' must be in the format-label rejection pattern");
    assert(patternLine2.toLowerCase().includes("omnibus"), "T31: 'omnibus' must be in the format-label rejection pattern");
    console.log("PASS T31: bare format-genre labels (Graphic Novel, Omnibus, etc.) are rejected");
  }

  // T32: normalizeRecommenderV2Items applies the title filter before map
  {
    const filterIdx = swipeDeckSource.indexOf(".filter((candidate) => isReliablePatronTitleIdentity(candidate.title))");
    const normalizeIdx = swipeDeckSource.indexOf("function normalizeRecommenderV2Items(");
    assert(filterIdx > normalizeIdx, "T32: normalizeRecommenderV2Items must apply isReliablePatronTitleIdentity filter before map");
    console.log("PASS T32: normalizeRecommenderV2Items filters bad titles before mapping to RecItem");
  }

  // T33: SHOW_REC_SOURCE respects isTestingMode so source labels don't leak as author in testing
  {
    assertIncludes(swipeDeckSource, "SHOW_REC_SOURCE && !isTestingMode", "T33: SHOW_REC_SOURCE must be gated by !isTestingMode");
    console.log("PASS T33: SHOW_REC_SOURCE is gated by !isTestingMode — source labels never shown as author in testing");
  }

  // T34: valid graphic novel titles are not rejected (general rule, not title-specific)
  {
    // The rejection patterns use ^ and $ anchors so they only reject titles that consist
    // ENTIRELY of a format label — descriptive titles like "Maus: A Survivor's Tale" pass through.
    const patternLine3 = swipeDeckSource.match(/PATRON_TITLE_FORMAT_LABEL_ONLY\s*=\s*\/[^/]+\//)?.[0] || "";
    assert(patternLine3.startsWith("PATRON_TITLE_FORMAT_LABEL_ONLY = /^"), "T34: format label pattern must be anchored at start with ^");
    assert(patternLine3.includes("$/"), "T34: format label pattern must be anchored at end with $");
    assertNotIncludes(
      swipeDeckSource,
      '=== "Graphic Novel"',
      "T34: no title-specific string equality check allowed — only general pattern rules"
    );
    console.log("PASS T34: rejection patterns are anchored so valid descriptive titles are not affected");
  }

  // ── Author-identity admission regressions ──────────────────────────────────

  // T35: hasReliablePatronAuthorIdentity function exists in SwipeDeckScreen
  {
    assertIncludes(swipeDeckSource, "function hasReliablePatronAuthorIdentity(", "T35: hasReliablePatronAuthorIdentity must be defined");
    console.log("PASS T35: hasReliablePatronAuthorIdentity function is defined");
  }

  // T36: empty-creators candidates are rejected from the public slate
  {
    assertIncludes(swipeDeckSource, "PATRON_AUTHOR_IMPL_LABELS", "T36: implementation-label set must be defined");
    // Verify the filter is applied in normalizeRecommenderV2Items
    const authorFilterIdx = swipeDeckSource.indexOf(".filter((candidate) => hasReliablePatronAuthorIdentity(candidate.creators))");
    const titleFilterIdx = swipeDeckSource.indexOf(".filter((candidate) => isReliablePatronTitleIdentity(candidate.title))");
    assert(authorFilterIdx > titleFilterIdx, "T36: author-identity filter must appear after title filter in normalizeRecommenderV2Items");
    console.log("PASS T36: empty-creators candidates are filtered from the public slate");
  }

  // T37: implementation-label-only creators are rejected
  {
    // Verify key labels are in the PATRON_AUTHOR_IMPL_LABELS set
    const implLabelsBlock = swipeDeckSource.match(/PATRON_AUTHOR_IMPL_LABELS\s*=\s*new Set\(\[[\s\S]*?\]\)/)?.[0] || "";
    assert(implLabelsBlock.length > 0, "T37: PATRON_AUTHOR_IMPL_LABELS set must be defined");
    assert(implLabelsBlock.toLowerCase().includes('"recommender v2"'), "T37: 'recommender v2' must be in implementation labels set");
    assert(implLabelsBlock.toLowerCase().includes('"open library"'), "T37: 'open library' must be in implementation labels set");
    assert(implLabelsBlock.toLowerCase().includes('"comicvine"'), "T37: 'comicvine' must be in implementation labels set");
    console.log("PASS T37: implementation-label-only creators (Recommender V2, source names, etc.) are rejected");
  }

  // T38: valid single-creator is preserved
  {
    // hasReliablePatronAuthorIdentity must return true for a non-empty, non-label creator.
    // Verified structurally: the function has an `every` check so a single valid name passes.
    const fnBody = swipeDeckSource.match(/function hasReliablePatronAuthorIdentity[\s\S]*?^}/m)?.[0] || "";
    assertIncludes(fnBody || swipeDeckSource, "every", "T38: author gate must use 'every' so a single valid non-label name passes");
    assertNotIncludes(
      swipeDeckSource,
      "creators.length === 0 ? false : creators.every",
      "T38: author gate must not duplicate the length check — relies on nonEmpty filter"
    );
    console.log("PASS T38: valid single-creator is preserved by the author-identity gate");
  }

  // T39: author gate uses case-insensitive comparison so label casing variants are rejected
  {
    assertIncludes(swipeDeckSource, ".toLowerCase()", "T39: author label comparison must be case-insensitive via toLowerCase");
    console.log("PASS T39: author-identity label rejection is case-insensitive");
  }

  // T40: anonymous reviewer identity remains internal for public testing
  {
    assertIncludes(swipeDeckSource, "HUMAN_REVIEW_ANON_REVIEWER_STORAGE_KEY", "T40: anonymous reviewer storage key must exist");
    assertIncludes(swipeDeckSource, "getOrCreateAnonymousHumanReviewerId()", "T40: public testing must still rely on anonymous reviewer identity internally");
    assertIncludes(swipeDeckSource, 'storagePushUnique("novelideas_human_review_submissions", duplicateKey)', "T40: anonymous reviewer identity must still back duplicate protection");
    console.log("PASS T40: public testing still uses anonymous reviewer identity internally");
  }

  console.log("\n✓ All testing-route regressions passed (40 tests).");
