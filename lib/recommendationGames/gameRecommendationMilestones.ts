// Pure, testable milestone policy for the shared game-recommendation-reward loop. Every function
// here is a deterministic function of counters already tracked by each game's own progress state;
// none of it depends on I/O, timers, or the recommender engine, so it can be exercised exhaustively
// in unit tests.
import type { RecommendationGameId } from "./gameRecommendationFeedback";

export type MilestoneEvaluation = {
  eligible: true;
  game: RecommendationGameId;
  milestoneId: string;
  milestoneIndex: number;
  evidenceCount: number;
};

/** Generic "every N meaningful units, starting at N" milestone shape shared by all four games.
 * `meaningfulCount` must only include evidence-bearing units (a game's own rules for what counts
 * as "meaningful" - e.g. excluding unknown/replacement rounds, skipped choices, or replayed
 * levels - are applied by the caller before this function ever sees the number).
 * `lastTriggeredAtCount` is the meaningful count at which the most recent milestone for this game
 * session already fired (0 if none yet). Returns null when no new milestone has been reached. */
export function evaluateEveryNMilestone(
  game: RecommendationGameId,
  meaningfulCount: number,
  step: number,
  lastTriggeredAtCount: number,
): MilestoneEvaluation | null {
  if (!Number.isInteger(meaningfulCount) || meaningfulCount < 0) return null;
  if (!Number.isInteger(step) || step < 1) return null;
  if (meaningfulCount < step) return null;
  if (meaningfulCount % step !== 0) return null;
  if (meaningfulCount <= lastTriggeredAtCount) return null;
  return {
    eligible: true,
    game,
    milestoneId: `${game}:${meaningfulCount / step}`,
    milestoneIndex: meaningfulCount / step,
    evidenceCount: meaningfulCount,
  };
}

export const MEDIA_MANIA_MILESTONE_STEP = 6;
export const LAST_BOOKSHOP_MILESTONE_STEP = 3;
export const UNWRITTEN_MAP_MILESTONE_STEP = 4;
export const ALCHEMISTS_CASCADE_MILESTONE_STEP = 3;

/** Media Mania: after 6 meaningful completed rounds, then every 6 further meaningful completed
 * rounds. `meaningfulCompletedRoundCount` must be `state.completedRoundCount`, which only
 * increments on an actual like/dislike choice - marking a candidate or basis item "unknown" (a
 * replacement) never increments it. */
export function mediaManiaMilestone(
  meaningfulCompletedRoundCount: number,
  lastTriggeredAtCount: number,
): MilestoneEvaluation | null {
  return evaluateEveryNMilestone("media_mania", meaningfulCompletedRoundCount, MEDIA_MANIA_MILESTONE_STEP, lastTriggeredAtCount);
}

/** The Last Bookshop: once per completed night (3 encounters per night).
 * `completedEncounterCount` must be `progress.completedEncounterIds.length`. */
export function lastBookshopMilestone(
  completedEncounterCount: number,
  lastTriggeredAtCount: number,
): MilestoneEvaluation | null {
  return evaluateEveryNMilestone("the_last_bookshop", completedEncounterCount, LAST_BOOKSHOP_MILESTONE_STEP, lastTriggeredAtCount);
}

/** The Unwritten Map: after every 4 completed preference-bearing narrative choices. Skipped
 * encounters do not count, so `preferenceBearingChoiceCount` must only count
 * `save.decisions` entries whose `kind` is `"choice"` (never `"skip"`), and must never count
 * `save.undoneDecisions`. */
export function unwrittenMapMilestone(
  preferenceBearingChoiceCount: number,
  lastTriggeredAtCount: number,
): MilestoneEvaluation | null {
  return evaluateEveryNMilestone("unwritten_map", preferenceBearingChoiceCount, UNWRITTEN_MAP_MILESTONE_STEP, lastTriggeredAtCount);
}

/** The Alchemist's Cascade: at each realm completion, i.e. every 3 newly completed unique levels.
 * `uniqueCompletedLevelCount` must be the count of distinct level ids that have ever been won
 * (e.g. `Object.keys(save.levelStars).length`), so replaying an already-completed level never
 * increases it. */
export function alchemistsCascadeMilestone(
  uniqueCompletedLevelCount: number,
  lastTriggeredAtCount: number,
): MilestoneEvaluation | null {
  return evaluateEveryNMilestone("alchemists_cascade", uniqueCompletedLevelCount, ALCHEMISTS_CASCADE_MILESTONE_STEP, lastTriggeredAtCount);
}
