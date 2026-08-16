#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { shouldShowTestingEvaluation } from "../screens/swipe/testingControls.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const swipeSource = readFileSync(resolve(root, "screens", "SwipeDeckScreen.tsx"), "utf8");
const homeSource = readFileSync(resolve(root, "app", "(tabs)", "index.tsx"), "utf8");

const testingStart = swipeSource.indexOf("{shouldShowTestingEvaluation({");
const testingEnd = swipeSource.indexOf(") : !isTestingMode ? (", testingStart);
const testingBranch = swipeSource.slice(testingStart, testingEnd);
const adminControlsStart = swipeSource.indexOf("<View style={styles.tempButtonsWrap}>");
const adminControlsEnd = swipeSource.indexOf('{Platform.OS === "web" ? (', adminControlsStart);
const adminControls = swipeSource.slice(adminControlsStart, adminControlsEnd);
const resetStart = swipeSource.indexOf("function handleFreshUserReset()");
const resetEnd = swipeSource.indexOf("\n  function ", resetStart + 1);
const resetHandler = swipeSource.slice(resetStart, resetEnd);

function pass(name) {
  process.stdout.write(`PASS ${name}\n`);
}

assert(testingBranch.length > 0, "testing control branch must be present");
assert(!adminControls.includes("Evaluate Recommendations"), "floating controls must not render Evaluate Recommendations");
assert.equal((swipeSource.match(/<Text style=\{styles\.btnText\}>Evaluate Recommendations<\/Text>/g) || []).length, 1);
pass("/testing renders only one Evaluate Recommendations control");

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
assert(testingBranch.includes("styles.btn"));
pass("Evaluate Recommendations appears in the normal bottom-action location");

const searchLabels = (swipeSource.match(/Search on my own/g) || []).length;
assert.equal(searchLabels, 3, "normal routes must retain all three Search on my own placements");
assert(testingEnd > testingStart && swipeSource.slice(testingEnd, testingEnd + 500).includes("!isTestingMode"));
assert.equal(
  (swipeSource.match(/\{!isTestingMode \? \(/g) || []).length >= 2,
  true,
  "swipe-phase Search actions must be hidden in testing mode",
);
pass("/testing hides Search on my own while normal routes retain it");

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
