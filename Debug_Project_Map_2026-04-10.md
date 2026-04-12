# NovelIdeas 2.0 Debug Map

Built from the uploaded zip `NovelIdeas_2.0_v2 (1)(3).zip` and intended as a **where-to-debug-first** map rather than a general architecture map.

---

## 1) Fastest mental model

```text
NovelIdeas.json
  -> app/(tabs)/index.tsx
  -> screens/SwipeDeckScreen.tsx
  -> screens/recommenders/taste/*
  -> screens/recommenders/recommenderRouter.ts
  -> engine fetchers
  -> screens/recommenders/normalizeCandidate.ts
  -> screens/recommenders/finalRecommender.ts
  -> UI results in SwipeDeckScreen.tsx
```

If something is wrong in the product, the bug is most likely in one of those layers.

---

## 2) Highest-value files to inspect first

### Entry and routing
- `app/_layout.tsx`
- `app/(tabs)/_layout.tsx`
- `app/(tabs)/index.tsx`
- `app/(tabs)/swipe.tsx`
- `app/swipe.tsx`

### Main session logic
- `screens/SwipeDeckScreen.tsx`
- `screens/swipe/adaptiveCardQueue.ts`
- `screens/swipe/openLibraryFromTags.ts`

### Recommendation core
- `screens/recommenders/recommenderRouter.ts`
- `screens/recommenders/finalRecommender.ts`
- `screens/recommenders/recommenderProfiles.ts`
- `screens/recommenders/normalizeCandidate.ts`
- `screens/recommenders/types.ts`

### Taste modeling
- `screens/recommenders/taste/tasteProfileBuilder.ts`
- `screens/recommenders/taste/recommendationPipeline.ts`
- `screens/recommenders/taste/personalityProfile.ts`
- `screens/recommenders/taste/sessionMood.ts`
- `screens/recommenders/taste/sophisticationModel.ts`

### External source adapters
- `screens/recommenders/googleBooks/googleBooksRecommender.ts`
- `screens/recommenders/openLibrary/openLibraryRecommender.ts`
- `screens/recommenders/kitsu/kitsuMangaRecommender.ts`
- `screens/recommenders/gcd/gcdGraphicNovelRecommender.ts`
- `services/hardcover/hardcoverRatings.ts`
- `api/openlibrary.ts`
- `api/hardcover.ts`
- `app/api/openlibrary/+api.ts`

### Config and data
- `NovelIdeas.json`
- `constants/runtimeConfig.ts`
- `constants/brandTheme.ts`
- `data/swipeDecks/*.ts`
- `data/tagNormalizationMap.ts`

---

## 3) Debug by symptom

### A. App opens but the wrong screen, header, or route behavior appears
Check in this order:
1. `app/_layout.tsx`
2. `app/(tabs)/_layout.tsx`
3. `app/(tabs)/index.tsx`
4. `app/swipe.tsx`
5. `app/(tabs)/swipe.tsx`

Likely causes:
- route path mismatch
- hidden redirect still pointing at old route structure
- header trigger pushing to a route that no longer exists
- initial route not matching intended UX

### B. Swipe session starts, but deck selection, progress, or skip behavior is wrong
Check in this order:
1. `screens/SwipeDeckScreen.tsx`
2. `data/swipeDecks/types.ts`
3. `data/swipeDecks/k2.ts | 36.ts | ms_hs.ts | adult.ts`
4. `screens/swipe/adaptiveCardQueue.ts`

Likely causes:
- enabled deck filtering mismatch
- card identity collision
- progress state incrementing on skip when it should not
- adaptive queue selecting repeated or low-value cards

### C. Recommendations are generic, repetitive, or collapse to the same books
Check in this order:
1. `screens/recommenders/recommenderRouter.ts`
2. `screens/recommenders/buildDescriptiveQueriesFromTaste.ts`
3. `screens/recommenders/buildBucketPlanFromTaste.ts`
4. `screens/recommenders/tasteToQuerySignals.ts`
5. `screens/recommenders/finalRecommender.ts`

Likely causes:
- query plan collapse
- too many weak queries being merged together
- fallback routing overpowering taste-specific routing
- final balancing caps not separating authors/series enough

### D. Teen manga / graphic-novel sessions feel wrong
Check in this order:
1. `screens/recommenders/recommenderRouter.ts`
2. `screens/recommenders/kitsu/kitsuMangaRecommender.ts`
3. `screens/recommenders/gcd/gcdGraphicNovelRecommender.ts`
4. `screens/recommenders/recommenderProfiles.ts`
5. `screens/recommenders/finalRecommender.ts`

Likely causes:
- teen signal detection not crossing the threshold for Kitsu or GCD
- source-mix weighting not reflecting session signals
- visual-source candidates being normalized too weakly
- final selection caps flattening distinct candidate pools

### E. Good raw candidates are fetched, but final results are still bad
Check in this order:
1. `screens/recommenders/normalizeCandidate.ts`
2. `screens/recommenders/finalRecommender.ts`
3. `screens/recommenders/recommenderProfiles.ts`
4. `screens/recommenders/taste/*`

Likely causes:
- normalization drops useful metadata
- filters are too aggressive
- sophistication model is misplacing users within an age band
- source-balancing logic is overpowering taste ranking

### F. Search/API fetches work in one environment but not another
Check in this order:
1. `app/api/openlibrary/+api.ts`
2. `api/openlibrary.ts`
3. `api/hardcover.ts`
4. `services/hardcover/hardcoverRatings.ts`

Likely causes:
- mixed Expo Router API and Vercel API assumptions
- client code calling `/api/...` while the current runtime expects another handler shape
- missing env token on server
- web/native differences in relative fetch handling

### G. Branding, title, or admin-edited settings do not stick
Check in this order:
1. `NovelIdeas.json`
2. `app/(tabs)/index.tsx`
3. `app/app_admin-web.tsx`
4. `constants/runtimeConfig.ts`
5. `constants/brandTheme.ts`
6. `app/(tabs)/_layout.tsx`

Likely causes:
- canonical vs legacy schema reconciliation drift
- localStorage draft differs from shipped config
- header reads runtime state while editor writes draft state
- branding fields duplicated under `branding` and `library`

---

## 4) Concrete hotspots found in the zip

### Hotspot 1: hidden admin trigger appears to push to the wrong route
In `app/(tabs)/_layout.tsx`, the title multi-tap handler does:

```text
router.push("/admin")
```

But the mounted admin route visible in the app shell is:
- `app/app_admin-web.tsx`

and other live pushes in `app/(tabs)/index.tsx` target:
- `/app_admin-web`
- `/admin-collection`

So `/admin` looks like a likely stale path.

### Hotspot 2: mixed backend/proxy structure is real
Both exist:
- `app/api/openlibrary/+api.ts`
- `api/openlibrary.ts`

and Hardcover exists only in:
- `api/hardcover.ts`

while `services/hardcover/hardcoverRatings.ts` fetches:
- `/api/hardcover?...`

This is a legitimate deployment/debug risk, especially when switching between Expo web, local dev, and Vercel-style hosting.

### Hotspot 3: swipe-category defaults are not perfectly aligned everywhere
`app/(tabs)/index.tsx` defines default swipe categories including:
- books
- movies
- tv
- games
- youtube
- anime
- podcasts

`SwipeDeckScreen.tsx` defines defaults including:
- books
- movies
- tv
- games
- albums
- youtube
- anime
- podcasts

`NovelIdeas.json` currently ships with:
- books
- movies
- tv
- games
- albums

That mismatch is not automatically fatal, but it is exactly the kind of drift that causes confusing config behavior.

### Hotspot 4: schema compatibility logic is centralized but fragile
`app/(tabs)/index.tsx` includes explicit syncing between:
- canonical fields like `branding.libraryName` and `enabledDecks`
- legacy fields like `library.name` and `decks.enabled`

Any bug involving saved config, admin edits, or title display should assume schema drift first.

---

## 5) Best breakpoint / logging map

### For route bugs
Set logs or breakpoints in:
- `app/_layout.tsx`
- `app/(tabs)/_layout.tsx`
- `app/(tabs)/index.tsx`

Look for:
- initial route
- route pushes
- title tap handler
- storage reads for admin config

### For swipe-state bugs
Set logs or breakpoints in:
- `screens/SwipeDeckScreen.tsx`
- `screens/swipe/adaptiveCardQueue.ts`

Inspect:
- active deck key
- enabled decks
- current card identity
- skip handling
- progress counter
- recommendation trigger condition

### For recommendation-quality bugs
Set logs or breakpoints in:
- `screens/recommenders/recommenderRouter.ts`
- `screens/recommenders/finalRecommender.ts`
- `screens/recommenders/taste/tasteProfileBuilder.ts`
- `screens/recommenders/taste/recommendationPipeline.ts`

Inspect:
- input deck/lane
- generated queries
- selected engines
- raw fetch counts by source
- normalized candidate counts
- filtered-out reasons
- final selected IDs

### For API bugs
Set logs or breakpoints in:
- `screens/recommenders/openLibrary/openLibraryRecommender.ts`
- `services/hardcover/hardcoverRatings.ts`
- `api/openlibrary.ts`
- `api/hardcover.ts`
- `app/api/openlibrary/+api.ts`

Inspect:
- final request URL
- response status
- response shape
- env token presence for Hardcover
- runtime environment path assumptions

---

## 6) Where each class of bug is most likely to live

### UI bug
Usually:
- `app/(tabs)/index.tsx`
- `screens/SwipeDeckScreen.tsx`
- `constants/brandTheme.ts`

### State bug
Usually:
- `screens/SwipeDeckScreen.tsx`
- `app/(tabs)/index.tsx`
- `constants/runtimeConfig.ts`

### Recommendation bug
Usually:
- `screens/recommenders/recommenderRouter.ts`
- `screens/recommenders/finalRecommender.ts`
- `screens/recommenders/taste/*`

### Data bug
Usually:
- `data/swipeDecks/*.ts`
- `data/tagNormalizationMap.ts`
- `screens/recommenders/normalizeCandidate.ts`

### Integration bug
Usually:
- `screens/recommenders/*Recommender.ts`
- `services/hardcover/hardcoverRatings.ts`
- `api/*`
- `app/api/*`

### Config/admin bug
Usually:
- `NovelIdeas.json`
- `app/(tabs)/index.tsx`
- `app/app_admin-web.tsx`
- `constants/runtimeConfig.ts`

---

## 7) Shortest debug paths for common problems

### “Why is the admin trigger not opening the admin screen?”
Start here:
1. `app/(tabs)/_layout.tsx`
2. `app/_layout.tsx`
3. `app/app_admin-web.tsx`

### “Why are teen results collapsing toward adult-like results?”
Start here:
1. `screens/recommenders/recommenderProfiles.ts`
2. `screens/recommenders/recommenderRouter.ts`
3. `screens/recommenders/taste/*`
4. `screens/recommenders/finalRecommender.ts`

### “Why do skips/progress feel wrong?”
Start here:
1. `screens/SwipeDeckScreen.tsx`
2. `screens/swipe/adaptiveCardQueue.ts`

### “Why does Hardcover enrichment silently fail?”
Start here:
1. `services/hardcover/hardcoverRatings.ts`
2. `api/hardcover.ts`
3. environment token setup

### “Why does config look different between home, header, and admin?”
Start here:
1. `NovelIdeas.json`
2. `app/(tabs)/index.tsx`
3. `constants/runtimeConfig.ts`
4. `app/(tabs)/_layout.tsx`
5. `app/app_admin-web.tsx`

---

## 8) Canonical debug order for this repo

When something is broken, this is the best default order:

1. **Confirm route + entry path**
   - `app/_layout.tsx`
   - `app/(tabs)/_layout.tsx`
   - `app/(tabs)/index.tsx`

2. **Confirm session state path**
   - `screens/SwipeDeckScreen.tsx`
   - active deck, categories, progress, skip behavior

3. **Confirm query/routing path**
   - `screens/recommenders/recommenderRouter.ts`
   - generated queries, chosen engines, source mix

4. **Confirm ranking/filtering path**
   - `screens/recommenders/finalRecommender.ts`
   - filter losses, dedupe, caps, source balancing

5. **Confirm external fetch path**
   - source recommender file
   - proxy/API file
   - token/env assumptions

6. **Confirm config/schema path**
   - `NovelIdeas.json`
   - `app/(tabs)/index.tsx`
   - `constants/runtimeConfig.ts`

---

## 9) Bottom line

This repo is easiest to debug if you treat it as **four stacked systems**:

```text
routing/config
  -> swipe/session state
  -> taste/query routing
  -> fetch/normalize/filter/select
```

Most real bugs will come from:
- route drift
- config/schema drift
- query-plan collapse
- source-mix thresholds
- final-selection over-filtering
- mixed API deployment assumptions

That is the practical debug map for this zip.
