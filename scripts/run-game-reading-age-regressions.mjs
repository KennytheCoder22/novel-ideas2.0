import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  module._compile(output, filename);
};

const routes = require(resolve(root, "lib/recommendationGames/gameRecommendationRouteConfig.ts"));
const cascade = require(resolve(root, "lib/recommendationGames/alchemistsCascade.ts"));
const lastBookshop = require(resolve(root, "lib/recommendationGames/lastBookshopProgressStorage.ts"));
const unwrittenMap = require(resolve(root, "lib/recommendationGames/unwrittenMap.ts"));

const componentSource = readFileSync(resolve(root, "components/GameReadingAge.tsx"), "utf8");
const gamesPortalSource = readFileSync(resolve(root, "app/games/index.tsx"), "utf8");
const gameSources = [
  "app/games/alchemists-cascade.tsx",
  "app/games/melanies-game.tsx",
  "app/games/last-bookshop.tsx",
  "app/games/unwritten-map.tsx",
].map((file) => readFileSync(resolve(root, file), "utf8"));

for (const [id, label] of [
  ["kids", "Kids"],
  ["preteens", "Pre-Teens"],
  ["teens", "Teens"],
  ["adult", "Adults"],
]) {
  assert(componentSource.includes(`["${id}", "${label}"]`), `${label} must remain an always-visible reading-age choice`);
}
assert(componentSource.includes("bands.map"), "the shared selector must render all four choices together");
assert(componentSource.includes('accessibilityRole="button"'), "age choices must expose button semantics");
assert(componentSource.includes("accessibilityState={{ selected }}"), "the active age must expose selected state");
assert(componentSource.includes("minHeight: 36"), "age choices must match the compact Media Mania touch target");
assert(componentSource.includes('backgroundColor: "transparent"'), "age choices must remain visually lightweight and outlined");
assert(componentSource.includes('alignSelf: "center"'), "the age group must remain content-width instead of stretching across the screen");
assert(!componentSource.slice(componentSource.indexOf("bar:"), componentSource.indexOf("button:")).includes("backgroundColor"),
  "the age group must not sit inside a full-width colored banner");
assert(!componentSource.includes("theme.surfaceColor"),
  "the shared wrapper must leave each game's original artwork and background in control");
assert(!componentSource.slice(componentSource.indexOf("button:"), componentSource.indexOf("label:")).includes("flex: 1"),
  "age buttons must size to their labels instead of stretching");
assert(componentSource.includes("theme.accentColor") && componentSource.includes("theme.selectedBackgroundColor"),
  "the selected age must use each game's accent treatment");
assert(componentSource.includes("router.setParams(buildGameReadingAgeParams(params, id))"), "one click must directly update the route age");
assert(!componentSource.includes("useState") && !componentSource.includes("pending") && !componentSource.includes("Use this reading age"),
  "the selector must not retain the old disclosure and confirmation flow");
assert(gameSources.every((source) => source.includes("withGameReadingAge")),
  "all four recommendation games must use the shared reading-age selector");
assert(gameSources.every((source) => source.includes("accentColor:")),
  "all four recommendation games must supply their own accent color");

const originalParams = {
  playerId: "reader-7",
  libraryId: "central",
  ageBand: "teens",
  srcGoogleBooks: "0",
  srcOpenLibrary: "1",
  srcLocalLibrary: "1",
  srcKitsu: "0",
  srcComicVine: "0",
  srcNyt: "0",
};
for (const ageBand of ["kids", "preteens", "teens", "adult"]) {
  const switched = { ...originalParams, ...routes.buildGameReadingAgeParams(originalParams, ageBand) };
  assert.equal(switched.ageBand, ageBand, `${ageBand} must switch directly in one route update`);
  assert.equal(switched.readingAgeOverride, ageBand === "teens" ? "0" : "1");
  assert.equal(switched.playerId, originalParams.playerId);
  assert.equal(switched.libraryId, originalParams.libraryId);
  assert.equal(switched.srcLocalLibrary, originalParams.srcLocalLibrary);
}
const kidsParams = { ...originalParams, ...routes.buildGameReadingAgeParams(originalParams, "kids") };
const teensAgainParams = { ...kidsParams, ...routes.buildGameReadingAgeParams(kidsParams, "teens") };

assert.equal(kidsParams.readingAgeOverride, "1");
assert.equal(kidsParams.readingAgeBase, "teens");
assert.equal(teensAgainParams.readingAgeOverride, "0");
for (const key of ["playerId", "libraryId", "srcGoogleBooks", "srcOpenLibrary", "srcLocalLibrary", "srcKitsu", "srcComicVine", "srcNyt"]) {
  assert.equal(kidsParams[key], originalParams[key], `${key} must survive a direct age switch`);
  assert.equal(teensAgainParams[key], originalParams[key], `${key} must survive switching back to Teens`);
}

const originalConfig = routes.parseGameRouteConfig(originalParams);
const kidsConfig = routes.parseGameRouteConfig(kidsParams);
const teensAgainConfig = routes.parseGameRouteConfig(teensAgainParams);

const cascadeBase = cascade.createCascadeScope(originalConfig.playerId, originalConfig.libraryId).scopeKey;
const cascadeTeen = routes.gameProgressScopeForRoute(cascadeBase, originalConfig.ageBand, originalParams);
const cascadeKids = routes.gameProgressScopeForRoute(cascadeBase, kidsConfig.ageBand, kidsParams);
const cascadeTeenAgain = routes.gameProgressScopeForRoute(cascadeBase, teensAgainConfig.ageBand, teensAgainParams);
assert.notEqual(cascadeTeen, cascadeKids, "Alchemist's Cascade must isolate Kids and Teens progress");
assert.equal(cascadeTeenAgain, cascadeTeen, "Alchemist's Cascade must restore the original Teens progress scope");

const lastBookshopTeen = lastBookshop.lastBookshopProgressScopeKey(originalConfig);
const lastBookshopKids = lastBookshop.lastBookshopProgressScopeKey(kidsConfig);
const lastBookshopTeenAgain = lastBookshop.lastBookshopProgressScopeKey(teensAgainConfig);
assert.notEqual(lastBookshopTeen, lastBookshopKids, "The Last Bookshop must isolate Kids and Teens progress");
assert.equal(lastBookshopTeenAgain, lastBookshopTeen, "The Last Bookshop must restore the original Teens progress scope");

const mapBase = unwrittenMap.storageScopeKey(originalConfig.libraryId, originalConfig.playerId);
const mapTeen = routes.gameProgressScopeForRoute(mapBase, originalConfig.ageBand, originalParams);
const mapKids = routes.gameProgressScopeForRoute(mapBase, kidsConfig.ageBand, kidsParams);
const mapTeenAgain = routes.gameProgressScopeForRoute(mapBase, teensAgainConfig.ageBand, teensAgainParams);
assert.notEqual(mapTeen, mapKids, "The Unwritten Map must isolate Kids and Teens progress");
assert.equal(mapTeenAgain, mapTeen, "The Unwritten Map must restore the original Teens progress scope");

const melanieTeen = routes.gameRouteConfigScope(originalConfig);
const melanieKids = routes.gameRouteConfigScope(kidsConfig);
const melanieTeenAgain = routes.gameRouteConfigScope(teensAgainConfig);
assert.notEqual(melanieTeen, melanieKids, "Melanie's Game must isolate Kids and Teens progress");
assert.equal(melanieTeenAgain, melanieTeen, "Melanie's Game must restore the original Teens progress scope");

const portalParams = routes.buildGamesPortalRouteParams(kidsConfig, kidsParams);
assert.equal(portalParams.playerId, originalParams.playerId);
assert.equal(portalParams.libraryId, originalParams.libraryId);
assert.equal(portalParams.srcLocalLibrary, "1");
assert.equal(portalParams.readingAgeOverride, "1");
assert.equal(portalParams.readingAgeBase, "teens");
assert(gamesPortalSource.includes("readingAgeBase"), "the games portal must forward the original age scope");

console.log("game_reading_age_regressions: ok");
