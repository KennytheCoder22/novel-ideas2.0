import assert from "node:assert/strict";
import test from "node:test";
import {
  gameRecommendationReasonFromMatchedSignals,
  safeGameRecommendationReason,
} from "./gameRecommendationReason";

function containsProhibitedToken(value: string): boolean {
  return /positiveTasteMatch|genreFacetMatch|avoidSignalPenalty|[_:]|\d|\b(?:high|low|weight|score|diagnostic|taxonomy)\b/i.test(value)
    || /[a-z][A-Z]/.test(value);
}

test("reason generation translates recommender internals into concise natural language", () => {
  const reason = gameRecommendationReasonFromMatchedSignals([
    "positiveTasteMatch:humor high",
    "positiveTasteMatch:imagination high",
    "genreFacetMatch:fantasy",
  ]);
  assert.equal(reason, "Your choices suggest you enjoy playful, imaginative stories.");
  assert.equal(containsProhibitedToken(reason), false);
});

test("reason generation handles each game evidence shape without leaking raw taxonomy", () => {
  const fixtures = [
    ["positiveTasteMatch:tone:cozy", "genreFacetMatch:mystery"],
    ["positiveTasteMatch:genre fantasy", "positiveTasteMatch:vibe cozy"],
    ["positiveTasteMatch:pitch:world", "genreFacetMatch:adventure"],
    ["positiveTasteMatch:social_energy:high", "positiveTasteMatch:imagination:high"],
    ["positiveTasteMatch:emotional_depth:high", "positiveTasteMatch:pace:low"],
  ];
  for (const matchedSignals of fixtures) {
    const reason = gameRecommendationReasonFromMatchedSignals(matchedSignals);
    assert.match(reason, /^Your choices suggest/);
    assert.equal(containsProhibitedToken(reason), false);
  }
});

test("reason generation omits negative scoring labels and falls back safely", () => {
  assert.equal(
    gameRecommendationReasonFromMatchedSignals(["avoidSignalPenalty:precise:violence", "queryRungBonus:2"]),
    "Your choices suggest this story could be a good fit.",
  );
});

test("the shared UI boundary rejects internal-looking reason fixtures", () => {
  const fixtures = [
    "It matches positiveTasteMatch:humor high.",
    "Because taxonomy_key was weighted 1.5.",
    "Based on genreFacetMatch fantasy.",
    "A scoreBucket suggests this.",
  ];
  for (const fixture of fixtures) {
    const reason = safeGameRecommendationReason(fixture);
    assert.equal(reason, "Your choices suggest this story could be a good fit.");
    assert.equal(containsProhibitedToken(reason), false);
  }
  assert.equal(
    safeGameRecommendationReason("Your choices suggest you enjoy imaginative, playful stories."),
    "Your choices suggest you enjoy imaginative, playful stories.",
  );
});
