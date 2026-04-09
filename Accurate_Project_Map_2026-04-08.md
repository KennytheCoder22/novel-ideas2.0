# NovelIdeas 2.0 Accurate Project Map

Built from the uploaded zip `NovelIdeas_2.0_v2 (1).zip` on April 8, 2026.

## 1) What this project is

NovelIdeas is an **Expo / React Native app** using **Expo Router**. The app's main product flow is:

1. configure branding and enabled decks
2. run a swipe-based taste session
3. turn swipe/taste signals into query plans
4. fetch candidates from multiple external sources
5. normalize, filter, rerank, and return final recommendations

The most important live files are:

- `app/(tabs)/index.tsx` — main home/config/search screen and launch point into the swipe flow
- `screens/SwipeDeckScreen.tsx` — core session orchestration
- `screens/recommenders/recommenderRouter.ts` — multi-engine fetch and merge router
- `screens/recommenders/finalRecommender.ts` — final filtering, scoring, and selection
- `data/swipeDecks/*.ts` — canonical swipe card content by age band
- `NovelIdeas.json` — default runtime/admin config shipped with the app

---

## 2) High-level architecture

```text
Expo Router app shell
  app/_layout.tsx
  app/(tabs)/_layout.tsx
        |
        +--> Home / Config / Search
        |      app/(tabs)/index.tsx
        |
        +--> Swipe session
        |      app/(tabs)/swipe.tsx -> screens/SwipeDeckScreen.tsx
        |
        +--> Admin screens
        |      app/app_admin-web.tsx
        |      app/admin-collection.tsx -> screens/AdminCollectionUploadScreen.tsx
        |
        +--> API proxy route
               app/api/openlibrary/+api.ts

Swipe session
  screens/SwipeDeckScreen.tsx
        |
        +--> deck data
        |      data/swipeDecks/*.ts
        |
        +--> swipe helpers / adaptive queue
        |      screens/swipe/*
        |
        +--> taste modeling
        |      screens/recommenders/taste/*
        |
        +--> recommender router
               screens/recommenders/recommenderRouter.ts
                         |
                         +--> Google Books engine
                         +--> Open Library engine
                         +--> Kitsu engine
                         +--> GCD engine
                         +--> Hardcover enrichment
                         +--> final ranking/filtering
```

---

## 3) Top-level directory map

```text
NovelIdeas.json                     default app config
NOVELIDEAS_2.0_NOTES.md             recent architecture-change notes
NovelIdeas_Project_Map_2026-04-06.md older project map (partly stale)
README.md                           Expo starter README

app/                                Expo Router routes
api/                                Vercel-style serverless handlers
assets/                             logo/app images
components/                         shared UI helpers
constants/                          themes, labels, runtime config
data/                               canonical swipe deck data + tag normalization
screens/                            real screen logic + recommender system
services/                           service-layer helpers
android/                            generated Android project
scripts/                            Expo starter reset script
node_modules/                       dependencies (included in zip)
```

---

## 4) Route map

### Root shell

### `app/_layout.tsx`
- root `Stack`
- mounts:
  - `(tabs)` with header hidden
  - `app_admin-web`
  - `modal`
- uses color-scheme hook and `ThemeProvider`

### Main stack shell

### `app/(tabs)/_layout.tsx`
- despite the folder name, this is now effectively a **stack-based main shell**, not a true bottom-tab product
- sets `initialRouteName="swipe"`
- shows a branded tappable header title using runtime library name
- the title tap logic contains a hidden multi-tap admin trigger
- explicitly mounts screens:
  - `swipe` with header hidden
  - `index`
  - `explore`

### Primary app routes

### `app/(tabs)/index.tsx`
This is the **real control center** of the app. It is doing several jobs at once:
- reads shipped config from `NovelIdeas.json`
- syncs canonical and legacy config schema shapes
- manages branding and theme state
- manages enabled age-band decks
- manages enabled swipe media categories
- supports Open Library search UI
- embeds/launches the swipe experience
- contains admin-entry affordances
- imports `SwipeDeckScreen` directly

### `app/(tabs)/swipe.tsx`
- separate routed entry into the swipe screen

### `app/swipe.tsx`
- redirects to `/(tabs)/index`
- this suggests the routed structure is still being normalized

### `app/(tabs)/explore.tsx`
- appears to be the stock Expo example screen
- likely not core product logic

### Admin / utility routes

### `app/app_admin-web.tsx`
- browser-oriented admin editor
- reads/writes admin draft config in web localStorage
- handles schema reconciliation between legacy and canonical config shapes
- includes QR-related UI and branding/theme editing logic
- acts more like a web admin console than a normal mobile screen

### `app/admin-collection.tsx`
- thin route wrapper around `screens/AdminCollectionUploadScreen.tsx`

### `app/modal.tsx`
- default starter modal screen
- not central to the product

### API routes

### `app/api/openlibrary/+api.ts`
- Expo Router API route
- proxies Open Library search requests
- validates `q`
- returns normalized `{ ok, docs }`

---

## 5) Screen layer

### `screens/SwipeDeckScreen.tsx`
This is the **main session engine**.

Responsibilities:
- resolves the active deck from canonical deck modules
- tracks swipe state, skips, progress, and recommendation readiness
- maintains tag counts and taste input state
- builds taste/personality/session signals
- uses adaptive card selection
- calls the recommender router
- renders results and session UI
- exposes search/open-home actions
- includes a developer equalizer panel hook-in

This file is clearly the biggest orchestration point in the app.

### `screens/AdminCollectionUploadScreen.tsx`
- MVP collection-upload flow
- intended to upload library collection files to Supabase storage
- then invoke a Supabase Edge Function import job
- currently contains placeholder credentials and lazy dependency loading
- this means the screen is **scaffolded, not production-finished**

---

## 6) Canonical data layer

### `data/swipeDecks/`
This is the **source of truth for swipe cards**.

Files:
- `k2.ts`
- `36.ts`
- `ms_hs.ts`
- `adult.ts`
- `types.ts`
- JSON mirrors for each deck

Meaning:
- `k2` = kids
- `36` = grades 3–6 / pre-teen
- `ms_hs` = teens
- `adult` = adults

These files define the actual card sets the user swipes through.

### `data/tagNormalizationMap.ts`
- normalizes tag vocabulary into a more consistent signal space for recommendation logic

### Practical rule
If someone asks where the swipe experience really starts, the shortest correct answer is:

```text
NovelIdeas.json -> app/(tabs)/index.tsx -> screens/SwipeDeckScreen.tsx -> data/swipeDecks/*.ts
```

---

## 7) Swipe subsystem

Located in `screens/swipe/`.

### `adaptiveCardQueue.ts`
- adaptive next-card selection
- decides which remaining card is most useful to show next
- directly aligns with the recent notes about the app becoming more diagnostic and less fixed-order

### `openLibraryFromTags.ts`
- important bridge/helper file used directly by `SwipeDeckScreen.tsx`
- exports tag-count utilities and cover helpers
- still part of the active flow despite the newer recommender system

### Other swipe helpers
- `openLibraryCore.ts`
- `openLibraryKids.ts`
- `openLibraryPreTeen.ts`
- `openLibraryTeen.ts`
- `openLibraryAdult.ts`
- `recommendationsByBand.ts`
- `swipeHelpers.ts`

These appear to be older band-specific recommendation/query helpers that still support or overlap with the current system.

---

## 8) Recommender subsystem

Located in `screens/recommenders/`.

### Core router/orchestration

### `recommenderRouter.ts`
This is the **switchboard**.

It:
- builds a router bucket/query plan
- decides source usage by deck and signal profile
- runs multiple engines in parallel
- conditionally adds Kitsu and GCD for teen visual signals
- extracts and dedupes docs from each engine
- enriches docs with Hardcover ratings
- normalizes candidates
- passes them into the final recommender

Important live behaviors visible in code:
- `k2` defaults to Open Library as primary engine choice
- other lanes default toward Google Books when a single engine is chosen
- teen manga/graphic-novel signals can trigger both **Kitsu** and **GCD**
- Hardcover is enrichment-only and should never block final output

### `finalRecommender.ts`
Final ranking and filtering layer.

It handles:
- deduplication
- metadata quality checks
- non-fiction / study-guide / anthology filtering
- taste matching
- sophistication alignment
- publisher/popularity/recency adjustments
- series/author repetition control
- source balancing
- final candidate selection

### `normalizeCandidate.ts`
- converts engine-specific docs into a shared candidate shape

### `types.ts`
- shared engine contracts
- defines `EngineId`, `DomainMode`, `RecommendationDoc`, `RecommendationResult`, `RecommenderInput`, etc.

### `recommenderProfiles.ts`
- lane-specific scoring profiles for:
  - `kids`
  - `preTeen`
  - `teen`
  - `adult`
- contains deck-to-lane mapping via `laneFromDeckKey`

### Query / shelf-building files
- `build20QRungs.ts`
- `bucketSelector.ts`
- `buildBucketPlanFromTaste.ts`
- `buildDescriptiveQueriesFromTaste.ts`
- `queryTranslations.ts`
- `tasteToQuerySignals.ts`

These files appear to transform taste/swipe signals into query buckets, shelf identity, and descriptive query plans.

---

## 9) Taste-modeling subsystem

Located in `screens/recommenders/taste/`.

Files:
- `personalityProfile.ts`
- `recommendationPipeline.ts`
- `sessionMood.ts`
- `sophisticationModel.ts`
- `tasteBlender.ts`
- `tasteProfileBuilder.ts`
- `tasteSimilarity.ts`
- `types.ts`

Purpose:
- convert raw swipe feedback into higher-level taste/personality/session models
- infer sophistication within an age band
- support ranking and alignment rather than simple age routing

This matches the repo note that sophistication is now an intra-band ranking signal.

---

## 10) Engine implementations

### `screens/recommenders/googleBooks/googleBooksRecommender.ts`
- Google Books candidate fetcher / recommender engine

### `screens/recommenders/openLibrary/openLibraryRecommender.ts`
- Open Library candidate fetcher / recommender engine

### `screens/recommenders/openLibrary/openLibraryKidsQueryBuilder.ts`
- kid-oriented Open Library query support

### `screens/recommenders/kitsu/kitsuMangaRecommender.ts`
- manga/anime-oriented source integration
- especially relevant for teen visual-signal sessions

### `screens/recommenders/gcd/gcdGraphicNovelRecommender.ts`
- graphic-comics source integration

### `services/hardcover/hardcoverRatings.ts`
- optional enrichment fetcher for ratings/counts via `/api/hardcover`

---

## 11) Server-side / proxy layer

There are **two server-style API locations** in this zip.

### Expo Router API route
- `app/api/openlibrary/+api.ts`

### Vercel-style serverless handlers
- `api/openlibrary.ts`
- `api/hardcover.ts`

What that means:
- Open Library exists in both Expo Router API form and Vercel handler form
- Hardcover currently exists only in `api/hardcover.ts`
- `services/hardcover/hardcoverRatings.ts` fetches `/api/hardcover?...`, which matches the Vercel-style route assumption

So this project currently looks like it is carrying **mixed deployment assumptions**:
- Expo Router API routes
- plus Vercel `api/` handlers

That is an important architectural detail, because it affects where backend calls are expected to work.

---

## 12) Constants and shared UI

### `constants/`
- `brandTheme.ts` — theme construction and branded color system
- `deckLabels.ts` — deck label helpers
- `runtimeConfig.ts` — runtime library name/config subscription logic used by the header
- `theme.ts` — generic theme support

### `components/`
Mostly generic shared UI / starter helpers:
- `external-link.tsx`
- `haptic-tab.tsx`
- `hello-wave.tsx`
- `parallax-scroll-view.tsx`
- `themed-text.tsx`
- `themed-view.tsx`
- `ui/collapsible.tsx`
- `ui/icon-symbol*.tsx`

These are not where the domain logic lives.

---

## 13) Configuration map

### `NovelIdeas.json`
This is the shipped config baseline. Current fields include:
- library metadata
- branding metadata
- theme settings
- enabled decks
- recommendation source default
- swipe category toggles

Current default recommendation source in the file is:
- `open_library`

Current default enabled swipe categories in the file are:
- books
- movies
- tv
- games
- albums

Important nuance:
- some UI code also references `youtube`, `anime`, and `podcasts`
- so the live code supports more category keys than the default shipped JSON currently enables

That is worth tracking when debugging config behavior.

---

## 14) What looks active vs. what looks scaffolded or legacy

### Clearly active
- `app/(tabs)/index.tsx`
- `screens/SwipeDeckScreen.tsx`
- `screens/recommenders/*`
- `screens/swipe/adaptiveCardQueue.ts`
- `data/swipeDecks/*`
- `NovelIdeas.json`

### Likely starter or secondary
- `app/(tabs)/explore.tsx`
- `app/modal.tsx`
- parts of `components/` from Expo starter structure

### Scaffolded / incomplete
- `screens/AdminCollectionUploadScreen.tsx`
  - placeholder Supabase keys
  - dependency comments
  - suggests planned, not finalized, collection ingestion

### Potentially transitional / mixed-era
- `api/openlibrary.ts` alongside `app/api/openlibrary/+api.ts`
- older swipe helper files in `screens/swipe/*`
- `NovelIdeas_Project_Map_2026-04-06.md` because it mentions paths and assumptions that are not fully current in this zip

---

## 15) Most important dependency paths

### Main user flow

```text
NovelIdeas.json
  -> app/(tabs)/index.tsx
  -> screens/SwipeDeckScreen.tsx
  -> screens/recommenders/taste/*
  -> screens/recommenders/recommenderRouter.ts
  -> engine files
  -> normalizeCandidate.ts
  -> finalRecommender.ts
```

### Deck/content path

```text
data/swipeDecks/types.ts
  -> data/swipeDecks/k2.ts | 36.ts | ms_hs.ts | adult.ts
  -> screens/SwipeDeckScreen.tsx
```

### Header/runtime branding path

```text
constants/runtimeConfig.ts
  -> app/(tabs)/_layout.tsx
  -> app/(tabs)/index.tsx / admin flows
```

### Hardcover enrichment path

```text
screens/recommenders/recommenderRouter.ts
  -> services/hardcover/hardcoverRatings.ts
  -> /api/hardcover
  -> api/hardcover.ts
```

---

## 16) Best “where to look first” guide

### If you want to change swipe cards
1. `data/swipeDecks/types.ts`
2. the relevant `data/swipeDecks/<band>.ts`
3. `screens/SwipeDeckScreen.tsx`

### If you want to change recommendation quality
1. `screens/recommenders/recommenderRouter.ts`
2. `screens/recommenders/finalRecommender.ts`
3. `screens/recommenders/recommenderProfiles.ts`
4. taste-model files in `screens/recommenders/taste/`

### If you want to change branding/admin behavior
1. `NovelIdeas.json`
2. `app/(tabs)/index.tsx`
3. `app/app_admin-web.tsx`
4. `constants/brandTheme.ts`
5. `constants/runtimeConfig.ts`

### If you want to change backend fetch behavior
1. engine file in `screens/recommenders/*`
2. `app/api/openlibrary/+api.ts`
3. `api/openlibrary.ts`
4. `api/hardcover.ts`

---

## 17) Short diagnosis of the repo state

This codebase is not a fresh greenfield app anymore. It looks like a **working product in transition**, with:
- an active swipe/recommendation core
- increasingly sophisticated taste modeling
- multiple external content sources
- a partially merged admin/config system
- a mixed backend/proxy story
- some starter Expo remnants still present
- some scaffolded collection-ingestion work not yet fully wired

The core of the product is solidly centered on:

```text
swipe session -> taste modeling -> multi-source candidate fetch -> final reranking
```

That is the cleanest one-line project map for the current zip.
