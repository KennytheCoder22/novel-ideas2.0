import assert from "node:assert/strict";
import test from "node:test";
import { computeGameRecommendationRewardLayout } from "./gameRecommendationRewardLayout";

test("narrow widths (phones) stack the cover above the text", () => {
  assert.equal(computeGameRecommendationRewardLayout(320), "stacked");
  assert.equal(computeGameRecommendationRewardLayout(519), "stacked");
});

test("wide widths (tablets/desktop) place the cover beside the text", () => {
  assert.equal(computeGameRecommendationRewardLayout(520), "sideBySide");
  assert.equal(computeGameRecommendationRewardLayout(1024), "sideBySide");
});
