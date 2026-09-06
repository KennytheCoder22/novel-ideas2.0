import assert from "node:assert/strict";
import test from "node:test";
import {
  isMediaManiaGameplayKeyboardBlocked,
  normalizeMediaManiaAgeBand,
  reconcileMediaManiaRouteAge,
} from "./mediaManiaUiGuards";
import { MEDIA_MANIA_CATALOG } from "./mediaManiaCatalog";
import { createMediaManiaState } from "./mediaManiaCore.mjs";

test("singular and plural adult routes use the trusted adults deck", () => {
  assert.equal(normalizeMediaManiaAgeBand("adult"), "adults");
  assert.equal(normalizeMediaManiaAgeBand("adults"), "adults");
  assert.equal(normalizeMediaManiaAgeBand("kids"), "kids");
});

test("a recommendation reward blocks gameplay keyboard input", () => {
  const base = {
    repeat: false,
    locked: false,
    hintVisible: false,
    recommendationRewardVisible: false,
    hasCurrentRound: true,
    unlockOffered: false,
  };
  assert.equal(isMediaManiaGameplayKeyboardBlocked(base), false);
  assert.equal(isMediaManiaGameplayKeyboardBlocked({
    ...base,
    recommendationRewardVisible: true,
  }), true);
});

test("an existing save is reconciled to the adult route before continuation", () => {
  const teensSave = createMediaManiaState({
    playerId: "route-reader",
    sessionId: "route-session",
    libraryId: "default",
    ageBand: "teens",
    nowMs: 1,
  });
  const routed = reconcileMediaManiaRouteAge(teensSave, "adults", MEDIA_MANIA_CATALOG);
  assert.equal(routed?.state.ageBand, "adults");
  assert.equal(routed?.state.currentRound, null);
  assert.equal(routed?.events[0]?.action, "age_band_changed");
  assert.equal(reconcileMediaManiaRouteAge(routed!.state, "adults", MEDIA_MANIA_CATALOG), null);
});
