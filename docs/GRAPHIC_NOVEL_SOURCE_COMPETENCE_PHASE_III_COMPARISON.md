# Graphic Novel Source Competence Phase III — GCD vs ComicVine Comparison

## Status

Graphic Novel Source Competence Phase III is **complete**.

- Branch: `kennythecoder22-graphic-comparison-phase`
- Merge commit baseline: `5c7c40625d218a5cc3eb4d12de04b77e618b5aeb`
- Outcome: **`comparison_complete`**
- Evidence class: Fixture Class (both sources)
- Equivalence certification consumed: `comparison_valid` (declared by Phase II)
- Frozen GCD artifact: `scripts/source-competence/frozen/gcd-phase1-summary.json`
- Frozen ComicVine artifact: `scripts/source-competence/frozen/comicvine-phase2-summary.json`
- Frozen comparison input fixture: `scripts/comparison-harness/fixtures/gcd-vs-comicvine-fixture-class-v1.json`
- Comparison run ID: `comparison-a4e5329050465614`
- Comparison fixture SHA-256: `a9d99a36c5174c70b2229035fabe129ecab183859bd6ca0395695d927d7bed06`
- GCD artifact SHA-256 (at comparison time): `c73ebb46e1f695816e1c6966a1087a8dadfd151c42c6dc091476c87f71abde92`
- ComicVine artifact SHA-256 (at comparison time): `66e32f0c519688214fd447a218e010c7610eaa173faeb7520035443bfd00de8f`
- Live GCD calls: none
- Live ComicVine calls: none
- Production adapter modified: no
- Production recommendation behavior changed: no

The completion claim is deliberately narrow:

> The frozen GCD (Phase I) and ComicVine (Phase II) characterization artifacts have been compared using the existing Source Comparison Harness and the source-competence adapter, under Fixture Class evidence, producing a competence map of their observable differences and the dimensions unavailable at this evidence class.

---

## Frozen Input Verification

Before comparison, both frozen characterization artifacts were verified against their deterministic replay commands.

| Artifact | Verification command | Result |
| --- | --- | --- |
| `gcd-phase1-summary.json` | `node scripts/source-competence/run-gcd-characterization.mjs --mode replay --profile all --verify-no-network --verify-determinism --verify-frozen` | `frozenArtifactVerified: true` |
| `comicvine-phase2-summary.json` | `node scripts/source-competence/run-comicvine-characterization.mjs --mode replay --profile all --verify-no-network --verify-determinism --verify-frozen` | `frozenArtifactVerified: true` |

The hash discrepancy between the comparison-time SHA-256 values and the hashes recorded in earlier documentation is a documentation artefact from the Phase II correction commit (`ec0ffb4`). The canonical verification is the deterministic `--verify-frozen` replay, not a hardcoded hash string.

---

## Comparison Methodology

Phase III consumes the frozen artifacts using the **existing, unmodified** Source Comparison Harness (`scripts/comparison-harness/lib/compare.mjs`). No harness code was changed.

A source-competence adapter (`scripts/comparison-harness/lib/adaptSourceCompetenceArtifact.mjs`) converts each characterization case into the comparison harness source-envelope format:

- Each record with `recommendationCapable: true` becomes a comparison candidate.
- Records with `recommendationCapable: false` (supporting_reference, ambiguous_reading_unit) are excluded and counted in `diagnostics.dropCounts`.
- When multiple records share the same `recommendationIdentity.id` (variant covers, binding editions), only the first in returned order is used; subsequent records are counted in `diagnostics.dropCounts.collapsed_publication_variant`.
- The adapter sets `workKey = recommendationIdentity.id` as the comparison identity anchor, ensuring deterministic identity resolution for all candidates including those with empty creator credits.
- `terminalState` is the `characterizationOutcome` string (passthrough; not remapped to a recommendation lifecycle state).
- Operational controls (`valid_empty_response`, `response_invalid`) produce empty slates as expected.

The comparison is deterministic, network-free, and produces identical outputs across repeated runs.

---

## Comparison Fixture Structure

The frozen comparison input fixture contains eight cases:

| Case ID | Description | GCD selected | CV selected |
| --- | --- | ---: | ---: |
| `gn-adult-speculative-ensemble` | Adult speculative, ensemble | 6 | 6 |
| `gn-adult-horror-mystery` | Adult horror/mystery | 3 | 3 |
| `gn-teen-fantasy-adventure` | Teen fantasy/adventure | 3 | 3 |
| `gn-teen-superhero-identity` | Teen superhero/identity | 2 | 2 |
| `gn-preteen-humor-adventure` | Preteen humor/adventure | 2 | 2 |
| `gn-teen-manga-volume` | Teen manga volume | 2 | 2 |
| `control-valid_empty_response` | Operational control | 0 | 0 |
| `control-response_invalid` | Operational control | 0 | 0 |

Dropped records per source (across all content profiles):

| Drop reason | GCD | ComicVine |
| --- | ---: | ---: |
| `collapsed_publication_variant` | 4 | 4 |
| `supporting_reference` | 1 | 1 |
| `ambiguous_reading_unit` | 1 | 1 |
| **Total** | **6** | **6** |

Both sources produce the same drop structure across all profiles, consistent with the equivalence certification.

---

## Competence Map

The following dimensions are where GCD and ComicVine differ at Fixture Class evidence. All findings are confined to what synthetic fixtures can demonstrate. No live source behavior, live metadata composition, or Human Review evidence is involved.

### 1. Language Coverage

**This is the largest single difference between the two sources.**

| Source | Language coverage (6 content profiles combined) |
| --- | ---: |
| GCD | 1.0000 (24/24 normalized records) |
| ComicVine | 0.0000 (0/24 normalized records) |

GCD's API schema includes a `language` field. The ComicVine search endpoint does not return a language field in the observed fixture shape. This difference is an observable fact about the API surface documented in the Phase II characterization.

This does not establish whether live GCD records consistently supply accurate language values, whether ComicVine language data exists elsewhere in the API, or whether language evidence would be sufficient for eligibility purposes. Those questions belong to later evidence classes.

### 2. Sequence Ordering Coverage

| Source | Sequence coverage (6 content profiles combined) |
| --- | ---: |
| GCD | 0.7083 (17/24 records) |
| ComicVine | 0.3750 (9/24 records) |

GCD's issue-number and series-ordering fields are populated for 17 of 24 normalized records. ComicVine's `issue_number` field is available but absent from more fixture records. The synthetic fixtures represent this as a documented difference in the API surface's ability to supply sequence evidence: GCD includes `year_began` on series records and consistent issue numbering; ComicVine's volume start year is not present in the search result shape.

The 7 records with `orderConfidence: "unknown"` in GCD and 15 such records in ComicVine reflect missing sequence evidence in the respective fixture corpora, not necessarily in live records.

### 3. Constituent Identity Coverage

| Source | Constituent identity coverage (6 content profiles combined) |
| --- | ---: |
| GCD | 0.3750 (9/24 records) |
| ComicVine | 0.2917 (7/24 records) |

Both sources can represent constituent relationships (issue-to-collection, volume-to-omnibus) when the evidence is explicit. GCD provides slightly more constituent evidence across the synthetic fixture set. Neither source provides constituent identity for the majority of records; both require explicit constituent declarations rather than inferring them from titles or years.

### 4. Creator Credit Completeness (Profile-Specific)

The comparison harness measures creator presence over comparison candidates (recommendation-capable identities). Two specific asymmetries were observed:

| Profile | GCD creators coverage | CV creators coverage | Explanation |
| --- | ---: | ---: | --- |
| `gn-adult-speculative-ensemble` | 0.8333 (5/6) | 1.0000 (6/6) | GCD boxed set representative has no creator attribution (`creatorCreditsComplete: true`, empty array — a legitimate synthetic case) |
| `gn-teen-fantasy-adventure` | 1.0000 (3/3) | 0.6667 (2/3) | CV binding editions representative has `creatorCreditsComplete: false` — the synthetic incomplete-creator-credits edge case |

These are profile-specific fixture edge cases, not a general claim that either source consistently lacks creator credits. Aggregate creators coverage is 0.9375 for GCD and 0.9375 for ComicVine across all content profiles combined.

### 5. Reading-Unit Kind Histogram Differences

| Kind | GCD (all profiles) | ComicVine (all profiles) |
| --- | ---: | ---: |
| `single_issue` | 7 | 7 |
| `collected_volume` | 6 | 4 |
| `standalone_graphic_work` | 5 | 7 |
| `omnibus` | 2 | 2 |
| `manga_volume` | 1 | 1 |
| `boxed_set` | 1 | 1 |
| `ambiguous_reading_unit` | 1 | 1 |
| `supporting_reference` | 1 | 1 |

GCD produces 6 collected volumes vs ComicVine's 4; ComicVine produces 7 standalone graphic works vs GCD's 5. Both sources cover the same set of reading-unit kinds across all profiles. The histogram differences reflect the source-specific synthetic fixture design, not a claim about live catalog composition.

### 6. Production Adapter State

| Source | Production adapter state |
| --- | --- |
| GCD | `adapter_not_implemented` |
| ComicVine | `adapter_implemented` (not exercised by characterization) |

ComicVine has an active production adapter; GCD does not. This is a real production-lifecycle difference and not merely a fixture artifact. However, the comparison methodology is unaffected: both sources were characterized without invoking their production adapters, and the adapter state is a finding about production maturity, not about fixture-class identity competence.

### 7. Fields Where Both Sources Are Equivalent

The following dimensions show **no difference** between sources at this evidence level:

| Dimension | GCD | ComicVine |
| --- | --- | --- |
| Evidence class | Fixture Class | Fixture Class |
| Deterministic replay | Yes | Yes |
| No network access | Yes | Yes |
| Human Review performed | No | No |
| Audience authority | 0/24 (0%) | 0/24 (0%) |
| Maturity authority | 0/24 (0%) | 0/24 (0%) |
| Genre authority | 0/24 (0%) | 0/24 (0%) |
| Summary/description authority | 0/24 (0%) | 0/24 (0%) |
| Aggregate metadata completeness (harness) | 0.6605 | 0.6605 |
| Title coverage | 1.0 | 1.0 |
| Format coverage | 1.0 | 1.0 |
| Publication year coverage | 1.0 | 1.0 |
| Stable identifier coverage | 1.0 | 1.0 |
| All reading-unit kinds covered | Yes | Yes |
| Ambiguous identity handling | Explicit, fail-closed | Explicit, fail-closed |
| Supporting-reference boundary | Yes | Yes |
| Cross-source fixture overlap | 0 (Jaccard 0.0) | — |

The zero Jaccard overlap is an **observed finding** from the Fixture Class comparison. Synthetic fixtures use source-specific, non-overlapping titles; cross-source identity matching at Fixture Class is not expected to produce overlap. This finding does not indicate anything about live catalog overlap between GCD and ComicVine.

---

## Dimensions Unavailable at Fixture Class Evidence

The following comparison questions cannot be answered from Fixture Class evidence alone. They require later evidence classes as described in `docs/SOURCE_COMPARISON_HARNESS.md`.

| Unavailable dimension | Required evidence class | Notes |
| --- | --- | --- |
| Live metadata field presence rates | Representative Frozen or Live Observation | Fixture completeness reflects synthetic corpus design, not live API response composition |
| Live language field accuracy in GCD | Representative Frozen or Live Observation | Language field is present in the API shape; accuracy and consistency in real records are unmeasured |
| ComicVine language availability via other endpoints | Representative Frozen or Live Observation | The search endpoint does not surface language; other API shapes are undocumented here |
| Sequence ordering accuracy and consistency | Representative Frozen or Live Observation | Fixture sequence reflects synthetic labels; live ordering reliability is unmeasured |
| Schema stability over time | Live Observation (longitudinal) | Both sources state that field/format stability is not guaranteed |
| Live constituent identity rates | Representative Frozen or Live Observation | Constituent fields depend on editorial data entry; live rates are unknown |
| Recommendation usefulness | Human Review | Whether recommendations from either source would satisfy a representative reader |
| Cross-source catalog overlap | Representative Frozen or Live Observation | Zero fixture overlap is expected and reflects synthetic independence, not live catalog structure |
| Licensing and attribution implications | Legal/operational gate | ComicVine non-commercial restriction and GCD CC BY-SA 4.0 require a separate decision gate |
| Rate limit, latency, and transport behavior | Live Observation | Neither source was called; no transport evidence exists |
| Production eligibility and routing suitability | Production experiment (post-Human-Review) | No production adapter exists for GCD; ComicVine adapter was not exercised |

---

## Lifecycle Asymmetry Assessment

The production-adapter-state difference (GCD=`adapter_not_implemented`, CV=`adapter_implemented`) was assessed for lifecycle asymmetry. Phase II certified this as "EQUIVALENT IN METHODOLOGY" — both states represent a documented boundary concept (production lifecycle not exercised by characterization), and neither value blocks like-for-like interpretation of the characterization data.

No lifecycle asymmetry requiring a `comparison_unavailable_lifecycle_asymmetry` result was detected.

---

## Observations

1. Both sources supply stable native identifiers suitable for reading-unit identity and deduplication.
2. Language is the most operationally significant field-presence difference: GCD supplies it, ComicVine does not (at the search endpoint level).
3. GCD supplies better sequence ordering evidence (issue number, series year) than ComicVine's search endpoint across the synthetic fixture set.
4. Neither source supplies audience authority, maturity authority, genre authority, or description fields. Shared eligibility and recommendation quality decisions cannot depend on these from either source at this evidence class.
5. Both sources handle the same set of reading-unit kinds and identity edge cases (variant covers, binding editions, ambiguous shapes, incomplete credits, missing sequence, date conflicts).
6. ComicVine's broader relevance-ranked search surface is a documented structural difference from GCD's series/issue-lookup surface. This difference is not directly observable in the comparison harness metrics (metadata coverage, diversity, overlap) because both use the same synthetic fixture count. It remains a candidate for investigation in the Representative Frozen evidence phase.
7. The comparison harness correctly processes source-competence characterization artifacts adapted through the envelope adapter. The comparison methodology required no changes.

---

## Interpretations

1. The language field difference suggests GCD has a structural advantage for language-filtered eligibility if live records reliably populate this field. Whether live GCD records actually populate language consistently is an unresolved question that requires Representative Frozen evidence.
2. The sequence coverage difference suggests GCD may provide better ordering evidence for series-entry guidance, but the fixture data is synthetic and the gap may narrow or invert in live records.
3. The constituent identity coverage difference (GCD 37.5% vs CV 29.2%) suggests GCD may document issue constituents more consistently, which affects collected-edition identity. This is a structural observation from the fixture design, not a live-catalog claim.
4. The discovery surface difference (ComicVine relevance-ranked search vs GCD series/issue lookup) is absent from the metadata metrics but is an operationally significant capability difference. A source can have excellent identity data without providing a suitable discovery surface for recommendation retrieval.
5. Both sources' inability to supply audience, maturity, or genre authority independently reinforces that shared eligibility layers must provide these from non-source evidence regardless of source choice.

These are interpretations, not conclusions. They require Representative Frozen and Human Review evidence before informing a production decision.

---

## Hypotheses Warranted for Later Evidence Classes

The following hypotheses are justified by the fixture-class observations but require later evidence to validate:

1. **Language hypothesis:** GCD live records supply language values at a materially higher rate than ComicVine live records at the search endpoint. *Requires Representative Frozen evidence.*
2. **Sequence hypothesis:** GCD live records supply sequence ordering evidence (issue number, series position) at a higher rate than ComicVine live records. *Requires Representative Frozen evidence.*
3. **Discovery surface hypothesis:** ComicVine's relevance-ranked search endpoint returns a larger raw candidate pool per query than GCD's series/issue-lookup surface. *Requires Representative Frozen evidence.*
4. **Usefulness hypothesis:** Neither source alone — without shared eligibility filtering, Human Review, and routing refinement — can be assumed to produce useful recommendations for the represented reader profiles. *Requires Human Review.*

No hypothesis asserts source superiority. Each hypothesis is an observable fixture-level signal, not a production claim.

---

## Reproducible Workflow

Verify frozen inputs and run the comparison:

```powershell
# Verify frozen characterization artifacts
node scripts/source-competence/run-gcd-characterization.mjs --mode replay --profile all --verify-no-network --verify-determinism --verify-frozen
node scripts/source-competence/run-comicvine-characterization.mjs --mode replay --profile all --verify-no-network --verify-determinism --verify-frozen

# Run the comparison
node scripts/comparison-harness/run-gcd-comicvine-comparison.mjs --verify-no-network --verify-determinism

# Run regressions (includes existing OL vs GB regression suite)
node scripts/comparison-harness/run-gcd-comicvine-comparison-regressions.mjs
```

---

## Outcome

> **`comparison_complete`**

The frozen GCD characterization artifact (Phase I) and the frozen ComicVine characterization artifact (Phase II) were compared using the existing Source Comparison Harness under Fixture Class evidence. The comparison produced a competence map identifying observable differences in language coverage, sequence ordering coverage, constituent identity coverage, and reading-unit kind distribution. No methodology change to the comparison harness was required.

---

## Unsupported Conclusions

Phase III does **not** establish any of the following:

- **Source superiority.** The competence map describes observable differences in fixture-class metadata coverage. It does not rank GCD above or below ComicVine for any purpose.
- **Recommendation usefulness.** No Human Review was performed. Machine identity competence is not recommendation usefulness. The comparison harness explicitly records `humanUsefulnessClaim: "not_established_without_completed_hash_linked_human_review"` for all cases.
- **Production suitability.** Fixture-class evidence cannot establish that either source is operationally suitable for production use. Transport health, schema stability, rate limits, and real-world composition are unmeasured.
- **Routing ownership.** The comparison does not decide which source owns graphic novel routing. Route ownership requires a production decision gate with Representative Frozen evidence, Human Review, and licensing resolution.
- **Source replacement.** No recommendation is made to replace one source with the other. Neither source has been evaluated in a live recommendation context.
- **Dual-source or multi-source architecture.** This comparison does not authorize or design a combined multi-source architecture. Cross-source deduplication and composition remain future engineering work.
- **Licensing approval.** ComicVine's non-commercial restriction and GCD's CC BY-SA 4.0 ShareAlike terms remain unresolved licensing questions outside the scope of this comparison.
- **Live evidence completeness.** All evidence is Fixture Class — synthetic, deterministic, and wholly independent of current external source behavior. Live metadata composition, live catalog overlap, and live transport health are all unmeasured.
- **Human recommendation quality.** No reader evaluated any recommendation from either source. The comparison harness does not assess whether a slate would satisfy a human reader.

---

## Completion Boundary

Phase III ends with the comparison and competence map delivered above.

If engineering hypotheses from Section "Hypotheses Warranted for Later Evidence Classes" are to be investigated, the next authorized phase is Representative Frozen and Live Observation evidence (roadmap section 5), which requires:
- approved API access and rate budgets for both sources;
- terms-compliance review for GCD CC BY-SA and ComicVine non-commercial terms;
- capture methodology preserving timestamps, schema versions, and raw response hashes;
- separate frozen capture artifacts (not mixed into the existing Fixture Class artifacts).

A production decision gate (roadmap section 6) follows live observation and Human Review — it does not follow from this comparison alone.
