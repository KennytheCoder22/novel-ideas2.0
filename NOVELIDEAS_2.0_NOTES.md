# NovelIdeas 2.0 Notes

This pass focuses on making the existing app behave more like an adaptive recommender without breaking the current age-band structure.

## What changed

- **Age bands remain hard-separated.** Recommendations still stay inside the current band.
- **Sophistication is now inferred inside each band.** It acts as a ranking signal instead of an age-routing signal.
- **Swipe cards are now adaptive.** The next card is chosen from the remaining deck based on familiarity, diagnostic value, recent variety, and how much information the current session still needs.
- **Skips no longer count toward progress.** Only explicit like/dislike swipes advance toward recommendation generation.
- **Teen visual sources are no longer capped during pool building.** Kitsu and GCD candidates can enter the pool, and the final ranker decides how many survive.

## Files added

- `screens/recommenders/taste/sophisticationModel.ts`
- `screens/swipe/adaptiveCardQueue.ts`

## Files updated

- `screens/SwipeDeckScreen.tsx`
- `screens/recommenders/finalRecommender.ts`
- `screens/recommenders/recommenderRouter.ts`

## Intended effect

The app should now feel less like a fixed card shuffle and more like a targeted taste-profiling session, while still respecting the existing deck boundaries.
