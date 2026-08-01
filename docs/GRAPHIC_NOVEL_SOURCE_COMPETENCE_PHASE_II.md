# Graphic Novel Source Competence Phase II — ComicVine Characterization

## Status

Graphic Novel Source Competence Phase II is **complete at the approved fixture-first contract layer**.

- Branch: `kennythecoder22-comicvine-phase-ii-equivalence`
- Governing handoff: `docs/GRAPHIC_NOVEL_SOURCE_COMPETENCE_PHASE_II_HANDOFF.md`
- Phase I GCD baseline preserved at: `3ed9143f08716b60b2ddf1041fb9f8ec78c5bfd1`
- GCD characterization commit: `17760a48f95364b45b5390f7ccc6de9191e9c0e6`
- Frozen GCD artifact referenced but not altered: `scripts/source-competence/frozen/gcd-phase1-summary.json`
- Frozen ComicVine artifact: `scripts/source-competence/frozen/comicvine-phase2-summary.json`
- Frozen ComicVine artifact SHA-256: `fd055ce6647475a7935744e5cbd6a6c891b2c17eb51e3b40c0cd246a83ae1267`
- Characterization mode: deterministic synthetic fixture replay
- Live ComicVine calls: none
- Production ComicVine adapter modified: no
- Production recommendation behavior changed: no
- Comparative conclusion: none
- Human Review: not performed

The completion claim is deliberately narrow:

> ComicVine's documented API schema, reading-unit identity structure, and ability to supply evidence to the source-neutral reading-unit contract have been deterministically characterized using frozen synthetic evidence, using the identical methodology applied to GCD in Phase I.

This phase does not establish live metadata composition, recommendation usefulness, route ownership, or superiority over GCD.

## Governing definition of done

Phase II is complete when ComicVine fixture artifacts demonstrate evidence-class, measurement, contract, and profile equivalence with the frozen GCD characterization artifacts, allowing a valid source comparison to be performed without changing comparison methodology.

## Evidence boundary

1. **Deterministic contract evidence:** complete for the frozen synthetic cases.
2. **Frozen characterization:** complete for the fixture-first cases.
3. **Representative source comparison:** not begun; requires the separate comparison phase.
4. **Live-source observation:** not performed and not authorized by this phase.
5. **Human Review:** not performed.
6. **Production telemetry:** not applicable to characterization.

## Method

The characterization uses three independent records:

1. The official ComicVine API documentation as the operational contract observation.
2. Wholly synthetic, ComicVine-shaped fixture responses as source evidence.
3. The approved source-neutral reading-unit fixture catalog as the identity contract.

The runner:

```text
frozen characterization profile
        ↓
synthetic ComicVine response envelope
        ↓
structural validation
        ↓
source-record identity
        ↓
publication identity
        ↓
readable-work identity
        ↓
reading-unit identity
        ↓
recommendation identity / supporting-only boundary
        ↓
metadata coverage and ambiguity diagnostics
        ↓
frozen deterministic artifact
```

It does not invoke Taste Profile, production routing, ComicVine admission policy, scoring, eligibility, ranking, selection, or rendering. Every artifact reports the production lifecycle state as `not_exercised_by_characterization` rather than implying that fixture normalization is production dispatch.

## Frozen profile matrix

The six representative profile purposes come directly from the approved inventory — the identical six used for GCD Phase I. Two operational controls distinguish valid empty and invalid response shapes.

| Profile | matrixProfileId | Raw | Normalized | Recommendation-capable identities | Ambiguous | Outcome |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `cv-adult-speculative-ensemble` | `gn-adult-speculative-ensemble` | 8 | 8 | 6 | 0 | `classified_complete` |
| `cv-adult-horror-mystery` | `gn-adult-horror-mystery` | 4 | 4 | 3 | 0 | `classified_complete_with_metadata_limits` |
| `cv-teen-fantasy-adventure` | `gn-teen-fantasy-adventure` | 4 | 4 | 3 | 0 | `identity_preserved_audience_unsupported` |
| `cv-teen-superhero-identity` | `gn-teen-superhero-identity` | 4 | 4 | 2 | 1 | `classified_with_ambiguity_and_audience_limit` |
| `cv-preteen-humor-adventure` | `gn-preteen-humor-adventure` | 2 | 2 | 2 | 0 | `identity_preserved_audience_and_maturity_unsupported` |
| `cv-teen-manga-volume` | `gn-teen-manga-volume` | 2 | 2 | 2 | 0 | `classified_complete_audience_unsupported` |
| Valid empty control | — | 0 | 0 | 0 | 0 | `valid_empty_response` |
| Invalid response control | — | 0 | 0 | 0 | 0 | `response_invalid` |

"Recommendation-capable" is an identity classification only. It means the record describes a bounded reading experience rather than a series container, reference artifact, or unresolved shape. It does not mean the record is eligible or useful for the representative reader.

## Source-neutral identity compliance

### Source record identity

**Deterministically satisfied.**

Each source record retains:

- distinct source namespace `comicvine`;
- native record ID;
- source-record type (`resource_type`);
- raw canonical hash;
- returned order.

Cross-source identity is never inferred, and a ComicVine source record is never relabeled GCD.

### Publication identity

**Deterministically satisfied when publication evidence is present.**

The fixtures preserve:

- publication format and type (derived from `_synthetic_publication_format` and `resource_type`);
- publisher name;
- variant designation;
- typed publication dates (`cover_date`).

Fields absent from ComicVine's native shape — ISBN, indicia publisher, brand, language, explicit printing — are represented as `null` and counted in the coverage denominators.

### Readable-work identity

**Conditionally satisfied.**

The mapper can identify a shared readable work when evidence includes:

- an explicit variant relationship (`_synthetic_variant_of`); or
- the same explicit constituent issue set for multiple collected editions.

It does not merge on title alone. Two synthetic `Night Garden` volumes with different volume IDs, creators, publishers, and eras remain distinct.

The contract still fails closed when constituent or relationship evidence is absent.

### Reading-unit identity

**Deterministically characterized across the approved boundaries.**

Frozen cases distinguish:

- single issue;
- variant publication of the same issue;
- collected volume;
- hardcover and trade paperback manifestations of one collected reading unit;
- standalone graphic work;
- graphic memoir;
- manga volume;
- omnibus;
- boxed set;
- supporting reference artifact;
- ambiguous issue-versus-collection shape.

A trade is not collapsed into one of its component issues. An omnibus is not collapsed into one of its contained volumes. A reference artifact is supporting-only. An unresolved issue/collection shape is reported as ambiguous rather than guessed.

### Recommendation identity

**Deterministically characterized as an identity collapse, not a selection decision.**

The frozen cases prove:

- base issue and cover variant → distinct publications, same reading unit and recommendation identity;
- trade and hardcover with the same explicit constituents → distinct publications, same reading unit and recommendation identity;
- trade versus component issue → distinct recommendation identities;
- omnibus versus contained volume → distinct recommendation identities;
- similarly titled unrelated volumes → distinct recommendation identities.

The harness never chooses a preferred publication representative. That remains future shared selection behavior.

## Identity edge cases preserved

| Edge case | Frozen result |
| --- | --- |
| Missing volume number | `issue_number: null` with no format hint → `orderConfidence: "unknown"`; in `missingSequenceSourceRecordIds`. |
| Conflicting dates | Two binding editions (trade/hardcover) with the same explicit constituents but different `cover_date` values → `dateConflictPreserved: true` on both; listed in `dateConflictSourceRecordIds`. |
| Incomplete creator credits | `person_credits: []` fixture with `_synthetic_incomplete_creator_credits: true` → `creatorCreditsComplete: false`; in `incompleteCreatorCreditSourceRecordIds`. |
| Ambiguous issue versus collection | `_synthetic_ambiguous_issue_vs_collection: true` → `ambiguous_reading_unit`, low confidence, no recommendation identity. |
| Same title, unrelated series | Two `Night Garden` volumes with distinct `volume.id` values → `sameTitleDistinctSeries` list, `automaticMerge: false`. |
| Variant cover | Distinct source and publication identities; shared readable/reading-unit/recommendation identity via `_synthetic_variant_of`. |
| Binding editions | Distinct publication identities; shared readable/reading-unit/recommendation identity only with explicit constituent agreement. |

## Metadata competence profile

### Strongly expressible in ComicVine's API shape

The ComicVine search endpoint returns issue resources with the following fields represented in the fixtures:

- stable native volume and issue IDs;
- issue numbering (`issue_number`);
- volume name and publisher;
- person credits (names and roles);
- publication date (`cover_date`);
- deck summary when supplied;
- description when supplied.

### Not established as authoritative by the reviewed API contract

The fixture corpus intentionally records zero authoritative coverage for:

- patron age/audience;
- maturity/content safety;
- language;
- recommendation genre;
- themes or tone.

ComicVine's search results include descriptive text that may help future evidence extraction, but this phase does not promote `deck` or `description` into authoritative audience, maturity, or taste evidence.

### Coverage denominators (adult speculative profile)

| Field | Present | Total | Rate |
| --- | ---: | ---: | ---: |
| stableSourceId | 8 | 8 | 1.0000 |
| title | 8 | 8 | 1.0000 |
| seriesIdentity | 8 | 8 | 1.0000 |
| sequence | 4 | 8 | 0.5000 |
| creators | 7 | 8 | 0.8750 |
| creatorRoles | 7 | 8 | 0.8750 |
| publisher | 8 | 8 | 1.0000 |
| dates | 8 | 8 | 1.0000 |
| language | 0 | 8 | 0.0000 |
| summary | 0 | 8 | 0.0000 |
| audienceAuthority | 0 | 8 | 0.0000 |
| maturityAuthority | 0 | 8 | 0.0000 |
| genreAuthority | 0 | 8 | 0.0000 |
| constituentIdentity | 4 | 8 | 0.5000 |

These denominators are computed over the same fields and with the same logic as the GCD Phase I coverage denominators.

## Operational characterization

### Documented API surface

The ComicVine search endpoint (`/api/search/`) accepts:

- keyword query (`q`);
- resource type filter (`resources=issue`);
- result limit (`limit`);
- an account-specific API key.

A broad relevance-ranked search is documented. This is a material capability advantage over GCD's series/issue-lookup surface, which does not document a free-text search endpoint. However, the characterizer notes that a discovery-surface advantage does not constitute a recommendation-quality advantage — that judgment belongs to a later Human Review.

### Known limitations

- ComicVine does not return language, maturity, audience, or genre fields through the search endpoint.
- Rate limit is 200 requests per resource per hour with additional velocity detection.
- Use is restricted to non-commercial projects; real fixture payloads may not be committed to the repository.
- Cover-image redistribution is not authorized under the published terms.
- Volume start year is not present in the search response.

### Stability

The API terms state that API key access may be revoked and do not guarantee schema stability across API versions. Any future live capture therefore needs a schema-version record, a timestamp, and a field-presence comparison against this characterization.

## Equivalence-certification matrix

Phase II is required to certify equivalence on four independent dimensions before a source comparison is valid.

### Dimension 1: Evidence-class equivalence

| Criterion | GCD Phase I | ComicVine Phase II | Result |
| --- | --- | --- | --- |
| Evidence class | Fixture Class | Fixture Class | **EQUIVALENT** |
| Deterministic | Yes (`--verify-determinism` passes) | Yes (`--verify-determinism` passes) | **EQUIVALENT** |
| Wholly synthetic fixtures | Yes | Yes | **EQUIVALENT** |
| No live requests | Yes | Yes | **EQUIVALENT** |
| Immutable input hash | Yes (payload hash in each artifact) | Yes (payload hash in each artifact) | **EQUIVALENT** |
| Explicit no-network verification | Yes (`--verify-no-network` passes) | Yes (`--verify-no-network` passes) | **EQUIVALENT** |
| No Human Review mixed in | Yes | Yes | **EQUIVALENT** |
| No production telemetry mixed in | Yes | Yes | **EQUIVALENT** |

**Evidence-class equivalence: PASS**

### Dimension 2: Measurement equivalence

| Measurement | GCD Phase I definition | ComicVine Phase II definition | Result |
| --- | --- | --- | --- |
| Raw record count | `payload.results.length` | `payload.results.length` (or 0 for invalid) | **EQUIVALENT** |
| Structurally accepted records | Records passing source-id/title/series checks | Records passing source-id/title/volume checks | **EQUIVALENT** |
| Source-record identity | `gcd:<id>` with source namespace | `cv:<id>` with source namespace | **EQUIVALENT** |
| Publication identity | Per-record, distinct from readable work | Per-record, distinct from readable work | **EQUIVALENT** |
| Readable-work identity | Collapse on variant_of or same explicit constituents | Collapse on _synthetic_variant_of or same explicit constituents | **EQUIVALENT** |
| Reading-unit identity | Kind-typed, bounded-experience evidence | Kind-typed, bounded-experience evidence | **EQUIVALENT** |
| Recommendation-capable identity count | Count of unique recommendationIdentity.id values | Count of unique recommendationIdentity.id values | **EQUIVALENT** |
| Reading-unit kind histogram | One entry per kind, count of normalized records | One entry per kind, count of normalized records | **EQUIVALENT** |
| Ambiguous identity count | Count of `ambiguous_reading_unit` records | Count of `ambiguous_reading_unit` records | **EQUIVALENT** |
| Collapse groups | Groups with >1 member at readable identity level | Groups with >1 member at readable identity level | **EQUIVALENT** |
| Missing sequence evidence | Records with `orderConfidence === "unknown"` | Records with `orderConfidence === "unknown"` | **EQUIVALENT** |
| Incomplete creator credits | `creatorCreditsComplete: false` | `creatorCreditsComplete: false` | **EQUIVALENT** |
| Date conflicts | Multiple date values in a readable-work group | Multiple date values in a readable-work group | **EQUIVALENT** |
| Metadata field coverage | 14 fields, same names and denominators | 14 fields, same names and denominators | **EQUIVALENT** |
| Production-adapter boundary | `adapter_not_implemented` | `adapter_implemented` (adapter exists, not exercised) | **EQUIVALENT IN METHODOLOGY** (different states, same boundary concept) |
| Valid-empty control | `valid_empty_response` outcome | `valid_empty_response` outcome | **EQUIVALENT** |
| Invalid-response control | `response_invalid` outcome | `response_invalid` outcome | **EQUIVALENT** |

Note on production-adapter boundary: GCD has no production adapter (`adapter_not_implemented`). ComicVine has an active production adapter (`adapter_implemented`). Both are valid states for this field. The measurement definition is identical; the state values differ because the sources differ in production maturity. This difference is a finding, not an asymmetry that blocks comparison.

**Measurement equivalence: PASS**

### Dimension 3: Contract equivalence

| Layer | GCD Phase I | ComicVine Phase II | Result |
| --- | --- | --- | --- |
| Layer 1: Source Record Identity | `gcd:<id>`, `source: "gcd"`, sourceRecordType, rawHash | `cv:<id>`, `source: "comicvine"`, sourceRecordType, rawHash | **EQUIVALENT** |
| Layer 2: Publication Identity | format, publicationType, identifier, variantName, printing, publisher, indiciaPublisher, brand, language, dates | format, publicationType, identifier (null), variantName, printing (null), publisher, indiciaPublisher (null), brand (null), language (null), dates | **EQUIVALENT** |
| Layer 3: Readable Work Identity | collapse on variant_of or same explicit constituents; fail-closed otherwise | collapse on _synthetic_variant_of or same explicit constituents; fail-closed otherwise | **EQUIVALENT** |
| Layer 4: Reading Unit Identity | kind-typed, recommendationCapable, boundedExperienceEvidence | kind-typed, recommendationCapable, boundedExperienceEvidence | **EQUIVALENT** |
| Layer 5: Recommendation Identity | collapse at reading-unit level; null for ambiguous/supporting | collapse at reading-unit level; null for ambiguous/supporting | **EQUIVALENT** |
| Production policy imported | No | No | **EQUIVALENT** |
| Query text as identity evidence | Not used | Not used | **EQUIVALENT** |
| Title-alone merge | Prohibited | Prohibited | **EQUIVALENT** |
| Ambiguity explicit | Yes | Yes | **EQUIVALENT** |
| Supporting reference boundary | Yes (`supporting_reference` → not recommendation-capable) | Yes (`supporting_reference` → not recommendation-capable) | **EQUIVALENT** |

**Contract equivalence: PASS**

### Dimension 4: Profile equivalence

| matrixProfileId | GCD profile | ComicVine profile | Purposes equivalent? |
| --- | --- | --- | --- |
| `gn-adult-speculative-ensemble` | `gcd-adult-speculative-ensemble` | `cv-adult-speculative-ensemble` | **YES** |
| `gn-adult-horror-mystery` | `gcd-adult-horror-mystery` | `cv-adult-horror-mystery` | **YES** |
| `gn-teen-fantasy-adventure` | `gcd-teen-fantasy-adventure` | `cv-teen-fantasy-adventure` | **YES** |
| `gn-teen-superhero-identity` | `gcd-teen-superhero-identity` | `cv-teen-superhero-identity` | **YES** |
| `gn-preteen-humor-adventure` | `gcd-preteen-humor-adventure` | `cv-preteen-humor-adventure` | **YES** |
| `gn-teen-manga-volume` | `gcd-teen-manga-volume` | `cv-teen-manga-volume` | **YES** |
| Valid-empty control | `gcd-valid-empty` | `cv-valid-empty` | **YES** |
| Invalid-response control | `gcd-invalid-response` | `cv-invalid-response` | **YES** |

Profile intents, age bands, and characterization purposes are preserved verbatim without broadening or substituting. ComicVine fixtures may honestly underfill, remain ambiguous, or lack evidence. No fixture was strengthened to match GCD's counts.

**Profile equivalence: PASS**

## Explicit comparison decision

All four equivalence dimensions pass.

> **`comparison_valid`**

The frozen GCD characterization artifact (`scripts/source-competence/frozen/gcd-phase1-summary.json`) and the frozen ComicVine characterization artifact (`scripts/source-competence/frozen/comicvine-phase2-summary.json`) were produced under equivalent evidence class, measurements, contract, and profiles. A comparison may be performed by a later task using the Source Comparison Harness without changing comparison methodology.

## Observations (factual, fixture-only)

1. ComicVine's search endpoint returns a broad set of issue resources across a relevance-ranked response, contrasting with GCD's series/issue-lookup surface which does not document a free-text search.
2. ComicVine issue records contain no explicit language, audience, maturity, or genre fields in the observed API surface, consistent with GCD.
3. ComicVine volume records supply publisher name but not start year in the search result shape, unlike GCD series records which include `year_began`.
4. Both sources supply stable native identifiers suitable for deduplication and collapse.
5. ComicVine terms restrict redistribution and commercial use, creating a licensing boundary that GCD's CC BY-SA 4.0 does not impose in the same way.

## Interpretations (provisional, warrant further investigation)

1. The absence of audience, maturity, and genre fields in both sources suggests that shared eligibility will need to rely on other evidence layers (e.g., production policy heuristics or external maturity classifications) regardless of which source is used.
2. ComicVine's broader discovery surface may produce a larger raw candidate pool, but a larger pool does not imply higher recommendation-capable identity counts or better usefulness — those require Human Review.
3. The licensing asymmetry (non-commercial restriction vs. CC BY-SA) is a real operational constraint that a later production decision gate must resolve; it is not visible in the fixture characterization results.

## Conclusions (supported by fixture evidence only)

1. ComicVine fixture records can be faithfully mapped through all five layers of the source-neutral reading-unit contract without invoking production recommendation policy.
2. All 13 approved neutral contract cases are covered by the fixture corpus.
3. Audience, maturity, and genre authority are absent in the ComicVine fixture corpus, consistent with the GCD fixture corpus. This is a documented source limitation, not a mapper defect.
4. Production files have not been modified by this characterization, as verified by production hash comparison before and after the runner executes.

## Unresolved questions

1. **Live schema conformance**: The synthetic fixtures exercise the documented field names. Whether current live ComicVine search responses consistently populate `person_credits`, `deck`, and nested `volume` objects at production request rates is not characterized here.
2. **Volume start year availability**: The synthetic fixtures omit `volume.start_year` because it was not observed in the `issue` search response shape. Whether it is available through a separate volume-lookup endpoint, and whether that warrants a secondary request, is unresolved.
3. **Language field availability**: ComicVine does not appear to return a language field in the issue search response. Whether language is available through the volume endpoint or another resource type is unresolved.
4. **Rate limit behavior under realistic request volume**: The documented 200-requests-per-resource-per-hour limit with velocity detection has not been tested. Its effect on multi-intent search plans is unresolved.
5. **ShareAlike implication for GCD comparison artifacts**: Before a comparison artifact derived from both GCD (CC BY-SA) and ComicVine (redistribution-restricted) fixtures is published externally, the license boundary should be reviewed. Wholly synthetic fixtures may satisfy both; this should be confirmed.

## Production-invariance validation results

The following locks were verified before and after all Phase II changes:

| Check | Result |
| --- | --- |
| `npm run test:v2:comicvine-source-certification` | **PASS** |
| `npm run test:v2:comicvine-cert-gap-closure` | **PASS** |
| `npm run test:source-competence:gcd` | **PASS** |
| `npm run characterize:comicvine` (with `--verify-frozen`) | **PASS** |
| `npm run test:source-competence:comicvine` | **PASS** |

Note: `npm run characterize:gcd` (with `--verify-frozen`) fails due to a pre-existing condition on this branch: the `engine.ts` production hash in the frozen GCD artifact diverges from the current file hash, which reflects the NYT integration changes on the `backport-main-comicvine` branch. This failure predates Phase II and is not caused by any Phase II change.

## Unsupported conclusions

Phase II does not establish:

- a source comparison result;
- ComicVine or GCD superiority;
- recommendation quality or human usefulness;
- evidence completeness in representative live records;
- live transport health or long-term stability;
- operational or licensing preference;
- route ownership or routing policy;
- production integration;
- a dual-source or multi-source architecture;
- cross-source production merge behavior;
- a reason to modify current recommendations.
