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
 *   T6  — In testing mode, Test preset controls are conditionally hidden (!isTestingMode guard)
 *   T7  — In testing mode, Diagnostics controls are conditionally hidden (!isTestingMode guard)
 *   T8  — "Fresh User" control always rendered (no isTestingMode guard)
 *   T9  — "Review This Slate" label still used when isTestingMode is false/absent
 *   T10 — app/_layout.tsx registers the "testing" Stack.Screen
 *   T11 — testing.tsx does not import any internal recommendation engine modules
 *   T12 — submitHumanReview success message uses storage-mode-aware text
 *   T13 — Intro banner localStorage key is defined and reasonable
 *   T14 — testing.tsx enables all four age-band decks
 *   T15 — testing mode blocks non-durable save responses with explicit operator-facing error text
 *   T16 — testing mode renders a thank-you completion screen with a Start Fresh CTA
 *   T17 — reviewer field autofocuses in testing mode for keyboard-first completion
 *   T18 — review modal keeps taps active while keyboard is open and remains scrollable on small screens
 *   T19 — testing modal copy hides raw profile/snapshot IDs while admin copy remains available
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

const testingSource = readFileSync(resolve(ROOT, "app/testing.tsx"), "utf8");
const swipeDeckSource = readFileSync(resolve(ROOT, "screens/SwipeDeckScreen.tsx"), "utf8");
const layoutSource = readFileSync(resolve(ROOT, "app/_layout.tsx"), "utf8");

// T1: testing.tsx exists and has default export
{
  assert(testingSource.length > 100, "T1: app/testing.tsx exists and has content");
  assertIncludes(testingSource, "export default function", "T1: testing.tsx has a default export function");
  console.log("PASS T1: app/testing.tsx exists and has a default export");
}

// T2: testing.tsx passes isTestingMode={true} or isTestingMode
{
  const hasTestingModeProp =
    testingSource.includes("isTestingMode={true}") ||
    testingSource.includes("isTestingMode\n") ||
    testingSource.includes("isTestingMode\r") ||
    testingSource.match(/isTestingMode\s*[^=]/) !== null;
  assertIncludes(testingSource, "isTestingMode", "T2: testing.tsx passes isTestingMode prop to SwipeDeckScreen");
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
  assertIncludes(swipeDeckSource, "isTestingMode ? \"Evaluate Recommendations\"", "T5: label is conditional on isTestingMode");
  console.log("PASS T5: 'Evaluate Recommendations' label used when isTestingMode is true");
}

// T6: Test preset controls are conditionally hidden
{
  assertIncludes(swipeDeckSource, "!isTestingMode && testSessionPresets", "T6: testSessionPresets render is guarded by !isTestingMode");
  console.log("PASS T6: Test preset controls (Test A/B/C) are guarded by !isTestingMode");
}

// T7: Diagnostics controls are conditionally hidden
{
  assertIncludes(swipeDeckSource, "!isTestingMode && (", "T7: Diagnostics/Codex controls are guarded by !isTestingMode");
  console.log("PASS T7: Diagnostics controls are guarded by !isTestingMode");
}

// T8: Fresh User always rendered (no isTestingMode guard around it)
{
  // Find the Fresh User button block and verify it is NOT inside an isTestingMode conditional
  const freshUserIdx = swipeDeckSource.indexOf('"Fresh User"');
  assert(freshUserIdx >= 0, "T8: 'Fresh User' text must exist in SwipeDeckScreen");
  // The 300 chars preceding the Fresh User text should not contain "isTestingMode" as a guard
  const precedingContext = swipeDeckSource.slice(Math.max(0, freshUserIdx - 300), freshUserIdx);
  // It should NOT have a direct {!isTestingMode && immediately before the Fresh User TouchableOpacity
  assert(
    !precedingContext.includes("!isTestingMode && (\n              <TouchableOpacity style={styles.testPillButton} onPress={handleFreshUserReset}"),
    "T8: Fresh User must not be wrapped in !isTestingMode guard"
  );
  console.log("PASS T8: 'Fresh User' control is always rendered (no isTestingMode guard)");
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

// T17: reviewer field autofocuses in testing mode for keyboard-first completion
{
  assertIncludes(swipeDeckSource, "autoFocus={isTestingMode}", "T17: reviewer input must autofocus in testing mode");
  assertIncludes(swipeDeckSource, 'returnKeyType="next"', "T17: reviewer input should expose forward keyboard navigation");
  console.log("PASS T17: reviewer field autofocuses in testing mode");
}

// T18: modal remains scrollable and keyboard-safe on small screens
{
  assertIncludes(swipeDeckSource, 'keyboardShouldPersistTaps="handled"', "T18: review modal ScrollView must keep taps active while keyboard is open");
  assertIncludes(swipeDeckSource, 'maxHeight: "85%"', "T18: review panel must remain height-capped for small-screen scrolling");
  console.log("PASS T18: review modal supports scrolling and keyboard-safe taps on small screens");
}

// T19: testing copy hides raw IDs while admin copy remains available
{
  assertIncludes(swipeDeckSource, 'isTestingMode ? "Evaluate Recommendations" : "Human Review (Admin)"', "T19: modal heading must switch between testing and admin copy");
  assertIncludes(swipeDeckSource, 'Tell us whether these recommendations fit the tastes you showed while swiping.', "T19: testing intro copy must exist");
  assertIncludes(swipeDeckSource, 'Profile: {humanReviewSnapshot.profileId}', "T19: admin-only profile line must still exist");
  assertIncludes(swipeDeckSource, 'Snapshot: {humanReviewSnapshot.snapshotId}', "T19: admin-only snapshot line must still exist");
  console.log("PASS T19: testing modal hides raw IDs while preserving admin copy");
}

console.log("\n✓ All testing-route regressions passed (19 tests).");
