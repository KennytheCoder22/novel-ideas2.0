#!/usr/bin/env node

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(output, filename);
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { buildTasteProfile } = require(resolve(root, "app/recommender-v2/tasteProfile.ts"));
const { buildSearchPlan } = require(resolve(root, "app/recommender-v2/searchPlan.ts"));
const { scoreCandidates } = require(resolve(root, "app/recommender-v2/score.ts"));
const { selectRecommendations } = require(resolve(root, "app/recommender-v2/select.ts"));
const { createHumanReviewSnapshot } = require(resolve(root, "screens/swipe/humanReviewContract.ts"));

const ages = ["kids", "preteens", "teens", "adult"];
const baseSignals = [
  {
    id: "liked",
    title: "Liked Adventure",
    action: "like",
    source: "googleBooks",
    format: "book",
    genres: ["adventure"],
    tones: ["hopeful"],
    themes: ["friendship"],
    tags: ["fast-paced"],
  },
  {
    id: "disliked",
    title: "Disliked Horror",
    action: "dislike",
    source: "openLibrary",
    format: "book",
    genres: ["horror"],
    tones: ["bleak"],
    themes: ["gore"],
  },
];
const skippedSignal = {
  id: "skipped",
  title: "Skipped Magic",
  action: "skip",
  source: "kitsu",
  format: "manga",
  genres: ["fantasy"],
  tones: ["dark"],
  themes: ["magic"],
  characterDynamics: ["chosen one"],
  tags: ["dragons", "slow-paced"],
  weight: 99,
};

function recommendationProfile(profile) {
  const { diagnostics, ...usedForRecommendations } = profile;
  return usedForRecommendations;
}

function candidates() {
  return [
    {
      id: "adventure",
      source: "googleBooks",
      sourceId: "adventure",
      title: "Hopeful Friendship Adventure",
      creators: ["A. Author"],
      description: "A hopeful fast-paced friendship adventure.",
      formats: ["book"],
      genres: ["adventure"],
      themes: ["friendship"],
      tones: ["hopeful"],
      characterDynamics: [],
      raw: {},
      diagnostics: {},
    },
    {
      id: "fantasy",
      source: "googleBooks",
      sourceId: "fantasy",
      title: "Dark Dragon Magic",
      creators: ["B. Author"],
      description: "A dark chosen one discovers dragons and magic.",
      formats: ["book"],
      genres: ["fantasy"],
      themes: ["magic"],
      tones: ["dark"],
      characterDynamics: ["chosen one"],
      raw: {},
      diagnostics: {},
    },
  ];
}

for (const ageBand of ages) {
  const withoutSkip = buildTasteProfile({ ageBand, signals: baseSignals });
  const withSkip = buildTasteProfile({ ageBand, signals: [...baseSignals, skippedSignal] });
  assert.deepEqual(
    recommendationProfile(withSkip),
    recommendationProfile(withoutSkip),
    `${ageBand}: Skip changed the recommendation taste profile`,
  );
  assert.equal(withSkip.diagnostics.skippedCount, 1, `${ageBand}: Skip telemetry count was not preserved`);

  const planWithoutSkip = buildSearchPlan(withoutSkip, { googleBooks: true, openLibrary: true, kitsu: true });
  const planWithSkip = buildSearchPlan(withSkip, { googleBooks: true, openLibrary: true, kitsu: true });
  assert.deepEqual(planWithSkip, planWithoutSkip, `${ageBand}: Skip changed generated queries or source routing`);

  const scoredWithoutSkip = scoreCandidates(candidates(), withoutSkip);
  const scoredWithSkip = scoreCandidates(candidates(), withSkip);
  assert.deepEqual(scoredWithSkip, scoredWithoutSkip, `${ageBand}: Skip changed candidate scores`);
  assert.deepEqual(
    selectRecommendations(scoredWithSkip, withSkip, 2).selected.map((item) => item.id),
    selectRecommendations(scoredWithoutSkip, withoutSkip, 2).selected.map((item) => item.id),
    `${ageBand}: Skip changed recommendation ranking`,
  );

  const skipOnly = buildTasteProfile({ ageBand, signals: [skippedSignal] });
  assert.deepEqual(skipOnly.genreFamily, [], `${ageBand}: Skip-only session created genre evidence`);
  assert.deepEqual(skipOnly.tone, [], `${ageBand}: Skip-only session created tone evidence`);
  assert.deepEqual(skipOnly.themes, [], `${ageBand}: Skip-only session created theme evidence`);
  assert.deepEqual(skipOnly.pacing, [], `${ageBand}: Skip-only session created pacing evidence`);
  assert.deepEqual(skipOnly.characterDynamics, [], `${ageBand}: Skip-only session created character evidence`);
  assert.deepEqual(skipOnly.formatPreference, [], `${ageBand}: Skip-only session created format evidence`);
  assert.deepEqual(skipOnly.sourceHints, [], `${ageBand}: Skip-only session created source hints`);
  assert.deepEqual(
    buildSearchPlan(skipOnly, { googleBooks: true, openLibrary: true, kitsu: true }),
    buildSearchPlan(buildTasteProfile({ ageBand, signals: [] }), { googleBooks: true, openLibrary: true, kitsu: true }),
    `${ageBand}: Skip-only session changed generic query or source routing`,
  );
  const emptyProfile = buildTasteProfile({ ageBand, signals: [] });
  const skipOnlyScores = scoreCandidates(candidates(), skipOnly);
  const emptyScores = scoreCandidates(candidates(), emptyProfile);
  assert.deepEqual(skipOnlyScores, emptyScores, `${ageBand}: Skip-only content changed candidate scores`);
  assert.deepEqual(
    selectRecommendations(skipOnlyScores, skipOnly, 2).selected.map((item) => item.id),
    selectRecommendations(emptyScores, emptyProfile, 2).selected.map((item) => item.id),
    `${ageBand}: Skip-only content changed recommendation ranking`,
  );
}

const telemetrySnapshot = createHumanReviewSnapshot({
  ageBand: "teens",
  deckKey: "ms_hs",
  engineVersion: "v2",
  swipeSignals: [...baseSignals, skippedSignal],
  recommendationItems: [{ rank: 1, title: "Result", author: "Author", source: "googleBooks" }],
});
assert.equal(telemetrySnapshot.swipeSignals.some((signal) => signal.action === "skip"), true, "Skip telemetry was removed");

console.log(`Skip neutrality regressions: ${ages.length} age bands passed`);
