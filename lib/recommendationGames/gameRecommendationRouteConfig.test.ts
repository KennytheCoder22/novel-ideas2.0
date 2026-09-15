import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLocalCollectionOnlyRouting,
  buildGameReadingAgeParams,
  buildGameRouteSourceParams,
  buildGamesPortalRouteParams,
  gameProgressScopeForRoute,
  gameRouteSourceFlagsToEnabledSources,
  normalizeGameRouteAgeBand,
  parseGameRouteConfig,
} from "./gameRecommendationRouteConfig";

test("direct routes with no params fall back to safe defaults with local collection disabled", () => {
  const config = parseGameRouteConfig({});
  assert.equal(config.libraryId, "default");
  assert.equal(config.ageBand, "teens");
  assert.equal(config.sourceFlags.localLibrary, false);
  assert.equal(config.localCollectionOnly, false);
  assert.equal(config.sourceFlags.googleBooks, true);
  assert.equal(config.sourceFlags.nyt, false);
});

test("age band route params are parsed for every supported band, including Home's plural 'adults'", () => {
  assert.equal(normalizeGameRouteAgeBand("kids"), "kids");
  assert.equal(normalizeGameRouteAgeBand("preteens"), "preteens");
  assert.equal(normalizeGameRouteAgeBand("teens"), "teens");
  assert.equal(normalizeGameRouteAgeBand("adult"), "adult");
  assert.equal(normalizeGameRouteAgeBand("adults"), "adult");
  assert.equal(normalizeGameRouteAgeBand("unknown"), "teens");
});

test("local-collection-only routing forces every hosted source off, exactly as the Home screen does", () => {
  const flags = applyLocalCollectionOnlyRouting({
    googleBooks: true, openLibrary: true, localLibrary: true, kitsu: true, comicVine: true, nyt: true,
  });
  assert.deepEqual(flags, {
    googleBooks: false, openLibrary: false, localLibrary: true, kitsu: false, comicVine: false, nyt: false,
  });
});

test("source flags parsed from route params round-trip through buildGameRouteSourceParams", () => {
  const params = buildGameRouteSourceParams({
    googleBooks: true, openLibrary: false, localLibrary: false, kitsu: true, comicVine: false, nyt: true,
  });
  const config = parseGameRouteConfig({ ...params, ageBand: "kids", libraryId: "yvhs", playerId: "patron-1" });
  assert.equal(config.ageBand, "kids");
  assert.equal(config.libraryId, "yvhs");
  assert.equal(config.playerId, "patron-1");
  assert.deepEqual(config.sourceFlags, {
    googleBooks: true, openLibrary: false, localLibrary: false, kitsu: true, comicVine: false, nyt: true,
  });
});

test("direct reading-age switches preserve route context and restore the original Teens progress scope", () => {
  const original: Record<string, string> = {
    playerId: "patron-1",
    libraryId: "yvhs",
    ageBand: "teens",
    srcGoogleBooks: "0",
    srcOpenLibrary: "1",
    srcLocalLibrary: "1",
    srcKitsu: "0",
    srcComicVine: "0",
    srcNyt: "0",
    campaign: "summer",
  };
  const kids = { ...original, ...buildGameReadingAgeParams(original, "kids") };
  assert.equal(kids.ageBand, "kids");
  assert.equal(kids.readingAgeOverride, "1");
  assert.equal(kids.readingAgeBase, "teens");
  assert.equal(kids.playerId, original.playerId);
  assert.equal(kids.libraryId, original.libraryId);
  assert.equal(kids.srcLocalLibrary, "1");
  assert.equal(kids.campaign, "summer");

  const teensAgain = { ...kids, ...buildGameReadingAgeParams(kids, "teens") };
  assert.equal(teensAgain.ageBand, "teens");
  assert.equal(teensAgain.readingAgeOverride, "0");
  assert.equal(gameProgressScopeForRoute("game-scope", "teens", original), "game-scope");
  assert.equal(gameProgressScopeForRoute("game-scope", "kids", kids), "game-scope:age:kids");
  assert.equal(gameProgressScopeForRoute("game-scope", "teens", teensAgain), "game-scope");
});

test("Back to Games route params preserve player, library, source, and reading-age context", () => {
  const params = {
    playerId: "patron-1",
    libraryId: "yvhs",
    ageBand: "kids",
    srcGoogleBooks: "0",
    srcOpenLibrary: "0",
    srcLocalLibrary: "1",
    srcKitsu: "0",
    srcComicVine: "0",
    srcNyt: "0",
    readingAgeOverride: "1",
    readingAgeBase: "teens",
  };
  assert.deepEqual(buildGamesPortalRouteParams(parseGameRouteConfig(params), params), params);
});

test("enabledSources mapping always disables the debug-only mock source", () => {
  const enabledSources = gameRouteSourceFlagsToEnabledSources({
    googleBooks: true, openLibrary: true, localLibrary: false, kitsu: true, comicVine: true, nyt: true,
  });
  assert.equal(enabledSources.mock, false);
  assert.equal(enabledSources.googleBooks, true);
});
