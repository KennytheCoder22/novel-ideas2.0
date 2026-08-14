import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { shouldShowDesktopSwipeControls } from "./webSwipeControls.ts";

test("desktop web with a fine hover pointer shows desktop buttons", () => {
  assert.equal(
    shouldShowDesktopSwipeControls({
      platform: "web",
      isSmallScreen: false,
      hasFineHoverPointer: true,
    }),
    true
  );
});

test("a Chromebook-sized web viewport with a fine pointer still shows desktop buttons", () => {
  assert.equal(
    shouldShowDesktopSwipeControls({
      platform: "web",
      isSmallScreen: true,
      hasFineHoverPointer: true,
    }),
    true
  );
});

test("phone-sized touch-only web shows mobile swipe instructions", () => {
  assert.equal(
    shouldShowDesktopSwipeControls({
      platform: "web",
      isSmallScreen: true,
      hasFineHoverPointer: false,
    }),
    false
  );
});

test("native control selection keeps its existing viewport behavior", () => {
  assert.equal(
    shouldShowDesktopSwipeControls({
      platform: "ios",
      isSmallScreen: true,
      hasFineHoverPointer: true,
    }),
    false
  );
  assert.equal(
    shouldShowDesktopSwipeControls({
      platform: "android",
      isSmallScreen: false,
      hasFineHoverPointer: false,
    }),
    true
  );
});

test("gesture and desktop controls retain the existing swipe-session handlers", async () => {
  const screenSource = await readFile(new URL("../SwipeDeckScreen.tsx", import.meta.url), "utf8");

  assert.match(screenSource, /animateOffscreen\("left", handleLeft\)/);
  assert.match(screenSource, /animateOffscreen\("down", handleDownNotSure\)/);
  assert.match(screenSource, /animateOffscreen\("right", \(\) => handleRight\(card\)\)/);
  assert.match(screenSource, /direction: "like"/);
  assert.match(screenSource, /direction: "dislike"/);
  assert.match(screenSource, /direction: "skip"/);
});
