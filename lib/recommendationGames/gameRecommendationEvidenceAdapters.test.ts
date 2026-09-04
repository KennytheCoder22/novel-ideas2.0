import assert from "node:assert/strict";
import test from "node:test";
import {
  ALCHEMISTS_CASCADE_EVIDENCE_MODE,
  LAST_BOOKSHOP_EVIDENCE_MODE,
  MEDIA_MANIA_EVIDENCE_MODE,
  UNWRITTEN_MAP_EVIDENCE_MODE,
  adaptAlchemistsCascadeCatalystToSignal,
  adaptLastBookshopEncounterToSignals,
  adaptMediaManiaEvidenceToSignals,
  adaptUnwrittenMapChoiceToSignal,
} from "./gameRecommendationEvidenceAdapters";

test("media mania adapter maps positive/negative catalog item IDs to like/dislike signals using catalog traitKeys", () => {
  const catalog = [
    { id: "a", source: "s", mediaSource: "books", title: "Atlas of Small Stars", traitKeys: ["tone:cozy", "pace:slow"] },
    { id: "b", source: "s", mediaSource: "movies", title: "Neon Skyline", traitKeys: ["tone:tense"] },
    { id: "c", source: "s", mediaSource: "games", title: "Ignored", traitKeys: ["tone:x"] },
  ];
  const signals = adaptMediaManiaEvidenceToSignals({
    newPositiveItemIds: ["a"],
    newNegativeItemIds: ["b"],
    catalog,
  });
  assert.equal(signals.length, 2);
  assert.equal(signals[0].action, "like");
  assert.deepEqual(signals[0].tones, ["cozy"]);
  assert.deepEqual(signals[0].tags, ["slow-paced"]);
  assert.equal(signals[1].action, "dislike");
  assert.deepEqual(signals[1].tones, ["tense"]);
  assert.equal(MEDIA_MANIA_EVIDENCE_MODE, "cross_media");
});

test("media mania adapter routes prefixed production traits into supported recommender fields", () => {
  const [signal] = adaptMediaManiaEvidenceToSignals({
    newPositiveItemIds: ["picture-book"],
    newNegativeItemIds: [],
    catalog: [{
      id: "picture-book",
      source: "deck",
      mediaSource: "books",
      title: "The Very Hungry Caterpillar",
      traitKeys: [
        "genre:animals",
        "tone:gentle",
        "theme:imagination",
        "format:picture_book",
        "vibe:cozy",
        "pacing:low",
        "publisher:example",
      ],
    }],
  });
  assert.deepEqual(signal.genres, ["animals"]);
  assert.deepEqual(signal.tones, ["gentle", "cozy"]);
  assert.deepEqual(signal.themes, ["imagination"]);
  assert.deepEqual(signal.tags, ["slow-paced"]);
  assert.equal(signal.format, "book");
});

test("media mania adapter does not mislabel unsupported screen formats as books", () => {
  const [signal] = adaptMediaManiaEvidenceToSignals({
    newPositiveItemIds: [],
    newNegativeItemIds: ["tv-series"],
    catalog: [{
      id: "tv-series",
      source: "deck",
      mediaSource: "tv",
      title: "Sesame Street",
      traitKeys: ["format:series", "genre:comedy"],
    }],
  });
  assert.equal(signal.format, undefined);
  assert.deepEqual(signal.genres, ["comedy"]);
});

test("media mania adapter silently skips ids that are not in the provided catalog slice", () => {
  const signals = adaptMediaManiaEvidenceToSignals({
    newPositiveItemIds: ["missing"],
    newNegativeItemIds: [],
    catalog: [],
  });
  assert.deepEqual(signals, []);
});

test("last bookshop adapter derives signals only from the selected works, prediction, and pitch charm", () => {
  const works = [
    { id: "work-1", title: "Atlas of Small Stars", tags: ["cozy", "mystery"] },
    { id: "work-2", title: "Neon Skyline", tags: ["tense"] },
    { id: "work-3", title: "Third Work", tags: ["adventure"] },
  ];
  const signals = adaptLastBookshopEncounterToSignals({
    selectedWorkIds: ["work-1", "work-2", "work-3"],
    predictedWorkId: "work-2",
    pitchCharm: "mood",
    works,
  });
  assert.equal(signals.length, 3);
  assert.ok(signals.every((signal) => signal.action === "like"));
  assert.ok(signals.every((signal) => signal.format === "book"));
  assert.deepEqual(signals[0].genres, ["mystery"]);
  assert.deepEqual(signals[0].tones, ["cozy"]);
  assert.deepEqual(signals[0].tags, []);
  assert.deepEqual(signals[1].tones, ["tense", "atmospheric"]);
  assert.deepEqual(signals[2].genres, ["adventure"]);
  const predicted = signals.find((signal) => signal.id === "work-2");
  assert.equal(predicted?.weight, 1.5);
  const notPredicted = signals.find((signal) => signal.id === "work-1");
  assert.equal(notPredicted?.weight, 1);
  assert.equal(LAST_BOOKSHOP_EVIDENCE_MODE, "cross_media");
});

test("unwritten map adapter derives one semantic signal from the selected option's tags and taste vector", () => {
  const signal = adaptUnwrittenMapChoiceToSignal({
    scenarioId: "scenario-1",
    option: { id: "option-a", label: "Follow the music", tags: ["curious", "gentle"], tasteVector: { novelty: 2, structure: -1 } },
  });
  assert.equal(signal.action, "like");
  assert.deepEqual(signal.tags, []);
  assert.deepEqual(signal.tones, ["gentle"]);
  assert.deepEqual(signal.themes?.sort(), ["curious", "exploratory", "surprising"].sort());
  assert.equal(signal.id, "unwritten-map:scenario-1:option-a");
  assert.equal(UNWRITTEN_MAP_EVIDENCE_MODE, "semantic_only");
});

test("alchemist's cascade adapter derives one semantic signal from an eligible balanced catalyst option", () => {
  const signal = adaptAlchemistsCascadeCatalystToSignal({
    id: "hearth-song",
    title: "Sing to the flame",
    tags: ["bold", "playful", "kinetic"],
    tasteVector: { intensity: 2, pace: 1, humor: 1 },
  });
  assert.equal(signal.action, "like");
  assert.deepEqual(signal.tags, ["fast-paced"]);
  assert.deepEqual(signal.genres, ["comedy"]);
  assert.deepEqual(signal.tones?.sort(), ["adventurous", "humorous", "playful"].sort());
  assert.equal(signal.id, "alchemists-cascade:catalyst:hearth-song");
  assert.equal(ALCHEMISTS_CASCADE_EVIDENCE_MODE, "semantic_only");
});

test("cross_media and semantic_only evidence modes never overlap across the four games", () => {
  const modes = new Set([
    MEDIA_MANIA_EVIDENCE_MODE,
    LAST_BOOKSHOP_EVIDENCE_MODE,
    UNWRITTEN_MAP_EVIDENCE_MODE,
    ALCHEMISTS_CASCADE_EVIDENCE_MODE,
  ]);
  assert.deepEqual([...modes].sort(), ["cross_media", "semantic_only"]);
});
