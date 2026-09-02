import assert from "node:assert/strict";
import test from "node:test";
import {
  MEDIA_MANIA_AGE_BANDS,
  MEDIA_MANIA_SOURCES,
  MEDIA_MANIA_UNLOCK_SCORE,
  availableMediaManiaSources,
  changeMediaManiaAgeBand,
  chooseMediaManiaCandidate,
  createMediaManiaState,
  resolveMediaManiaUnlock,
  startMediaMania,
  type MediaManiaAgeBand,
} from "./mediaManiaCore.mjs";
import { MEDIA_MANIA_CATALOG, mediaManiaCatalogCountsByAgeBand } from "./mediaManiaCatalog";

const random = () => 0;
const expectedSources: Record<MediaManiaAgeBand, string[]> = {
  kids: ["books", "movies", "tv", "games"],
  preteens: ["books", "movies", "tv", "games", "youtube"],
  teens: ["books", "movies", "tv", "games", "anime"],
  adults: ["books", "movies", "tv", "games", "podcasts"],
};

test("production catalog keeps all seven sources and trusted age pools", () => {
  for (const source of MEDIA_MANIA_SOURCES) {
    assert.ok(MEDIA_MANIA_CATALOG.some((item) => item.mediaSource === source), `${source} missing globally`);
  }
  for (const ageBand of MEDIA_MANIA_AGE_BANDS) {
    const counts = mediaManiaCatalogCountsByAgeBand(ageBand);
    assert.deepEqual(availableMediaManiaSources(MEDIA_MANIA_CATALOG, ageBand), expectedSources[ageBand]);
    for (const source of expectedSources[ageBand]) assert.ok(counts[source] >= 4, `${ageBand}/${source} pool too small`);
  }
});

test("production deck membership prevents the reported Kids and Adult mix", () => {
  const peterRabbit = MEDIA_MANIA_CATALOG.find((item) => item.title === "The Tale of Peter Rabbit");
  const polarExpress = MEDIA_MANIA_CATALOG.find((item) => item.title === "The Polar Express");
  const expanse = MEDIA_MANIA_CATALOG.find((item) => item.title === "The Expanse");
  assert.ok(peterRabbit?.ageBands.includes("kids"));
  assert.ok(polarExpress?.ageBands.includes("kids"));
  assert.deepEqual(expanse?.ageBands, ["adults"]);
  assert.ok(!expanse?.ageBands.includes("kids"));
});

test("every production age band starts and unlocks age-safe cross-media play", () => {
  for (const ageBand of MEDIA_MANIA_AGE_BANDS) {
    const [startingSource] = availableMediaManiaSources(MEDIA_MANIA_CATALOG, ageBand);
    let state = createMediaManiaState({ playerId: "catalog-test", sessionId: `catalog-${ageBand}`, ageBand, nowMs: 1_000 });
    state = startMediaMania(state, startingSource, MEDIA_MANIA_CATALOG, { random, nowMs: 2_000 }).state;
    while (state.tasteScore < MEDIA_MANIA_UNLOCK_SCORE) {
      state = chooseMediaManiaCandidate(state, state.currentRound!.candidates[0].id, MEDIA_MANIA_CATALOG, {
        random,
        nowMs: 3_000 + state.completedRoundCount,
      }).state;
    }
    const secondSource = state.unlockOptions[0];
    state = resolveMediaManiaUnlock(state, secondSource, MEDIA_MANIA_CATALOG, { random, nowMs: 4_000 }).state;
    assert.equal(state.currentRound?.isCrossMedia, true);
    assert.ok(state.currentRound?.candidates.every((item) => item.ageBands.includes(ageBand)));
  }
});

test("sources without a trusted band pool fail closed", () => {
  const kidsState = createMediaManiaState({ playerId: "catalog-test", sessionId: "kids-anime", ageBand: "kids" });
  assert.throws(
    () => startMediaMania(kidsState, "anime", MEDIA_MANIA_CATALOG, { random }),
    /at least four anime items for kids/,
  );
});

test("changing to a band without the current source returns safely to source selection", () => {
  const teenState = createMediaManiaState({ playerId: "catalog-test", sessionId: "teen-anime", ageBand: "teens" });
  const playingAnime = startMediaMania(teenState, "anime", MEDIA_MANIA_CATALOG, { random }).state;
  const changed = changeMediaManiaAgeBand(playingAnime, "kids", MEDIA_MANIA_CATALOG, { random }).state;
  assert.equal(changed.ageBand, "kids");
  assert.equal(changed.startingSource, null);
  assert.deepEqual(changed.activeSources, []);
  assert.equal(changed.currentRound, null);
});
