# Google Books Source Certification — Phase 1

## Decision

Google Books is **deterministically contract-certified** for the frozen Phase 1 profiles. It is **not live-transport certified** and **not human-usefulness certified**.

The certification replays the current Recommendation V2 pipeline without changing it:

```text
representative swipe signals
→ Taste Profile
→ Google Books routing and query plan
→ Google Books adapter over frozen responses
→ normalization
→ scoring
→ final eligibility
→ selection
→ structured competence artifact
```

No production query, routing, filtering, scoring, eligibility, ranking, recovery, or selection rule was changed.

## The three source questions

### Can Google Books answer?

At the deterministic contract layer, yes:

- the V2 planner activates the adapter when enabled;
- all four age bands receive source-specific query plans;
- the adapter consumes valid Google Books volume responses;
- accepted rows normalize, score, and reach final selection;
- disabled, valid-empty, invalid-shape, source-policy rejection, and underfill outcomes remain distinguishable;
- request execution is bounded by the existing three-intent plan and existing timeout.

Live endpoint reachability, quota, latency, and response stability were not exercised. “Can answer live today” therefore remains unresolved.

### Should Google Books answer?

The current architecture supports Kids, Preteens, Teens, and Adult when Google Books is explicitly enabled. Phase 1 does not change that routing.

The evidence supports advancing Adult narrative-book profiles—and selectively Preteen profiles—to Human Review and source comparison. It does not yet support granting Google Books route ownership or production preference for any family.

Teen and Kids warrant special caution:

- the Teen Fantasy fixture returned six plausible YA narrative records, but only one survived publication-shape policy;
- the Kids fixture returned five plausible child-story/picture-book records, but none survived publication-shape policy.

Those are characterized constraints, not authorization to weaken policy or change routing.

### Does Google Books answer well?

The machine evidence is mixed:

| Frozen profile | Raw fixture rows | Accepted after source policy | Scored | Selected | Terminal state |
| --- | ---: | ---: | ---: | ---: | --- |
| Teen Fantasy | 6 | 1 | 1 | 1 | `eligible_underfilled` |
| Adult Mystery | 6 | 6 | 6 | 6 | `eligible_useful` |
| Preteen Fantasy/Adventure | 4 | 2 | 2 | 2 | `eligible_underfilled` |
| Kids Fantasy/Friendship | 5 | 0 | 0 | 0 | `source_policy_rejected_all` |
| Teen Science Fiction underfill | 1 | 1 | 1 | 1 | `eligible_underfilled` |
| Teen artifact-heavy | 3 | 0 | 0 | 0 | `source_policy_rejected_all` |
| Adult valid empty | 0 | 0 | 0 | 0 | `valid_empty_response` |
| Adult invalid response shape | 0 | 0 | 0 | 0 | `response_invalid` |
| Teen disabled source | 0 | 0 | 0 | 0 | `intentional_skip_disabled` |

Adult Mystery has the strongest deterministic composition: six distinct creators, six category groupings, complete measured metadata, and six selected candidates. Preteen filtering correctly prevents a reference work and an unsuitable ambiguous record from reaching scoring while preserving two relevant novels.

The Teen and Kids results show that plausible audience and story metadata does not automatically satisfy the current publication-shape classifier. This is the narrowest current competence limitation exposed by Phase 1.

These results do **not** establish that any title is useful to a human reader. Every artifact remains `not_reviewed`.

## Route-family characterization

The current planner produces:

- Kids: `children … fiction novel`
- Preteens: `middle grade … fiction novel`
- Teens: `young adult … fiction novel`
- Adult: narrative genre terms ending in `novel`, without an `adult` audience prefix

The adapter executes the two primary intents and conditionally executes the broad fallback when fewer than three usable rows survive. Phase 1 preserves this behavior and records exact sanitized request parameters and per-query composition.

Current evidence classification:

| Route/profile family | Phase 1 evidence | Engineering disposition |
| --- | --- | --- |
| Adult narrative mystery | Strong deterministic composition | Advance to Human Review and Open Library comparison |
| Preteen fantasy/adventure | Selective, relevant underfill | Advance cautiously to Human Review; retain filtering evidence |
| Teen fantasy | High publication-shape attrition | Do not promote route ownership; investigate composition before any policy change |
| Kids story/picture book | Zero source-policy acceptance | Do not treat as certified useful; diagnose classifier/metadata interaction separately |
| Sparse Teen science fiction | Honest underfill | Preserve as a valid underfill case |
| Artifact-heavy Teen fantasy | Correct source-policy rejection | Retain as a policy protection case |

## Metadata characterization

Every row that reached shared normalization in the useful/underfilled fixtures had all ten measured fields:

- stable source identity;
- title;
- creator;
- description;
- category metadata;
- publication year;
- ISBN;
- audience band;
- publication-shape classification;
- query provenance.

This proves field preservation for the frozen accepted rows. It does not prove Google Books metadata is richer than Open Library in live results. Cross-source richness requires independently captured equivalent profiles and the locked Comparison Harness.

## Failure and recovery characterization

Phase 1 proves:

- disabled source → `intentional_skip_disabled`, with zero requests;
- valid empty `items: []` → `valid_empty_response`;
- HTTP-success body missing `items` → `response_invalid`;
- all rows rejected by publication policy → `source_policy_rejected_all`;
- accepted but small slate → `eligible_underfilled`;
- sufficiently populated eligible slate → `eligible_useful`.

The existing adapter has no retry path. The broad third intent is a conditional fallback, not a retry. This certification records that boundary but does not change it.

## Certification layers

| Layer | Status | Evidence |
| --- | --- | --- |
| Contract correctness | Certified for frozen Phase 1 fixtures | Nine deterministic replay cases and focused regression |
| Transport health | Not certified | No live requests; quota and latency remain external |
| Routing correctness | Deterministically characterized | All four age prefixes, Adult narrative plan, disabled skip |
| Source competence | Partially certified by profile family | Adult strong; Preteen selective; Teen/Kids constrained |
| Human usefulness | Not certified | Human Review status is `not_reviewed` |

## Existing policy regressions retained

The certification complements, rather than replaces, the existing Google Books suites for:

- query quality;
- publication shape;
- Kids and Teen architecture boundaries;
- age-band infrastructure;
- audience/maturity separation;
- Preteen publication identity and narrow narrative rescue;
- final eligibility and final-slate identity;
- narrative-strength ranking;
- stage-by-stage lineage diagnostics.

Those regressions protect individual rules. The Source Competence replay shows how those rules compose for representative profiles.

## Workflow

Run the full deterministic certification:

```powershell
node scripts/source-competence/run-googlebooks-certification.mjs --mode replay --profile all --verify-no-network --verify-determinism
```

Run the focused certification regression:

```powershell
node scripts/source-competence/run-googlebooks-certification-regressions.mjs
```

Generated JSON and Markdown are written to `artifacts/source-competence/google-books-phase1/` and remain ignored.

## Remaining questions

1. Does the live endpoint return equivalent metadata composition under current quota and latency conditions?
2. Do human reviewers judge the Adult Mystery and surviving Preteen titles useful?
3. Why do five plausible Kids records fail publication-shape identity?
4. Which Teen metadata fields distinguish the one accepted Fantasy record from the five rejected records?
5. Does Google Books outperform or complement Open Library on independently characterized, equivalent profiles?
6. Should any production route prefer or avoid Google Books after Human Review and comparison evidence?

No routing decision should be made from Phase 1 alone.
