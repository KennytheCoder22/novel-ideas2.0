# Graphic-Novel Source Evaluation: Architecture Inventory and Contract Proposal

## Status

This is the pre-implementation record for the bounded GCD-versus-ComicVine evaluation.

- Investigation branch: `codex/graphic-novel-source-evaluation`
- Authoritative baseline: `32e22086707c4acc67a7e442499dc8348500178f`
- Baseline tag: annotated `phase1-complete`
- Inventory date: 2026-07-29
- Production changes: none
- GCD reactivation: none
- Source tuning: none

All current-behavior conclusions below come from the tagged Phase I baseline. Historical GCD files were read from Git objects only and were not restored. Proposed contracts and profiles are proposals, not descriptions of current behavior.

## Executive conclusion

Proceed to **independent, fixture-first source characterization**, but do not proceed directly to a production GCD adapter or a combined-source experiment.

The present ComicVine implementation is a real V2 source with deterministic Adult certification. GCD is not: no active GCD adapter, `SourceIdV2`, fixture corpus, or current regression exists. The surviving `/api/gcd-proxy` endpoint and `gcd` configuration names are remnants, not evidence of a source contract.

The existing Source Competence and Comparison Harnesses provide the correct process and most of the correct evidence envelope. They require one narrow graphic-novel extension before a comparison is trustworthy: a source-neutral, typed reading-unit identity that distinguishes work, series, volume, issue, collection, and edition. The locked comparator's current work-key/ISBN/title-plus-creator identity is intentionally insufficient for volumes, component issues, collected editions, and variants.

Two non-code gates must also be resolved before live capture is treated as reusable evidence:

1. ComicVine's published API terms restrict use to non-commercial projects, require attribution/linkback, restrict redistribution, and impose rate and velocity limits.
2. GCD data is CC BY-SA 4.0, but cover images have separate reserved rights; its current API documentation says endpoint URLs are stable while fields and formats are not, and anonymous access may be disabled later.

## Evidence discipline

This report uses four labels:

- **Observed**: directly established by the tagged source tree, deterministic regressions, or repository history.
- **Historical**: established from retired files or earlier commits; not current behavior.
- **External constraint**: stated by the source's current official documentation.
- **Proposed**: a contract or study design requiring review before implementation.

No quality, route-ownership, or source-superiority conclusion is made here.

## Repository architecture map

### Current production flow

```text
SwipeDeckScreen source controls
        |
        v
runRecommenderV2
        |
        +--> buildTasteProfile
        +--> buildSearchPlan (same generic intents for ComicVine)
        +--> comicVineSourceAdapter (issue search through /api/comicvine)
        +--> normalizeSourceResults
        +--> buildComicVineEntityMetadata
        +--> applyComicVineSourceAdmissionPolicy
        +--> scoreCandidates
        +--> applyAdultComicVinePostScorePolicy
        +--> selectRecommendations
        +--> ComicVine lineage/identity diagnostics
        +--> SwipeDeckScreen rendering and report export
```

### Current files and responsibilities

| Layer | Current file and primary symbols | Observed responsibility |
| --- | --- | --- |
| Caller and control | `screens/SwipeDeckScreen.tsx`; `sourceEnabled`, `runRecommenderV2` call sites | Maps the current `comicVine` control, or legacy `gcd` control when `comicVine` is absent, into V2 `enabledSources.comicVine`. Exports detailed source diagnostics. |
| Admin compatibility | `app/app_admin-web.tsx`; `app/(tabs)/index.tsx` | Persists the historical key `gcd` but labels it “ComicVine (Comics).” This is a compatibility/configuration alias, not a GCD adapter. |
| Orchestration | `app/recommender-v2/engine.ts`; `runRecommenderV2`, `runWithTimeout`, `applyAdultComicVinePostScoreGate`, `applyComicVinePipelineDiagnostics` | Runs sources in parallel, enforces the source deadline, then applies normalization, ComicVine admission, shared scoring, Adult ComicVine post-score policy, shared selection, and diagnostic serialization. |
| Routing | `app/recommender-v2/searchPlan.ts`; `buildSearchPlan` | Creates two generic taste intents and gives them unchanged to ComicVine when explicitly enabled. ComicVine has no age or graphic-intent scope gate here. Default non-Open-Library source deadline is 2,500 ms. |
| Registry | `app/recommender-v2/sources/index.ts`; `sourceAdapters` | Registers `comicVineSourceAdapter`. There is no GCD source identity or adapter slot. |
| Shared contract | `app/recommender-v2/types.ts`; `SourceIdV2`, `SourcePlan`, `SourceResult`, `NormalizedCandidate`, `SourceDiagnosticV2`, `SourceAdapterV2` | Defines source lifecycle, candidate envelope, stage diagnostics, and the only current source identity, `comicVine`. |
| Transport and conversion | `app/recommender-v2/sources/comicVineSource.ts`; `buildRequestPlan`, `toRawRow`, `comicVineSourceAdapter.search` | Sequentially searches ComicVine `issue` resources for each planned intent, converts rows, deduplicates exact source IDs, and emits per-query transport lineage. |
| Server proxy | `api/comicvine.ts`; default handler | Requires server-side `COMICVINE_API_KEY`, forwards `q` and bounded `limit` to ComicVine `search` with `resources=issue`, and returns a normalized `results` response. |
| Normalization | `app/recommender-v2/normalize.ts`; `normalizeSourceResults` | Builds shared candidates, preserves raw rows, attaches `ComicVineEntityMetadata`, and seeds source provenance/survival reasons. |
| Identity | `app/recommender-v2/comicVineTypes.ts`; `app/recommender-v2/comicVineIdentity.ts`; `classifyComicVineIdentity`, `buildComicVineEntityMetadata`, `buildComicVineIdentityReport` | Classifies publication shape, derives family/title/series roots and ranges, and reports identity composition. |
| Source-local admission | `app/recommender-v2/comicVineAdmission.ts`; `applyComicVineSourceAdmissionPolicy` | Hard-rejects excluded identities and collapses deterministically dominated members within ComicVine families before shared scoring. |
| Shared scoring | `app/recommender-v2/score.ts`; `scoreCandidates` | Scores all sources. Adult ComicVine uses document metadata only and explicitly excludes query text/family/facets as taste evidence. |
| Post-score gate | `app/recommender-v2/comicVineAdmission.ts`; `applyAdultComicVinePostScorePolicy` | For Adult only, withholds weak restricted items and inaccessible issues, releases eligible issue-one/annual/one-shot fallbacks only for underfill, and preserves honest underfill. |
| Shared selection | `app/recommender-v2/select.ts`; `selectRecommendations` | Applies common score eligibility, exact normalized-title suppression, author/series diversity, deferral, and underfill behavior. It contains no ComicVine-specific branch. |
| Diagnostic UI | `screens/SwipeDeckScreen.tsx` | Serializes current V2 source diagnostics, but retains many old `lastDebugGcdDispatchTrace` names and retired V1 field labels. |

### Transport behavior

**Observed:**

- The adapter requests only ComicVine `issue` search results, not `volume` results.
- It requests up to 20 rows per query and runs planned queries sequentially under one parent source deadline.
- It records exact final URL, request path, start/end, elapsed time, response status/content type/body prefix/shape, raw and converted counts, duplicates, abort origin, and empty/failure classification.
- It has no adapter retry, pagination, caching, rate limiter, or post-header grace path.
- The server proxy also has no explicit timeout, retry, pagination, caching, rate limiter, or response replay store.
- Exact repeated source IDs are deduplicated in the adapter before shared normalization.
- A default proxy path (`/api/comicvine`) is always selected. Consequently, the direct-API branch is not normally reachable merely by providing an API key; the active deployment contract is effectively proxy-first.
- `api/comicvine.ts` keeps the API key server-side. Its diagnostic response exposes only key presence and length, not the key value.

**External contract discrepancy to characterize, not fix here:** ComicVine's current search documentation says the search endpoint defaults to 10 results and “can not exceed” 10, while NovelIdeas asks its proxy for 20 and deterministic fixtures return 20. Live capture must record the actual page count rather than assuming either behavior.

## Current ComicVine contract

### Input

`comicVineSourceAdapter.search` receives:

- a shared `SourcePlan`;
- enabled/disabled state;
- two generic shared search intents;
- a 2,500 ms total source deadline in ordinary runs;
- a `TasteProfile`;
- the parent `AbortSignal`.

No ComicVine-specific routing object or age-band eligibility contract exists.

### Raw source fields consumed

The adapter currently consumes:

- issue `id`;
- `resource_type`;
- `name`;
- parent `volume.id` and `volume.name`;
- `issue_number`;
- `deck` or `description`;
- `cover_date`;
- `site_detail_url`;
- `person_credits[].name`;
- `publisher.name` for later identity analysis.

It does not currently normalize:

- creator roles;
- cover/image fields;
- character, concept, team, or story-arc credits;
- store date;
- page count;
- language;
- ISBN or other edition identifiers;
- explicit collected contents.

The complete raw row remains attached to the candidate, so omitted fields in a fixture are recoverable for diagnostics, but they are not part of the shared normalized contract.

### Output

`toRawRow` emits:

- stable source ID `comicVine:<issue-id>`;
- title and sometimes parent-volume subtitle;
- creator names without roles;
- description;
- format `comic`;
- genres containing planned facets, normalized query tokens, `graphic novels`, and `comics`;
- themes containing volume name and issue number;
- publication year, source URL, query/family/cascade/facets, adapter version, and raw row.

This means the adapter currently mixes source data with retrieval context in `genres`. Adult scoring compensates by using metadata-only evidence. Non-Adult ComicVine scoring does not have that same source-specific protection. This is an architectural risk to characterize, not permission to change it.

### Activation and age coverage

**Observed current behavior:**

- A caller must pass `enabledSources.comicVine: true`; otherwise the plan is an intentional `source_disabled` skip.
- The UI enables ComicVine by default unless the per-deck `comicVine` or legacy `gcd` setting is false.
- `buildSearchPlan` has no ComicVine age-band, format-intent, or route-ownership gate.
- The adapter can therefore dispatch for kids, preteens, teens, or adults when the caller enables it.

**Certified behavior:**

- Current source-only, mixed-source, identity, admission, restricted-category, fallback, duplicate, and honest-underfill fixtures all build an **Adult** profile.
- No equivalent deterministic Kids, Preteen, Teen, or manga-specific ComicVine certification was found.

Operational availability across four age bands must not be reported as certification across four age bands.

## Current publication and identity behavior

### Graphic novels and collections

`classifyComicVineIdentity` uses source metadata text with explicit precedence:

1. hard-reject semantic markers;
2. reference/tie-in semantic markers;
3. collection markers;
4. series markers when no issue number exists;
5. other semantic markers;
6. issue-number default;
7. `resource_type=volume` fallback;
8. unknown.

Collection identities include graphic novel, trade paperback, hardcover collection, collected edition, deluxe edition, omnibus, and compendium. Collection semantics deliberately override the presence of an issue number.

### Individual issues

An otherwise unclassified row with `issue_number` becomes:

- `annual` when marked annual;
- `one_shot` when marked one-shot;
- otherwise `single_issue`.

Issue accessibility is `issue_one`, `middle_issue`, `annual`, `one_shot`, or a non-issue state. First issues, annuals, and one-shots are fallback-only; middle issues are withheld by the Adult post-score policy.

### Series, volumes, and ordering

- ComicVine `volume.id` is the strongest current family key.
- Without it, normalized series root, then title root, then source ID is used.
- A `volumeNumber` is parsed from title/volume text.
- A collection issue range or volume range is parsed from descriptive text when an explicit “collects/contains/issues/volumes” pattern exists.
- Limited or ongoing series containers may dominate component issues in the same ComicVine volume.

There is no source-neutral work ID, series ID, volume ID, issue ID, or edition ID in `NormalizedCandidate`. These distinctions live only in optional `comicVine` metadata.

### Omnibuses

An omnibus is preferred. It suppresses a contained volume only when:

- both records share a deterministically derived family; and
- a parsed omnibus volume range contains the other record's volume number.

The word “omnibus” alone does not authorize cross-family suppression.

### Duplicate publications

Three distinct mechanisms exist:

1. Adapter exact-ID dedupe across queries.
2. ComicVine family dominance before scoring:
   - collection over a contained issue;
   - series container over component issue;
   - omnibus over a contained volume;
   - same-family collection editions with overlapping issue ranges or the same volume number.
3. Shared selection:
   - exact normalized title rejection;
   - author and series/root deferral;
   - bounded diversity relaxation on underfill.

Ambiguous same-family records without deterministic dominance remain visible and are diagnosed rather than silently collapsed.

### Manga

The shared candidate format supports `manga`, but the ComicVine adapter always emits `comic`, and the ComicVine identity taxonomy has no manga-volume identity. Manga currently has no deterministic ComicVine-specific distinction from other comic issues/collections. Kitsu coverage does not solve cross-source ComicVine/GCD manga identity.

### Missing work/edition distinction

Current code can often distinguish a component issue from a collection and sometimes collapse editions of the same collected range. It cannot generally answer:

- whether two source records express the same abstract narrative work;
- whether two collections contain exactly the same stories;
- whether two records are editions/variants of one publication;
- whether similarly titled volumes are different series eras;
- whether a source “volume” is a series container or a purchasable reading unit.

This is the principal blocker to a trustworthy GCD-versus-ComicVine overlap metric.

## Shared architecture versus ComicVine-specific implementation

### Genuinely source-contract concerns

These should remain source adapters/extractors:

- authentication and endpoint construction;
- parsing ComicVine response envelopes and source fields;
- source-native IDs and parent links;
- transport status, pagination, rate-limit, and retry facts;
- mapping source-native entity types into a shared reading-unit vocabulary;
- preserving raw source metadata and source-specific fields;
- reporting classification confidence and evidence;
- exact source-ID dedupe within one response stream.

### Semantically shared recommendation concerns

These should be owned by shared architecture even where current code implements them in `comicVineAdmission.ts`:

- which reading units are recommendable;
- whether an issue is an acceptable entry point;
- age/maturity eligibility;
- whether reference material can answer a reader profile;
- whether an underfilled slate may release a fallback issue;
- collection-versus-component preference;
- edition/work duplicate collapse across sources;
- scoring, ranking, diversity, and final selection.

This is not a request to move current code. It is a boundary for the proposed GCD work: do not copy ComicVine policy into a GCD adapter, and do not create a second independent graphic-novel recommender.

### Current mixed boundary

`comicVineIdentity.ts` is mostly a source-native extractor plus a useful candidate shared taxonomy. `comicVineAdmission.ts` combines:

- source-specific provenance and family extraction; and
- recommendation policy such as preferred/allowed/restricted/excluded buckets, restricted evidence thresholds, issue entry-point rules, and underfill release.

Independent characterization must record both layers separately. A source should not “win” because its adapter embeds a more favorable policy.

## Diagnostics and certification coverage

### Diagnostics emitted

Current diagnostics preserve:

- planned/attempted/skipped/failed/timed-out/empty/succeeded state;
- one fetch record per intent;
- exact query and request URL;
- path, proxy normalization, response content type and recognized envelope;
- request timestamps, elapsed time, HTTP status, abort origin, and error;
- raw API, converted, duplicate, normalized, scoring handoff, final eligible, selected, and rendered counts;
- per-query stage counts and first titles;
- source empty-stage classification;
- identity, entity-type, policy-bucket, unknown, issue, artifact, and low-confidence composition;
- hard rejects with source ID/query/reasons/evidence;
- family clusters, suppressed records, winners, ambiguous clusters, and collapse evidence;
- restricted and fallback releases/withholds with reasons and evidence;
- candidate survival reasons through rendering.

### Deterministic regression coverage

| Script | Current coverage |
| --- | --- |
| `scripts/run-v2-kitsu-comicvine-contract-regressions.mjs` | Adapter registration; Adult ComicVine-only execution; two-intent isolation; proxy normalization; mixed-source execution; end-to-end lineage; source failure isolation; query evidence excluded from Adult taste scoring. |
| `scripts/run-v2-comicvine-source-certification-regressions.mjs` | Successful 40-row and 25-row fixture paths; stage-count consistency; abort vs timeout vs valid empty vs disabled; identity report; hard rejects; collection/component collapse; duplicate editions; first-issue fallback; restricted withholding; retained-score invariance; non-ComicVine invariance. |
| `scripts/run-v2-comicvine-cert-gap-closure-regressions.mjs` | Hard rejects; preferred identities; semantic-over-issue precedence; collection/omnibus/series dominance; first versus middle issue; restricted evidence; duplicate editions; honest underfill; taste relevance outranking unrelated entity preference. |

### Certification status

**Observed conclusion:** the current **Adult ComicVine V2 contract is deterministically certified** for its mocked transport and entity-policy fixtures. The Phase I matrix verified these scripts green at the authoritative baseline.

It does not certify:

- live API health or response limits;
- Kids, Preteen, or Teen behavior;
- manga volumes;
- the accuracy of regex-derived publication identities on representative live data;
- creator roles, covers, languages, ISBNs, or exact collected contents;
- user-facing recommendation usefulness;
- route ownership;
- GCD equivalence;
- cross-source identity or duplicate collapse.

## Surviving GCD assets

### Current tree

| Asset | Current status | Apparent validity |
| --- | --- | --- |
| `app/api/gcd-proxy/+api.ts` | Live route that forwards an allow-listed `https://www.comics.org/*` URL and returns the body with `no-store`. | Transport utility only. It has no caller in the current V2 source registry and no current regression. It is not an adapter or certification. |
| `gcd` source-setting fields in `screens/SwipeDeckScreen.tsx`, `app/app_admin-web.tsx`, and `app/(tabs)/index.tsx` | Legacy persisted configuration key mapped to ComicVine. | Valid only as a compatibility shim; invalid as evidence that GCD is active. |
| `lastDebugGcdDispatchTrace` and old ComicVine field labels in `SwipeDeckScreen.tsx` | Legacy diagnostic naming and report fields. | Partly stale presentation vocabulary. Current V2 fields are populated separately; many old labels describe retired V1 behavior. |
| `services/bestsellers/bestsellerMatcher.ts` source string checks for `gcd` | Compatibility handling for bestseller records. | Unrelated to a V2 GCD recommendation adapter. |
| `NOVELIDEAS_2.0_NOTES.md` and `Debug_Project_Map_2026-04-10.md` | Historical descriptions of GCD candidates and the old recommender path. | Stale for the Phase I baseline. |
| `docs/CODEX_ARCHITECTURE_AND_SOURCE_AUDIT.md` GCD/ComicVine section | Correct for its earlier snapshot, including the then-current V1 alias. | Historical design record, superseded by V2 commits beginning at `53b5c33` and by V1 retirement. |

### Retired assets

Commit `78b0f82` (and merge counterpart `7d5410e`) retired the V1 engine on 2026-07-23 and deleted:

- `screens/recommenders/gcd/gcdGraphicNovelRecommender.ts` (1,743 lines);
- `scripts/test-gcd-query-regression.mjs`;
- `scripts/run-comicvine-contract-traces.ts`;
- `scripts/smoke-comicvine-adapter.mjs`;
- other V1 smoke/contract helpers.

The last retired file contained:

- GCD HTML search and issue-API parsing;
- ComicVine proxy search;
- ComicVine-specific query anchors, curated fallback titles, scoring, filtering, rescue, and final shaping;
- an exported `getComicVineGraphicNovelRecommendations` alias pointing to a historically named `getGcdGraphicNovelRecommendations`.

Therefore it was not an independent GCD characterization. Its GCD name concealed a later ComicVine implementation with accumulated recommender policy. Restoring it would violate the current architecture and would contaminate a source comparison.

### Historical assumptions that must not be inherited

1. **`gcd` means GCD.** In current persisted settings it means ComicVine.
2. **The retired GCD regression certified GCD quality.** It only statically required broad seed strings and forbade three query strings.
3. **The old recommender is reusable as an adapter.** It mixed transport, curated inventory, source filtering, scoring, rescue, dedupe, and selection.
4. **GCD and ComicVine share one identity.** Current `SourceIdV2` recognizes only ComicVine; future GCD evidence must retain a distinct source identity.
5. **Issue records imply books.** Both sources are issue-centric; a recommendation reading unit must be established explicitly.
6. **Title/root similarity proves duplicate identity.** The historical path used aggressive lexical and franchise roots; the Phase I comparator explicitly forbids title-only overlap.
7. **Curated fallback is source output.** The old ComicVine path injected curated titles. Those titles cannot appear in independent source competence evidence.
8. **Operational return count proves usefulness.** Phase I requires Human Review for that conclusion.

## Minimum graphic-novel source contract

### Contract shape

**Proposed:** each source adapter emits two linked records:

1. `GraphicSourceRecord`: lossless source-native evidence and transport provenance.
2. `GraphicReadingUnitCandidate`: source-neutral normalized identity and recommendation evidence.

The source record is immutable and replayable. The reading-unit candidate contains explicit missing values, confidence, and evidence; it must not silently infer a book from the query that retrieved an issue.

### Required identity fields

Required means the field must exist in the schema. A value may be `unknown` only with explicit missingness and classification evidence.

| Field | Requirement |
| --- | --- |
| `source` | Distinct value such as `comicVine` or future `gcd`; never merged. |
| `sourceRecordType` | Source-native type, separately namespaced. |
| `sourceRecordId` | Stable source-native ID. |
| `sourceParentIds` | Typed source-native links for series/volume/issue/variant parents. |
| `readingUnitKind` | One of `original_graphic_novel`, `collected_edition`, `omnibus`, `compendium`, `manga_volume`, `series_container`, `story_arc`, `single_issue`, `annual`, `one_shot`, `reference`, `artifact`, `unknown`. |
| `identityLevel` | `work`, `series`, `volume`, `issue`, or `edition`. |
| `workIdentity` | Source-native work/arc ID when present; otherwise explicit unknown. |
| `seriesIdentity` | ID, canonical source name, start year/era when available. |
| `volumeIdentity` | ID, normalized number/label, parent series, and whether it is a container or readable publication. |
| `issueIdentity` | ID, normalized number including suffixes/fractions, parent volume/series. |
| `editionIdentity` | Edition/variant ID and relation to the underlying issue/volume when known. |
| `collectedContents` | Typed issue or volume ranges/IDs; empty plus `unknown` is different from an asserted empty collection. |
| `identityConfidence` | `high`, `medium`, `low`, or `unknown`. |
| `identityEvidence` | Source fields and rules supporting every non-native identity conclusion. |
| `externalIdentifiers` | Namespaced map for ISBN-10/13 and other source-supported identifiers; empty is allowed. |

Cross-source canonical IDs must be an output of a later evidence-based identity resolver, not invented by either source adapter.

### Required recommendation fields

| Field | Requirement |
| --- | --- |
| `title`, `subtitle` | Separate source values with normalized display title derived transparently. |
| `creators` | Array of names with role when supplied; missing role remains explicit. |
| `summary` | Source summary plus provenance; empty is allowed and measurable. |
| `formats` | Source-supported formats mapped to shared values with evidence. |
| `audienceSignals` | Explicit ratings, audience labels, or source-backed age evidence only. |
| `maturitySignals` | Source-backed content/rating signals; absence is not “safe.” |
| `genreSignals`, `themeSignals` | Document/source metadata only. Query terms remain separate retrieval provenance. |
| `publicationShape` | Narrative collection, component issue, series container, reference, artifact, or unknown. |
| `seriesOrder` | Volume/issue order plus whether it appears to be a viable entry point; raw order fact is distinct from recommendation policy. |
| `language` | Language code/name when supplied; explicit unknown otherwise. |
| `publisher`, `publicationDates` | Source values with date type (`cover`, `store`, `key`, etc.). |
| `sourceUrl` | Stable detail link for attribution and review. |

### Optional enrichment fields

- cover/image references and image rights provenance;
- creator biographies or alternate names;
- creator roles beyond writer/artist;
- character, team, location, concept, and franchise links;
- story-arc membership;
- awards, reviews, staff ratings, or popularity;
- page count and dimensions;
- imprint/brand/indicia publisher detail;
- first-appearance metadata;
- prices and market information;
- detailed story contents.

Optional fields must contribute to measured coverage. Their absence must not be silently replaced with query tokens.

### Source-specific metadata that must remain namespaced

Examples include:

- ComicVine `resource_type`, `deck`, `api_detail_url`, `site_detail_url`, `concept_credits`, and wiki-specific entity links;
- GCD `key_date`, indicia publisher, brand emblem, descriptor, index status, variant fields, and `story_set`;
- source response codes, offsets, cursors, and schema versions.

These fields may support a shared normalized fact. They must not themselves become shared recommendation policy, a source-quality bonus, or a reason to prefer one provider.

### Transport and replay contract

Each independent run must record:

- canonical request purpose and exact request with secrets redacted;
- source, endpoint, method, query, filters, field list, limit, offset/cursor, and page;
- request order and concurrency;
- capture timestamp and elapsed time;
- connection/header/body completion facts when observable;
- total source deadline and per-request deadline;
- every retry, delay, retry reason, and final disposition;
- HTTP status and source-native status/error code;
- response content type, declared count, page count, total count, and ordering;
- rate-limit headers/state when supplied;
- authentication mode and credential presence, never credential values;
- raw-body SHA-256 and fixture SHA-256;
- source schema/version indicators when supplied;
- cache status;
- terminal state from the shared Phase I vocabulary.

Fixture replay must:

- make no network request;
- preserve record IDs and returned order;
- preserve pagination boundaries;
- replay failures and partial pages;
- produce byte-stable structured artifacts without generation timestamps;
- identify the source-capture terms and redistribution status.

## Proposed frozen profile matrix

The same exact swipe evidence, age band, format intent, target size, and characterization purpose must be used for both sources. Profiles are not to be broadened when one source underfills.

| ID | Age | Preserved intent | Characterization purpose |
| --- | --- | --- | --- |
| `gn-adult-speculative-ensemble` | Adult | Speculative graphic novels; ensemble/found-family; adventurous; avoid reference/art books | Broad narrative discovery and creator/publisher diversity. |
| `gn-adult-horror-mystery` | Adult | Atmospheric horror/mystery graphic novels; avoid gore-only and non-narrative guides | Genre/tone metadata, maturity evidence, and collection entry points. |
| `gn-teen-fantasy-adventure` | Teen | Teen fantasy/adventure graphic novels; friendship/identity; avoid adult crossover | Audience authority, maturity, query-only evidence, and collection quality. |
| `gn-teen-superhero-identity` | Teen | Teen superhero/identity stories; accessible entry points; avoid middle issues | Franchise pressure, first-entry quality, issue contamination, and crossover. |
| `gn-preteen-humor-adventure` | Preteen | Preteen humorous adventure graphic novels; age-appropriate stakes | Younger-reader evidence and honest underfill. |
| `gn-teen-manga-volume` | Teen | Teen manga volume; fantasy/adventure; viable series entry | Whether either source can distinguish manga volumes and series order. |

Add source-contract fixtures, not reader profiles, for:

- collection plus component issues;
- omnibus plus contained volumes;
- two editions/variants of the same publication;
- same title from different series eras;
- annual, one-shot, issue one, and middle issue;
- art/reference/activity artifacts;
- missing summary/creator/order metadata;
- valid empty, invalid response, timeout, rate limit, and partial pagination.

The first comparison report should mark a profile unavailable until both sources have independently frozen artifacts for that exact profile.

## Proposed comparison measurements

### Lifecycle

- planned, attempted, intentionally skipped, failed, timed out, rate limited, or valid empty;
- raw records and pages;
- structurally valid records;
- reading-unit classified records;
- accepted after source contract;
- normalized;
- final eligible;
- selected;
- honest underfill.

### Identity and reading-unit quality

- identity-level and reading-unit-kind histograms;
- unknown/low-confidence identity rate;
- component-issue contamination;
- middle-issue selection rate;
- collection-to-component ratio;
- original graphic novel, collected edition, omnibus, and manga-volume coverage;
- valid series-entry rate;
- later-volume pressure;
- edition/variant pressure;
- ambiguous family clusters;
- deterministic collapse rate and reasons;
- exact-edition overlap, reading-unit overlap, and work-family overlap reported separately;
- unresolved cross-source matches, never forced matches.

### Metadata coverage

- stable native ID;
- series/volume/issue/edition relationships;
- title/subtitle/numbering;
- creator names and roles;
- summary;
- publisher;
- dates;
- language;
- audience and maturity;
- genre/theme;
- character/franchise;
- cover reference and rights provenance;
- external identifiers;
- collected-content ranges.

Coverage measures presence, not accuracy.

### Composition

- unique creators, publishers, franchises, series, genres, themes, and formats;
- concentration by creator, publisher, franchise, and series;
- duplicate identities;
- query-family contribution;
- fallback contribution;
- selected-rank stability across repeated live captures.

### Transport and reproducibility

- latency distribution;
- request/page count;
- completion within bounded total time;
- retry/rate-limit incidence;
- repeated-request returned IDs and ordering;
- missing IDs between captures;
- fixture-replay determinism.

### Human Review

Use the locked Human Review sidecar model and add graphic-specific concerns already anticipated by its taxonomy:

- wrong format;
- age or maturity;
- poor series entry;
- duplicate/near duplicate;
- franchise overconcentration;
- misleading or insufficient metadata;
- individually valid but bad for slate.

No source quality or route ownership conclusion is valid before review coverage is reported.

## Framework reuse decision

### Reuse directly

- Phase I terminal-state vocabulary;
- immutable fixture/replay discipline;
- production-hash guards;
- no-network and determinism checks;
- candidate lineage and source-artifact hashes;
- underfill and failure reporting;
- metadata coverage and diversity envelopes;
- append-only Human Review linkage;
- separation of machine evidence from interpretation.

### Narrow extension required

1. Add a `graphicReadingUnitIdentity` object to characterization artifacts.
2. Add source-native ComicVine and GCD fixture loaders; do not generalize production adapters first.
3. Add exact-edition, reading-unit, and work-family match strategies with evidence/confidence.
4. Make ambiguous identity a reported result.
5. Add series-entry, component-issue, collection, variant, and manga measurements.
6. Keep source-native scores incomparable.

The locked Comparison Harness should not be modified during independent characterization. A reviewed graphic identity extension should be additive and versioned before it consumes the two frozen source artifacts.

## API, licensing, authentication, and reproducibility blockers

### ComicVine

**External constraints from official ComicVine documentation:**

- API key requires an account.
- Terms state non-commercial use only.
- Published limit is 200 requests per resource per hour plus velocity detection; caching is recommended.
- Attribution/linkback is required.
- Redistribution/manipulation restrictions apply, and access may be refused.
- Search supports issue and volume resource filters, limit and offset, while the current NovelIdeas adapter searches only issues.

**Required decision before live corpus capture:** confirm that NovelIdeas' deployment, stored fixture payloads, generated artifacts, and Human Review cards comply with ComicVine's non-commercial, attribution, and redistribution terms.

### GCD

**External constraints from official GCD documentation:**

- Database/schema/distribution data is CC BY-SA 4.0 except where noted.
- Cover images have separate reserved rights.
- The current REST API is described as initial: endpoint URLs are stable, fields and formats are not.
- Anonymous API access currently has hourly limits; authenticated access has larger limits; anonymous access may later be disabled.
- Authentication is documented as Basic or session authentication.
- Current documented search centers on series name/year and issue lookup; recommendation-style full-text discovery is not an established contract.

**Required decisions before live corpus capture:**

- define attribution and ShareAlike handling for fixtures and derived artifacts;
- exclude or separately license cover binaries;
- obtain/define an authenticated access path if anonymous reproducibility is inadequate;
- freeze raw response hashes and schema observations because fields are explicitly unstable;
- verify that the intended discovery workload is acceptable to GCD rather than assuming the retired HTML-scraping approach is supported.

### Repository-specific blockers

- No GCD adapter contract or fixture corpus exists.
- `SourceIdV2` cannot represent GCD independently.
- The active GCD proxy is untested and accepts arbitrary allow-listed GCD URLs rather than a typed query contract.
- Current cross-source identity cannot distinguish graphic reading units safely.
- ComicVine's current live adapter does not expose sufficient fields for the proposed contract.
- ComicVine younger-age behavior and manga are uncertified.
- Old UI/report names can cause investigators to confuse current V2 evidence with retired V1 telemetry.

## Likely implementation files after review

This is a forecast, not authorization to edit them.

### Diagnostic characterization

- `scripts/source-competence/`:
  - new source-neutral graphic contract/schema helper;
  - ComicVine and GCD fixture replay modules;
  - frozen profile definitions;
  - source-native fixture sets;
  - deterministic regressions and documentation.
- `scripts/comparison-harness/`:
  - later, a versioned graphic identity extension or adapter;
  - graphic comparison fixture and regressions only after both certifications freeze.
- `docs/`:
  - independent ComicVine characterization;
  - independent GCD characterization;
  - reviewed comparison report;
  - API/licensing decision record.

### Potential production work, explicitly deferred

- `app/recommender-v2/types.ts` for a distinct GCD source and shared graphic identity;
- a new `app/recommender-v2/sources/gcdSource.ts`;
- a source-neutral graphic reading-unit identity module;
- `normalize.ts`, `engine.ts`, and diagnostics serialization;
- typed proxy changes or replacement of `app/api/gcd-proxy/+api.ts`;
- UI/admin migration away from the legacy `gcd` key;
- shared policy extraction from `comicVineAdmission.ts`.

None of these production files should change during the next independent characterization step unless a separately reviewed implementation task authorizes it.

## Recommended next step

Proceed, with conditions, to independent source characterization:

1. Resolve and record ComicVine and GCD fixture/artifact licensing.
2. Approve the source-neutral reading-unit contract and identity confidence rules.
3. Freeze the exact profile matrix.
4. Build fixture-only ComicVine characterization from current V2 response shapes.
5. Build fixture-only GCD characterization against the current official API, not the retired implementation.
6. Add bounded live capture only after authentication/rate/terms gates are satisfied.
7. Freeze each source independently.
8. Extend comparison identity narrowly and compare only equivalent frozen profiles.
9. Apply Human Review before any route-ownership, restoration, replacement, or production-preference decision.

Do not proceed yet to:

- restoring GCD in production;
- copying the retired GCD/ComicVine recommender;
- merging source identities;
- tuning queries or source policy;
- changing eligibility, scoring, ranking, diversity, or selection;
- choosing a “winner.”

## Reference record

### Current repository commits

- `53b5c33` — Add Kitsu and ComicVine V2 source contracts.
- `c734b2d` — Repair ComicVine V2 live traversal diagnostics.
- `ea18365` — Add ComicVine retrieval audit and identity diagnostics.
- `1a34926` — Implement ComicVine Slice 2 source admission policy.
- `9f7e0b0` — Add ComicVine certification gap-closure regressions.
- `54fc91b` — Implement Adult ComicVine entity policy gates.
- `78b0f82` / `7d5410e` — Retire V1 recommender and remove the historical GCD-named implementation.

### Official external references

- ComicVine API terms and key requirements: <https://comicvine.gamespot.com/api/>
- ComicVine resource and field documentation: <https://comicvine.gamespot.com/api/documentation>
- GCD home, API status, and data/cover licensing notice: <https://www.comics.org/>
- GCD current REST API documentation: <https://github.com/GrandComicsDatabase/gcd-django/wiki/API>
- GCD current application repository: <https://github.com/GrandComicsDatabase/gcd-django>
