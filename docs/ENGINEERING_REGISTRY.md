# NovelIdeas Engineering Registry

## 1. Purpose and scope

This registry is the durable map of the NovelIdeas engineering system. It records current repository structure and evidence, distinguishes implementation from characterization/certification/completion, and identifies dependencies, gaps, and next authorized work.

It authorizes no implementation; does not replace `docs/NOVELIDEAS_COMPLETION_ROADMAP.md`; does not replace `docs/DETERMINISTIC_TEST_MANIFEST.md`; and does not claim recommendation quality, product completeness, deployment correctness, or launch readiness.

Current code and later certification records take precedence over older audits. The normal swipe workflow now invokes Recommendation V2; the older statement that V1 is the default path is historical.

## 2. Repository baseline

- **Branch:** `main`
- **Starting commit:** `e8a2a6f2d0cf591509eed9ce41e8c12f2dff5f8e`
- **Starting state:** clean worktree.
- **Governing records:** `docs/NOVELIDEAS_COMPLETION_ROADMAP.md`, `docs/DETERMINISTIC_TEST_MANIFEST.md`, `docs/RECOMMENDATION_PHILOSOPHY.md`, `docs/CODEX_ARCHITECTURE_AND_SOURCE_AUDIT.md`, `scripts/output/certified-subsystem-registry.json`, and `package.json`.
- **Later evidence consulted:** current certification, source-competence, comparison, graphic-novel, Human Review, Collection Opportunities, and Phase I comparison records under `docs/`; current harness READMEs and frozen artifacts.
- **Implementation inspected:** `app/`, `api/`, `components/`, `constants/`, `data/`, `hooks/`, `screens/`, `services/`, and `assets/`. No `src/` directory exists.
- **Evidence inspected:** `scripts/`, `scripts/source-competence/`, `scripts/comparison-harness/`, `scripts/output/`, committed fixtures/frozen artifacts, `package.json`, `app.json`, and `tsconfig.json`.
- **Execution boundary:** static inspection only; no test suite, probe, build, lint, typecheck, network request, or artifact generator ran.

## 3. Status vocabulary

Every entry has exactly one primary status.

| Status | Meaning |
| --- | --- |
| **Implemented** | Working code/tool/document exists; validation, usefulness, completeness, and readiness are separate claims. |
| **Characterized** | Reproducible evidence describes a bounded capability and limitations; selection or production use is not implied. |
| **Certified** | A named contract or slice has explicit deterministic evidence, normally registry-backed. |
| **Locked** | A phase/tool contract/governance boundary has explicit protection and no current authorization for expansion. |
| **Frozen** | Evidence or a baseline is deliberately preserved unchanged and fixture/hash-linked. |
| **Active Development** | A capability exists but roadmap gates remain open; this registry grants no change authority. |
| **Planned** | A specification or roadmap defines future work; code must not be inferred. |
| **Placeholder** | A non-operational stub preserves a future boundary or product intent. |
| **Historical** | An earlier path/record remains but is not authoritative for current behavior. |
| **Superseded** | Later evidence explicitly replaced the item; removal still requires history review. |
| **Unknown / Requires Review** | Evidence is insufficient or conflicting, so ambiguity is preserved. |

`Certified` must name its evidence. `Locked` requires explicit protection. `Frozen` describes preserved evidence, not every passing test. `Planned` never implies code exists.

## 4. Registry entry schema

Entry IDs make the document mechanically countable. Every entry records:

```text
Purpose and lifecycle role
Current status
Primary implementation files and entry points
Configuration/environment
Deterministic and live/manual validation
Certification/frozen evidence and registry entry
Dependencies and dependents
Known risks/gaps and next authorized work
Do not infer
```

Optional fields identify age bands, sources, production/diagnostic paths, and Human Review requirements.

## 5. Core recommendation architecture

### CORE-01 - Taste-profile construction
- **Purpose / lifecycle role:** Convert V2 swipe signals into weighted taste, maturity, avoid, and source-hint evidence; taste understanding.
- **Current status:** **Implemented**
- **Implementation / entry points:** `app/recommender-v2/tasteProfile.ts`, `app/recommender-v2/types.ts`; `buildTasteProfile`.
- **Configuration/environment:** `SwipeSessionV2`, age band, diagnostic debug flags.
- **Validation:** `scripts/run-v2-taste-alignment-diagnostics-regressions.mjs`; source-competence replays; manual session diagnostics in `screens/SwipeDeckScreen.tsx`.
- **Evidence / registry:** Representative harness profiles, source-scoped only; no standalone registry row.
- **Dependencies / dependents:** Swipe decisions and deck evidence -> routing, scoring, eligibility, diagnostics.
- **Risks / next work:** V2 and legacy taste builders remain distinct; deck evidence is uncertified. Roadmap order 13 may certify deck/profile formation after release-manifest work.
- **Do not infer:** A deterministic profile accurately represents a real reader.

### CORE-02 - Swipe decision accounting and 20Q progress
- **Purpose / lifecycle role:** Preserve like/dislike/skip decisions and determine evidence-seeking card progression; reader-evidence capture.
- **Current status:** **Implemented**
- **Implementation / entry points:** `screens/SwipeDeckScreen.tsx`, `data/swipeDecks/types.ts`, `data/swipeDecks/*.ts`, `data/swipeDecks/*.json`; `swipeHistoryToV2Signals`, `selectTwentyQCard`, `shouldFinishTwentyQSession`.
- **Configuration/environment:** Deck, target/maximum swipes, category toggles, local session state.
- **Validation:** Indirect source-competence coverage; patron UI manual validation; no dedicated registry slice.
- **Evidence / registry:** None standalone.
- **Dependencies / dependents:** Swipe decks/card traits -> Taste Profile and session reporting.
- **Risks / next work:** Minimum evidence, early-stop, and trait provenance lack formal certification. Preserve polarity and skip semantics in roadmap order 13.
- **Do not infer:** Completing 20Q proves sufficient or unbiased reader evidence.

### CORE-03 - Recommendation router
- **Purpose / lifecycle role:** Turn profile plus enabled-source configuration into source plans; routing.
- **Current status:** **Implemented**
- **Implementation / entry points:** `app/recommender-v2/searchPlan.ts`, `app/recommender-v2/types.ts`, `screens/SwipeDeckScreen.tsx`; `buildSearchPlan`.
- **Configuration/environment:** `SwipeSessionV2.enabledSources`, per-deck Admin settings.
- **Validation:** OL routing, GB age/query, and Kitsu/ComicVine contract regressions; manual source diagnostics.
- **Evidence / registry:** Source slices only; no route-ownership certificate.
- **Dependencies / dependents:** Taste profile and UI source controls -> query planning and dispatch.
- **Risks / next work:** UI enablement may exceed certified source/age scope. Publish a future source-by-age support ledger.
- **Do not infer:** Planned or enabled means a source should own a route.

### CORE-04 - Query planning and route families
- **Purpose / lifecycle role:** Build common intents and source/age-specific query plans; retrieval planning.
- **Current status:** **Implemented**
- **Implementation / entry points:** `app/recommender-v2/searchPlan.ts`, `app/recommender-v2/sources/openLibrarySource.ts`, `screens/recommenders/teenRouter.ts`, `screens/swipe/recommendationsByBand.ts`; `buildSearchPlan`, `buildOpenLibraryQueryPlansForRegression`.
- **Configuration/environment:** Age band, profile signals, enabled sources, source timeouts.
- **Validation:** GB query-planning/routing suites; OL routing regression; manual query-family audits in `docs/DETERMINISTIC_TEST_MANIFEST.md`.
- **Evidence / registry:** D1/D2/E1 and R1 protect bounded behavior.
- **Dependencies / dependents:** Taste profile/route policy -> adapters and query lineage.
- **Risks / next work:** OL adapter owns substantial age/query policy; legacy builders remain. No tuning is authorized before roadmap evidence gates.
- **Do not infer:** More retrieved candidates means a better strategy.

### CORE-05 - Source dispatch
- **Purpose / lifecycle role:** Execute enabled plans with explicit status, skip, and timeout semantics; retrieval.
- **Current status:** **Implemented**
- **Implementation / entry points:** `app/recommender-v2/engine.ts`, `app/recommender-v2/sources/index.ts`, `app/recommender-v2/types.ts`; `runRecommenderV2`, `sourceAdapters`, `SourceAdapterV2.search`.
- **Configuration/environment:** Source toggles, timeouts, keys, proxy URLs.
- **Validation:** Mock-off and adapter locks; competence no-network traps; live/manual `scripts/source-direct-smoke.mjs`, `scripts/source-health-preflight.mjs`, and source probes.
- **Evidence / registry:** Adapter-specific only; `localLibrary` is explicitly `null`.
- **Dependencies / dependents:** Router/query plans/environment -> normalization and source diagnostics.
- **Risks / next work:** Retry/failure contracts differ by source. Bounded fault injection follows roadmap prerequisites.
- **Do not infer:** Skip is failure or HTTP success is usefulness.

### CORE-06 - Candidate normalization
- **Purpose / lifecycle role:** Convert accepted source rows into `NormalizedCandidate` while preserving provenance; normalization.
- **Current status:** **Implemented**
- **Implementation / entry points:** `app/recommender-v2/normalize.ts`, `app/recommender-v2/types.ts`; `normalizeSourceResults`.
- **Configuration/environment:** Source result shape.
- **Validation:** Source locks and GB lineage/identity suites; manual composition audits.
- **Evidence / registry:** Indirect registered-slice and competence evidence; no standalone row.
- **Dependencies / dependents:** Adapters/source admission -> identity, scoring, eligibility, diagnostics.
- **Risks / next work:** Important evidence remains in `raw`/diagnostics; no shared reading-unit implementation. Generalize identity only from repeated evidence.
- **Do not infer:** Normalized means correctly identified or eligible.

### CORE-07 - Publication, readable-work, and reading-unit identity
- **Purpose / lifecycle role:** Distinguish source record, publication, work, reading unit, series, and recommendation identities where evidence supports it; identity.
- **Current status:** **Implemented**
- **Implementation / entry points:** `app/recommender-v2/comicVineIdentity.ts`, `app/recommender-v2/preteenGoogleBooksPublicationIdentity.ts`, `app/recommender-v2/sources/googleBooksSource.ts`, `app/recommender-v2/select.ts`; `classifyComicVineIdentity`, `buildComicVineEntityMetadata`, `preteenGoogleBooksPublicationIdentityAudit`.
- **Configuration/environment:** Source metadata; query text is not identity evidence.
- **Validation:** EP1; GB identity/shape/slate suites; GCD characterizer; manual identity artifacts.
- **Evidence / registry:** EP1, D2, `scripts/source-competence/frozen/gcd-phase1-summary.json`; source slices, not one platform contract.
- **Dependencies / dependents:** Normalization/stable IDs -> admission, collapse, selection, comparison.
- **Risks / next work:** Five-layer model is not promoted platform-wide. Next authorized work is ComicVine equivalence under the unchanged contract.
- **Do not infer:** Either graphic source is selected or one model fits all media.

### CORE-08 - Admission and final eligibility filtering
- **Purpose / lifecycle role:** Enforce structural, age, maturity, publication-shape, and document-evidence gates; admission/eligibility.
- **Current status:** **Implemented**
- **Implementation / entry points:** `app/recommender-v2/engine.ts`, `app/recommender-v2/select.ts`, `app/recommender-v2/comicVineAdmission.ts`, `app/recommender-v2/kitsuAdmission.ts`, source adapters; source-policy functions and `selectRecommendations`.
- **Configuration/environment:** Age, maturity, profile, and document evidence.
- **Validation:** D1/D2/E1, EP1, K1, R1, final-eligibility suites; manual rejection histograms.
- **Evidence / registry:** Registered D1/D2/E1, EP1, K1, and R1 fixture suite.
- **Dependencies / dependents:** Profile/normalization/identity -> ranking, selection, underfill.
- **Risks / next work:** Policy crosses adapters, engine, and large `select.ts`. No weakening/tuning is authorized.
- **Do not infer:** Underfill is failure or query evidence may replace document evidence.

### CORE-09 - Scoring
- **Purpose / lifecycle role:** Produce evidence-backed candidate scores and component diagnostics; candidate evaluation.
- **Current status:** **Implemented**
- **Implementation / entry points:** `app/recommender-v2/score.ts`, `app/recommender-v2/types.ts`; `scoreCandidates`, `ageSuitabilityScore`.
- **Configuration/environment:** Taste profile and normalized evidence.
- **Validation:** GB ranking/signal suites and source pipeline regressions; manual score breakdown export.
- **Evidence / registry:** Indirect source-slice locks; no standalone row.
- **Dependencies / dependents:** Profile/normalization -> ranking and selection.
- **Risks / next work:** Source/age branches are complex; source-native scores are not cross-comparable. Only a bounded post-review hypothesis may change scoring.
- **Do not infer:** Higher machine score means greater human usefulness.

### CORE-10 - Ranking
- **Purpose / lifecycle role:** Order scored candidates before selection; candidate ordering.
- **Current status:** **Implemented**
- **Implementation / entry points:** `app/recommender-v2/select.ts`, `app/recommender-v2/score.ts`; internal rank logic consumed by `selectRecommendations`.
- **Configuration/environment:** Scores, age/source policies, identity evidence.
- **Validation:** GB narrative-strength/final-slate suites and source certifications; manual ranking reasons.
- **Evidence / registry:** Bounded source slices only.
- **Dependencies / dependents:** Scoring/identity -> selection/diversity.
- **Risks / next work:** Ranking and final eligibility are coupled in `select.ts`. No tuning before comparative/human evidence.
- **Do not infer:** Deterministic order is optimal order.

### CORE-11 - Selection and slate assembly
- **Purpose / lifecycle role:** Choose a bounded slate from ranked eligible candidates; selection.
- **Current status:** **Implemented**
- **Implementation / entry points:** `app/recommender-v2/select.ts`, `app/recommender-v2/engine.ts`; `selectRecommendations`.
- **Configuration/environment:** Session limit, age/profile, source/identity evidence.
- **Validation:** Final-slate, source certification, recovery, and comparison fixtures; manual selected/rejected diagnostics.
- **Evidence / registry:** R1 and registered source-policy slices.
- **Dependencies / dependents:** Ranking/eligibility/diversity -> rendering, reporting, comparison.
- **Risks / next work:** Extensive source/age policy and observability are coupled. Preserve outputs until a bounded hypothesis is supported.
- **Do not infer:** A full slate is better than relevant underfill.

### CORE-12 - Diversity and same-series handling
- **Purpose / lifecycle role:** Limit duplicate/series pressure without diluting relevance; slate composition.
- **Current status:** **Implemented**
- **Implementation / entry points:** `app/recommender-v2/select.ts`, `app/recommender-v2/diagnostics.ts`; series/root helpers and returned-layer middle-grades collapse.
- **Configuration/environment:** Series, collection, title, creator, and format evidence.
- **Validation:** ComicVine collapse fixtures, GB final-slate identity, OL routing/selection regressions.
- **Evidence / registry:** Source-specific only.
- **Dependencies / dependents:** Identity/ranking -> final slate/rendering.
- **Risks / next work:** Cross-source identity is incomplete; title-root heuristics are risky. Cross-domain identity follows empirical repetition.
- **Do not infer:** More diversity automatically improves fit.

### CORE-13 - Diagnostics and lineage
- **Purpose / lifecycle role:** Preserve stage, source, query, candidate, recovery, selection, and rendering evidence; cross-cutting observability.
- **Current status:** **Implemented**
- **Implementation / entry points:** `app/recommender-v2/diagnostics.ts`, `app/recommender-v2/engine.ts`, `app/recommender-v2/googleBooksLineageDiagnostics.ts`, `app/recommender-v2/types.ts`, `screens/SwipeDeckScreen.tsx`; report/lineage builders.
- **Configuration/environment:** Debug flags and local export state.
- **Validation:** OL routing/lineage, GB lineage, output-invariance suites; manual compact/session exports.
- **Evidence / registry:** Prior lineage repairs and source artifacts; no standalone row.
- **Dependencies / dependents:** Every lifecycle stage -> certification, investigation, future Human Review/telemetry.
- **Risks / next work:** Giant screen-level report assembly; unversioned schema; rendered attribution debt. Roadmap permits behavior-invariant diagnostic integrity work.
- **Do not infer:** Detailed logging proves quality.

### CORE-14 - Final recommendation rendering
- **Purpose / lifecycle role:** Convert selected candidates into displayed cards and feedback controls; presentation.
- **Current status:** **Implemented**
- **Implementation / entry points:** `app/recommender-v2/diagnostics.ts`, `screens/SwipeDeckScreen.tsx`, `app/(tabs)/index.tsx`; `buildRecommendationResultV2` and screen rendering.
- **Configuration/environment:** Theme, deck, local recommendation/feedback state.
- **Validation:** Wrapper/output-lineage and invariance regressions; manual web/native inspection.
- **Evidence / registry:** No rendering certification slice.
- **Dependencies / dependents:** Selection, covers, attribution -> patron feedback/reporting.
- **Risks / next work:** Accessibility, degraded states, attribution, and explanation policy are not release-certified. Product completion follows scope decisions.
- **Do not infer:** Selected candidates are always rendered completely or accessibly.

### CORE-15 - Fallback and underfill recovery
- **Purpose / lifecycle role:** Recover bounded additional candidates while preserving eligibility and honest underfill; recovery/reselection.
- **Current status:** **Implemented**
- **Implementation / entry points:** `app/recommender-v2/engine.ts`, `app/recommender-v2/sources/openLibrarySource.ts`, `app/recommender-v2/select.ts`; OL recovery/expansion helpers and repeated normalize-score-select cycles.
- **Configuration/environment:** Source/total budgets, attempted queries, age profile, slate limit.
- **Validation:** OL routing/lineage/timeout and GB fallback regressions; manual OL timeout/fallback audits.
- **Evidence / registry:** R1 recovery fixtures and OL-F records.
- **Dependencies / dependents:** Dispatch through selection/diagnostics -> final slate and underfill UX.
- **Risks / next work:** Complex reselection lifecycle; transport contracts differ. Resilience characterization requires explicit budgets.
- **Do not infer:** Recovery should fill every slot or may weaken eligibility.

### CORE-16 - Legacy recommendation path
- **Purpose / lifecycle role:** Preserve earlier taste/recommendation helpers and historical architecture context.
- **Current status:** **Historical**
- **Implementation / entry points:** `screens/recommenders/taste/`, `screens/swipe/openLibrary*.ts`, `screens/swipe/swipeHelpers.ts`; `RecommendationPipeline` and legacy OL helpers.
- **Configuration/environment:** Legacy screen/helper inputs.
- **Validation:** No current global legacy-path lock identified.
- **Evidence / registry:** Older architecture audit; no registry row.
- **Dependencies / dependents:** Some UI helpers remain; normal swipe recommendations use V2.
- **Risks / next work:** Overlap can mislead contributors. No cleanup without dependency/history review and output invariance.
- **Do not infer:** Historical means safe to delete.

## 6. Source registry

### SRC-01 - Google Books
- **Purpose / lifecycle role:** Narrative-book discovery and metadata evidence through the shared V2 pipeline.
- **Current status:** **Certified**
- **Age bands / production path:** Planner supports Kids, Preteen, Teen, Adult when enabled; adapter is registered. D1/D2/E1 are certified; Adult is characterized, not registry-certified.
- **Implementation / entry points:** `app/recommender-v2/sources/googleBooksSource.ts`, `app/recommender-v2/searchPlan.ts`, `app/recommender-v2/normalize.ts`, `app/recommender-v2/select.ts`; `googleBooksSourceAdapter`.
- **Configuration/environment:** Optional Google Books keys (`EXPO_PUBLIC_`, `NEXT_PUBLIC_`, `VITE_`, or server form); current adapter query/timeout policy.
- **Validation:** Numerous GB regressions; `npm run certify:googlebooks`; live/manual audits listed in the deterministic manifest.
- **Evidence / registry:** D1 Kids, D2 Preteen, E1 Teen are frozen/fully certified in `scripts/output/certified-subsystem-registry.json`; `docs/GOOGLE_BOOKS_SOURCE_CERTIFICATION.md`; fixture/profile files under `scripts/source-competence/`.
- **Dependencies / dependents:** Router/query plan -> normalization/shared recommendation lifecycle; comparison harness consumes immutable artifacts.
- **Risks / next work:** Live quota/403/429/latency/retry are uncertified; Kids filtered-to-zero status and Adult formal status remain open; Human Review absent. Close release gaps only after current critical-path gates.
- **Do not infer:** Google Books owns any route, is human-useful, or is superior to Open Library.

### SRC-02 - Open Library
- **Purpose / lifecycle role:** Broad book discovery with age-specialized retrieval, recovery, and lineage.
- **Current status:** **Characterized**
- **Age bands / production path:** Registered and planned across all four age bands when enabled; K-2 formal support remains pending.
- **Implementation / entry points:** `app/recommender-v2/sources/openLibrarySource.ts`, `app/recommender-v2/sources/openLibraryProfiles.ts`, `api/openlibrary.ts`, `app/api/openlibrary/+api.ts`; `openLibrarySourceAdapter`.
- **Configuration/environment:** Optional OL proxy bases; age-specific time/budget profiles; direct/proxy paths.
- **Validation:** OL routing/query-lineage regression; source-competence replay; live/manual presets and timeout audits.
- **Evidence / registry:** Adult R1 is a frozen registered fixture suite, not a fully certified source contract; OL competence fixtures/profile and Phase I comparison.
- **Dependencies / dependents:** Shared planner plus adapter-owned age/query policy -> normalization through rendering.
- **Risks / next work:** Kids status, formal Teen/Preteen registry state, live composition, proxy/direct resilience, cover reliability, and Human Review remain open.
- **Do not infer:** Adult R1 certifies every age, or live endpoint health/usefulness.

### SRC-03 - Kitsu
- **Purpose / lifecycle role:** Manga/anime-specialist evidence, not general book retrieval.
- **Current status:** **Certified**
- **Age bands / production path:** Adapter registered; Adult K1 certified. Teen manga role is not formally characterized/approved.
- **Implementation / entry points:** `app/recommender-v2/sources/kitsuSource.ts`, `app/recommender-v2/kitsuAdmission.ts`; `kitsuSourceAdapter`.
- **Configuration/environment:** `EXPO_PUBLIC_KITSU_API_BASE_URL` or `KITSU_API_BASE_URL`; categories enrichment.
- **Validation:** `scripts/run-v2-kitsu-source-certification-regressions.mjs`, Adult fixture lock, Kitsu/ComicVine contract; manual reliability probe.
- **Evidence / registry:** K1 fully certified/frozen; `scripts/output/adult-kitsu-baseline-phase3.json`; registry records one historical 20/20 probe.
- **Dependencies / dependents:** Manga format preference/routing -> shared normalization/scoring/selection; optional graphic-source evidence relationship.
- **Risks / next work:** Product activation, Teen competence, category-enrichment failure/latency, and Human Review unresolved.
- **Do not infer:** One reliability probe proves longitudinal health or Kitsu should own manga routes.

### SRC-04 - ComicVine
- **Purpose / lifecycle role:** Comic/graphic identity and discovery evidence through the shared V2 pipeline.
- **Current status:** **Certified**
- **Age bands / production path:** Adapter registered and production-controlled; Adult EP1 certified. Exact broader age support is unresolved.
- **Implementation / entry points:** `app/recommender-v2/sources/comicVineSource.ts`, `app/recommender-v2/comicVineIdentity.ts`, `app/recommender-v2/comicVineAdmission.ts`, `api/comicvine.ts`; `comicVineSourceAdapter`.
- **Configuration/environment:** Server/public proxy variables, server API key, site origin; published non-commercial/rate constraints.
- **Validation:** Packaged source-certification and gap-closure regressions; Kitsu/ComicVine contract; live proxy behavior not equivalently characterized.
- **Evidence / registry:** Adult EP1 fully certified/frozen, tag/baseline recorded; graphic-novel inventory and licensing gates.
- **Dependencies / dependents:** Router/query plan -> ComicVine identity/admission -> shared scoring/selection.
- **Risks / next work:** Immediate next phase is source-neutral Fixture Class equivalence certification; licensing, covers, persistence, live proxy, and age scope remain open.
- **Do not infer:** EP1 proves GCD comparability, recommendation quality, or selection as the future graphic source.

### SRC-05 - Grand Comics Database (GCD)
- **Purpose / lifecycle role:** Fixture-characterized graphic-novel identity evidence; no production discovery/adapter role exists.
- **Current status:** **Characterized**
- **Age bands / production path:** Frozen profiles include Adult, Teen, Preteen purposes; there is no production adapter, routing activation, or live authorization.
- **Implementation / entry points:** Diagnostic-only `scripts/source-competence/lib/gcdCharacterization.mjs`, `run-gcd-characterization.mjs`; `app/api/gcd-proxy/+api.ts` is not a recommendation adapter.
- **Configuration/environment:** Fixture-only; live access/authentication/rate limits unresolved.
- **Validation:** `npm run characterize:gcd`, `npm run test:source-competence:gcd`; no live requests.
- **Evidence / registry:** `docs/GRAPHIC_NOVEL_SOURCE_COMPETENCE_PHASE_I.md`, synthetic fixtures/profiles, `scripts/source-competence/frozen/gcd-phase1-summary.json`; no certified-subsystem row.
- **Dependencies / dependents:** Source-neutral reading-unit contract -> future equivalent ComicVine comparison only.
- **Risks / next work:** API stability, attribution/ShareAlike, covers, discovery, and live completeness unresolved. Do not change GCD until ComicVine equivalence phase completes.
- **Do not infer:** GCD is selected, operational, recommendation-competent, or superior.

### SRC-06 - New York Times
- **Purpose / lifecycle role:** Bestseller authority/popularity evidence; exact product value remains to be defined.
- **Current status:** **Implemented**
- **Age bands / production path:** Adapter registered and can be enabled; roadmap requires Teen and Adult characterization separately. Other age support is not established.
- **Implementation / entry points:** `app/recommender-v2/sources/nytSource.ts`, `services/bestsellers/nytClient.ts`, `services/bestsellers/nytAdapter.ts`, `services/bestsellers/bestsellerMatcher.ts`, `api/nyt-books.ts`; `nytSourceAdapter`.
- **Configuration/environment:** NYT API key variants, list override, in-memory cache/rate limiter.
- **Validation:** `scripts/run-v2-nyt-f1-live-validation.mjs` mixes mocked/live concerns; `run-v2-nyt-f2a-overview-audit.mjs` is live/manual. No package regression gate.
- **Evidence / registry:** Output artifacts exist; no certified-subsystem registry entry.
- **Dependencies / dependents:** Router/list-family selection -> shared normalization/pipeline.
- **Risks / next work:** Purpose, attribution, admission, quota/retry/partial failure, source-age scope, and Human Review are open.
- **Do not infer:** Popularity evidence improves fit or NYT is certified.

### SRC-07 - Local Library / Local Collection
- **Purpose / lifecycle role:** Future customized-library candidate universe restricted to verified holdings.
- **Current status:** **Placeholder**
- **Age bands / production path:** Intended across chosen Library Mode ages; `sourceAdapters.localLibrary` is `null` and UI support defaults false.
- **Implementation / entry points:** `constants/deploymentCapabilities.ts`, `screens/AdminCollectionUploadScreen.tsx`, `app/admin-collection.tsx`, Admin source toggles.
- **Configuration/environment:** Deployment kind, catalog authority, tenant/library ID, import/storage/privacy decisions are unresolved.
- **Validation:** `scripts/run-collection-opportunities-placeholder-regressions.mjs` protects non-operation and local/global boundaries.
- **Evidence / registry:** `docs/COLLECTION_OPPORTUNITIES.md`, roadmap section 8; no adapter certification/frozen catalog.
- **Dependencies / dependents:** Product-owner deployment decision, catalog/import/storage/privacy -> future local adapter and Library Mode.
- **Risks / next work:** Upload screen has hard-coded placeholders and undeclared optional dependencies; no membership/isolation proof. Implement only if launch scope selects Library Mode.
- **Do not infer:** Upload UI is functional or global fallback is allowed in Library Mode.

### SRC-08 - Mock source
- **Purpose / lifecycle role:** Deterministic diagnostic adapter for pipeline tests; never a normal production recommendation source.
- **Current status:** **Implemented**
- **Age bands / production path:** Structurally supports V2 sessions but normal runs must leave it disabled.
- **Implementation / entry points:** `app/recommender-v2/sources/mockSource.ts`, `app/recommender-v2/sources/index.ts`; `mockSourceAdapter`.
- **Configuration/environment:** Explicit source enablement only.
- **Validation:** `scripts/run-v2-mock-source-regressions.mjs`; source diagnostics expose activation/suppression.
- **Evidence / registry:** No certification row; architecture/manifest classify it as a contract regression tool.
- **Dependencies / dependents:** Source plan -> shared pipeline tests.
- **Risks / next work:** Accidental activation would contaminate product results. Preserve fail-closed default.
- **Do not infer:** Mock fixture success proves live-source competence.

## 7. Age-band registry

### AGE-01 - Kids / K-2
- **Purpose / lifecycle role:** Age-appropriate early-reader recommendation route.
- **Current status:** **Active Development**
- **Implementation / entry points:** K-2 deck in `data/swipeDecks/k2.*`; V2 age band `kids`; GB Kids planner/policy; OL K-2 profile/path.
- **Configuration/environment:** Deck/source toggles; source support must fail closed.
- **Validation:** GB D1 certified; OL code/regressions exist; GB competence Kids fixture filters to zero.
- **Evidence / registry:** D1 registry slice; no formal OL K-2 certification or Human Review.
- **Dependencies / dependents:** Deck/profile evidence, age/maturity policy, supported sources -> Kids slate/UX.
- **Local Collection implications:** Requires age/shelf evidence without treating shelf placement as automatic age truth.
- **Risks / next work:** Human usefulness, live composition, OL K-2 decision, and non-book support unproven. Future support ledger must mark each source supported/disabled/unevaluated.
- **Do not infer:** D1 means the full Kids product is complete.

### AGE-02 - Preteen
- **Purpose / lifecycle role:** Middle-grades recommendation route.
- **Current status:** **Active Development**
- **Implementation / entry points:** `data/swipeDecks/36.*`; V2 `preteens`; OL middle-grades path; GB Preteen identity/admission.
- **Configuration/environment:** Deck/source/debug controls and middle-grades budgets.
- **Validation:** GB D2 certified; OL route highly instrumented; Phase I equivalent comparison cases.
- **Evidence / registry:** D2 frozen registry slice; OL formal certification status not reconciled; no Human Review.
- **Dependencies / dependents:** Age/profile policy and source availability -> Preteen slate/recovery.
- **Local Collection implications:** Shelf/audience evidence must remain evidence, not automatic age truth.
- **Risks / next work:** Cross-source usefulness, live stability, local semantics, and representative review remain open.
- **Do not infer:** Deterministic underfill is a defect or the route is launch-ready.

### AGE-03 - Teen
- **Purpose / lifecycle role:** Teen book, graphic, and potential manga recommendation route.
- **Current status:** **Active Development**
- **Implementation / entry points:** `data/swipeDecks/ms_hs.*`; V2 `teens`; Teen GB/OL planners; ComicVine/Kitsu adapters.
- **Configuration/environment:** Per-deck source toggles, profile/format evidence.
- **Validation:** GB E1 certified; OL Teen route locked by regressions; graphic/manga adapter contracts exist.
- **Evidence / registry:** E1; OL characterization; EP1/K1 do not establish Teen route ownership.
- **Dependencies / dependents:** Profile evidence, source-age support, graphic equivalence -> Teen slate.
- **Local Collection implications:** Requires school/community safety and holdings boundaries.
- **Risks / next work:** Graphic comparability/ownership, Kitsu scope, Human Review, and exact launch portfolio unresolved.
- **Do not infer:** Existing adapters are all approved Teen sources.

### AGE-04 - Adult
- **Purpose / lifecycle role:** Adult narrative, graphic, and manga recommendation route.
- **Current status:** **Active Development**
- **Implementation / entry points:** `data/swipeDecks/adult.*`; V2 `adult`; all current external adapters can be planned when enabled.
- **Configuration/environment:** Adult deck/source controls and longer OL budget.
- **Validation:** OL R1 registered; ComicVine EP1 and Kitsu K1 certified; GB Adult characterized.
- **Evidence / registry:** Multiple source slices, but no unified Adult support/quality ledger or Human Review.
- **Dependencies / dependents:** Source portfolio, identity, licensing, live health -> Adult slate.
- **Local Collection implications:** Adult holdings/audience data require the same membership and evidence rules.
- **Risks / next work:** Formal GB status, live release behavior, licensing, and Human Review remain open.
- **Do not infer:** Multiple certified slices make the Adult product complete.

## 8. Product and interface registry

### UI-01 - Swipe deck
- **Purpose / lifecycle role:** Patron evidence collection and session progress.
- **Current status:** **Implemented**
- **Implementation / entry points:** `screens/SwipeDeckScreen.tsx`, `data/swipeDecks/`, `app/(tabs)/swipe.tsx`.
- **Configuration/environment:** Deck, categories, theme, Admin settings.
- **Validation:** No dedicated UI automation; source/profile tests use frozen signals.
- **Evidence / registry:** Roadmap order 13; no product certification.
- **Dependencies / dependents:** Deck assets/config -> Taste Profile and recommendations.
- **Risks / next work:** Evidence provenance, balance, rights, progress/reset, and accessibility require certification.
- **Do not infer:** Existing cards are balanced or understandable to representative patrons.

### UI-02 - Result display
- **Purpose / lifecycle role:** Present recommendation cards, source/author/cover data, and feedback controls.
- **Current status:** **Implemented**
- **Implementation / entry points:** `screens/SwipeDeckScreen.tsx`, `app/(tabs)/index.tsx`.
- **Configuration/environment:** Theme and locally held results/feedback.
- **Validation:** Pipeline output regressions; manual UI only.
- **Evidence / registry:** No UI certification row.
- **Dependencies / dependents:** Rendering/cover/attribution -> patron response.
- **Risks / next work:** Complete cards, explanation policy, underfill/error truthfulness, and accessibility remain launch blockers.
- **Do not infer:** Displayed output has passed Human Review.

### UI-03 - Hidden Admin
- **Purpose / lifecycle role:** Configure branding, decks, sources, theme, PIN, QR, and future local capabilities.
- **Current status:** **Implemented**
- **Implementation / entry points:** `app/(tabs)/index.tsx`, `app/app_admin-web.tsx`, hidden unlock described in `app/(tabs)/swipe.tsx`.
- **Configuration/environment:** Browser local storage, app config state, debug environment flags.
- **Validation:** Manual only; no secure-admin certification.
- **Evidence / registry:** Roadmap product-completion inventory.
- **Dependencies / dependents:** Runtime configuration -> patron mode/source exposure.
- **Risks / next work:** PIN is not strong authentication; config hydration/hosted route is incomplete. Production-safe admin is required if shipped.
- **Do not infer:** Hidden or PIN-gated means secure.

### UI-04 - Deck toggles and customization
- **Purpose / lifecycle role:** Select decks, card categories, source toggles, branding, and themes.
- **Current status:** **Implemented**
- **Implementation / entry points:** Admin screens, `constants/brandTheme.ts`, `constants/deckLabels.ts`, `constants/runtimeConfig.ts`.
- **Configuration/environment:** Local config schema and per-deck source settings.
- **Validation:** Manual; collection placeholder protects one capability boundary.
- **Evidence / registry:** No round-trip/config certification.
- **Dependencies / dependents:** Admin state -> Swipe deck/router/presentation.
- **Risks / next work:** Legacy/canonical schemas coexist; unsupported sources may be exposed. Validate/gate release configuration.
- **Do not infer:** A visible toggle represents a supported route.

### UI-05 - Session reporting
- **Purpose / lifecycle role:** Expose recommendation, source, lineage, and feedback diagnostics.
- **Current status:** **Implemented**
- **Implementation / entry points:** `screens/SwipeDeckScreen.tsx`, `app/recommender-v2/diagnostics.ts`, `googleBooksLineageDiagnostics.ts`.
- **Configuration/environment:** Local state/debug controls; clipboard/export surfaces.
- **Validation:** OL/GB lineage and diagnostic invariance regressions.
- **Evidence / registry:** Diagnostic artifacts; not telemetry.
- **Dependencies / dependents:** V2 diagnostics -> engineering audits and future review linkage.
- **Risks / next work:** Report assembly is screen-coupled; redaction/schema/versioning unresolved.
- **Do not infer:** Local report state is governed production telemetry.

### UI-06 - Tuner and debug tools
- **Purpose / lifecycle role:** Developer-only profile overrides/equalizer and deep diagnostics.
- **Current status:** **Implemented**
- **Implementation / entry points:** `screens/recommenders/dev/RecommenderEqualizerPanel.tsx`, `recommenderProfileOverrides.ts`, `recommenderTuningStorage.ts`, V2 debug controls in `SwipeDeckScreen.tsx`.
- **Configuration/environment:** AsyncStorage and hidden/global/environment flags.
- **Validation:** Manual only; production output locks do not certify UI gating.
- **Evidence / registry:** None.
- **Dependencies / dependents:** Recommender profiles/debug state -> local experiments.
- **Risks / next work:** Must be absent or safely gated in release builds; saved overrides can confuse baselines.
- **Do not infer:** Tuner values are approved production policy.

### UI-07 - Cover-image handling
- **Purpose / lifecycle role:** Resolve and display recommendation/swipe imagery with fallbacks.
- **Current status:** **Implemented**
- **Implementation / entry points:** `screens/SwipeDeckScreen.tsx`, `screens/swipe/swipeHelpers.ts`, `assets/swipeCardFallback/`, `scripts/populateSwipeCardFallbackImages.mjs`.
- **Configuration/environment:** OL/GB/Wikipedia URLs and optional GB key.
- **Validation:** Manual; population utility is live/manual and not CI.
- **Evidence / registry:** Graphic licensing gate explicitly leaves ComicVine/GCD cover rights unresolved.
- **Dependencies / dependents:** Source metadata/rights -> result and swipe presentation.
- **Risks / next work:** Reliability, attribution, caching, and rights need source-specific review.
- **Do not infer:** A remote cover URL grants display/cache rights.

### UI-08 - Accessibility
- **Purpose / lifecycle role:** Make patron/admin workflows usable across keyboard, assistive technology, scaling, contrast, motion, and touch.
- **Current status:** **Unknown / Requires Review**
- **Implementation / entry points:** Scattered React Native accessibility labels/roles; theme constants.
- **Configuration/environment:** Platform/device accessibility settings.
- **Validation:** No conformance target, automated gate, or supported-device evidence.
- **Evidence / registry:** Roadmap launch blocker only.
- **Dependencies / dependents:** All product surfaces -> launch eligibility.
- **Risks / next work:** Perform representative accessibility validation after platform/scope decisions.
- **Do not infer:** Existing labels or readable themes establish compliance.

### UI-09 - Privacy
- **Purpose / lifecycle role:** Govern patron, reviewer, library, diagnostic, and telemetry data.
- **Current status:** **Unknown / Requires Review**
- **Implementation / entry points:** Local-state behavior and privacy copy in `app/(tabs)/index.tsx`; design constraints in Human Review/Collection docs.
- **Configuration/environment:** Future retention, consent, reviewer identity, deployment mode.
- **Validation:** No privacy/security audit or data-flow certification.
- **Evidence / registry:** Roadmap decisions requiring product/legal ownership.
- **Dependencies / dependents:** Local Collection, telemetry, Human Review, deployment.
- **Risks / next work:** Minors' data, retention/deletion, processors, and diagnostic export require explicit decisions.
- **Do not infer:** No login means privacy compliance.

### UI-10 - Error and degraded-state UX
- **Purpose / lifecycle role:** Represent loading, empty, underfill, timeout, quota, partial failure, and unsupported modes honestly.
- **Current status:** **Active Development**
- **Implementation / entry points:** Error/loading/result state in `screens/SwipeDeckScreen.tsx` and `app/(tabs)/index.tsx`; source terminal diagnostics.
- **Configuration/environment:** Source failures and mode/source support.
- **Validation:** Machine terminal-state fixtures; no comprehensive UI regression.
- **Evidence / registry:** Source competence distinguishes skip/empty/failure/filtering.
- **Dependencies / dependents:** Dispatch/recovery/diagnostics -> patron trust.
- **Risks / next work:** UI coverage for all terminal states and offline/quota behavior is incomplete.
- **Do not infer:** Correct machine state is correctly communicated to users.

### UI-11 - Onboarding and instructions
- **Purpose / lifecycle role:** Explain modes, sources, swipe behavior, privacy, and support.
- **Current status:** **Placeholder**
- **Implementation / entry points:** Partial source/help copy in `app/(tabs)/index.tsx`; `README.md` remains largely Expo starter content.
- **Configuration/environment:** Deployment mode and supported features.
- **Validation:** None.
- **Evidence / registry:** Roadmap product-completion requirement.
- **Dependencies / dependents:** Final product scope -> patron/admin understanding.
- **Risks / next work:** Coming-next claims, hosted config, import, help/about/privacy/attribution are incomplete.
- **Do not infer:** Partial explanatory copy is production onboarding.

### UI-12 - Deployment-facing product configuration
- **Purpose / lifecycle role:** Describe Global versus customized-library capability and product identity.
- **Current status:** **Placeholder**
- **Implementation / entry points:** `constants/deploymentCapabilities.ts`, `constants/runtimeConfig.ts`, `app.json`, Admin configuration.
- **Configuration/environment:** `global`/`customized_library`, library name/theme, source toggles.
- **Validation:** Collection placeholder regression only.
- **Evidence / registry:** Collection Opportunities and roadmap; `app.json` still uses generic package identity.
- **Dependencies / dependents:** Product-owner launch mode -> sources, UI promises, deployment.
- **Risks / next work:** No environment schema/release channels; Library Mode is not operational.
- **Do not infer:** Configuration types prove a deployable customized-library product.

## 9. Evidence and governance registry

### GOV-01 - Recommendation philosophy and Engineering Constitution
- **Purpose / lifecycle role:** Define enduring ownership, evidence, trust, and change-evaluation principles.
- **Current status:** **Locked**
- **Implementation / entry points:** `docs/RECOMMENDATION_PHILOSOPHY.md`; six-principle constitution and lifecycle.
- **Configuration/environment:** None.
- **Validation:** Governance is applied by later design/certification records; not executable policy.
- **Evidence / registry:** Roadmap names it part of the locked foundation.
- **Dependencies / dependents:** Product intent -> all recommendation/source work.
- **Risks / next work:** Interpretation can drift; update only through explicit architectural review.
- **Do not infer:** Philosophy is a substitute for empirical evidence.

### GOV-02 - Completion roadmap
- **Purpose / lifecycle role:** Define ordered critical path, gates, stop conditions, unsupported conclusions, and launch definition.
- **Current status:** **Implemented**
- **Implementation / entry points:** `docs/NOVELIDEAS_COMPLETION_ROADMAP.md`.
- **Configuration/environment:** Current repository/evidence state and product-owner decisions.
- **Validation:** Paths and phase status require maintenance with major changes.
- **Evidence / registry:** Governing execution record; not an executable registry.
- **Dependencies / dependents:** Foundation evidence and owner decisions -> every next authorized phase.
- **Risks / next work:** Can drift unless updated in phase-closing PRs. Current next phase remains ComicVine equivalence certification.
- **Do not infer:** A listed phase is implemented or approved out of order.

### GOV-03 - Deterministic test manifest
- **Purpose / lifecycle role:** Inventory/classify executable validation and prepare a future release gate.
- **Current status:** **Implemented**
- **Implementation / entry points:** `docs/DETERMINISTIC_TEST_MANIFEST.md`.
- **Configuration/environment:** Baseline script/package tree.
- **Validation:** Static reconciliation found 99 runnable tools plus 12 support modules.
- **Evidence / registry:** Documents 43 proposed CI candidates; does not implement them.
- **Dependencies / dependents:** Scripts/package/registry -> future release manifest and CI.
- **Risks / next work:** Runtime pin, authority decisions, tracked outputs, lint/typecheck blockers remain.
- **Do not infer:** All candidates pass together or constitute a release gate.

### GOV-04 - Certified subsystem registry
- **Purpose / lifecycle role:** Record accepted deterministic contract slices and their baselines.
- **Current status:** **Implemented**
- **Implementation / entry points:** `scripts/output/certified-subsystem-registry.json`.
- **Configuration/environment:** Manually maintained versioned JSON evidence.
- **Validation:** All named paths existed at manifest inspection; no canonical registry verifier.
- **Evidence / registry:** D1/D2/E1, R1 fixture registration, EP1, K1.
- **Dependencies / dependents:** Certification decisions/scripts -> roadmap/source support ledger.
- **Risks / next work:** Coverage is narrower than actual validation; some locks lack package aliases/check modes.
- **Do not infer:** Registry membership proves product usefulness or completeness.

### GOV-05 - Source competence framework
- **Purpose / lifecycle role:** Characterize one source through frozen fixture/replay evidence without tuning production behavior.
- **Current status:** **Locked**
- **Implementation / entry points:** `scripts/source-competence/`, `scripts/source-competence/README.md`; OL, GB, GCD runners.
- **Configuration/environment:** Committed profiles/fixtures; ignored generated output; no-network modes.
- **Validation:** Source-specific regression runners and determinism/network traps.
- **Evidence / registry:** OL/GB Phase I records and frozen GCD artifact; only some slices appear in certified registry.
- **Dependencies / dependents:** Immutable source evidence -> comparison, hypotheses, future Human Review.
- **Risks / next work:** Evidence classes and source-native shapes differ; do not generalize/tune the framework now.
- **Do not infer:** Characterization equals recommendation competence.

### GOV-06 - Source comparison harness
- **Purpose / lifecycle role:** Compare two immutable equivalent source characterizations; produce evidence only.
- **Current status:** **Locked**
- **Implementation / entry points:** `scripts/comparison-harness/`, `docs/SOURCE_COMPARISON_HARNESS.md`; runner/regression.
- **Configuration/environment:** Frozen fixture pair, same profile/evidence class/measurement/contract.
- **Validation:** Network trap, deterministic JSON/Markdown, overlap/metadata/diversity regressions.
- **Evidence / registry:** Phase I OL-vs-GB fixture/report; no certified registry row.
- **Dependencies / dependents:** Equivalent characterization artifacts -> engineering hypotheses.
- **Risks / next work:** Existing code does not yet enforce every documented evidence-class unavailable state. Do not change it during ComicVine characterization.
- **Do not infer:** Comparison selects a winner or route owner.

### GOV-07 - Frozen evidence artifacts
- **Purpose / lifecycle role:** Preserve immutable inputs/results that make characterization and certification reproducible.
- **Current status:** **Frozen**
- **Implementation / entry points:** Committed fixtures under `scripts/source-competence/fixtures/`, `scripts/comparison-harness/fixtures/`; `scripts/source-competence/frozen/gcd-phase1-summary.json`; registered `scripts/output/` artifacts.
- **Configuration/environment:** Artifact/schema versions and hashes.
- **Validation:** GCD has explicit `--verify-frozen`; other artifacts vary between regressions and generators.
- **Evidence / registry:** GCD, R1, K1 and historical outputs.
- **Dependencies / dependents:** Characterization/certification -> comparison and audit continuity.
- **Risks / next work:** Several tracked artifacts lack non-mutating checksum verification; generated ignored artifacts are not repository evidence by themselves.
- **Do not infer:** Frozen synthetic evidence represents current live composition.

### GOV-08 - Human Review
- **Purpose / lifecycle role:** Append structured human fit/safety/usefulness judgments to immutable machine artifacts.
- **Current status:** **Planned**
- **Implementation / entry points:** Specification only: `docs/HUMAN_REVIEW_MODE_SPEC.md`.
- **Configuration/environment:** Future rubric, pseudonymous reviewer identity, coverage/adjudication decisions.
- **Validation:** Acceptance contract specified; no storage, command, UI, or workflow exists.
- **Evidence / registry:** All current harness artifacts remain `not_reviewed`.
- **Dependencies / dependents:** Immutable comparable machine artifacts and privacy decisions -> route/product quality decisions.
- **Risks / next work:** Implement artifact contract after Ken resolves rubric/authority/privacy decisions.
- **Do not infer:** `eligible_useful` means a human approved a slate.

### GOV-09 - Unsupported-conclusions discipline
- **Purpose / lifecycle role:** Preserve the boundary between observations, interpretations, hypotheses, and decisions.
- **Current status:** **Implemented**
- **Implementation / entry points:** Mandatory sections/rules across philosophy, roadmap, comparison, GCD, and Phase II handoff documents.
- **Configuration/environment:** Evidence class and phase scope.
- **Validation:** Document review; not executable.
- **Evidence / registry:** Repeated explicit negative certifications in current records.
- **Dependencies / dependents:** Evidence methodology -> all engineering reports/decisions.
- **Risks / next work:** Later summaries may overstate old evidence; every major report should retain this section.
- **Do not infer:** An unavailable conclusion is a failed investigation.

### GOV-10 - Production decision gates
- **Purpose / lifecycle role:** Convert characterized/comparable/reviewed evidence into a separately approved architecture or product decision.
- **Current status:** **Planned**
- **Implementation / entry points:** Roadmap gate cards, especially graphic-novel decision gate and release stages.
- **Configuration/environment:** Product-owner, legal, Human Review, operational evidence.
- **Validation:** Future decision records and invariant tests.
- **Evidence / registry:** No graphic-source production decision record exists.
- **Dependencies / dependents:** Comparison/live/Human Review/licensing -> production experiments.
- **Risks / next work:** Decisions must not be smuggled into adapters or fixture changes.
- **Do not infer:** A characterized/certified source is selected for production.

### GOV-11 - Telemetry and post-launch evidence
- **Purpose / lifecycle role:** Measure longitudinal deployed behavior without replacing deterministic correctness or Human Review.
- **Current status:** **Planned**
- **Implementation / entry points:** Requirements only in roadmap sections 16-17.
- **Configuration/environment:** Privacy-approved schema, deployment/build version, source terminal states, latency, underfill, feedback.
- **Validation:** None implemented.
- **Evidence / registry:** No production telemetry baseline/dashboard.
- **Dependencies / dependents:** Deployment, privacy, monitoring -> post-launch hypotheses.
- **Risks / next work:** Raw swipe/profile data must not be uploaded by convenience; thresholds/ownership unresolved.
- **Do not infer:** Clickthrough or uptime alone proves recommendation quality.

## 10. Operations and release registry

### OPS-01 - Package commands
- **Purpose / lifecycle role:** Expose development, platform, certification, test, and audit commands.
- **Current status:** **Implemented**
- **Implementation / entry points:** `package.json`, `package-lock.json`.
- **Configuration/environment:** Local Node/npm and source credentials for live commands.
- **Validation:** Deterministic manifest maps 49 validation aliases to 45 tools.
- **Evidence / registry:** Package surface only.
- **Dependencies / dependents:** Node dependencies -> local workflows/future CI.
- **Risks / next work:** Coverage is incomplete and one `test:` alias is live. Canonicalize only in release-gate task.
- **Do not infer:** Package exposure means CI suitability.

### OPS-02 - Canonical deterministic release gate
- **Purpose / lifecycle role:** Run every declared release lock from a clean checkout with one command.
- **Current status:** **Planned**
- **Implementation / entry points:** Proposed by `docs/DETERMINISTIC_TEST_MANIFEST.md` and roadmap; no command exists.
- **Configuration/environment:** Future pinned runtime, isolated/no-network execution, clean output paths.
- **Validation:** Not implemented.
- **Evidence / registry:** 43 proposed candidates require authority review.
- **Dependencies / dependents:** Manifest, package aliases, artifact checks -> CI/release certification.
- **Risks / next work:** Resolve tracked `.tmp`, historical authority, artifact check modes, lint/typecheck/build first.
- **Do not infer:** Current manual enumeration is an authoritative release gate.

### OPS-03 - Continuous integration
- **Purpose / lifecycle role:** Automatically enforce required deterministic/build gates on protected `main`.
- **Current status:** **Planned**
- **Implementation / entry points:** No `.github/workflows/` exists.
- **Configuration/environment:** Future runner/runtime/cache/secrets policy.
- **Validation:** None.
- **Evidence / registry:** Roadmap release blocker.
- **Dependencies / dependents:** Canonical gate and runtime pin -> protected merges.
- **Risks / next work:** Must exclude live probes/secrets and avoid artifact drift.
- **Do not infer:** Local passing scripts protect GitHub main.

### OPS-04 - Lint
- **Purpose / lifecycle role:** Static style/import validation.
- **Current status:** **Implemented**
- **Implementation / entry points:** `npm run lint`, `eslint.config.js`.
- **Configuration/environment:** Expo ESLint; currently loads tracked `.env`.
- **Validation:** Manifest baseline records 21 errors and 49 warnings.
- **Evidence / registry:** No passing release lock.
- **Dependencies / dependents:** Source/config -> future release gate.
- **Risks / next work:** Resolve failures and environment isolation in a separately authorized task.
- **Do not infer:** Lint is green or currently release-blocking through CI.

### OPS-05 - Typecheck
- **Purpose / lifecycle role:** Strict TypeScript validation.
- **Current status:** **Implemented**
- **Implementation / entry points:** `npm run typecheck`, `tsconfig.json`.
- **Configuration/environment:** Expo base config, strict mode, `@/*` path mapping.
- **Validation:** Manifest baseline records broad existing failures.
- **Evidence / registry:** No passing release lock.
- **Dependencies / dependents:** TypeScript source/types -> future build/release gate.
- **Risks / next work:** Missing server types, UI/deck schema, legacy and V2 type drift require separate repair.
- **Do not infer:** Repository currently typechecks.

### OPS-06 - Production build
- **Purpose / lifecycle role:** Produce a reproducible supported-platform release artifact.
- **Current status:** **Planned**
- **Implementation / entry points:** No canonical production-build command; Expo dev/platform commands only.
- **Configuration/environment:** Future target platforms and release environment.
- **Validation:** No production build smoke.
- **Evidence / registry:** Roadmap release blocker.
- **Dependencies / dependents:** Green static/deterministic gates, runtime, app identity -> deployment.
- **Risks / next work:** Platform/scope and build command must be chosen.
- **Do not infer:** `expo start` or `expo run:*` is production certification.

### OPS-07 - Expo/EAS deployment
- **Purpose / lifecycle role:** Configure and publish web/iOS/Android application builds.
- **Current status:** **Placeholder**
- **Implementation / entry points:** `app.json`; no `eas.json`.
- **Configuration/environment:** Generic app identity `com.anonymous.novelideas`, static web output, no release channels.
- **Validation:** No deployment smoke or supported-device matrix.
- **Evidence / registry:** Roadmap says readiness not established.
- **Dependencies / dependents:** Product scope/build/secrets -> staging/production.
- **Risks / next work:** Choose provider/platforms, app identity, assets, environments.
- **Do not infer:** Expo metadata is a deployment plan.

### OPS-08 - Environment management
- **Purpose / lifecycle role:** Define, validate, and separate development/staging/production configuration.
- **Current status:** **Unknown / Requires Review**
- **Implementation / entry points:** Scattered `process.env` reads in adapters/APIs; `.env`; no schema validator.
- **Configuration/environment:** Source keys, proxies, site origin, debug flags.
- **Validation:** No startup/environment validation.
- **Evidence / registry:** Manifest/roadmap identify isolation gaps.
- **Dependencies / dependents:** Every external source and deployment.
- **Risks / next work:** Establish environment schema and fail-clearly behavior after security review.
- **Do not infer:** Existing variable fallbacks are safe or complete.

### OPS-09 - Secrets
- **Purpose / lifecycle role:** Keep provider/deployment credentials server-side, scoped, rotated, and absent from artifacts/client bundles.
- **Current status:** **Unknown / Requires Review**
- **Implementation / entry points:** Server API routes plus some `EXPO_PUBLIC_*` adapter fallbacks; tracked `.env`.
- **Configuration/environment:** GB, ComicVine, NYT, proxies, future storage credentials.
- **Validation:** No secret scan/history audit or rotation record.
- **Evidence / registry:** Roadmap stop condition.
- **Dependencies / dependents:** Live sources/deployment -> staging/production.
- **Risks / next work:** Inspect tracked file/history, rotate if needed, define client/server boundaries.
- **Do not infer:** Variable naming proves a secret cannot enter a client bundle.

### OPS-10 - Staging
- **Purpose / lifecycle role:** Validate bounded live behavior and product flows before production.
- **Current status:** **Planned**
- **Implementation / entry points:** Roadmap only; no staging manifest/environment/runbook.
- **Configuration/environment:** Approved keys, terms, rate budgets, redaction, platform target.
- **Validation:** Future bounded source/product smoke.
- **Evidence / registry:** Existing live probes are investigations, not staging.
- **Dependencies / dependents:** Build, environment, legal/privacy -> beta/release.
- **Risks / next work:** Hosting and ownership unresolved.
- **Do not infer:** Local live probes constitute staging validation.

### OPS-11 - Production monitoring
- **Purpose / lifecycle role:** Observe health, source terminal states, latency, underfill, and incidents.
- **Current status:** **Planned**
- **Implementation / entry points:** Roadmap telemetry requirements only.
- **Configuration/environment:** Privacy-approved metrics, diagnostic schema version, alert ownership.
- **Validation:** None.
- **Evidence / registry:** No dashboard/monitoring baseline.
- **Dependencies / dependents:** Production deployment -> incidents/post-launch evidence.
- **Risks / next work:** Avoid patron-identifying/raw taste data; define SLOs and owners.
- **Do not infer:** Diagnostic exports are monitoring.

### OPS-12 - Rollback
- **Purpose / lifecycle role:** Restore prior build/config/source state when release behavior is unsafe.
- **Current status:** **Planned**
- **Implementation / entry points:** Roadmap requirements only.
- **Configuration/environment:** Versioned releases, source-disable controls, deployment provider.
- **Validation:** No rollback drill.
- **Evidence / registry:** Missing rollback blocks beta/public launch.
- **Dependencies / dependents:** Reproducible build/deployment -> incident response.
- **Risks / next work:** Define prior-build restoration and source-disable recovery.
- **Do not infer:** Git history alone is an operational rollback.

### OPS-13 - Release certification
- **Purpose / lifecycle role:** Produce a signed/versioned record that deterministic, build, live, Human Review, accessibility, privacy, deployment, and rollback gates are satisfied.
- **Current status:** **Planned**
- **Implementation / entry points:** Roadmap final certification matrix; no executable record.
- **Configuration/environment:** Chosen launch stage, platforms, sources, thresholds.
- **Validation:** Not implemented.
- **Evidence / registry:** Source certifications are inputs, not release certification.
- **Dependencies / dependents:** All release gates -> launch.
- **Risks / next work:** Ken must set thresholds/scope; canonical gate and CI must exist.
- **Do not infer:** `phase1-complete` is a product release certification.

### OPS-14 - Tracked `.env` review
- **Purpose / lifecycle role:** Determine whether current file/history contains secrets and what remediation is required.
- **Current status:** **Planned**
- **Implementation / entry points:** Tracked `.env`; `.gitignore` ignores only `.env*.local`.
- **Configuration/environment:** Git history and provider credentials.
- **Validation:** Contents/history intentionally not assessed in roadmap/this static registry.
- **Evidence / registry:** Explicit release/security blocker.
- **Dependencies / dependents:** Security/legal decision -> environment/secrets/deployment.
- **Risks / next work:** Perform authorized secret/history audit and rotation plan.
- **Do not infer:** Presence or absence of visible values here resolves secret risk.

### OPS-15 - Runtime version pinning
- **Purpose / lifecycle role:** Make clean-checkout installs and validation reproducible.
- **Current status:** **Planned**
- **Implementation / entry points:** No `package.json.engines`, `.nvmrc`, `.node-version`, or `.tool-versions`; lockfile version 3.
- **Configuration/environment:** Future supported Node/npm versions.
- **Validation:** None.
- **Evidence / registry:** Deterministic manifest gap.
- **Dependencies / dependents:** Package install -> tests, build, CI.
- **Risks / next work:** Choose/pin versions before canonical CI.
- **Do not infer:** A lockfile pins the runtime.

## 11. Dependency map

The main current path is:

```text
Swipe cards and decisions
  -> V2 Taste Profile
  -> buildSearchPlan router
  -> source/age query planning
  -> registered source adapters
  -> source admission and shared normalization
  -> source-specific identity evidence
  -> scoring and final eligibility
  -> ranking, diversity, and selection
  -> bounded recovery/reselection where applicable
  -> RecommendationResultV2
  -> screen rendering and local session report
```

Current code crosses ideal boundaries:

- Open Library age/query/recovery policy is concentrated in `openLibrarySource.ts` and `engine.ts`.
- Google Books publication identity/admission spans its adapter, `engine.ts`, `score.ts`, and `select.ts`.
- Ranking, final eligibility, identity observability, and selection are heavily coupled in `select.ts`.
- Rendering diagnostics are partly assembled in `screens/SwipeDeckScreen.tsx`, not solely in the diagnostics module.
- Legacy recommendation helpers remain beside the authoritative V2 path.

Cross-cutting dependencies:

```text
Age-band policy ---------> planning, admission, maturity, selection, UI promise
Source certification ----> support ledger and production-decision eligibility
Frozen evidence ---------> characterization, comparison, regression continuity
Human Review (planned) --> usefulness claims and route/product decisions
Local Collection --------> deployment mode, tenant/catalog/privacy boundaries
Release validation ------> every enabled source, age, UI, build, and operation
```

Machine evidence, live observation, Human Review, and telemetry remain separate evidence classes. None substitutes for another.

## 12. Lock and certification summary

| Subsystem or slice | Status | Evidence | Lock command | Artifact | Next permitted change |
| --- | --- | --- | --- | --- | --- |
| Engineering Constitution | Locked governance | `docs/RECOMMENDATION_PHILOSOPHY.md` | Documentation review | Governing document | Explicit architecture review only |
| Source Competence Phase 1 | Locked framework | `scripts/source-competence/README.md` and focused regressions | Source-specific commands below | Fixtures/profiles and generated ignored outputs | Use framework; do not generalize it |
| Source Comparison Harness Phase 1 | Locked tool contract | comparator regression and architecture doc | `node scripts/comparison-harness/run-comparison-harness-regressions.mjs` | `scripts/comparison-harness/fixtures/openlibrary-vs-googlebooks-v1.json` | Consume equivalent evidence; no methodology change during Phase II |
| Google Books D1 Kids | Certified/frozen | Registry D1 | `node scripts/run-v2-googlebooks-kids-architecture-regressions.mjs`; D1 closure script | Registry baseline scripts | Source/age release gaps only after roadmap gates |
| Google Books D2 Preteen | Certified/frozen | Registry D2 | Publication identity, narrative rescue, D2 closure scripts | Registry baseline scripts | Same |
| Google Books E1 Teen | Certified/frozen | Registry E1 | Teen architecture, audience/maturity, E1 closure scripts | Registry baseline scripts | Same |
| Google Books Phase 1 competence | Characterized; not live/human certified | `docs/GOOGLE_BOOKS_SOURCE_CERTIFICATION.md` | `npm run certify:googlebooks`; focused regression | Committed fixtures/profiles; generated output ignored | Human Review/live characterization later |
| Open Library R1 Adult | Registered frozen fixture suite; not full source certification | Registry R1 | R1 generator is not a non-mutating verifier | `scripts/output/recommendation-certification-suite-v1.json` | Add verifier only in release-gate work; preserve behavior |
| Open Library source competence | Characterized | OL harness fixtures/profile | `node scripts/source-competence/run-source-competence-harness.mjs --mode replay --profile all --verify-no-network --verify-determinism` | Committed fixtures/profile; generated output ignored | Formalize age support/live/review later |
| ComicVine EP1 Adult | Certified/frozen | Registry EP1 | `npm run test:v2:comicvine-source-certification`; gap closure | Registry baseline/tag record | Source-neutral equivalence characterization only |
| Kitsu K1 Adult | Certified/frozen | Registry K1 | Source certification and Adult fixture scripts | `scripts/output/adult-kitsu-baseline-phase3.json` | Clarify product/age role and representative evidence later |
| GCD Phase I | Characterized/frozen; not integrated | GCD report and focused regression | `npm run characterize:gcd`; `npm run test:source-competence:gcd` | `scripts/source-competence/frozen/gcd-phase1-summary.json` | Preserve while ComicVine equivalence runs |
| Local Collection | Placeholder/absent adapter | Capability doc and placeholder regression | `node scripts/run-collection-opportunities-placeholder-regressions.mjs` | No catalog artifact | Implement only if launch mode selects Library Mode |
| Human Review | Planned/absent | `docs/HUMAN_REVIEW_MODE_SPEC.md` | None | None | Implement immutable artifact workflow after owner decisions |
| NYT | Implemented, not certified | Adapter/live audit scripts | No dedicated deterministic package gate | Historical output only | Define purpose and fixture-certify before production claim |
| Release engineering | Planned/incomplete | Deterministic manifest and roadmap | No canonical command | No release manifest | Implement canonical gate/CI in its authorized phase |

Areas can be certified but not product-complete (D1/D2/E1, EP1, K1), characterized but not selected (GCD, OL/GB competence profiles), implemented but not certified (NYT and many UI/core surfaces), planned but absent (Human Review, CI, telemetry), or historical and awaiting review (legacy recommendation helpers and numbered investigation tools).

## 13. Critical-path alignment

The roadmap remains authoritative; this registry does not reorder it.

| Roadmap position | Registry alignment | Current evidence boundary |
| --- | --- | --- |
| Completed foundation | GOV-01 through GOV-07; source/core architecture | Philosophy, competence/comparison methods, source slices, and deterministic inventory exist |
| Immediate next phase | SRC-04 ComicVine plus CORE-07 identity | ComicVine equivalence certification under `docs/GRAPHIC_NOVEL_SOURCE_COMPETENCE_PHASE_II_HANDOFF.md` |
| Later graphic comparison | GOV-06, SRC-04, SRC-05 | Allowed only if all four equivalence dimensions pass |
| Licensing/access review | SRC-04, SRC-05, UI-07, OPS-09 | ComicVine non-commercial/persistence/covers and GCD attribution/ShareAlike/access unresolved |
| Representative frozen/live evidence | GOV-07, source entries, OPS-10 | Terms-compliant capture/replay and bounded live observation remain future |
| Human Review | GOV-08 | Specification exists; implementation and reviews absent |
| Source-by-age completion | SRC-01 through SRC-07; AGE-01 through AGE-04 | Per-source/age support, live, review, legal, and activation states must align |
| Local Collection | SRC-07, UI-12 | Depends on launch-mode/catalog/privacy decisions |
| Swipe/profile certification | CORE-01, CORE-02, UI-01 | Roadmap order 13 |
| Product completion | UI-01 through UI-12 | Launch-facing workflows and accessibility/privacy remain open |
| Release engineering | OPS-01 through OPS-15 | Canonical gate, CI, build, runtime, environments, rollback absent |
| Deployment and launch | OPS-06 through OPS-13 | Staging precedes controlled release stages; readiness not established |

Immediate sequencing:

1. The deterministic manifest exists; its future implementation is separate.
2. Current next recommendation-evidence phase is ComicVine equivalence certification.
3. GCD/ComicVine comparison follows only on `comparison_valid`.
4. Licensing/access, representative evidence, and Human Review precede any graphic-source production decision.
5. No Phase II tuning or route ownership is authorized by this registry.

## 14. Ownership and decision boundaries

| Decision class | Repository-supported responsibility |
| --- | --- |
| Engineering decisions | Implement contracts, diagnostics, deterministic fixtures, bounded experiments, and invariant-preserving changes inside an authorized gate. |
| Evidence/certification decisions | State exactly what a deterministic or frozen artifact establishes; update registry/lock records only when acceptance is reproducible. |
| Product-owner decisions | Launch age bands/platforms/modes, slate/latency/review thresholds, patron promises, source portfolio, and whether Library Mode ships. The roadmap explicitly names Ken for these decisions. |
| Licensing/legal decisions | Interpret ComicVine commercial scope, GCD ShareAlike/attribution boundaries, cover rights, persistence, public display, and provider terms. Engineering records facts and questions, not legal conclusions. |
| Human Review decisions | Choose rubric, reviewers, coverage, disagreement/adjudication, and judge fit/safety/usefulness for exact immutable artifacts. |
| Operational release decisions | Approve environments, secrets, staging, supported-device/build matrix, monitoring, incidents, rollback, and signed release promotion. |

Sources do not own routing, eligibility, ranking, diversity, or selection. Adapters expose evidence; the shared architecture owns recommendation behavior. A certification decision does not make a product decision.

## 15. Known gaps and ambiguities

1. **Core coupling:** `engine.ts`, `openLibrarySource.ts`, and especially `select.ts` span multiple conceptual stages.
2. **Legacy overlap:** `screens/recommenders/taste/` and `screens/swipe/openLibrary*.ts` coexist with authoritative V2 and can be mistaken for current ownership.
3. **Stale documentation paths:** Older audits cite absent ComicVine/GCD scripts identified in `docs/DETERMINISTIC_TEST_MANIFEST.md`.
4. **Registry coverage:** The certified-subsystem registry is narrower than actual deterministic validation and competence evidence.
5. **Age-specific status:** A source can be certified for one age slice and merely implemented, characterized, or unevaluated for another.
6. **Uncertified production paths:** NYT, rendering, Admin, swipe evidence, and some route/source combinations lack formal certification.
7. **Historical authority:** Numerous numbered GB/R1 tools and tracked outputs have unclear current release authority.
8. **Release infrastructure:** No canonical aggregate gate, CI, production build command, runtime pin, staging, release record, monitoring, or rollback drill.
9. **Static blockers:** Lint and typecheck are known red baselines; this registry did not rerun or repair them.
10. **Tracked output/temp behavior:** Some tools write `scripts/output/` or tracked `.tmp/`; generators are not non-mutating verifiers.
11. **Local Collection:** Adapter/import/storage/tenant/membership/privacy behavior is absent; upload UI is nonfunctional as committed.
12. **Human Review:** Specification exists but workflow, artifacts, reviewers, thresholds, and evidence do not.
13. **Telemetry:** No production evidence schema, privacy approval, dashboards, or longitudinal baseline.
14. **Environment/secrets:** Variables are scattered, runtime is unpinned, `.env` is tracked, and secret-history status is unknown.
15. **Source operations:** Live reliability, quota, retry, cache, terms, and cover rights are not established for launch.
16. **Identity promotion:** Graphic reading-unit identity is source-neutral within its characterized domain but not yet a platform-wide implementation.
17. **Product promises:** Coming-next/import/config text and unsupported toggles can exceed operational capability.
18. **Accessibility/privacy/security:** No formal targets, audits, or certifications.

These gaps are inventory findings, not repair authorization.

## 16. Maintenance rules

Future PRs must update this registry when they:

- add/remove a durable subsystem;
- move architectural ownership;
- certify, freeze, or lock a phase;
- change a major dependency;
- add, retire, enable, or disable a source;
- add/remove a release gate;
- change a subsystem's next authorized work;
- alter source-by-age support or product/deployment scope.

Maintenance requirements:

1. Mark a phase **Locked** only with explicit supporting evidence and protection.
2. Keep the roadmap critical path authoritative; this registry summarizes, never reorders it.
3. Preserve unsupported conclusions and evidence-class limits.
4. Do not silently rewrite historical records; add later evidence and explain supersession.
5. Verify every current path, command, artifact, registry row, and source status before publication.
6. Keep one primary status per entry so counts remain auditable.
7. Distinguish adapter implementation, characterization, certification, production activation, and future selection.
8. Update registry and roadmap in the same PR when a major phase closes.

## 17. Unsupported conclusions

This registry does not prove:

- recommendation usefulness or quality;
- source superiority or route ownership;
- live source reliability;
- licensing suitability or cover rights;
- launch readiness or product completeness;
- accessibility compliance;
- privacy or security compliance;
- deployment correctness;
- that every implemented subsystem is certified;
- that every certified subsystem is ready for public use;
- that every passing tool belongs in a release gate;
- that historical files may be removed;
- that a source will remain in the final product;
- that GCD and ComicVine are currently comparable;
- that Local Collection, Human Review, telemetry, CI, or release operations exist;
- that a clean static inventory is equivalent to executing validation.

The registry answers what exists, what evidence protects it, what remains uncertain, and what work is authorized next. It does not answer whether current recommendations are good.
