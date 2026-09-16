import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  MEDIA_MANIA_ENVIRONMENT_ASSETS,
  mediaManiaEnvironmentScene,
} from "./mediaManiaPresentation";
import type { MediaManiaState } from "./mediaManiaCore.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const screen = fs.readFileSync(path.join(root, "app/media-mania.tsx"), "utf8");
const environment = fs.readFileSync(path.join(root, "features/recommendation-games/media-mania/MediaManiaEnvironment.tsx"), "utf8");
const assetBuilder = fs.readFileSync(path.join(root, "scripts/build-media-mania-environment-assets.mjs"), "utf8");

const sceneFor = (
  startingSource: MediaManiaState["startingSource"],
  unlockStatus: MediaManiaState["unlockStatus"],
  roundType: "LIKE" | "DISLIKE" | null,
) => mediaManiaEnvironmentScene({
  startingSource,
  unlockStatus,
  currentRound: roundType ? { roundType } : null,
} as MediaManiaState);

test("environment scenes follow live landing, LIKE, DISLIKE, and unlock state", () => {
  assert.equal(sceneFor(null, "locked", null), "landing");
  assert.equal(sceneFor("books", "locked", "LIKE"), "like");
  assert.equal(sceneFor("books", "locked", "DISLIKE"), "dislike");
  assert.equal(sceneFor("books", "offered", "DISLIKE"), "unlock");
});

test("dedicated optimized assets back each semantic scene", () => {
  assert.deepEqual(MEDIA_MANIA_ENVIRONMENT_ASSETS, {
    landing: "landing.webp",
    like: "like.webp",
    dislike: "dislike.webp",
    unlock: "landing.webp",
  });
  for (const asset of new Set(Object.values(MEDIA_MANIA_ENVIRONMENT_ASSETS))) {
    const assetPath = path.join(root, "assets/games/media-mania-environment", asset);
    assert.ok(fs.statSync(assetPath).size > 20_000, `${asset} should be an optimized production backdrop`);
  }
  assert.match(assetBuilder, /--like/);
  assert.match(assetBuilder, /--dislike/);
  assert.doesNotMatch(assetBuilder, /extract\(/, "round assets must come from the dedicated clean references, not the earlier composite");
});

test("environment art is non-interactive while all game controls remain live React UI", () => {
  assert.match(environment, /pointerEvents="none"/);
  assert.match(environment, /accessible=\{false\}/);
  assert.match(environment, /importantForAccessibility="no-hide-descendants"/);
  assert.doesNotMatch(environment, /onPress=/, "decorative environment must never expose fake hotspots");
  assert.match(screen, /testID="media-mania-live-ui"/);
  assert.match(screen, /accessibilityLabel=\{`Start with/);
  assert.match(screen, /accessibilityLabel=\{`\$\{dislikeRound \? "Skip" : "Pick"\}/);
  assert.match(screen, /<MediaArtwork item=\{candidate\}/, "real media artwork must remain live in every choice");
});

test("LIKE and DISLIKE presentation changes the whole gameplay frame", () => {
  assert.match(screen, /media-mania-\$\{dislikeRound \? "dislike" : "like"\}-round/);
  assert.match(screen, /dislikeRound \? styles\.dislikeRoundSurface : styles\.likeRoundSurface/);
  assert.match(screen, /dislikeRound \? styles\.dislikeRoundBanner : styles\.likeRoundBanner/);
  assert.match(screen, /dislikeRound && styles\.progressFillDislike/);
  assert.match(screen, /tone=\{dislikeRound \? "dislike" : "like"\}/);
});
