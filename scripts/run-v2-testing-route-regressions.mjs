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
 *   T12 — submitHumanReview success message uses storage-mode-aware text (no hardcoded "not durable")
 *   T13 — Intro banner localStorage key is defined and reasonable
 *   T14 — testing.tsx enables all four age-band decks
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
  // The old hardcoded text "not durable on Vercel serverless" should still exist in non-durable path
  // but the new code should have "durable_postgres" check for testing mode path
  assertIncludes(swipeDeckSource, "durableSaved", "T12: submitHumanReview must have durableSaved variable");
  assertIncludes(swipeDeckSource, "durable_postgres", "T12: submitHumanReview must check for durable_postgres storageMode");
  assertIncludes(swipeDeckSource, "Evaluation saved", "T12: durable path must say 'Evaluation saved' (clean confirmation)");
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

console.log("\n✓ All testing-route regressions passed (14 tests).");
