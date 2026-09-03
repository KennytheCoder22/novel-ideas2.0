export const GAME_PLAYTEST_FIXTURE_PARAM = "playtestFixture";
export const GAME_PLAYTEST_FIXTURE_STATES = [
  "media-mania-start",
  "media-mania-like",
  "media-mania-dislike",
  "media-mania-unknown-replacement",
  "media-mania-unlock",
  "media-mania-cross-media",
  "last-bookshop-visitor-shelf",
  "last-bookshop-counter",
  "last-bookshop-pitch-charm",
  "last-bookshop-candle",
  "last-bookshop-result",
  "unwritten-map-exploration",
  "unwritten-map-encounter",
  "unwritten-map-choice-result",
  "unwritten-map-skip-result",
  "unwritten-map-journal",
  "cascade-level-start",
  "cascade-board",
  "cascade-catalyst-selection",
  "cascade-resolved",
  "cascade-success",
  "cascade-failure-retry",
] as const;

export function isGamePlaytestFixtureEnabled(value?: unknown): boolean {
  return process.env.NODE_ENV !== "production"
    && process.env.EXPO_PUBLIC_GAME_PLAYTEST_FIXTURES === "1"
    && GAME_PLAYTEST_FIXTURE_STATES.includes(String(value) as typeof GAME_PLAYTEST_FIXTURE_STATES[number]);
}
