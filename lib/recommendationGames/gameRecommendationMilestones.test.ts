import assert from "node:assert/strict";
import test from "node:test";
import {
  ALCHEMISTS_CASCADE_MILESTONE_STEP,
  LAST_BOOKSHOP_MILESTONE_STEP,
  MEDIA_MANIA_MILESTONE_STEP,
  UNWRITTEN_MAP_MILESTONE_STEP,
  alchemistsCascadeMilestone,
  evaluateEveryNMilestone,
  lastBookshopMilestone,
  mediaManiaMilestone,
  unwrittenMapMilestone,
} from "./gameRecommendationMilestones";

test("media mania fires at the first 6 meaningful rounds, then every further 6", () => {
  assert.equal(MEDIA_MANIA_MILESTONE_STEP, 6);
  for (let round = 1; round < 6; round += 1) {
    assert.equal(mediaManiaMilestone(round, 0), null, `round ${round} should not fire`);
  }
  const first = mediaManiaMilestone(6, 0);
  assert.ok(first);
  assert.equal(first?.milestoneId, "media_mania:1");
  assert.equal(first?.milestoneIndex, 1);
  assert.equal(first?.evidenceCount, 6);

  for (let round = 7; round < 12; round += 1) {
    assert.equal(mediaManiaMilestone(round, 6), null, `round ${round} should not re-fire`);
  }
  const second = mediaManiaMilestone(12, 6);
  assert.ok(second);
  assert.equal(second?.milestoneId, "media_mania:2");
  assert.equal(second?.milestoneIndex, 2);
});

test("media mania does not fire again for the same count once already triggered", () => {
  assert.equal(mediaManiaMilestone(6, 6), null);
  assert.equal(mediaManiaMilestone(5, 0), null);
});

test("unknown/replacement rounds never advance the meaningful count seen by the policy", () => {
  // The caller is responsible for only ever passing `state.completedRoundCount`, which the
  // Media Mania core never increments on an "unknown" mark. This test documents that a count
  // that has not moved past a multiple of 6 must not fire twice.
  assert.equal(mediaManiaMilestone(6, 0)?.evidenceCount, 6);
  assert.deepEqual(mediaManiaMilestone(6, 0), mediaManiaMilestone(6, 0));
});

test("the last bookshop fires once per completed night (every 3 encounters)", () => {
  assert.equal(LAST_BOOKSHOP_MILESTONE_STEP, 3);
  assert.equal(lastBookshopMilestone(1, 0), null);
  assert.equal(lastBookshopMilestone(2, 0), null);
  const night1 = lastBookshopMilestone(3, 0);
  assert.equal(night1?.milestoneId, "the_last_bookshop:1");
  const night2 = lastBookshopMilestone(6, 3);
  assert.equal(night2?.milestoneId, "the_last_bookshop:2");
  assert.equal(lastBookshopMilestone(6, 6), null);
});

test("the unwritten map fires after every 4 preference-bearing (non-skip) choices", () => {
  assert.equal(UNWRITTEN_MAP_MILESTONE_STEP, 4);
  assert.equal(unwrittenMapMilestone(1, 0), null);
  assert.equal(unwrittenMapMilestone(3, 0), null);
  const first = unwrittenMapMilestone(4, 0);
  assert.equal(first?.milestoneId, "unwritten_map:1");
  const second = unwrittenMapMilestone(8, 4);
  assert.equal(second?.milestoneId, "unwritten_map:2");
});

test("the alchemist's cascade fires at each realm completion (every 3 newly completed levels)", () => {
  assert.equal(ALCHEMISTS_CASCADE_MILESTONE_STEP, 3);
  assert.equal(alchemistsCascadeMilestone(1, 0), null);
  assert.equal(alchemistsCascadeMilestone(2, 0), null);
  const realm1 = alchemistsCascadeMilestone(3, 0);
  assert.equal(realm1?.milestoneId, "alchemists_cascade:1");
  const realm2 = alchemistsCascadeMilestone(6, 3);
  assert.equal(realm2?.milestoneId, "alchemists_cascade:2");
  // Replaying an already-completed level must not move the unique-level count, so calling again
  // with the same count must not re-fire.
  assert.equal(alchemistsCascadeMilestone(6, 6), null);
});

test("evaluateEveryNMilestone rejects invalid inputs defensively", () => {
  assert.equal(evaluateEveryNMilestone("media_mania", -1, 6, 0), null);
  assert.equal(evaluateEveryNMilestone("media_mania", 6, 0, 0), null);
  assert.equal(evaluateEveryNMilestone("media_mania", 1.5, 6, 0), null);
});
