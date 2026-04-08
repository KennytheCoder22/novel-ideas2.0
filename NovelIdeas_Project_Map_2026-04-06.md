# NovelIdeas 2.0 Project Map

Built from the uploaded repo zip on April 6, 2026.

## Executive map

NovelIdeas is an **Expo / React Native app** with a file-based router, a swipe-driven taste-capture flow, and a multi-source recommender pipeline. The app appears to be organized around three main layers:

1. **App shell / routes** in `app/`
2. **UI screens and orchestration** in `screens/`
3. **Recommendation logic + canonical deck data** in `screens/recommenders/` and `data/swipeDecks/`

The current center of gravity is:

- `app/(tabs)/index.tsx` — large home/config shell
- `screens/SwipeDeckScreen.tsx` — core swipe + recommendation orchestration
- `screens/recommenders/recommenderRouter.ts` — fetch/merge/rerank switchboard
- `screens/recommenders/finalRecommender.ts` — final filtering/ranking layer
- `data/swipeDecks/*.ts` — canonical swipe deck content

---

## Top-level structure

```text
app/
  (tabs)/
    _layout.tsx
    explore.tsx
    index.tsx
    swipe.tsx
  api/
    hardcover/+api.ts
    openlibrary/+api.ts
  _layout.tsx
  admin-collection.tsx
  app_admin-web.tsx
  modal.tsx
  swipe.tsx

screens/
  AdminCollectionUploadScreen.tsx
  SwipeDeckScreen.tsx
  recommenders/
    dev/
    gcd/
    googleBooks/
    kitsu/
    openLibrary/
    taste/
    bucketSelector.ts
    buildBucketPlanFromTaste.ts
    buildDescriptiveQueriesFromTaste.ts
    finalRecommender.ts
    normalizeCandidate.ts
    queryTranslations.ts
    recommenderProfiles.ts
    recommenderRouter.ts
    tasteToQuerySignals.ts
    types.ts
  swipe/
    adaptiveCardQueue.ts
    openLibraryAdult.ts
    openLibraryCore.ts
    openLibraryFromTags.ts
    openLibraryKids.ts
    openLibraryPreTeen.ts
    openLibraryTeen.ts
    recommendationsByBand.ts
    swipeHelpers.ts

data/
  swipeDecks/
    k2.ts
    36.ts
    ms_hs.ts
    adult.ts
    *.json mirrors
    types.ts
  tagNormalizationMap.ts

constants/
  brandTheme.ts
  deckLabels.ts
  runtimeConfig.ts
  theme.ts

components/
  ...themed/shared UI helpers

services/
  hardcover/
    hardcoverRatings.ts

api/
  openlibrary.ts
```

---

## Route map

### Root routing

- `app/_layout.tsx`
  - root stack for Expo Router
  - mounts tab shell and other top-level routes

### Main tabs shell

- `app/(tabs)/_layout.tsx`
  - bottom tab/header shell
  - branded title behavior
  - swipe route is treated as part of the main user flow

### Primary user-facing routes

- `app/(tabs)/index.tsx`
  - main landing page
  - includes branding/config/admin controls
  - includes search-related UI and config state
  - acts like the app control center

- `app/swipe.tsx`
- `app/(tabs)/swipe.tsx`
  - route into `screens/SwipeDeckScreen.tsx`

- `app/(tabs)/explore.tsx`
  - likely leftover template/demo screen, not core product logic

### Admin-oriented routes

- `app/app_admin-web.tsx`
  - web admin editor for config-like data
  - reads/writes browser-side draft state

- `app/admin-collection.tsx`
  - admin collection route stub/entry point

- `screens/AdminCollectionUploadScreen.tsx`
  - collection upload/admin workflow screen

### Server/API routes

- `app/api/hardcover/+api.ts`
  - proxy route to Hardcover GraphQL
  - likely enriches recommendations with ratings/counts

- `app/api/openlibrary/+api.ts`
  - server wrapper for Open Library access

---

## Core application flow

```text
Home / Config UI
  app/(tabs)/index.tsx
        |
        v
Swipe session
  screens/SwipeDeckScreen.tsx
        |
        +--> loads deck from data/swipeDecks/*.ts
        +--> tracks swipes, tag counts, skips, feedback, mood/personality state
        +--> builds recommender input
        |
        v
Recommendation router
  screens/recommenders/recommenderRouter.ts
        |
        +--> Google Books recommender
        +--> Open Library recommender
        +--> optional Kitsu recommender
        +--> optional GCD recommender
        |
        v
Candidate normalization + final ranking
  normalizeCandidate.ts
  finalRecommender.ts
        |
        v
Recommendation results back to SwipeDeckScreen UI
```

---

## Canonical deck layer

The **current source of truth for swipe cards** is `data/swipeDecks/`.

### Deck files

- `data/swipeDecks/k2.ts`
  - K-2 / younger-reader deck

- `data/swipeDecks/36.ts`
  - grades 3-6 / pre-teen deck

- `data/swipeDecks/ms_hs.ts`
  - middle/high school deck
  - important because media signal cards now live here rather than older legacy locations

- `data/swipeDecks/adult.ts`
  - adult deck

- `data/swipeDecks/types.ts`
  - deck/card schema definitions

### Supporting data

- `data/tagNormalizationMap.ts`
  - normalizes tag vocabulary into a consistent recommendation signal space

### Practical takeaway

If you want to change the swipe experience safely, the first files to inspect are:

1. `data/swipeDecks/types.ts`
2. the relevant `data/swipeDecks/<band>.ts`
3. `screens/SwipeDeckScreen.tsx`

---

## Swipe engine map

### Main orchestrator

- `screens/SwipeDeckScreen.tsx`
  - loads the active deck
  - filters cards by enabled categories
  - manages progress and recommendation state
  - tracks tag counts and feedback loops
  - invokes the recommender router
  - appears to hold most of the session state

### Card selection logic

- `screens/swipe/adaptiveCardQueue.ts`
  - adaptive next-card selection
  - likely responsible for diagnostic value / variety behavior

### Legacy-but-still-used swipe helpers

- `screens/swipe/openLibraryFromTags.ts`
  - still imported by `SwipeDeckScreen.tsx`
  - contains shared query/cover/helper logic bridging older and newer systems

- `screens/swipe/openLibraryCore.ts`
- `screens/swipe/openLibraryKids.ts`
- `screens/swipe/openLibraryPreTeen.ts`
- `screens/swipe/openLibraryTeen.ts`
- `screens/swipe/openLibraryAdult.ts`
- `screens/swipe/recommendationsByBand.ts`
- `screens/swipe/swipeHelpers.ts`
  - older band/query helper layer that still appears to support the live system

---

## Recommender system map

### 1) Router / orchestration layer

- `screens/recommenders/recommenderRouter.ts`
  - central switchboard
  - chooses engine defaults
  - currently defaults `k2` to Open Library and other decks to Google Books
  - can additionally include Kitsu and GCD for teen visual-signal cases
  - merges source outputs before final ranking

### 2) Per-source fetchers

- `screens/recommenders/googleBooks/googleBooksRecommender.ts`
  - primary non-kids fetch path

- `screens/recommenders/openLibrary/openLibraryRecommender.ts`
  - Open Library path

- `screens/recommenders/openLibrary/openLibraryKidsQueryBuilder.ts`
  - kids-specific query shaping / domain mode handling

- `screens/recommenders/kitsu/kitsuMangaRecommender.ts`
  - manga/anime adjacent source path

- `screens/recommenders/gcd/gcdGraphicNovelRecommender.ts`
  - graphic novel / comics source path

### 3) Shared query and planning layer

- `screens/recommenders/buildDescriptiveQueriesFromTaste.ts`
  - builds descriptive queries from inferred taste

- `screens/recommenders/tasteToQuerySignals.ts`
  - converts taste signals into query-friendly features

- `screens/recommenders/queryTranslations.ts`
  - translations/normalization across sources or vocabularies

- `screens/recommenders/buildBucketPlanFromTaste.ts`
- `screens/recommenders/bucketSelector.ts`
  - likely control source/category balance in final output

### 4) Candidate normalization + ranking

- `screens/recommenders/normalizeCandidate.ts`
  - maps raw source docs into a common comparable shape

- `screens/recommenders/finalRecommender.ts`
  - final dedupe, penalties, quality filters, lane-aware reranking
  - key place for changing what "good results" means

- `screens/recommenders/recommenderProfiles.ts`
  - per-lane tuning values and deck-to-lane mapping

- `screens/recommenders/types.ts`
  - canonical recommender input/output types

---

## Taste-model layer

This project has a distinct taste/personality subsystem under `screens/recommenders/taste/`.

### Key files

- `tasteProfileBuilder.ts`
  - builds a taste profile from swipe tags and feedback

- `personalityProfile.ts`
  - persistent-ish personality representation

- `sessionMood.ts`
  - session-specific state / recent-swipe signal handling

- `tasteBlender.ts`
  - merges personality and session mood

- `tasteSimilarity.ts`
  - similarity scoring between user taste and candidates

- `recommendationPipeline.ts`
  - pipeline object coordinating ranking lifecycle

- `sophisticationModel.ts`
  - inferred reader sophistication within an age band

- `types.ts`
  - taste-system types

### Practical takeaway

For recommendation quality tuning, the main hotspot order is:

1. `finalRecommender.ts`
2. `recommenderProfiles.ts`
3. `tasteProfileBuilder.ts`
4. `tasteSimilarity.ts`
5. `buildDescriptiveQueriesFromTaste.ts`

---

## Config / branding / runtime state

### Project config-ish files

- `NovelIdeas.json`
  - appears to be a canonical config/data file for app/admin use

- `app.json`
  - Expo app config

- `.env`
  - environment values for runtime/server keys

### Runtime/UI constants

- `constants/runtimeConfig.ts`
  - runtime title / library-name style value

- `constants/brandTheme.ts`
  - brand theming

- `constants/theme.ts`
  - broader theme definitions

- `constants/deckLabels.ts`
  - display labels for deck keys

### Admin/config editors

- `app/(tabs)/index.tsx`
  - mixes user UI with config/admin behavior

- `app/app_admin-web.tsx`
  - dedicated web admin editing surface

---

## External integrations

### Hardcover

- `app/api/hardcover/+api.ts`
  - server proxy
- `services/hardcover/hardcoverRatings.ts`
  - client service wrapper

Use this pair when changing rating enrichment or troubleshooting rating lookups.

### Open Library

- `app/api/openlibrary/+api.ts`
- `api/openlibrary.ts`
- `screens/recommenders/openLibrary/*`
- `screens/swipe/openLibrary*.ts`

Open Library logic is split across server wrapper, recommender implementation, and older swipe helpers.

---

## Files that look central vs peripheral

### Most central files

- `app/(tabs)/index.tsx`
- `screens/SwipeDeckScreen.tsx`
- `screens/recommenders/recommenderRouter.ts`
- `screens/recommenders/finalRecommender.ts`
- `screens/recommenders/recommenderProfiles.ts`
- `data/swipeDecks/ms_hs.ts`
- `data/swipeDecks/adult.ts`
- `data/swipeDecks/k2.ts`
- `data/swipeDecks/36.ts`

### Likely support / utility files

- `components/*`
- `hooks/*`
- `constants/*`
- `assets/*`

### Likely legacy or template-adjacent files to verify before investing in them

- `app/(tabs)/explore.tsx`
- portions of `README.md`
- some `screens/swipe/*` helpers if the logic has already migrated upward into recommender modules

---

## Where to change specific behaviors

### Change swipe cards or age-band content

- `data/swipeDecks/*.ts`
- possibly `data/tagNormalizationMap.ts`

### Change skip/progress/session behavior

- `screens/SwipeDeckScreen.tsx`
- `screens/swipe/adaptiveCardQueue.ts`

### Change default recommendation source selection

- `screens/recommenders/recommenderRouter.ts`

### Change ranking, filtering, dedupe, final mix

- `screens/recommenders/finalRecommender.ts`
- `screens/recommenders/recommenderProfiles.ts`

### Change taste interpretation

- `screens/recommenders/taste/tasteProfileBuilder.ts`
- `screens/recommenders/taste/tasteSimilarity.ts`
- `screens/recommenders/taste/sophisticationModel.ts`

### Change admin/config editing behavior

- `app/(tabs)/index.tsx`
- `app/app_admin-web.tsx`
- `NovelIdeas.json`

---

## Architecture observations

1. **The project is mid-migration rather than fully consolidated.**
   - New recommender modules exist, but some older swipe/query helpers are still active.

2. **`SwipeDeckScreen.tsx` is the main orchestration choke point.**
   - It is likely the highest-leverage file for understanding live app behavior.

3. **The recommender is already multi-source.**
   - Google Books, Open Library, Kitsu, and GCD are part of the active architecture.

4. **Deck data is canonicalized in `data/swipeDecks/`.**
   - That folder should be treated as the source of truth for card content.

5. **Home/config logic is fairly concentrated in `app/(tabs)/index.tsx`.**
   - If you want future maintainability, this is a candidate for splitting.

---

## Suggested mental model

```text
UI shell
  app/*

Session orchestration
  screens/SwipeDeckScreen.tsx

Canonical content
  data/swipeDecks/*

Recommendation engines
  screens/recommenders/*

Legacy/shared query helpers
  screens/swipe/*

Config / branding
  constants/* + NovelIdeas.json + admin screens
```

---

## Fast start points by goal

### Understand the whole product quickly

1. `package.json`
2. `app/(tabs)/index.tsx`
3. `screens/SwipeDeckScreen.tsx`
4. `screens/recommenders/recommenderRouter.ts`
5. `screens/recommenders/finalRecommender.ts`
6. `data/swipeDecks/ms_hs.ts`
7. `data/swipeDecks/adult.ts`

### Debug recommendation weirdness

1. `screens/recommenders/recommenderRouter.ts`
2. `screens/recommenders/finalRecommender.ts`
3. `screens/recommenders/recommenderProfiles.ts`
4. `screens/recommenders/taste/*`
5. `screens/recommenders/googleBooks/*`, `openLibrary/*`, `kitsu/*`, `gcd/*`

### Debug deck behavior / progress / swipe flow

1. `screens/SwipeDeckScreen.tsx`
2. `screens/swipe/adaptiveCardQueue.ts`
3. `data/swipeDecks/*.ts`

