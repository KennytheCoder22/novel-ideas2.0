// Pure responsive-layout policy for the shared game recommendation reward component. Extracted
// from the component itself (which imports react-native) so it can be unit tested with plain
// node:test without needing a React Native rendering environment.
export type GameRecommendationRewardLayout = "stacked" | "sideBySide";

/** Below the breakpoint the cover and text stack vertically (phones/narrow panes); at or above it
 * they sit side by side (tablets/desktop). */
export function computeGameRecommendationRewardLayout(width: number): GameRecommendationRewardLayout {
  return width >= 520 ? "sideBySide" : "stacked";
}
