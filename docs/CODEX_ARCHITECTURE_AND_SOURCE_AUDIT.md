# Recommendation Architecture and Source Audit

Date: 2026-07-27  
Audited baseline: `3b30f283f235cca65aecba61fa99bc3b93e23838` (`3b30f28`, **Expose younger Google Books stage lineage**)  
Audit branch: `codex/architecture-source-audit`

## Scope and confidence

This is a read-only architecture audit. No production code or test was intentionally changed. The only deliverable is this report.

The repository currently contains two recommendation paths:

1. **Recommendation V1 / multi-source router** — the default UI path. It is entered through `screens/recommenders/recommenderRouter.ts::getRecommendations` and can dispatch Google Books, Open Library, Kitsu, ComicVine, and NYT augmentation.
2. **Recommendation V2** — an explicit UI/debug selection. It is entered through `app/recommender-v2/engine.ts::runRecommenderV2`. Although the V2 type and planner enumerate seven source IDs, only Mock, Google Books, and Open Library have registered V2 adapters.

This distinction is foundational. A source being configurable in the wrapper, listed in `SourceIdV2`, or present in a V2 `SearchPlan` does not mean V2 can dispatch it.

Evidence:

- `screens/SwipeDeckScreen.tsx::initialRecommendationEngineSelection` defaults to `"v1"` and selects V2 only for `?engine=v2` or a UI selection.
- `screens/SwipeDeckScreen.tsx::performRecommendationRun` branches on `selectedRecommendationEngine`.
- `app/recommender-v2/types.ts::SourceIdV2` lists all sources.
- `app/recommender-v2/searchPlan.ts::buildSearchPlan` creates plans for all sources.
- `app/recommender-v2/sources/index.ts::sourceAdapters` registers only Mock, Google Books, and Open Library; Kitsu, ComicVine, Local Library, and NYT are `null`.
- The V2 skeleton was introduced by `5264c3e`; production mock isolation was later made explicit by `00290d1`.

## Executive findings

1. **V2 is a complete book-recommendation pipeline, not yet a complete multi-source replacement.** Its source-agnostic types are ahead of its adapter coverage.
2. **The UI maintains two different taste models.** The legacy Taste DNA/profile is built in `screens/recommenders/taste/*`, while V2 rebuilds a separate weighted profile directly from converted swipe history. V2 does not consume `tasteProfileWithMood`.
3. **Open Library is the most deeply age-specialized V2 adapter.** Teen, Adult, and Preteen profiles are labeled locked; K-2 remains explicitly pending.
4. **Google Books has the broadest deterministic V2 regression coverage**, especially for publication identity, age/maturity separation, lineage, and final eligibility. Several suites explicitly do not assert recommendation quality.
5. **Kitsu, ComicVine, NYT, and Local Library should not be described as V2 sources in an operational sense.** Their current behavior belongs to V1/wrapper code, and Local Library has configuration/upload plumbing but no recommendation adapter.
6. **Certification and usefulness are not equivalent.** The audited live Open Library preset run passed its structural checks while still returning obviously debatable titles and underfilled slates.
7. **The Open Library routing suite is not fully green on the audited baseline.** It stops at a stale Teen Fantasy query-order assertion: expected `fantasy school`, `action adventure`, `young adult fantasy`; current planner returned `young adult fantasy`, `fantasy`. Commit history shows the intentional planner change at `8d42418`.

---

## 1. Recommendation V2 lifecycle

### Lifecycle map

| Stage | Primary files and functions | Input | Output | Principal diagnostics | Regression protection |
|---|---|---|---|---|---|
| Swipe history | `screens/SwipeDeckScreen.tsx::{handleRight,handleLeft,handleDownNotSure,swipeHistoryToV2Signals}` | UI cards and like/dislike/skip gestures | `SwipeHistoryEntry[]`, then `SwipeSignalV2[]` | UI counters, phase history, converted signals in copied diagnostics | Indirectly exercised by `scripts/run-v2-openlibrary-routing-regressions.mjs`; there is no focused component test for gesture-to-signal conversion |
| Taste DNA/profile | Legacy: `screens/recommenders/taste/tasteProfileBuilder.ts::buildTasteProfile`, `recommendationPipeline.ts::RecommendationPipeline`; V2: `app/recommender-v2/tasteProfile.ts::buildTasteProfile` | Legacy tag counts/history or V2 `SwipeSessionV2.signals` | Legacy `TasteProfile` or V2 weighted `TasteProfile` | V2 input/like/dislike/skip counts, Adult polarity maps, deep-debug state | `scripts/run-v2-taste-alignment-diagnostics-regressions.mjs`, Open Library routing regressions |
| Routing | Wrapper engine selection plus `searchPlan.ts::buildSearchPlan`; source-specific OL query builders inside `openLibrarySource.ts` | V2 profile, enabled-source map | `SearchPlan`, source plans, intents | `taste_profile_built`, `search_plan_built`; query rationale, routing reason/family | Open Library routing regressions; Google Books query-quality and age-infrastructure regressions |
| Source eligibility | `SwipeDeckScreen.tsx` source settings; `searchPlan.ts::buildSearchPlan`; adapter registration in `sources/index.ts` | Configuration, source support flags, plan adapter availability | Enabled, skipped, or `adapter_not_implemented` plan result | `skippedReason`, planned/attempted/status; wrapper source-disable reasons | `run-v2-mock-source-regressions.mjs`; Google Books infrastructure audit |
| Query planning | `searchPlan.ts::{buildSearchPlan,buildGoogleBooksIntents}`; `openLibrarySource.ts::buildOpenLibraryQueryPlansForRegression` and age-specific internal builders | Weighted profile, top genres/tones/themes/formats | Ordered `SearchIntentV2[]` and source query cascades | Planned/attempted queries, family, facets, cascade index, rationale | OL routing suite; GB query-quality suite |
| Source adapters | `sources/{googleBooksSource,openLibrarySource,mockSource}.ts` | `SourcePlan`, profile, abort signal | `SourceResult` with accepted raw rows | Fetch timestamps/status/body prefix, raw counts, drops, retries/recovery, per-query lineage | OL presets/routing; GB suites; mock isolation suite |
| Normalization | `normalize.ts::normalizeSourceResults`; source adapters also pre-normalize their accepted rows | `SourceResult[]` | shared `NormalizedCandidate[]` | Per-source `normalizedCount`; provenance fields; maturity/audience split; pipeline object IDs | GB age infrastructure, maturity, publication-shape, lineage; OL routing |
| Pre-scoring policy | `engine.ts::{applyAdultGoogleBooksNormalizationGate,applyPreteenGoogleBooksPublicationIdentityPreScoringGate,applyKidsGoogleBooksPreScoringGate,applyTeensGoogleBooksPreScoringGate}` | Normalized candidates and profile | reduced normalized candidate pool | Per-title policy decisions/reasons/evidence and stage lineage | Dedicated GB Kids, Teens, Preteen identity/shape suites |
| Scoring | `score.ts::{scoreCandidates,ageSuitabilityScore,signalPresentInText}` | normalized candidates and profile | `ScoredCandidate[]` | matched signals, score/breakdown, metadata-backed positive/negative evidence, query-only signals removed | taste-alignment; OL routing; GB short-signal and narrative-ranking suites |
| Final eligibility | `select.ts::rejectReason` plus age/source-specific eligibility helpers called by `selectRecommendations` | scored candidates and profile | accepted/deferred/rejected candidate states | reason histograms, per-title final-eligibility decisions/evidence, clean counts | OL routing; GB final eligibility, final slate identity, Preteen/Kids/Teens suites |
| Selection | `select.ts::selectRecommendations` | eligible ranked pool, profile, limit | selected `ScoredCandidate[]` | duplicate/title/author/series deferrals, underfill relaxation, recovery, final-selection decisions | taste-alignment, OL routing/presets, GB lineage/final-slate/narrative ranking |
| Wrapper/rendering | `diagnostics.ts::{buildDiagnosticReport,buildRecommendationResultV2}`; `SwipeDeckScreen.tsx::{normalizeRecommenderV2Items,buildV2RecommendationResultForDiagnostics,applyMiddleGradesFinalPayloadGuard}` | selected candidates and diagnostic report | `RecommendationResultV2`, then UI `RecItem[]` | final/returned title boundaries, root collapse, rendering lineage, fail-closed markers | GB lineage diagnostics; OL routing source-text/lineage assertions; no focused renderer component suite |

### 1.1 Swipe history

`handleRight`, `handleLeft`, and `handleDownNotSure` append a card plus direction to local `swipeHistory`. Likes/dislikes also change `tagCounts`; all three asynchronously call `RecommendationPipeline.recordSwipe`.

When V2 runs, `swipeHistoryToV2Signals` converts the history again:

- prefixes in card tags become genres, tones, themes, or character dynamics;
- format is inferred as book, manga, anime, comic, or graphic novel;
- likes and dislikes receive weight `1`;
- skips receive weight `0.25`.

The V2 converter therefore depends on card tag quality. It does not read the persisted personality/profile produced by `RecommendationPipeline`.

Risk: the swipe UI, tag-count model, persisted pipeline, and V2 signal conversion are parallel representations. A change to card tags can alter both engines differently even if the visible swipe sequence is unchanged.

Evidence: `screens/SwipeDeckScreen.tsx::{swipeHistoryToV2Signals,recordPipelineSwipe,performRecommendationRun}`; legacy taste types in `screens/recommenders/taste/types.ts`. Wrapper lineage was tightened in `8ef00e6` and the Preteen fail-closed handoff in `1a65881`.

### 1.2 Taste profile construction

The legacy profile is a normalized, cross-media axis vector built by `screens/recommenders/taste/tasteProfileBuilder.ts::buildTasteProfile`, then blended with session mood/personality via `RecommendationPipeline`, `tasteBlender.ts`, and `sessionMood.ts`.

V2 instead builds weighted lists for:

- tone;
- pacing;
- genre family;
- themes;
- character dynamics;
- format preference;
- avoid signals;
- source hints.

V2 action semantics are age-sensitive:

- Like: positive.
- Dislike: negative and stored in avoid signals.
- Non-Adult skip: low positive weight in `buildTasteProfile` (`0.25`).
- Adult skip: zero influence.

Adult profiles also emit family-level polarity diagnostics so mixed, net-positive, neutral, and negative evidence can be distinguished. Preteen avoid signals are pruned when they conflict with positive maps.

Evidence: `app/recommender-v2/tasteProfile.ts::buildTasteProfile`; regressions in `run-v2-taste-alignment-diagnostics-regressions.mjs`; commits `d5c1eca`, `d7c5e43`, `06c9dcf`, and `66fe325`.

### 1.3 Routing and search planning

`buildSearchPlan` creates two source-agnostic intents, then replaces them with a four-rung Google Books plan for Google Books. Every source receives a plan, but only a source explicitly set to `true` is enabled.

Open Library subsequently performs substantial age-specific replanning inside its adapter. The query planner selects distinct Teen, Adult, Preteen, and K-2 families, carries query family/cascade/facets into each row, and can run source-level and post-final-eligibility recovery.

This means the real Open Library routing contract is not fully represented by `SearchPlan.intents`; it is split between `searchPlan.ts`, `openLibraryProfiles.ts`, `openLibrarySource.ts`, and post-selection recovery in `engine.ts`.

Evidence:

- `app/recommender-v2/searchPlan.ts::buildSearchPlan`.
- `app/recommender-v2/sources/openLibrarySource.ts::buildOpenLibraryQueryPlansForRegression`.
- `app/recommender-v2/engine.ts::teenOpenLibraryPostFinalRecoveryQueries` and `adultOpenLibraryPostFinalRecoveryQueries`.
- OL routing changes include `8d42418`, `9831f14`, `f6bf9e3`, and `5483768`.
- Adult/Teen post-final recovery arrived in `3bc44d3` and `f63ba7a`.

### 1.4 Source eligibility and dispatch

V2 eligibility is a three-step contract:

1. Wrapper setting supplies `enabledSources`.
2. `buildSearchPlan` marks the plan enabled or skipped.
3. `runRecommenderV2` looks up the adapter. Missing adapters become an intentional `skipped` result with `adapter_not_implemented`; they are not failed dispatches.

`Promise.all` dispatches enabled implemented sources concurrently. `runWithTimeout` supplies a source-level abort signal and maps timeout/failure into structured source diagnostics.

The adapter itself may still return skipped—for example, disabled plan or no query intents—or empty after a successful request.

This is why a future harness must retain distinct terminal states:

- disabled;
- unsupported;
- adapter not implemented;
- no eligible intent;
- attempted and empty;
- attempted and failed;
- attempted and filtered to zero.

Evidence: `engine.ts::{runWithTimeout,skippedResult,failedResult,runRecommenderV2}`; `sources/index.ts::sourceAdapters`; `types.ts::{SourceStatusV2,SourceDiagnosticV2}`.

### 1.5 Adapter admission and normalization

Both real V2 adapters do material filtering before shared normalization:

- Open Library converts documents, rejects structural/artifact/audience/relevance shapes, deduplicates, and limits the scoring handoff.
- Google Books validates volume records, deduplicates volume IDs, requires title and author, classifies publication shape, rejects non-narrative identities, and permits a narrow Preteen unknown-shape rescue.

`normalizeSourceResults` then maps accepted rows into the common candidate contract and preserves provenance. It deliberately separates Google Books source maturity (`MATURE` / `NOT_MATURE`) from the requested audience band.

Evidence: `normalize.ts::{normalizeSourceResults,normalizeMaturityBand}`; `googleBooksSource.ts::{inferGoogleBooksPublicationShape,googleBooksPublicationShapeDropReason}`; Open Library artifact predicates in `openLibrarySource.ts`. Audience/maturity separation was introduced by `11ace48`; publication-shape port by `248f3ec`.

### 1.6 Scoring

`scoreCandidates` calculates:

- genre, theme, tone, character, and format matches;
- avoid penalties;
- age suitability;
- source-quality relevance;
- query-rung bonus;
- source/age-specific narrative evidence.

For Open Library youth/adult and Adult Google Books, taste matches are metadata-backed: query text is not allowed to manufacture candidate evidence. Preteen/Kids generic container signals such as “book”, “story”, or “fiction” are removed. The result preserves score breakdowns and positive/negative evidence per title.

The code also contains title- and phrase-specific protections. These are effective regressions against known false positives, but they are high-risk to generalize because they encode historical incidents.

Evidence: `score.ts::{scoreCandidates,sourceQualityRelevanceScore,ageSuitabilityScore}`; taste-alignment and OL routing regressions; short-signal guard commit `539e051`.

### 1.7 Final eligibility

Final eligibility is not a single threshold. `select.ts` applies source- and age-specific rules for:

- meaningful document-backed taste evidence;
- maturity/audience;
- publication identity;
- source quality;
- route overlap;
- generic/context-only evidence;
- sequel/later-series handling;
- emergency exceptions.

The same function then performs ranking/selection, so diagnostics must distinguish “failed eligibility” from “passed eligibility but lost ranking/diversity.” The Google Books lineage utilities and `selectRecommendations` now do this explicitly.

Evidence: `select.ts::{selectRecommendations,rejectReason,middleGradesFinalEligibility,adultGoogleBooksFinalSlateIdentityAudit}`; `googleBooksLineageDiagnostics.ts`; commits `85c0b32`, `c53c1e8`, and `3b30f28`.

### 1.8 Selection

Initial ranking is score-based with source-specific ordering refinements. The selector then:

- rejects hard-ineligible candidates;
- deduplicates normalized titles;
- defers repeated authors, series roots, and recurring OL clusters;
- caps Adult Google Books cluster concentration;
- can relax selected diversity constraints only for underfill;
- can use narrowly defined zero-slate or weak-source fallbacks;
- records all such decisions.

Underfill is not automatically treated as failure. Several paths deliberately preserve a smaller relevant slate instead of accepting a known-bad candidate, although there are also emergency fill paths that require explicit quality auditing.

Evidence: `select.ts::selectRecommendations`; Adult GB narrative ranking in `c7bde79`; Teen later-series deferral in `bcfc874`.

### 1.9 Wrapper and rendering

`buildDiagnosticReport` serializes the internal stages and source diagnostics. `buildRecommendationResultV2` may collapse repeated Preteen collection roots after selection, so `finalItemsLength` can differ from `returnedItemsLength`.

`SwipeDeckScreen` converts candidates into the UI's existing Open-Library-shaped `RecItem` wrapper regardless of source. It also:

- carries scoring/provenance into `doc.diagnostics`;
- harmonizes Google Books source-through-rendering lineage;
- blocks a Preteen Open Library payload if wrapper items exist but no candidate was scored;
- persists and renders only the guarded list.

The Open-Library-shaped wrapper is a compatibility device, not a statement that every item came from Open Library.

Evidence: `diagnostics.ts::{buildDiagnosticReport,buildRecommendationResultV2}`; `SwipeDeckScreen.tsx::{normalizeRecommenderV2Items,buildV2RecommendationResultForDiagnostics,applyMiddleGradesFinalPayloadGuard}`; commits `c53c1e8`, `8ef00e6`, and `1a65881`.

---

## 2. Source audit

### Summary matrix

| Source | V2 adapter | Current intended role | Operational age bands | Default activation | Certification summary |
|---|---:|---|---|---|---|
| Open Library | Yes | Broad bibliographic discovery and diversity; main V2 recovery source | Kids, Preteens, Teens, Adult | Wrapper default on; V2 only when passed true | Teen/Adult/Preteen profiles labeled locked; K-2 pending; live Teen/Adult presets pass, routing suite has one stale assertion |
| Google Books | Yes | Metadata-rich, commercially available narrative books; V1 primary for non-K2 | Kids, Preteens, Teens, Adult | Wrapper default on; V2 only when passed true | Extensive fixture certification; live quota/health not proven by deterministic suites |
| ComicVine | No | Graphic novel/comics lane, issue-to-collection conversion, Kitsu metadata enrichment | Primarily Teen; adapter lacks a hard age gate | V1 default on if proxy/runtime gate allows | Static dispatch/query smokes pass; live contract gate exists but was not run |
| Kitsu | No | Manga discovery and visual-format lane | Teen in normal adapter path; Adult recovery/debug paths exist | V1 setting defaults on, but normal adapter requires Teen manga intent | Historical frozen-behavior/observability work; no dedicated package regression command |
| NYT | No | At most two bestseller anchor injections into underfilled Teen/Adult V1 pools | Teens and Adult after enough decisions | Explicit opt-in only | No dedicated regression suite found |
| Local Library | No | Intended local collection source | None operationally in recommender; configuration is deck-wide | Unsupported by default; gated by `localLibrarySupported` | No adapter or certification suite found |

### 2.1 Open Library

**Role.** Open Library supplies broad book discovery, diversity against Google Books, and the only deeply instrumented V2 underfill recovery path. In legacy V1, it is also the preferred K-2 engine (`recommenderRouter.ts::chooseEngine`).

**Age support.**

- Teen: `teen_openlibrary_locked_baseline`.
- Adult: `adult_openlibrary_locked_baseline`.
- Preteen: `middle_grades_openlibrary_locked_baseline`.
- Kids/K-2: `k2_openlibrary_profile_pending`.

These labels are code declarations in `openLibraryProfiles.ts`, not independent product-quality certificates.

**Activation and skips.**

- Wrapper configuration defaults Open Library on.
- V2 requires `enabledSources.openLibrary === true`.
- Disabled plans return `source_disabled`.
- Missing intent falls back to the age profile's diagnostic query.
- Successful transport with no usable rows is `empty`, not dispatch failure.

**Source filtering.** The adapter rejects or diagnoses:

- malformed/no-title/no-author records;
- study guides, criticism, programming guides, activity books, catalogs, media studies, and other artifacts;
- age-shape mismatch;
- Teen adult-romance, academic-YA-object, low-fit, classic-drift, and omnibus drift;
- Adult juvenile, criticism/reference, and sparse-family problems;
- query-only or generic evidence at downstream scoring/eligibility;
- repeated titles/series/root clusters.

**Recovery.**

- per-age query cascades and top-up;
- direct/proxy modes;
- time budgets and circuit breakers;
- delayed/reliable-variant recovery for Preteen;
- Teen and Adult post-final-eligibility recovery;
- emergency fallback, with explicit markers and no-worsening guards.

**Diagnostics.** `SourceFetchDiagnosticV2` and `SourceDiagnosticV2` carry fetch timing, request path, timeout, body prefix, counts, drop reasons, query provenance, handoff counts, recovery traces, and final contribution. The adapter is significantly more observable than the other sources.

**Certification.**

- `run-v2-openlibrary-presets.mjs` passed for six live Teen/Adult presets during this audit. Its Preteen and K-2 entries are placeholders.
- `run-v2-openlibrary-routing-regressions.mjs` passed its initial profile/scoring checks but stopped at the stale Teen Fantasy order assertion.
- Relevant history: `2e029d4`, `8d42418`, `5ca50e7`, `f63ba7a`, `3bc44d3`.

**What certification does not prove.** The passing live preset output itself demonstrates the gap: structurally passing slates included titles such as `Brutal Prince`, `Curvy Girls Can't Date Bullies`, `From Andrew, with Love : One Dead Teen`, and `Stardust` for the audited profiles. The suite proves contracts and artifact exclusions, not that a reader would judge every title useful. Adult B/C and Teen A also returned four rather than five, which can be an appropriate relevance-preserving underfill but still requires product review.

### 2.2 Google Books

**Role.** Google Books is the metadata-rich narrative-book source. In V1 it is the default preferred engine outside K-2; in V2 it has specialized intents and extensive publication identity gates.

**Age support.** The V2 adapter and shared pipeline support Kids, Preteens, Teens, and Adult. The engine applies different pre-scoring gates by age.

**Activation and skips.**

- Wrapper defaults on unless explicitly disabled.
- V2 requires explicit `true`.
- Disabled and no-intent paths are structured skips.
- API key is optional in code; it is read from Expo/Next/Vite/general environment variables.

**Source filtering.**

- requires a valid volume, ID, title, and author;
- deduplicates volume IDs;
- requests English books with relevance ordering;
- classifies narrative vs criticism, reference, readers' advisory, writing guide, catalog, periodical, anthology, compilation, or unknown;
- rejects artifact identities before shared normalization;
- allows a Preteen-only rescue for unknown shapes with two independent evidence families;
- separates source maturity rating from audience band;
- applies further Adult, Kids, Preteen, and Teen pre-scoring/final gates.

**Recovery.**

- V2 runs primary intents, then only runs the broad fallback when accepted raw rows remain below three.
- Per-query timeout is a bounded share of the source timeout.
- V2 currently does not retry a failed Google Books fetch.
- Legacy V1 has separate 429/503 retry and authority-backfill behavior in `screens/recommenders/googleBooks/googleBooksRecommender.ts`; that behavior must not be assumed to exist in V2.

**Diagnostics.** The V2 adapter exposes raw/accepted/rejected counts by query, fetch status/body prefix, publication-shape histograms, per-title identity and maturity evidence, narrative efficiency, ranking/final-eligibility/selection lineage, and rendered drop attribution.

**Certification.**

- Passed in this audit: age-band infrastructure, lineage diagnostics, and query-quality regressions.
- Additional scripts cover publication shape, Kids/Teen architecture, Preteen identity/false rejects/rescue, audience/maturity, narrative ranking, final slate identity, and short-signal boundaries.
- `run-v2-googlebooks-age-band-infrastructure-audit-regressions.mjs` explicitly states that its fixtures do not assert recommendation quality.
- Relevant commits include `512f54b`, `248f3ec`, `11ace48`, `a689858`, `bee0733`, `367824e`, `e75b2d9`, and `3b30f28`.

**What certification does not prove.** Most suites replace `globalThis.fetch` or construct candidates directly. They prove deterministic policy behavior, not live quota availability, search-rank stability, metadata completeness, cover availability, or human precision. `scripts/source-health-preflight.mjs` can distinguish quota/rate-limit health, but it is a transport probe and is not part of the package test suite.

### 2.3 ComicVine

**Role.** ComicVine is the V1 comics/graphic-novel lane. It converts issue records into parent-volume-aware documents, filters single issues and weak narrative shapes, supplies exact-title metadata for Kitsu enrichment, and can use curated graphic-novel fallback rows.

The file retains the historical `gcdGraphicNovelRecommender` name and some GCD proxy utilities, while the exported production alias is `getComicVineGraphicNovelRecommendations`.

**Age support.** The query vocabulary, fallback catalog, and most certification presets are Teen-oriented. The adapter itself has no hard deck-age rejection, so configuration can dispatch it elsewhere. This is a support ambiguity, not evidence that all ages are certified.

**Activation and skips.**

- V1 setting defaults on unless disabled.
- Router runtime requires a proxy URL; production has a runtime gate.
- `shouldUseComicVine` checks only configuration.
- No V2 adapter exists; an enabled V2 plan is skipped as `adapter_not_implemented`.

**Filtering.**

- merges generic issue titles with parent-volume names;
- requires collection-like and meaningful narrative evidence;
- removes single issues, lexical artifacts, trivial titles, and canonical-empty rows;
- deduplicates and caps franchise/root concentration;
- tracks superhero suppression/evidence and taste overlap.

**Recovery.**

- per-query failures do not abort the source;
- known anchors, format followups, raw rescue, non-superhero backfill, and known-good probes;
- curated fallback/top-up can return titles not derived from the live query;
- a ComicVine-only no-query or known-good-probe failure can be fatal.

**Certification.**

- `smoke-comicvine-dispatch-diagnostics.mjs` and `test-gcd-query-regression.mjs` passed in this audit. They are static/source-contract checks.
- `run-comicvine-contract-traces.ts` defines a live three-preset router release gate requiring at least two useful passes, exact router fingerprint, persisted output, and no fatal error. It was not run because it dispatches external services.
- `smoke-comicvine-adapter.mjs` and production-bundle checks exist but are not package scripts.
- History includes `f7435ac`, `d9eb409`, `31c7233`, `eb0c0fe`, and `432b2e6`.

**What certification does not prove.** Static smokes prove symbols/order/guards, not API health or candidate quality. The live contract can pass with emergency/curated returns; the script emits warnings for fallback paths. Therefore returned count alone cannot establish ComicVine competence.

### 2.4 Kitsu

**Role.** Kitsu supplies manga candidates and a visual-format alternative to book sources. Router code also contains substantial Teen query sanitization, family inference, weak-overlap handling, and optional ComicVine metadata enrichment.

**Age support.**

- Normal adapter entry requires `deckKey === "ms_hs"` and positive Teen manga intent.
- `forceKitsuRecoveryFetch` bypasses that check; the router contains Adult Kitsu recovery/debug behavior.
- No normal Kids or Preteen Kitsu support was found.
- No V2 adapter exists.

**Activation and skips.**

- Kitsu configuration defaults on.
- The router may call it whenever enabled, but `getKitsuMangaRecommendations` intentionally returns empty unless the Teen/manga gate passes.
- Router `resolveKitsuEligibility` separately requires positive anime/manga likes at least as strong as other media likes.

An empty Kitsu result can therefore be intentional eligibility behavior even when the source toggle is on.

**Filtering.**

- converts Kitsu manga JSON:API rows;
- rejects subtype `novel` unless the session explicitly wants novels;
- scores facet overlap and sorts by overlap, user count, then popularity rank;
- downstream router code applies stronger taste, family, maturity, and final guards.

**Recovery.**

- tries multiple sanitized/taste-aligned queries;
- continues after individual fetch errors;
- includes Teen alternate-query planning and Adult forced/recovery paths in the router;
- can enrich candidates via exact ComicVine title matches.

**Certification.**

- No dedicated Kitsu regression command is present in `package.json`.
- `source-health-preflight.mjs` and `source-direct-smoke.mjs` probe Kitsu transport only.
- Commit history shows extensive diagnostics and a deliberate frozen-behavior restoration: `2f82b4f`, `39b95f0`, `828cf43`, `b99c0df`, and `5659eae`.

**What certification does not prove.** A Kitsu health response does not prove that Teen eligibility permits dispatch, that the chosen text query maps to the intended manga genre, that age suitability is acceptable, or that ComicVine enrichment improves the recommendation rather than merely adding metadata.

### 2.5 NYT

**Role.** NYT is not a general retrieval source. It is a popularity/authority anchor layer in the V1 router.

**Age support and activation.**

- Only Teen or Adult routes.
- Requires at least four decision swipes.
- Disabled by default; configuration must set `nyt: true`.
- Injections are allowed only when the filtered pool is under the configured floor.
- At most two anchors are injected.

**Filtering.** The router selects family-specific lists, requires family match, computes tone similarity, caps anchors, and merges/deduplicates them with the source pool.

**Recovery.** List requests run with `Promise.allSettled`; one failed list does not discard successful lists. `fetchNytAnchorDocs` catches an overall failure and emits an error in its debug object rather than failing the recommendation.

**Diagnostics.** Router output includes enablement, fetch/match/injection counts, list names, accepted/rejected titles, and errors.

**Certification.** No dedicated NYT regression or package command was found. Integration originated in `e1c15af`; source configuration in `7061ebc`.

**Important discrepancy.** `nytAdapter.ts::NytAdaptedRecommendationDoc` sets `source: "openLibrary"` for compatibility. NYT identity remains in `doc.nyt`, but source-count summaries can attribute an NYT anchor to Open Library unless they inspect the nested marker. This is a diagnostic attribution risk.

**What certification does not prove.** Bestseller status is not taste relevance, Teen appropriateness, or literary fit. Current logic limits the blast radius, but the absence of deterministic tests leaves the family/tone and source-attribution contracts underprotected.

### 2.6 Local Library

**Role.** The UI/admin design intends a library-specific local collection source. Admin code can persist uploaded JSON/CSV in browser local storage.

**Operational status.**

- `localLibrarySupported` defaults to false.
- The toggle is disabled unless support is explicitly declared.
- Source configuration is propagated for every deck.
- No V1 local-library fetch/adapter was found.
- `sourceAdapters.localLibrary` is `null` in V2.

Therefore Local Library currently has **configuration and collection-ingestion plumbing, but no recommendation dispatch path** in the audited code.

**Activation and skips.** Unsupported is reported as `localLibrary_not_supported`; supported-but-disabled is `localLibrary_disabled_by_admin`. If enabled in V2, it becomes `adapter_not_implemented`.

**Certification.** No Local Library regression, smoke, or competence suite was found. Collection persistence was restored by `3293e79`.

**What certification does not prove.** There is no operational source to certify. The UI label and uploaded storage should not be interpreted as recommendation availability.

---

## 3. Intentionally frozen or risky behavior

### Explicitly frozen

- Open Library Teen, Adult, and Preteen age profiles have `lockedBaseline: true`.
- K-2 Open Library is explicitly pending, not locked.
- Kitsu history contains `5659eae` (**Restore frozen Teen Kitsu behavior**).
- Mock is explicitly off in normal V2 runs (`00290d1`, protected by `run-v2-mock-source-regressions.mjs`).
- Current Teen Fantasy query order reflects the intentional planner change in `8d42418`, despite a stale regression expectation.

### Especially risky

1. **Changing metadata-only evidence rules.** Allowing query text to stand in for document evidence would create circular relevance, especially for Open Library.
2. **Changing age/maturity semantics.** Google Books `NOT_MATURE` means content maturity, not the requested age band.
3. **Moving gates across stages.** Source filtering, shared normalization, pre-scoring gates, final eligibility, and wrapper fail-closed guards have distinct diagnostics and recovery semantics.
4. **Changing timeouts or retries globally.** Source and per-query budgets interact with proxy behavior, circuit breakers, recovery order, and total UI latency.
5. **Increasing fill targets without precision evidence.** Underfilled relevant slates can be preferable to irrelevant or unsafe filler.
6. **Altering dedupe/root logic.** Titles, authors, editions, series roots, recurring OL clusters, ComicVine franchises, and Preteen collection roots are handled at different stages.
7. **Assuming V1/V2 parity.** Legacy Google Books retries and Kitsu/ComicVine/NYT paths are not V2 behavior.
8. **Removing compatibility source shapes.** The wrapper renders all V2 candidates as `open_library`-kind UI items; NYT also masquerades as Open Library at the source field. Cleanup without a migration would break diagnostics and rendering.
9. **Editing incident-specific filters casually.** Title/phrase/publisher lists encode known false-positive history and can create both false positives and false negatives.
10. **Treating count contracts as quality contracts.** ComicVine curated fallback and emergency selection paths can satisfy counts while weakening profile fit.

---

## 4. Certification, health, routing, and usefulness discrepancies

### Mocked/deterministic certification versus live health

- Google Books has extensive deterministic coverage, but most suites mock `fetch` or construct candidates. Live quota, 403/429 behavior, and search composition remain external.
- Open Library routing regressions are heavily fixture-driven; the preset runner is live. A live pass is a point-in-time health/composition observation, not reproducibility proof.
- ComicVine's passing static scripts do not hit the API. Its live contract runner is separate and can exercise fallback.
- Kitsu health scripts prove endpoint response shape only.
- NYT and Local Library lack dedicated certification.

### Source routing versus dispatch

- V2 plans Kitsu, ComicVine, NYT, and Local Library but cannot dispatch them.
- Kitsu may be enabled and invoked by V1 yet intentionally return empty because Teen manga intent is absent.
- NYT may be enabled but intentionally skip because the deck, decision count, pool size, family, or tone does not qualify.
- Local Library may be configured but remains unsupported/no-adapter.
- ComicVine configuration can be enabled while production proxy/runtime gates prevent dispatch.

### Routing versus usefulness

- Query-family alignment is not document-backed relevance.
- Source authority or bestseller status is not taste precision.
- A clean transport response can be filtered to zero correctly.
- A full slate can be less useful than an underfilled but strongly supported slate.
- A fallback-derived ComicVine title can satisfy the count contract without proving the live query was competent.

### Diagnostic attribution gaps

- NYT documents identify as `source: "openLibrary"` and require nested `nyt` inspection.
- V2 wrapper items use the UI kind `"open_library"` for every source.
- `SearchPlan.diagnostics.sourceAgnostic: true` understates the amount of source-specific planning performed inside adapters.
- The default UI engine is V1, so a V2 certification pass does not certify the default path.
- The stale Teen Fantasy assertion obscures the difference between a frozen current baseline and an older expected order.

---

## 5. Proposed diagnostic-only Source Competence Harness

The harness should characterize competence, not optimize production behavior.

### 5.1 Placement and artifacts

Proposed files:

- `scripts/source-competence/run-source-competence-harness.mjs`
- `scripts/source-competence/profiles/*.json`
- `scripts/source-competence/fixtures/<source>/*.json`
- output under an ignored `artifacts/source-competence/<timestamp>/`

No production module should be modified merely to support the harness. It should call existing exported adapters/router entry points or compile the same dependency set used by current regressions.

### 5.2 Modes

1. **Fixture mode** — deterministic contract certification with captured responses.
2. **Live mode** — bounded source-health and composition characterization.
3. **Replay mode** — rerun a captured live response through normalization/scoring/eligibility without network access.
4. **Source-isolation mode** — one source enabled, all others disabled, while retaining intentional eligibility gates.
5. **Composition mode** — multiple sources enabled only to measure merge/dedupe/contribution, not to change routing.

Fixture and live results must never be combined into one pass/fail label.

### 5.3 Case matrix

Use a small, versioned set of representative profiles:

- all four age bands where the source is operational;
- primary genre families;
- positive, negative, mixed, and sparse evidence;
- explicit format intent for manga/comics;
- underfill and duplicate-pressure cases;
- known narrative and known artifact controls.

Each case must state expected activation:

- `intentional_skip`;
- `eligible_to_dispatch`;
- `unsupported_age`;
- `adapter_not_implemented`.

### 5.4 Required capture

For every source/query/attempt:

- source, engine path, age band, profile ID, request ID;
- exact request URL with secrets redacted;
- timestamp, elapsed time, timeout budget, attempt/retry number;
- connection/header/body completion states where available;
- HTTP status and bounded body prefix;
- raw stable IDs and returned ordering;
- structural drops and source-policy drops by reason;
- normalized/scored/final-eligible/final-selected titles;
- originating query and merge/dedupe lineage;
- publication shape, maturity/audience, authority, and document-backed taste evidence;
- final rejection or selection reason;
- fallback/curated/emergency provenance;
- wrapper/rendered source identity.

### 5.5 Terminal-state taxonomy

Every source case should end in exactly one primary state:

- `intentional_skip_disabled`;
- `intentional_skip_ineligible_profile`;
- `unsupported_age_or_configuration`;
- `adapter_not_implemented`;
- `dispatch_not_attempted_bug`;
- `transport_failed`;
- `timed_out`;
- `response_invalid`;
- `valid_empty_response`;
- `raw_results_all_structurally_rejected`;
- `source_policy_rejected_all`;
- `normalized_but_final_ineligible`;
- `eligible_underfilled`;
- `eligible_useful`;
- `fallback_only`;

This prevents “zero results” from collapsing intentional policy, failed dispatch, and weak source composition into the same diagnosis.

### 5.6 Competence metrics

Count is secondary. Report:

- document-backed taste precision;
- age-authority and maturity precision;
- narrative/publication-shape precision;
- duplicate/edition/series pressure;
- sequel-entry pressure;
- query-derived versus fallback-derived share;
- final-eligibility survival rate;
- final contribution;
- distinct useful family coverage;
- cross-run ID/order stability;
- underfill reason;
- human-review labels: strong fit, acceptable crossover, weak fit, concern, false positive.

Never score a smaller relevant slate below a larger irrelevant slate merely because it is smaller.

### 5.7 Bounded execution safeguards

- fixed total source deadline;
- fixed per-query deadline;
- explicit maximum attempts;
- no retry unless exercising existing production behavior;
- no pagination beyond a declared cap;
- no mutation of caches, config, routing, or source data;
- secrets redacted from artifacts;
- live mode opt-in;
- stop a source after repeated equivalent failures;
- preserve response ordering and raw IDs.

### 5.8 Certification layers

The harness should emit separate badges/statuses:

1. **Contract certified** — deterministic fixtures and lineage pass.
2. **Transport healthy** — live endpoint returned a valid response within bounds.
3. **Routing verified** — intended profile reached the intended source/query.
4. **Composition acceptable** — raw/accepted metadata composition meets declared thresholds.
5. **Usefulness reviewed** — representative final candidates received human precision review.

Only the fifth status addresses user-facing recommendation quality. No earlier status should be described as equivalent.

---

## 6. Regression evidence from this audit

Commands were bounded and run on the isolated worktree.

Passed:

- `npm run test:v2:openlibrary-presets`
- `npm run test:v2:googlebooks-age-band-infrastructure-audit`
- `npm run test:v2:googlebooks-lineage-diagnostics`
- `npm run test:v2:googlebooks-query-quality`
- `node scripts/run-v2-mock-source-regressions.mjs`
- `node scripts/run-v2-taste-alignment-diagnostics-regressions.mjs`
- `node scripts/smoke-comicvine-dispatch-diagnostics.mjs`
- `node scripts/test-gcd-query-regression.mjs`

Partially passed, then failed:

- `npm run test:v2:openlibrary-routing-regressions`
  - Initial routing, metadata-only evidence, generic-signal, Adult route, and Preteen route assertions passed.
  - Failure: stale Teen Fantasy query-order assertion expected `["fantasy school","action adventure","young adult fantasy"]`, received `["young adult fantasy","fantasy"]`.
  - This report does not modify the assertion or planner.

Not run:

- live ComicVine contract traces;
- live source-health preflight;
- live Kitsu/NYT/Google Books probes;
- full typecheck/lint;
- the remainder of every source-specific package script.

The first Open Library preset attempt failed before execution because the isolated worktree lacked `node_modules`. An ignored directory junction to the parent workspace's existing dependencies was created; no dependency installation occurred. The harness-generated tracked `.tmp` snapshots were restored to `HEAD`, and newly generated `.tmp` files were removed before the report was written.

---

## 7. Unresolved questions

1. Should V2 remain an explicit alternative engine, or is it intended to replace the default V1 router? Current adapter coverage is insufficient for silent replacement.
2. Is the legacy cross-media Taste DNA intentionally separate from V2's weighted profile, and which is the product contract?
3. Should Kitsu, ComicVine, NYT, and Local Library be removed from V2 planning until adapters exist, or retained as explicit `adapter_not_implemented` observability?
4. Which age bands are product-supported for ComicVine and Adult Kitsu, as opposed to technically dispatchable/debuggable?
5. Should NYT candidates retain `source: "openLibrary"` for compatibility, or receive a distinct attribution field without changing rendering?
6. Is Local Library recommendation support planned, and where should uploaded local collection data be read?
7. Which live-source checks are release gates versus advisory health probes?
8. Who owns human precision certification for each age band/source, and what is the acceptable underfill policy?
9. Should the stale Teen Fantasy query-order assertion be updated to the intentional `8d42418` baseline, or preserved as a historical drift alarm with a different test name?

## Conclusion

The V2 core has strong observability and unusually detailed source/age policy for Open Library and Google Books. Its largest architectural risk is not a missing scoring primitive; it is the coexistence of two engines, two taste representations, and source capabilities whose configuration surface is broader than their V2 implementation.

The next safe investment is the proposed Source Competence Harness. It should preserve the current policy stack and make activation, dispatch, transport, composition, eligibility, fallback provenance, and human usefulness independently measurable.
