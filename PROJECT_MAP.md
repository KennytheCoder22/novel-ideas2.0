# NovelIdeas Project Map (rebuilt from canonical zip)

This map is rebuilt from the uploaded canonical repo zip, not from the prior map. It reflects the files that actually exist in the project now.

---

## Canonical source

Use the uploaded repo zip as the source of truth for this map.

- `NovelIdeas.zip` — current canonical repo snapshot
- `PROJECT_MAP.md` — previous map, now partially stale

Most important stale point: the old map still references `screens/swipe/defaultCards.ts`, but that file is **not** in the repo anymore. The teen deck comments indicate those media signal cards were migrated into `data/swipeDecks/ms_hs.ts`.

---

## Actual top-level structure

```text
app/
  (tabs)/
    _layout.tsx
    explore.tsx
    index.tsx
    swipe.tsx
  _layout.tsx
  admin-collection.tsx
  api/hardcover/+api.ts
  app_admin-web.tsx
  modal.tsx
  swipe.tsx

assets/
components/
constants/
  brandTheme.ts
  deckLabels.ts
  runtimeConfig.ts
  theme.ts

data/
  swipeDecks/
    k2.ts
    36.ts
    ms_hs.ts
    adult.ts
    *.json mirrors
    types.ts
  tagNormalizationMap.ts

screens/
  AdminCollectionUploadScreen.tsx
  SwipeDeckScreen.tsx
  recommenders/
    dev/
    googleBooks/
    openLibrary/
    taste/
    finalRecommender.ts
    normalizeCandidate.ts
    recommenderProfiles.ts
    recommenderRouter.ts
    types.ts
  swipe/
    openLibraryAdult.ts
    openLibraryCore.ts
    openLibraryFromTags.ts
    openLibraryKids.ts
    openLibraryPreTeen.ts
    openLibraryTeen.ts
    recommendationsByBand.ts
    swipeHelpers.ts

services/
  hardcover/hardcoverRatings.ts

NovelIdeas.json
README.md
```

---

## High-signal architecture

### 1) App shell and routing

- `app/_layout.tsx`
  - root Expo Router stack
  - mounts `(tabs)` as the main app shell
  - also exposes `app_admin-web` and `modal`

- `app/(tabs)/_layout.tsx`
  - stack layout for the main user-facing shell
  - branded header title is driven by `constants/runtimeConfig.ts`
  - 7-tap title gesture pushes to `/admin`, but the in-app Home screen also pushes to `/app_admin-web`
  - `swipe` is treated as the real default route

- `app/swipe.tsx`
  - direct route to `SwipeDeckScreen`

- `app/(tabs)/swipe.tsx`
  - renders the same Home screen as a shortcut, preserving the branded header/admin unlock behavior

- `app/(tabs)/explore.tsx`
  - Expo starter/example screen; not part of the core NovelIdeas product flow

### 2) Home / admin shell

- `app/(tabs)/index.tsx`
  - largest UI shell in the repo
  - student-facing home + search UI
  - admin controls for branding, enabled decks, swipe categories, recommendation source, QR flow, and navigation to web admin
  - contains back-compat schema sync between legacy config and current config shapes
  - still contains manual Open Library search code and Open Library cover URL helpers
  - passes config into `SwipeDeckScreen`

- `app/app_admin-web.tsx`
  - dedicated web admin editor
  - works against `NovelIdeas.json`-style config
  - reads/writes a web draft in localStorage
  - includes theme/highlight/title text color controls and config normalization

- `constants/runtimeConfig.ts`
  - tiny runtime store for the library name shown in the header

### 3) Swipe experience

- `screens/SwipeDeckScreen.tsx`
  - central orchestration point for the swipe product
  - loads the active deck from `data/swipeDecks/*`
  - filters cards by enabled media categories
  - tracks swipe counts, tag counts, session nonce, recommendation state, feedback, cover caches, and debug UI
  - builds a taste profile from swipe tags plus recommendation feedback
  - keeps a lightweight in-memory recommendation pipeline state for personality + session mood previews
  - calls `screens/recommenders/recommenderRouter.ts` for the actual recommendation fetch
  - still imports `openLibraryFromTags` helpers for some legacy/shared query and cover behavior
  - exposes the dev equalizer panel in the UI

### 4) Deck source of truth

These are now the canonical card/deck files:

- `data/swipeDecks/k2.ts`
  - kids deck
  - book/title-style cards with flat `tags`
  - derives an age-band genre guardrail (`juvenile fiction` vs `middle grade fiction`)

- `data/swipeDecks/36.ts`
  - pre-teen prompt deck
  - prompt-style cards for genre/topic/vibe/pace/format/world

- `data/swipeDecks/ms_hs.ts`
  - teen deck
  - comments explicitly say migrated media signal cards that previously lived in `screens/swipe/defaultCards.ts` now live here
  - this is a major reason the old map is out of date

- `data/swipeDecks/adult.ts`
  - adult deck

- `data/swipeDecks/types.ts`
  - shared deck/card schema
  - defines the split between display-only metadata and recommendation output metadata
  - also defines optional weighted-tag types, though runtime still uses raw tag counts in several places

### 5) Recommendation engine boundary

- `screens/recommenders/recommenderRouter.ts`
  - the engine switchboard
  - current default policy is:
    - `k2` → Open Library
    - all other decks → Google Books
  - if you want to change the default engine policy, start here

- `screens/recommenders/types.ts`
  - canonical engine input/output types
  - defines `EngineId`, `DeckKey`, `TagCounts`, `RecommendationDoc`, `RecommendationResult`, and recommender input shape

### 6) Google Books path

- `screens/recommenders/googleBooks/googleBooksRecommender.ts`
  - main Google Books recommender implementation
  - imports query-building helpers from the older swipe-layer files
  - enriches books with Hardcover ratings
  - large, dominant implementation for non-kids lanes

- `screens/recommenders/googleBooks/googleBooksRecommenderCanonical.ts`
  - second Google Books recommender file in the repo
  - appears to be an alternate or canonicalized branch of the same logic, but `recommenderRouter.ts` imports `googleBooksRecommender.ts`, not this file
  - treat as secondary until routing is changed

- `services/hardcover/hardcoverRatings.ts`
  - client-side wrapper for the Hardcover proxy route

- `app/api/hardcover/+api.ts`
  - server route that calls Hardcover GraphQL using `HARDCOVER_API_TOKEN`
  - returns rating and rating count for a title/author lookup

### 7) Open Library path

- `screens/recommenders/openLibrary/openLibraryRecommender.ts`
  - Open Library engine used by the router for kids by default

- `screens/recommenders/openLibrary/openLibraryKidsQueryBuilder.ts`
  - kids-specific query shaping and domain mode selection
  - supports domain modes like picture books / early reader / chapter-middle

### 8) Shared recommendation ranking and normalization

- `screens/recommenders/normalizeCandidate.ts`
  - normalizes raw Google Books and Open Library docs into one comparable candidate shape

- `screens/recommenders/finalRecommender.ts`
  - post-fetch ranking/filtering layer
  - dedupes candidates
  - scores quality/trust signals
  - penalizes anthologies, guides, spammy titles, media tie-ins, etc.
  - lane-aware final reranking happens here

- `screens/recommenders/recommenderProfiles.ts`
  - lane-specific tuning values for adult / teen / preTeen / kids
  - maps deck key to lane

### 9) Taste system and tuning

- `screens/recommenders/taste/tasteProfileBuilder.ts`
  - builds a cross-media taste profile from swipe tags and feedback
  - weights structured tag prefixes differently (`vibe`, `theme`, `genre`, etc.)

- `screens/recommenders/taste/personalityProfile.ts`
  - persistent-ish personality vector model

- `screens/recommenders/taste/sessionMood.ts`
  - session-level mood model based on recent swipes

- `screens/recommenders/taste/tasteBlender.ts`
  - blends long-term personality with session mood

- `screens/recommenders/taste/tasteSimilarity.ts`
  - scores and ranks candidate books against a taste vector

- `screens/recommenders/taste/recommendationPipeline.ts`
  - generic pipeline class that manages personality, session swipes, mood, and ranking lifecycle
  - in `SwipeDeckScreen`, this is currently used with in-memory stores for preview/debug state rather than as the primary backend recommendation source

- `screens/recommenders/dev/RecommenderEqualizerPanel.tsx`
  - UI for tuning recommender weights

- `screens/recommenders/dev/recommenderProfileOverrides.ts`
- `screens/recommenders/dev/recommenderTuningStorage.ts`
  - persistence and override helpers for tuning profiles

---

## Legacy / compatibility layer still in active use

These files are no longer the whole recommendation system, but they still matter.

- `screens/swipe/openLibraryFromTags.ts`
  - still a major helper module
  - builds tag-count-driven query strings
  - contains Google Books search logic despite the filename
  - also still contains Open Library HTTP search and Open Library cover helpers
  - imported by `SwipeDeckScreen`, band-specific files, and the Google Books recommender

- `screens/swipe/openLibraryCore.ts`
  - shared token normalization and Google Books helper utilities
  - also still contains an Open Library cover helper

- `screens/swipe/openLibraryKids.ts`
- `screens/swipe/openLibraryPreTeen.ts`
- `screens/swipe/openLibraryTeen.ts`
- `screens/swipe/openLibraryAdult.ts`
  - band-specific query shaping wrappers that still feed the older tag-query approach

- `screens/swipe/recommendationsByBand.ts`
  - chooses the final query builder for each deck key

- `screens/swipe/swipeHelpers.ts`
  - assorted swipe utilities
  - deck resolution, shuffling, tag count mutation, search helpers, cover/image lookup, fallback book picking, candidate scoring

### Practical meaning

The project has **two overlapping recommendation layers**:

1. the newer `screens/recommenders/**` engine/router/ranking/taste stack
2. the older `screens/swipe/openLibrary*` tag-query stack

They are connected rather than fully separated. If you change recommendation behavior, you usually need to check both layers.

---

## Config and theming

- `NovelIdeas.json`
  - baseline shipped config
  - contains branding, theme, deck enablement, recommendation source, and swipe categories
  - still defaults `recommendations.source` to `open_library`

- `constants/brandTheme.ts`
  - theme and highlight presets
  - also controls banner title text color

- `constants/deckLabels.ts`
  - label helper for deck names

- `data/tagNormalizationMap.ts`
  - canonical raw-tag normalization layer
  - fail-closed: unmapped tags can be dropped
  - this is still the right place to contain tag drift

---

## Collection upload / local library path

- `screens/AdminCollectionUploadScreen.tsx`
  - MVP-style upload screen for collection imports
  - designed around Supabase storage + an Edge Function named `import-collection`
  - currently placeholder-configured (`PASTE_YOUR_SUPABASE_URL_HERE` etc.)
  - not production-wired yet

- `app/admin-collection.tsx`
  - route wrapper for the upload screen

---

## What changed versus the old map

### Removed or no longer true

- `screens/swipe/defaultCards.ts` is not present
- the old map treated `screens/swipe/openLibraryCore.ts` + `openLibraryFromTags.ts` as the main choke points for all recommendations; that is now incomplete
- the old map did not include:
  - `screens/recommenders/finalRecommender.ts`
  - `screens/recommenders/normalizeCandidate.ts`
  - `screens/recommenders/recommenderProfiles.ts`
  - `screens/recommenders/taste/**`
  - `screens/recommenders/dev/**`
  - `services/hardcover/hardcoverRatings.ts`
  - `app/api/hardcover/+api.ts`
  - `app/app_admin-web.tsx`
  - `data/swipeDecks/*` as the real deck source of truth

### New reality

- `SwipeDeckScreen.tsx` is the product orchestrator
- `recommenderRouter.ts` is the engine switchboard
- `data/swipeDecks/*` is where deck content really lives
- `finalRecommender.ts` is a major ranking/filtering choke point
- `taste/**` adds a second layer of personalization logic on top of raw tags
- kids and non-kids do not share the same default engine path

---

## Best “where do I change X?” guide now

### 1) Change which engine each deck uses
Start here:
- `screens/recommenders/recommenderRouter.ts`

### 2) Change the actual card content for a deck
Start here:
- `data/swipeDecks/k2.ts`
- `data/swipeDecks/36.ts`
- `data/swipeDecks/ms_hs.ts`
- `data/swipeDecks/adult.ts`

### 3) Change tag normalization / prevent vocabulary drift
Start here:
- `data/tagNormalizationMap.ts`

### 4) Change post-fetch ranking quality
Start here:
- `screens/recommenders/finalRecommender.ts`
- `screens/recommenders/recommenderProfiles.ts`

### 5) Change taste-personalization behavior
Start here:
- `screens/recommenders/taste/tasteProfileBuilder.ts`
- `screens/recommenders/taste/personalityProfile.ts`
- `screens/recommenders/taste/sessionMood.ts`
- `screens/recommenders/taste/tasteBlender.ts`

### 6) Change query-building for the older tag-driven system
Start here:
- `screens/swipe/openLibraryFromTags.ts`
- `screens/swipe/openLibraryCore.ts`
- `screens/swipe/openLibraryKids.ts`
- `screens/swipe/openLibraryPreTeen.ts`
- `screens/swipe/openLibraryTeen.ts`
- `screens/swipe/openLibraryAdult.ts`

### 7) Remove Open Library entirely
You need to inspect all of these, not just one file:
- `screens/recommenders/recommenderRouter.ts`
- `screens/recommenders/openLibrary/openLibraryRecommender.ts`
- `screens/recommenders/openLibrary/openLibraryKidsQueryBuilder.ts`
- `screens/swipe/openLibraryFromTags.ts`
- `screens/swipe/openLibraryCore.ts`
- `screens/swipe/swipeHelpers.ts`
- `app/(tabs)/index.tsx`

### 8) Change admin config UX
Start here:
- `app/(tabs)/index.tsx`
- `app/app_admin-web.tsx`
- `constants/brandTheme.ts`
- `constants/runtimeConfig.ts`

---

## Short version of the current map

If I had to reduce the repo to the files that matter most right now, I would keep this mental model:

1. `screens/SwipeDeckScreen.tsx` — product orchestrator
2. `data/swipeDecks/*` — actual deck content
3. `screens/recommenders/recommenderRouter.ts` — engine selection
4. `screens/recommenders/googleBooks/googleBooksRecommender.ts` and `screens/recommenders/openLibrary/openLibraryRecommender.ts` — fetch engines
5. `screens/recommenders/finalRecommender.ts` — quality/ranking choke point
6. `screens/recommenders/taste/*` — personalization layer
7. `app/(tabs)/index.tsx` and `app/app_admin-web.tsx` — admin/config shell
8. `data/tagNormalizationMap.ts` — vocabulary control

