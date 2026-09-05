import assert from "node:assert/strict";
import test from "node:test";
import { gameRecommendationRewardContent } from "./gameRecommendationRewardContent";

test("reward content labels and separates a real description from the taste-fit reason", () => {
  const content = gameRecommendationRewardContent({
    description: "<p>Two friends uncover a hidden map.</p>",
    reason: "Your choices suggest you enjoy imaginative, playful stories.",
  });
  assert.deepEqual(content.description, {
    label: "About this book",
    text: "Two friends uncover a hidden map.",
  });
  assert.deepEqual(content.reason, {
    label: "Why it fits",
    text: "Your choices suggest you enjoy imaginative, playful stories.",
  });
});

test("reward content omits the description section when genuine text is unavailable", () => {
  const content = gameRecommendationRewardContent({
    description: null,
    reason: "A concise fit reason.",
  });
  assert.equal(content.description, null);
  assert.equal(content.reason.label, "Why it fits");
});
