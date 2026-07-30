# NovelIdeas Completion Roadmap

## Purpose

This roadmap describes the evidence-gated path from the current published `main` branch to a trustworthy, shippable NovelIdeas product. It is a planning record, not an authorization to tune recommendations, change routing, promote a source, or begin ComicVine characterization.

The governing standard is `docs/RECOMMENDATION_PHILOSOPHY.md`: NovelIdeas owns the conceptual model; sources expose evidence rather than behavior; characterization precedes optimization; characterization is itself a deliverable; shared abstractions must earn promotion; and every investigation should leave the architecture stronger. The current architecture map is `docs/CODEX_ARCHITECTURE_AND_SOURCE_AUDIT.md`. Where that point-in-time audit conflicts with current code, current code and later frozen certification records control.

Throughout this roadmap, “green” means that a named, versioned validation manifest passes from a clean checkout. It does not mean that recommendations are useful to readers. Human usefulness remains a separate evidence class.

## 1. Current authoritative state

### Repository baseline

- Authoritative branch at roadmap creation: `main`.
- Authoritative commit at roadmap creation: `4422b85920696ebff246b1acfb3be7d7905f112e` (`Document ComicVine equivalence certification handoff`).
- `main` and `origin/main` were synchronized and the worktree was clean before this documentation change.
- Phase I is preserved at annotated tag `phase1-complete` (`32e22086707c4acc67a7e442499dc8348500178f`); later approved graphic-novel investigation records and fixtures are intentionally ahead of that tag.
- The normal swipe workflow now calls `runRecommenderV2` directly from `screens/SwipeDeckScreen.tsx`. The older audit’s statement that V1 is the default path is historical and must not be used as the current product contract.

### Locked foundation

The repository already contains:

- the Engineering Constitution and recommendation lifecycle in `docs/RECOMMENDATION_PHILOSOPHY.md`;
- the implementation-level architecture audit in `docs/CODEX_ARCHITECTURE_AND_SOURCE_AUDIT.md`;
- deterministic source-competence harnesses under `scripts/source-competence/`;
- the source-comparison harness under `scripts/comparison-harness/` and its contract in `docs/SOURCE_COMPARISON_HARNESS.md`;
- the Human Review design in `docs/HUMAN_REVIEW_MODE_SPEC.md`;
- the Local Collection/Collection Opportunities boundary in `docs/COLLECTION_OPPORTUNITIES.md` and `constants/deploymentCapabilities.ts`;
- frozen Open Library, Google Books, ComicVine, Kitsu, and GCD evidence recorded in `scripts/output/`, `scripts/source-competence/frozen/`, and the certification registry `scripts/output/certified-subsystem-registry.json`;
- the GCD fixture-only characterization in `docs/GRAPHIC_NOVEL_SOURCE_COMPETENCE_PHASE_I.md`;
- the source-neutral reading-unit contract and legal/operational gates in `docs/GRAPHIC_NOVEL_PRE_CHARACTERIZATION_GATES.md`;
- the next approved task boundary in `docs/GRAPHIC_NOVEL_SOURCE_COMPETENCE_PHASE_II_HANDOFF.md`.

### Current implementation shape

`app/recommender-v2/sources/index.ts` registers live V2 adapters for Google Books, Open Library, Kitsu, ComicVine, and NYT, plus the diagnostic mock adapter. `localLibrary` is explicitly `null`. `app/recommender-v2/searchPlan.ts::buildSearchPlan` plans every source, but enablement is controlled by the UI configuration passed through `screens/SwipeDeckScreen.tsx`.

The shared V2 lifecycle is implemented across:

- `app/recommender-v2/tasteProfile.ts`;
- `app/recommender-v2/searchPlan.ts`;
- `app/recommender-v2/sources/*.ts`;
- `app/recommender-v2/normalize.ts`;
- `app/recommender-v2/score.ts`;
- `app/recommender-v2/select.ts`;
- `app/recommender-v2/diagnostics.ts`;
- `app/recommender-v2/engine.ts`;
- `screens/SwipeDeckScreen.tsx`.

This is the behavior-owning architecture. Source-specific identity and admission contracts such as `comicVineIdentity.ts`, `comicVineAdmission.ts`, `kitsuAdmission.ts`, and Google Books publication-shape logic may expose source evidence, but they must not become independent recommendation engines.

### Known completion gaps

- No Human Review implementation exists; only the specification exists.
- No operational Local Library adapter exists. `screens/AdminCollectionUploadScreen.tsx` is a placeholder with hard-coded Supabase placeholders, optional dependencies not declared in `package.json`, and an unimplemented import function.
- Collection Opportunities is deliberately `planned_not_implemented`.
- No `.github` workflow and no `eas.json` or equivalent release manifest are present.
- `README.md` remains mostly the default Expo starter README and is not an operator or deployment guide.
- `app.json` still uses the generic package `com.anonymous.novelideas` and provides no explicit release-channel or environment strategy.
- The repository has many deterministic scripts, but there is no single authoritative package command that enumerates the complete regression matrix.
- Live-source health, human usefulness, device coverage, accessibility, privacy, security, and production telemetry are not certified by the existing fixture suites.
- A tracked `.env` exists while `.gitignore` ignores only `.env*.local`. Its contents were not inspected for this roadmap. Secret history and configuration handling require an explicit security audit before release.

## 2. Governing execution sequence

NovelIdeas should advance by reducing one uncertainty at a time:

```text
Frozen baseline
    -> independent characterization
    -> equivalence certification
    -> comparison
    -> representative frozen/live observation
    -> Human Review
    -> engineering hypothesis
    -> production experiment
    -> release validation
    -> monitored launch
```

No phase may borrow a conclusion from a later evidence class. Deterministic fixtures establish contracts and reproducibility. Frozen characterization establishes observed composition under known evidence. Live probes establish point-in-time transport and source behavior. Human Review establishes judged usefulness for the reviewed cases. Production telemetry establishes longitudinal behavior in the deployed product.

Every implementation phase must use this gate card:

- **Objective:** the single uncertainty being reduced.
- **Prerequisites:** frozen inputs and decisions required before work starts.
- **Deliverables:** code, fixtures, artifacts, reports, and operator documentation.
- **Deterministic acceptance:** exact commands and invariants that must pass.
- **Stop conditions:** facts requiring architectural, legal, product-owner, or security review.
- **Unsupported conclusions:** claims the phase cannot justify.
- **Merge/lock:** the commit, tag, registry update, and artifact freeze that close the phase.

A phase is not complete merely because its code exists. It is complete only when its evidence is reproducible from a clean checkout and its unsupported conclusions are documented.

## 3. Immediate next phase: ComicVine equivalence certification

The next authorized engineering task is exactly `docs/GRAPHIC_NOVEL_SOURCE_COMPETENCE_PHASE_II_HANDOFF.md`. It is not source comparison and not recommendation tuning.

- **Objective:** produce ComicVine fixture artifacts that are evidence-class, measurement, contract, and profile equivalent to the frozen GCD characterization, so a later comparison is scientifically valid.
- **Prerequisites:** preserve GCD commit `17760a4`; use Fixture Class evidence only; use the same six frozen profiles; apply the five-layer reading-unit contract without importing ComicVine production policy into the source-neutral mapper.
- **Exact profile/control set:** `gn-adult-speculative-ensemble`, `gn-adult-horror-mystery`, `gn-teen-fantasy-adventure`, `gn-teen-superhero-identity`, `gn-preteen-humor-adventure`, `gn-teen-manga-volume`, plus equivalent valid-empty and invalid-response controls.
- **Characterization tasks:** create wholly synthetic ComicVine-shaped fixture rows; map source record, publication, readable work, reading unit, and recommendation identity; preserve issue/trade/omnibus distinctions; represent unavailable fields and ambiguous mappings explicitly; compute the exact GCD measurements with identical denominators; verify Fixture Class/no-network provenance; generate a frozen artifact and immutable hash; and issue a separate evidence-class/measurement/contract/profile equivalence determination.
- **Deliverables:** ComicVine source-neutral fixtures, mapper output, deterministic runner, frozen artifact, equivalence matrix, characterization report, and a mandatory **Unsupported Conclusions** section.
- **Deterministic acceptance:** no network access; repeated runs are byte-identical; all GCD characterization locks remain green; `npm run test:v2:comicvine-source-certification` and `npm run test:v2:comicvine-cert-gap-closure` remain green; production hashes and recommendation outputs remain unchanged; `git diff --check` passes.
- **Stop conditions:** the reading-unit contract cannot represent a ComicVine entity; an equivalent profile or measurement cannot be produced without changing methodology; live access is required; licensing interpretation is required; or production policy would influence the neutral mapper.
- **Unsupported conclusions:** no source comparison, superiority, usefulness, route ownership, operational preference, production suitability, or multi-source design.
- **Merge/lock:** merge one bounded characterization series, freeze the artifact, record its evidence class and contract version, and update the certification registry only if all four equivalence dimensions pass. If any dimension fails, lock the result as `comparison_unavailable_*`, not as a defective-source verdict.

## 4. Graphic-novel comparison phase

This phase begins only after equivalence certification succeeds without modifying comparison methodology.

- **Objective:** compare equivalent GCD and ComicVine evidence and report their relative identity competence, discovery competence, schema richness, evidence completeness, and operational/legal constraints.
- **Prerequisites:** frozen GCD and ComicVine artifacts with identical profile IDs, measurement definitions, contract version, and evidence class; the asymmetry rules in `docs/SOURCE_COMPARISON_HARNESS.md`.
- **Deliverables:** immutable comparison input manifest, generated comparison artifacts, overlap/uniqueness and completeness tables, asymmetry report, and evidence-separated observations, interpretations, hypotheses, and conclusions.
- **Deterministic acceptance:** artifact identities and checksums are recorded; source ordering does not change results; title-only identity matching is rejected; unavailable comparisons remain explicit; repeated runs are byte-identical; existing comparison regressions and both source locks pass.
- **Stop conditions:** evidence-class, measurement, lifecycle, contract, or profile asymmetry; ambiguous cross-source identity requiring a policy decision; licensing prevents use of an artifact; or a proposed conclusion exceeds the evidence.
- **Unsupported conclusions:** human recommendation quality, route ownership, source replacement, production activation, or licensing clearance.
- **Merge/lock:** merge and freeze the comparison as an engineering observation. Do not alter adapters or routing in the same change.

The comparison should be a competence map, not a winner ranking. A plausible supported outcome is that one source supplies stronger identity evidence while another supplies a stronger discovery surface.

## 5. Representative frozen and live validation

After deterministic comparison, validate whether the frozen evidence resembles current external behavior.

- **Objective:** separate contract stability from point-in-time source transport and composition.
- **Prerequisites:** frozen comparable profiles and artifacts; approved API access; documented rate budgets; rights-holder or legal clarification where required by `docs/GRAPHIC_NOVEL_PRE_CHARACTERIZATION_GATES.md`.
- **Deliverables:** replay-safe request manifests, timestamps, endpoint and schema versions, latency/timeout/retry traces, returned IDs and ordering, missing-field/completeness distributions, redacted raw-response captures where terms permit, and frozen/live deltas.
- **Deterministic acceptance:** replay mode reproduces the captured result without network; live mode is bounded; secrets are absent from artifacts; source failures are classified as skip, transport failure, empty, filtered-to-zero, or unsupported rather than collapsed into “no results.”
- **Stop conditions:** unclear ComicVine non-commercial compatibility; unclear GCD attribution/ShareAlike implications; cover redistribution uncertainty; missing access credentials; unstable schema that cannot be captured safely; or a request rate that cannot be bounded.
- **Unsupported conclusions:** long-term stability from a short probe, recommendation usefulness, production readiness, or commercial permission.
- **Merge/lock:** commit only terms-compliant metadata and redacted evidence. Record live observations separately from deterministic certification.

### Representative Frozen evidence

Capture a terms-compliant, immutable sample using approved credentials and a predeclared profile/request matrix. Record raw source IDs, ordering, schema presence, identity classifications, evidence-completeness denominators, timestamps, endpoint/version, and capture hash. A frozen capture can support repeatable characterization; it cannot establish ongoing availability.

### Live Observation evidence

Run the same bounded request manifest repeatedly without persisting prohibited fields. Record authentication path, rate-limit headers, latency, timeout/retry path, order/composition variance, schema drift, and cover availability separately for GCD and ComicVine. Live observations must never overwrite the Representative Frozen artifact or be fed into deterministic comparison as though they were Fixture Class evidence.

This phase must not normalize live results until they resemble fixtures. Differences are findings.

## 6. Graphic-novel production decision gate

Only after independent characterization, valid comparison, live observation, and Human Review may NovelIdeas decide whether the platform changes.

- **Objective:** choose among ComicVine-only, GCD-only, role-specialized dual source, neither source, or continued investigation.
- **Prerequisites:** sections 3–5 complete; representative Human Review complete; licensing and operational questions resolved; total latency and failure budgets measured.
- **Deliverables:** architecture decision record defining each source’s permitted role, age bands, activation rules, identity authority, discovery authority, failure semantics, attribution obligations, and rollback plan.
- **Deterministic acceptance:** proposed configuration is exercised in fixtures; existing selected outputs remain unchanged outside explicitly approved profiles; source failures cannot bypass shared eligibility; deduplication is source-neutral; diagnostic lineage identifies discovery and enrichment provenance separately.
- **Stop conditions:** legal ambiguity; inability to preserve identity provenance; unacceptable latency or quota risk; insufficient human-review coverage; or no configuration improves the reviewed system outcome.
- **Unsupported conclusions:** global superiority from a bounded profile matrix or quality claims for unreviewed age bands.
- **Merge/lock:** the decision record merges before production code. Any implementation follows as a separately reviewable, reversible experiment with feature flags and a frozen control.

## 7. Existing source completion by source and age band

The current registry proves selected contracts, not end-to-end product competence. Each source needs a transparent completion ledger.

### Current source ledger

| Source | Production/architecture state | Deterministic state | Live state | Human Review | Blocker / remaining work | Lock criterion |
| --- | --- | --- | --- | --- | --- | --- |
| Open Library | Enabled V2 adapter across planned age bands; most mature recovery and lineage implementation | Adult R1 registered; routing/lineage and Phase I competence fixtures exist; age-profile labels are not quality certificates | Prior bounded observations exist, but no current release-health contract | Not implemented | Formalize age-by-age registry states; K–2 remains pending; review representative output; validate resilience | Named age routes have explicit certification/review/support states and all OL locks pass |
| Google Books | Enabled V2 narrative-book adapter across Kids, Preteen, Teen, Adult | D1 Kids, D2 Preteen, E1 Teen frozen; Phase I competence characterization includes Adult | Live quota, latency, search composition, and retry behavior are not release-certified | Not implemented | Formalize Adult state; characterize live failure/composition; decide unsupported versus incomplete youth outcomes from evidence | Registry, live, and review state agree for every enabled age route |
| ComicVine | Enabled V2 graphic/comic adapter; shared pipeline owns final recommendation behavior | Adult EP1 entity policy frozen; source-neutral equivalence work not begun | Current production access is not equivalent characterization evidence | Not implemented | Section 3, licensing, explicit age scope, live proxy/resilience, then comparison/review | Four-dimensional equivalence locked; later production role has a reviewed decision record |
| Kitsu | Enabled V2 manga/anime-specialist adapter | Adult K1 frozen; mocked baseline and contract suites exist | Registry records one 20/20 reliability probe, not longitudinal competence | Not implemented | Explain Teen versus Adult product role; representative characterization/review; enrichment failure contract | Every enabled route is characterized, reviewed, operationally bounded, and registry-backed |
| NYT | Enabled V2 list/authority adapter with quota/retry diagnostics | No registry entry or dedicated package gate | Not release-certified | Not implemented | Define purpose; fixture-certify attribution/admission/failure states; characterize Teen and Adult separately | Dedicated deterministic lock, explicit route support, live bounds, reviewed value |
| Local Library | Planned source; `sourceAdapters.localLibrary` is `null` | Placeholder regression only | Not operational | Not implemented | Complete section 8 or keep disabled and unadvertised | Catalog membership, isolation, local-only selection, and user promise certified |
| GCD | No production adapter; fixture-only characterization | Phase I fixture evidence frozen | Live access expressly not authorized | Not implemented | Equivalent ComicVine evidence, legal/access review, then later comparison | No production lock is possible before later decision gate |

“Remaining tuning” is deliberately **none authorized** for every row until characterization, equivalent comparison where relevant, and Human Review yield a bounded engineering hypothesis.

### Current age-band ledger

| Age band | Current evidence | Explicitly unproven | Completion/lock criterion |
| --- | --- | --- | --- |
| Kids / K–2 | Google Books D1 admission is certified; Open Library code path and K–2 deck exist | Human usefulness; live composition; formal Open Library K–2 profile; non-book source support | Supported sources are named, fixture/live/review gates pass, and unsupported sources cannot dispatch |
| Pre-Teens | Google Books D2 is certified; Open Library middle-grades path is locked and highly instrumented | Cross-source usefulness; representative live stability; local shelf/audience semantics | Representative profiles pass deterministic, live, safety, and Human Review gates without forced fill |
| Teens | Google Books E1 is certified; Open Library Teen path is locked; graphic/manga adapters exist | Comparable graphic evidence; graphic route ownership; Human Review; exact ComicVine/Kitsu launch scope | Book and any enabled graphic/manga routes have independent locks, live bounds, and reviewed slates |
| Adults | Open Library R1, ComicVine EP1, and Kitsu K1 are registered; Google Books Adult is characterized | Unified formal support ledger; Human Review; live release behavior; source licensing suitability | Every enabled source has a declared purpose and release gate; representative slates meet approved review thresholds |

### Open Library

Current evidence: a deeply instrumented V2 adapter (`openLibrarySource.ts`), locked age profiles (`openLibraryProfiles.ts`), routing and lineage regressions, and the Adult R1 recommendation certification registered in `scripts/output/certified-subsystem-registry.json`. The Phase I competence harness also includes Teen, Preteen, underfill, artifact-heavy, and valid-empty cases.

Remaining gates:

- Kids/K–2: replace the explicit pending profile status with a deliberate characterize-or-do-not-support decision.
- Preteen and Teen: reconcile which frozen fixtures constitute formal registry certification, then conduct Human Review rather than infer usefulness from route locks.
- Adult: preserve R1, add representative live composition and review coverage.
- All ages: validate proxy/direct behavior, post-header timeout recovery, rate/circuit behavior, cover reliability, and diagnostic invariants without query tuning.

Merge only when each age band has an explicit state: `contract_certified`, `characterized_only`, `human_reviewed`, `unsupported`, or `not_yet_evaluated`.

### Google Books

Current evidence: D1 Kids, D2 Preteen, and E1 Teen admission contracts are frozen and fully certified in the registry; `docs/GOOGLE_BOOKS_SOURCE_CERTIFICATION.md` characterizes representative Adult and youth profiles; numerous publication-shape, lineage, ranking, and query regressions exist.

Remaining gates:

- make Adult’s formal registry status match the existing characterization and regression evidence;
- run bounded live quota/403/429/latency/composition observations;
- establish whether Kids’ filtered-to-zero behavior is an intentional unsupported route or a product gap, without weakening policy;
- Human Review representative outputs for every claimed age/route;
- define V2 retry and source-budget contracts explicitly rather than inherit assumptions from legacy code.

### ComicVine

Current evidence: V2 adapter, identity and admission contracts, Adult EP1 deterministic certification, and current production controls. The repository does not yet contain source-neutral characterization equivalent to GCD.

Remaining gates: complete sections 3–6; define age-band support explicitly; resolve non-commercial and persistence/cover questions; prove live proxy behavior; and preserve the distinction between issue/volume evidence and patron-facing reading units.

### Kitsu

Current evidence: V2 adapter, admission policy, Adult K1 mocked certification, a recorded 20/20 live reliability probe, and contract regressions. Its intended role is manga/anime-specialist evidence, not general book retrieval.

Remaining gates: reconcile Adult certification with actual product activation; explicitly characterize Teen manga competence if Teen is a supported product route; add profile-equivalent Human Review; verify category-enrichment latency and failure behavior; document whether ComicVine enrichment is optional evidence or a hard dependency.

### NYT

Current evidence: V2 adapter with quota, retry, list, ISBN, and fetch diagnostics. No NYT entry exists in the certification registry and no dedicated package test command protects the adapter.

Remaining gates: define the source’s exact role as authority/popularity enrichment; create deterministic adapter and admission fixtures; verify source attribution through normalization/rendering; characterize Teen and Adult separately; test quota exhaustion, retry-after, partial list failure, and valid empty; Human Review whether bestseller evidence helps rather than distorts fit.

### Local Library

Current evidence: source ID, UI toggle gate, capability placeholder, and a nonfunctional collection-upload screen. No V2 adapter or certification exists.

Remaining gates are section 8. Until then the only correct production state is unsupported/disabled, never silent global-source fallback marketed as Library Mode.

### Cross-age acceptance

For Kids, Preteen, Teen, and Adult, create a versioned support matrix whose rows are sources and whose columns separately state:

- contract certification;
- frozen characterization;
- live health;
- Human Review coverage;
- operational/legal clearance;
- production activation.

Absence in one column must not be inferred from another. A source may be transport healthy and not appropriate for an age band; it may be contract certified and not useful; it may be useful and not legally suitable for the intended deployment.

## 8. Local Collection and Collection Opportunities

Local Collection is a product capability, not merely another HTTP adapter.

- **Objective:** make customized-library mode truthfully recommend only holdings owned by that library, while keeping Collection Opportunities a separate librarian-facing analytic capability.
- **Prerequisites:** Ken chooses the deployment model, catalog authority, supported import formats, hosting/data processor, retention policy, authentication model, and whether patrons may ever fall back to global sources. Privacy and school/district requirements are reviewed.
- **Deliverables:** versioned local-record schema; MARC/CSV import contract; validation and reject report; idempotent library-scoped storage; source-neutral identity mapping; `localLibrary` V2 adapter; provenance/availability fields; audience and shelf-placement fields kept as evidence rather than automatic age truth; mixed Adult/Teen/Preteen holdings fixtures; admin status UI; import rollback; fixture competence suite; representative profiles; Human Review; Library Mode end-to-end tests; operator runbook.
- **Deterministic acceptance:** same import yields the same catalog; malformed records are reported without partial corruption; tenant/library isolation is tested; recommendations contain only local holdings when policy is `local_collection_only`; empty/underfilled local results remain honest; global fallbacks cannot leak across the boundary; no patron-level demand data is collected.
- **Stop conditions:** no authoritative catalog identifier; ambiguous tenant boundary; unapproved cloud processor; unsupported MARC semantics; inability to prove collection membership; or product request to fill from global sources without changing the patron promise.
- **Unsupported conclusions:** acquisition need, circulation demand, reader usefulness, or collection adequacy from catalog presence alone.
- **Merge/lock:** first lock import and membership correctness. Then lock recommendation integration. Do not implement Collection Opportunities in the same phase.

The local source’s routing purpose must be explicit: it constrains the candidate universe to verified holdings in customized-library mode. Shelf location, collection code, call number, and catalog audience labels may inform normalization and safety, but shelf placement alone must not define patron age. Availability is time-sensitive evidence and must remain distinct from bibliographic ownership. Cross-source duplicate resolution must prefer strong identifiers and preserve the local holding even when external metadata enriches it.

Collection Opportunities begins only after Local Collection is trustworthy:

- use anonymous, aggregated, thresholded demand evidence;
- keep collection-gap analysis distinct from acquisition suggestions;
- require librarian review and auditable dispositions;
- never alter patron ranking or collect data merely because the capability exists;
- preserve `constants/deploymentCapabilities.ts` invariants and `scripts/run-collection-opportunities-placeholder-regressions.mjs`.

## 9. Swipe-card evidence enrichment and profile quality

The recommender can only infer reader intent from the evidence encoded by swipe cards and feedback.

- **Objective:** establish that Kids, Preteen, Teen, and Adult decks provide balanced, interpretable evidence for the Taste Profile without using recommendation outcomes to tune cards circularly.
- **Prerequisites:** freeze current decks in `data/swipeDecks/`; define each card’s intended evidence families; preserve like, dislike, and skip semantics in `SwipeDeckScreen.tsx::swipeHistoryToV2Signals`.
- **Deliverables:** inventory of displayed and currently hidden card metadata; deck schema validation; duplicate/coverage/polarity reports; small candidate trait vocabulary shared with book candidates; trait provenance and confidence; age-appropriate copy and imagery review; positive/negative/contradictory aggregation rules; representative swipe-session fixtures; documented minimum evidence and early-stop behavior; before/after profile and recommendation comparison artifacts.
- **Deterministic acceptance:** TS and JSON deck forms reconcile; stable card IDs; every trait and inferred signal has provenance; hidden semantic evidence never contradicts what the card communicates; dislikes cannot become positive evidence; skip remains non-preference; one card cannot dominate a profile without an explicit rule; contradictions remain visible; session completion is reproducible; deck changes produce explicit profile and recommendation diffs.
- **Stop conditions:** changes would redefine Taste DNA, age/maturity semantics, or recommendation policy; image rights are unclear; representative users cannot understand a card.
- **Unsupported conclusions:** recommendation improvement from broader tag coverage alone.
- **Merge/lock:** version each deck and profile-output baseline. Promote traits gradually, one evidence family at a time. Human Review is required before claiming a deck revision improves reader understanding or recommendations.

Do not begin with a large uncontrolled taxonomy. First identify which existing card facts are already visible or reliably curated, then test whether those same traits can be found with comparable meaning on candidate books.

## 10. Cross-source and cross-domain identity

- **Objective:** converge repeated identity needs without prematurely promoting the graphic-novel reading-unit model to all media.
- **Prerequisites:** evidence from at least two domains showing the same unresolved identity distinction; preserve current Google Books publication identity, Open Library work/edition roots, ComicVine issues/series entries/trades/omnibuses/anthologies/boxed sets, Kitsu manga volumes, NYT ISBN identity, audiobook format distinctions, constituent works, and future local holdings provenance.
- **Deliverables:** shared conceptual vocabulary; source-record, publication, readable-work, reading-unit, series, and recommendation identity interfaces where empirically justified; confidence/evidence requirements; merge/collapse decision records; ambiguity states.
- **Deterministic acceptance:** no title-only merge; editions may collapse without losing publication provenance; unrelated same-title works remain separate; collected works preserve constituents; source contribution remains traceable after merge; selection does not change unless explicitly authorized.
- **Stop conditions:** an abstraction requires source-specific field names; records cannot be merged with sufficient evidence; existing outputs change as a side effect; or only one domain demonstrates the need.
- **Unsupported conclusions:** that one identity model fits every future media type.
- **Merge/lock:** introduce shared contracts in small versioned slices, with before/after identity fixtures and output-invariance tests. Generalization is the final step, not the starting assumption.

## 11. Human Review implementation and evidence collection

Implement `docs/HUMAN_REVIEW_MODE_SPEC.md` only after machine evidence is immutable and comparable.

- **Objective:** collect structured human judgments about whether recommendations fit the represented reader, without allowing reviews to rewrite machine evidence.
- **Prerequisites:** frozen profile/run IDs; immutable recommendation cards; privacy decision for reviewer identity; rubric version; reviewer training and disagreement policy.
- **Deliverables:** representative profile suite; exact input and output hashes; offline-first review artifact schema; CLI or isolated review UI; append-only candidate judgments; separate slate judgments; fit, safety, crossover, series-entry, maturity, and usefulness fields; reviewer confidence/uncertainty; concern taxonomy; insufficient-information state; engine-version comparison; export/import; coverage and disagreement reports; checksums linking review to machine artifact.
- **Deterministic acceptance:** machine fields cannot be edited; unreviewed is not approval; rubric versions never mix silently; duplicate review imports are idempotent; reviewer identity is pseudonymous/minimized; aggregation denominators are explicit; comparison harness can attach reviews without changing its machine metrics.
- **Stop conditions:** review requires patron personal data; reviewers see information that invalidates the intended blind judgment; profile ambiguity prevents a fair assessment; or product decisions about reviewer authority, minimum coverage, acceptance thresholds, adjudication, or sampling remain unresolved.
- **Unsupported conclusions:** population-wide quality from a small review set, causal production improvement, or source superiority outside equivalent reviewed profiles.
- **Merge/lock:** lock the artifact contract before UI polish. Freeze a representative reviewed baseline and publish fit, concern, abstention, coverage, and inter-reviewer disagreement separately. Never collapse machine evidence and human judgment into an unexplained combined score.

Human Review is mandatory before claiming recommendation usefulness, selecting route ownership, promoting a graphic-novel source strategy, accepting a swipe-evidence change, or approving public-launch quality thresholds.

## 12. Diagnostics integrity and observability

Diagnostics are part of correctness.

- **Objective:** make every recommendation explainable from request through rendering, across all sources and recovery paths.
- **Prerequisites:** current `SourceFetchDiagnosticV2`, `SourceDiagnosticV2`, selection diagnostics, compact Codex export, and prior lineage repairs remain frozen controls.
- **Deliverables:** versioned diagnostic schema; lifecycle event model; per-query and per-candidate lineage IDs; source/identity provenance after merge; retry/recovery/reselection attribution; rendered-drop reasons; privacy/redaction policy; bounded export and support bundle.
- **Deterministic acceptance:** aggregate and per-query counts reconcile; each rendered item has a selected candidate; every selected candidate has normalized source evidence; recovery titles are attributed to the exact attempt; no secret or raw patron identifier appears; diagnostic serialization is stable and size-bounded; instrumentation changes do not alter recommendation arrays.
- **Stop conditions:** an invariant fails in production behavior rather than serialization; fixing diagnostics would require changing policy; or instrumentation captures copyrighted/private data beyond approved need.
- **Unsupported conclusions:** that detailed logging proves quality.
- **Merge/lock:** every diagnostic repair must include byte-for-byte recommendation-output invariance. Version schema changes; do not rename or delete fields without migration.

Specific debt to resolve includes source attribution through rendering, consistent lifecycle terminal states for all adapters, and moving the current giant screen-level report assembly toward tested diagnostics modules without changing behavior.

## 13. Performance, resilience, and external-source behavior

- **Objective:** keep recommendation latency bounded and failures honest under real external-source conditions.
- **Prerequisites:** per-source latency budgets and desired total user wait chosen; approved API credentials; deterministic timeout/retry fixtures.
- **Deliverables:** connection/header/body timing; bounded retries with jitter rules; concurrency and rate budgets; cancellation; circuit behavior; cache policy; replayable failure fixtures; UI degraded/underfill states; source-health dashboard or probe report.
- **Deterministic acceptance:** no runaway retry; ordinary success is not duplicated; parent cancellation stops child work; total budget is bounded; partial source failure preserves eligible results; fully failed sources cannot masquerade as valid empty; quota and timeout paths are distinguished; successful ordering is stable.
- **Stop conditions:** provider terms prohibit needed caching; a retry can exceed the product budget; source variability makes frozen comparison invalid; or graceful degradation would violate Library Mode.
- **Unsupported conclusions:** long-term reliability from short probes.
- **Merge/lock:** lock transport contracts independently of recommendation quality. Use fault injection for Google Books, Open Library, ComicVine, Kitsu, and NYT before changing any production deadline.

Operational targets must be chosen rather than invented in code: p50/p95/p99 latency, maximum recommendation wait, per-source timeout, total retry budget, acceptable underfill, and outage behavior all require Ken’s product decision.

## 14. Product completion

The repository is a functioning recommendation experience but not yet a finished distributable product.

- **Objective:** complete the patron and librarian workflows without changing recommendation policy as incidental UI work.
- **Prerequisites:** supported platforms, deployment modes, age bands, accessibility target, privacy posture, and launch audience are chosen.
- **Deliverables:** production onboarding; truthful source/mode messaging; complete admin configuration; secure admin access appropriate to deployment; collection import status if Library Mode ships; recommendation explanations and feedback behavior; empty/error/offline states; reset/data deletion; help/about/privacy/attribution screens; polished assets and package identity; operator documentation.
- **Deterministic acceptance:** navigation smoke tests; state persistence and reset tests; no hidden debug controls in release builds; admin settings validate and round-trip; all user-facing “coming next” or placeholder claims are removed or gated; recommendation underfill and source failure are represented honestly.
- **Stop conditions:** product promise exceeds implemented behavior; administrator PIN is being treated as strong authentication; Local Collection is presented while unsupported; or privacy/legal text lacks owner approval.
- **Unsupported conclusions:** usability, accessibility, or trustworthiness without representative user evaluation.
- **Merge/lock:** lock a release-candidate feature inventory. Defer nonessential features rather than leave visible placeholders.

Particular repository gaps include:

- `screens/AdminCollectionUploadScreen.tsx` cannot operate as committed;
- QR hosted-config import text says app-side auto-import is future work;
- several Admin screens describe upload/import as forthcoming;
- feedback is held in screen state and is not yet a governed product telemetry system;
- `README.md`, app identifiers, release assets, and support/operator instructions need product-specific completion.

### Launch blockers

- truthful age-band and mode selection;
- stable swipe progress/completion and reset behavior;
- accessible loading, underfill, empty, timeout, quota, and failure states;
- complete recommendation cards with cover fallback, author/source attribution, explanation policy, and safe next/back/already-read behavior;
- governed save/share/export behavior or explicit deferral;
- keyboard, screen-reader, focus, contrast, text-scaling, reduced-motion, and touch-target validation;
- supported web/iOS/Android device matrix;
- production-safe Admin controls, import/export, and configuration validation;
- privacy, retention, deletion, attribution, and help/support surfaces;
- removal or gating of every nonfunctional "coming next" product promise.

### Deferrable polish

- richer animations;
- additional themes beyond the accessible locked set;
- nonessential social sharing;
- optional discovery visualizations;
- Collection Opportunities;
- unsupported sources and age routes;
- aesthetic cover enhancement that lacks clear rights.

Deferral must be visible in the release inventory; it must not leave a control that appears operational.

## 15. Testing and release engineering

- **Objective:** make a clean checkout capable of proving the product baseline with one documented command.
- **Prerequisites:** enumerate which existing scripts are release gates, characterization tools, live probes, audits, and historical experiments.
- **Deliverables:** canonical deterministic test manifest; package scripts for unit/contract/integration/release checks; CI workflow; pinned Node/npm versions; artifact checksum validation; platform build smoke tests; coverage map by lifecycle/source/age; release checklist.
- **Deterministic acceptance:** clean install from `package-lock.json`; lint; typecheck; all canonical deterministic regressions; competence and comparison locks; no-network fixture verification; `git diff --check`; production bundle/build for supported platforms; no generated tracked drift.
- **Stop conditions:** a failing test encodes a genuine production discrepancy; a stale expectation cannot be proven from history; tests mutate frozen artifacts; or CI needs unapproved external secrets.
- **Unsupported conclusions:** live health or recommendation quality from CI.
- **Merge/lock:** create a versioned release-gate script and registry. Require it on protected `main`. Preserve focused scripts, but stop relying on undocumented manual enumeration.

### Final certification matrix

| Evidence/gate | Required scope | Release effect |
| --- | --- | --- |
| Unit/pure-function tests | Identity, normalization, scoring helpers, diagnostic reconciliation, configuration parsing | Any contract failure blocks |
| Contract regressions | Every enabled adapter, routing plan, eligibility, ranking, recovery, selection, rendering | Any unexplained behavior drift blocks |
| Source competence | Every enabled source/age role | Missing certification blocks that route, not necessarily the whole product if disabled |
| Identity regressions | Publication, readable work, reading unit where promoted, recommendation identity, cross-source merge | Unsafe or ambiguous silent collapse blocks |
| Recommendation comparison | Frozen control versus any proposed behavior change | Missing or worse evidence blocks promotion |
| Human Review | Candidate and slate coverage for every launched age band/route | Safety failure or unmet Ken-approved threshold blocks |
| Live-source observation | Bounded staging probes for every enabled external source | Auth/quota/schema/latency blocker disables source or release |
| Performance/resilience | Total/source budgets, retries, cancellation, low connectivity, partial failure | Unbounded behavior or dishonest fallback blocks |
| Accessibility | Keyboard/screen reader/focus/contrast/scaling/motion/touch targets | Failure against chosen conformance target blocks public launch |
| Supported devices | Clean install and smoke on declared web/iOS/Android matrix | Failure blocks that platform |
| Deployment | Environment validation, proxy/config, terms/attribution, production smoke | Any secret or configuration failure blocks |
| Rollback | Prior build and source-disable recovery drill | Missing verified rollback blocks beta/public launch |

Documented limitations may be accepted only when the affected capability is disabled or the limitation does not violate a launch promise, safety boundary, privacy rule, legal obligation, deterministic invariant, or rollback requirement.

The current absence of `.github` workflows is a release blocker. The large inventory of `scripts/run-*.mjs` is valuable, but scripts not represented in `package.json` or a canonical manifest can be missed. Typecheck and lint must be made genuinely green or have narrowly documented, time-bounded exceptions before launch.

## 16. Deployment, operations, and telemetry

- **Objective:** operate NovelIdeas safely in the intended environment with reproducible builds, protected credentials, and enough telemetry to distinguish product behavior from provider failure.
- **Prerequisites:** hosting/platform choice; institution/commercial status; domain; privacy owner; incident owner; source terms approval; data retention and deletion decisions.
- **Deliverables:** dev/staging/production environments; server-side secret storage; key rotation; environment schema and startup validation; proxy deployment; source allowlists; build/release automation; rollback; status/runbooks; dependency and vulnerability checks; backups where state exists; telemetry schema and dashboards.
- **Deterministic acceptance:** no production secret in client bundles or Git history; staging smoke passes; missing configuration fails clearly; proxy abuse controls are tested; logs redact patron/session content; release is reproducible from a tag; rollback restores the prior build; source attribution obligations appear where required.
- **Stop conditions:** tracked secrets or unresolved secret history; unapproved provider terms; no owner for incidents/privacy; inability to isolate libraries; or telemetry requires identifiable minors’ data.
- **Unsupported conclusions:** recommendation quality from uptime, counts, or clickthrough alone.
- **Merge/lock:** deploy a release candidate to staging first. Production promotion requires signed checklist evidence and a versioned rollback point.

Minimum telemetry should separate:

- app/build version and deployment mode;
- source planned, skipped, attempted, succeeded, empty, filtered-to-zero, failed, timed out, quota-blocked;
- bounded timing by lifecycle stage;
- slate size, honest underfill, and recommendation-session abandonment;
- separately defined reader-success and recommendation-acceptance signals, with already-read, rating, save, next, and retry events interpreted only after privacy and product review;
- anonymous aggregate feedback only after privacy approval;
- diagnostic schema version.

Do not upload raw swipe histories or recommendation profiles merely because the UI can export diagnostics locally.

## 17. Launch definition

NovelIdeas is launchable only when all of the following are true:

1. The supported audience, platforms, and deployment modes are explicitly named.
2. Every enabled source/age route has a known contract state, deterministic lock, operational clearance, and truthful failure behavior.
3. Unsupported sources and modes cannot be enabled or advertised.
4. Representative Human Review establishes acceptable usefulness and safety for each launched age band.
5. Honest underfill is accepted as a product outcome; irrelevant filler is not required.
6. Local Library membership is proven if Library Mode is launched.
7. The canonical deterministic release suite is green from a clean checkout and in CI.
8. Supported platform builds pass accessibility, navigation, persistence, error, offline/degraded, and device testing.
9. Secrets, licenses, attribution, cover rights, privacy, retention, and minor-data questions are resolved for the chosen deployment.
10. Staging has passed bounded live-source validation.
11. Monitoring, incident response, rollback, and source-disable controls are operational.
12. Product copy contains no false promise or nonfunctional placeholder.
13. A release tag identifies exactly what was deployed.

Launch does not require every source or future capability. A smaller, well-supported product is preferable to a broad but untrustworthy one.

### Release stages

| Stage | Permitted audience | Required evidence | Tolerated limitations | Exit criterion |
| --- | --- | --- | --- | --- |
| Internal alpha | Named developers/reviewers using nonproduction or explicitly approved keys | Canonical deterministic suite; local build; diagnostic integrity; fixture profiles | Rough UI and fixture-only sources, if clearly labeled | No invariant/security blocker; representative artifacts can be reproduced |
| Controlled beta | Named school/library participants under approved privacy and support plan | Staging builds; bounded live-source health; Human Review threshold chosen by Ken and met for enabled age bands; rollback and monitoring | Documented underfill and disabled features | Agreed observation window completes without unresolved safety, privacy, or operational blocker |
| Public launch | Intended public/institutional audience | All 13 launch conditions above; source terms and cover rights approved; supported-device and accessibility gates; incident owner | Only published limitations that do not violate the patron promise | Signed release record, remotely verified deployment, and rollback-ready tag |
| Post-launch optimization | Existing launched audience | Production telemetry plus deterministic reproduction and Human Review for each hypothesis | Experiments behind bounded rollout controls | Improvement is explainable, reproducible, reviewed, monitored, and reversible |

Ken must set numeric thresholds for acceptable slate size, allowed underfill, review fit/safety, latency, and supported devices. Until then, "good enough to ship" is structurally defined but not numerically certified.

## 18. Ordered critical path

| Order | Work item | Dependency | Complexity | Best agent | Parallel? | Completion artifact | Acceptance / lock |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | Define canonical deterministic release manifest | Current clean `main` | Medium | Copilot + Codex review | Yes, with 2 | Versioned manifest/package command and CI design | Clean checkout runs every declared lock without artifact drift |
| 2 | ComicVine equivalence certification | Frozen GCD artifacts and Phase II handoff | Medium | Codex | Yes, with 1 | ComicVine frozen artifact and four-dimension report | `comparison_valid` or explicit unavailable state; production hashes invariant |
| 3 | GCD/ComicVine comparison | Order 2 = `comparison_valid` | Medium | Codex | No | Frozen comparison report/artifacts | Equivalent inputs only; competence map locked; no production claim |
| 4 | Source licensing/access decisions | Existing gate matrix | Research | Legal/policy review + Ken | Yes, with 1–3 | Written rights/access decision record | Approved scope for metadata, covers, persistence, and live probes |
| 5 | Representative frozen/live graphic observations | Orders 2 and 4 | Research | Codex + human operator | No | Terms-compliant capture/replay artifacts | Bounded repeat observations; schema/completeness deltas preserved |
| 6 | Implement Human Review artifact workflow | Ken resolves rubric decisions | Large | Copilot + human review | Can begin after order 2; independent of live access | Versioned schema, CLI/UI, regressions | Immutable machine evidence; reproducible reports; disagreement preserved |
| 7 | Review graphic profiles and decide source role | Orders 3, 5, 6 | Research | Human review + Ken + Codex synthesis | No | Reviewed evidence pack and architecture decision record | Decision supported or explicit no-change/no-go |
| 8 | Publish source-by-age support ledger | Current registry plus orders 1 and 7 | Small | Codex | Yes, after 1 | Versioned support matrix | Every route explicitly supported, limited, disabled, or unevaluated |
| 9 | Close Open Library/Google Books release gaps | Orders 1, 6, 8 | Large | Mixed | Parallel by source/age | Updated certifications, live captures, review packs | Registry/live/review state agrees for enabled routes |
| 10 | Close or disable Kitsu/NYT/ComicVine gaps | Orders 1, 6, 7, 8 | Large | Mixed | Parallel by source | Per-source decision and locks | No enabled uncertified route; unsupported routes fail closed |
| 11 | Choose launch deployment mode | Orders 8–10 and Ken scope decision | Small | Ken | Yes, before source work finishes | Launch-scope decision record | Age bands, platforms, Global/Library modes fixed |
| 12 | Implement Local Library if in launch scope | Order 11 selects Library Mode; privacy/vendor decisions | Large | Copilot + Codex review | Parallel with 13, not with its own contract design | Import/storage/adapter/fixtures/runbook | Tenant isolation and local-only membership certified |
| 13 | Certify swipe-card evidence and profile formation | Order 1 | Medium | Codex + human review | Yes, with 9–12 | Deck inventory, profile fixtures, review report | Provenance/polarity/contradiction locks; no unsupported trait promotion |
| 14 | Review final source portfolio across all launch ages | Orders 6, 9–13 | Research | Human review | No | Final representative review baseline | Ken-approved fit/safety/coverage thresholds met |
| 15 | Test bounded quality hypotheses, if any | Order 14 identifies a specific hypothesis | Research | Copilot + Codex + human review | One hypothesis at a time | Experiment artifact and decision | Improvement versus frozen control; reproducible and reversible |
| 16 | Complete patron/admin/accessibility/privacy UX | Order 11; Local dependency if selected | Large | Copilot + human QA | Parallel by independent surface | Release-candidate feature inventory and test evidence | No false promise/placeholder; supported workflows pass |
| 17 | Implement CI and release certification | Order 1 manifest | Medium | Copilot | Parallel with 9–16 | Required CI workflow and release script | Protected `main` is green; clean-install/build checks pass |
| 18 | Resolve secrets, proxies, environments, and source terms | Orders 4 and 11 | Large | Mixed security/legal/Copilot | Parallel with 16–17 | Environment schema, rotated keys if needed, staging proxies | No client/history secret risk; staging configuration validates |
| 19 | Establish staging, telemetry, incidents, rollback | Orders 16–18 | Large | Copilot + operator | Partly parallel | Staging deployment, dashboards, runbooks, rollback drill | Bounded live smoke and rollback succeed; privacy controls verified |
| 20 | Release by stage | Orders 14, 16–19 | Medium | Mixed with Ken approval | No | Signed checklist, annotated release tag, remote deployment proof | Relevant alpha/beta/public exit criterion in section 17 is met |

The next three executable tasks after ComicVine equivalence certification are:

1. run the GCD/ComicVine comparison if and only if equivalence is valid;
2. resolve the source licensing/API-access decisions needed for representative capture;
3. implement the immutable Human Review artifact workflow while access review proceeds.

The shortest credible launch path may exclude GCD, ComicVine, Kitsu, NYT, Local Library, and Collection Opportunities if their gates are not satisfied. Their presence in the repository is not a requirement to enable them.
## 19. Risks and decisions requiring Ken

The following decisions cannot be made from code or deterministic fixtures:

### Product scope

- Is the first launch Global Mode, customized Library Mode, or both?
- Which platforms ship first: web, iOS, Android, kiosk/tablet?
- Which age bands are launch commitments?
- What slate-size and latency expectations should the UI communicate?
- Is “Try Again” intended to provide novelty, reproducibility, or both?

### Source and rights

- Is NovelIdeas’s intended operation non-commercial under ComicVine’s terms, including district, grant-funded, subscription, or institutionally funded deployment?
- May ComicVine metadata and covers be cached, persisted, and displayed as planned?
- What GCD attribution and ShareAlike treatment is acceptable for stored/derived metadata?
- Are live GCD access, authentication, and rate limits available for the intended workload?
- Which source cover images may be displayed and cached?
- Which sources should remain disabled until these questions are answered?

### Privacy and governance

- What patron information, if any, may leave the device?
- May anonymous aggregate recommendation/feedback events be collected for minors?
- What retention, deletion, consent, and school/district rules apply?
- Who may perform Human Review, and how are reviewer disagreements resolved?
- Who owns incident response, security, privacy, source terms, and release approval?

### Local Library

- What system is the catalog authority and what import formats are supported?
- What is a library/tenant identity?
- Is global fallback ever permitted in Library Mode?
- Which hosting and processing vendors are approved?
- Is collection-gap analysis in launch scope or explicitly deferred?

### Engineering targets

- Required Node/platform versions and deployment provider.
- p50/p95/p99 and maximum recommendation latency.
- Availability and graceful-degradation targets.
- Minimum representative profile/reviewer coverage for launch.
- Accessibility conformance target.
- Whether existing tracked `.env` history contains credentials requiring rotation and history remediation.

Each decision should become a short decision record with owner, date, scope, alternatives, and evidence. Silence must not turn into an implicit production default.

## 20. Unsupported conclusions

This roadmap does not establish:

- that current recommendations are good, safe, fair, or useful to representative readers;
- that one source is superior to another;
- that any source should own a route;
- that ComicVine and GCD are currently comparable;
- that GCD should be activated or ComicVine replaced;
- that the source-neutral reading-unit model should already become a platform-wide abstraction;
- that deterministic certification proves live transport health;
- that live transport health proves source competence;
- that source competence proves system recommendation competence;
- that a full slate is better than a relevant underfill;
- that current source licenses permit NovelIdeas’s future deployment;
- that cover display or caching rights are resolved;
- that Local Library or Collection Opportunities is operational;
- that the current UI is accessible, secure, private, production-ready, or deployable;
- that the tracked `.env` is safe or contains secrets;
- that existing feedback represents production telemetry;
- that a clean local test run substitutes for CI, staging, remote deployment verification, or monitoring;
- that every historical audit statement still describes current code.

The roadmap itself authorizes no production behavior change. Its purpose is to make the remaining work ordered, testable, reviewable, and honest about uncertainty.
