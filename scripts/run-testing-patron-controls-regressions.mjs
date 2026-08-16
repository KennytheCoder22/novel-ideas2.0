#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { shouldShowTestingEvaluation } from "../screens/swipe/testingControls.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const swipeSource = readFileSync(resolve(root, "screens", "SwipeDeckScreen.tsx"), "utf8");
const homeSource = readFileSync(resolve(root, "app", "(tabs)", "index.tsx"), "utf8");

const testingStart = swipeSource.indexOf("{isTestingMode ? (");
const testingEnd = swipeSource.indexOf(") : isAdminMode ? (", testingStart);
const testingBranch = swipeSource.slice(testingStart, testingEnd);
const resetStart = swipeSource.indexOf("function handleFreshUserReset()");
const resetEnd = swipeSource.indexOf("\n  function ", resetStart + 1);
const resetHandler = swipeSource.slice(resetStart, resetEnd);

function pass(name) {
  process.stdout.write(`PASS ${name}\n`);
}

assert(testingBranch.length > 0, "testing control branch must be present");
assert(!testingBranch.includes("Fresh User"), "/testing must not render standalone Fresh User");
assert(!testingBranch.includes("handleFreshUserReset"), "/testing must not wire standalone Fresh User");
pass("/testing omits standalone Fresh User");

assert(homeSource.includes("onPress={confirmResetUser}"), "menu Reset User handler must remain");
assert(homeSource.includes(">Reset User</Text>"), "menu Reset User label must remain");
pass("three-dot menu retains Reset User");

assert.equal(
  shouldShowTestingEvaluation({
    isTestingMode: true,
    platform: "web",
    showRecommendationsView: false,
    recommendationCount: 0,
  }),
  false,
);
assert.equal(
  shouldShowTestingEvaluation({
    isTestingMode: true,
    platform: "web",
    showRecommendationsView: true,
    recommendationCount: 0,
  }),
  false,
);
pass("Evaluate Recommendations is hidden before a slate exists");

assert.equal(
  shouldShowTestingEvaluation({
    isTestingMode: true,
    platform: "web",
    showRecommendationsView: true,
    recommendationCount: 10,
  }),
  true,
);
assert(testingBranch.includes("onPress={openHumanReviewForCurrentSlate}"));
pass("Evaluate Recommendations appears for a rendered slate");

assert(resetHandler.includes("setRecItems([])"), "reset must clear recommendation items");
assert(resetHandler.includes("setForceRecommendationsView(false)"), "reset must leave recommendation view");
assert.equal(
  shouldShowTestingEvaluation({
    isTestingMode: true,
    platform: "web",
    showRecommendationsView: false,
    recommendationCount: 0,
  }),
  false,
);
pass("fresh/reset session hides evaluation until the next slate");

process.stdout.write("\nTesting patron-control regressions passed.\n");
