# Source Comparison Harness Architecture

## Status and scope

This document defines Phase 1 of the NovelIdeas Source Comparison Harness. The harness is an offline engineering tool that compares two immutable source-characterization artifacts for the same representative reader profile.

It is not part of the recommendation engine. It does not call source adapters, alter routing, combine candidate pools, rescore candidates, rank recommendations, or select a production slate. It produces comparison evidence only.

Phase 1 includes deterministic Open Library-versus-Google Books fixtures. Those fixtures validate comparison behavior; they are not live-source health or human-quality claims. Local Collection is intentionally not implemented, but the comparison contract is source-agnostic and does not exclude it.

## Architectural position

```text
Representative reader profile
        |
        +--> immutable source characterization A
        |
        +--> immutable source characterization B
                         |
                         v
              Source Comparison Harness
                         |
                  JSON + Markdown
                         |
             optional Human Review join
```

The Source Competence Harness characterizes one source. The Comparison Harness consumes two such characterizations. Human Review remains a separate, optional, hash-linked judgment layer.

## Reused concepts

Phase 1 deliberately reuses existing project concepts:

- representative profile identity, age band, intent, positive signals, negative signals, and format intent;
- machine activation and terminal states;
- selected candidate stable IDs and source artifact identity;
- query and route provenance;
- document-backed evidence;
- explicit underfill;
- immutable artifact hashes;
- `not_reviewed` as a meaningful Human Review state.

It does not define a competing terminal-state taxonomy or a numeric recommendation-quality score.

## Evidence classes and comparison validity

Evidence class describes what produced an artifact and therefore what claims the artifact can support. It is a taxonomy of scope, not a ranking of truth or importance:

1. **Fixture Class** — deterministic synthetic or mocked contract evidence.
2. **Representative Frozen Class** — immutable representative source records captured under a documented method.
3. **Live Observation Class** — bounded observations of current external source behavior.
4. **Human Review Class** — structured judgments linked to exact machine artifacts.
5. **Production Telemetry Class** — longitudinal observations from real production use.

The governing comparison rule is:

> **Comparative conclusions are valid only when they are derived from equivalent evidence classes and equivalent measurements. When evidence classes differ, the comparison must explicitly report the asymmetry rather than infer equivalence.**

Every claim inherits the limitations of its evidence class. Fixture evidence cannot establish operational suitability. A live observation cannot establish long-term stability. Human Review cannot establish deterministic correctness. Production telemetry cannot retroactively prove identity preservation.

Likewise, two artifacts from the same evidence class are not comparable when they measure different concepts or lifecycle stages. Schema richness is not evidence completeness. Documented discovery capability is not recommendation usefulness.

| Proposed comparison | Validity | Required result |
| --- | --- | --- |
| Fixture GCD versus Fixture ComicVine | Valid when the same profile, contract, and measurement are used | Report fixture-level differences only. |
| Live GCD versus Live ComicVine | Valid when capture conditions and measurements are equivalent | Report bounded live observations only. |
| Representative Frozen GCD versus Representative Frozen ComicVine | Valid when capture and profile equivalence are established | Report representative frozen differences only. |
| Fixture GCD versus Live ComicVine | Invalid for a comparative conclusion | `comparison_unavailable_evidence_class_asymmetry` |
| Schema richness versus evidence completeness | Invalid measurement equivalence | `comparison_unavailable_measurement_asymmetry` |
| Discovery documentation versus recommendation usefulness | Invalid lifecycle equivalence | `comparison_unavailable_lifecycle_asymmetry` |

Comparison unavailability is a correct engineering result. The harness must not coerce, normalize, or broaden an artifact to manufacture equivalence. Reports must preserve both artifact classes, identify the exact asymmetry, and state which claim remains unsupported.

Phase 1's existing deterministic comparison fixtures are Fixture Class by their declared capture kind. Adding an explicit `evidenceClass` field and enforcing these unavailable states in code requires a separately reviewed, versioned harness change; this documentation amendment does not modify the locked implementation or reinterpret existing results.

## Input contract

A comparison fixture contains one or more cases. Every case has:

- a stable case ID;
- one preserved representative profile;
- exactly two source-characterization artifacts;
- the same profile ID on both source artifacts;
- source activation, terminal state, target slate size, failure reason, and diagnostics;
- ordered selected candidates with stable identity and metadata;
- optional hash-linked Human Review records.

A candidate may carry:

- source stable ID;
- canonical work key or ISBN;
- title and creators;
- description;
- genres, themes, and formats;
- publication year;
- series key;
- selected rank;
- query family and fallback provenance;
- document-backed positive and negative evidence.

The comparator validates the shared profile and rejects malformed or same-source pairs.

## Identity and overlap

Source-native IDs are not assumed to match. Phase 1 builds a transparent comparison identity in this order:

1. canonical work key;
2. ISBN-13;
3. normalized title plus first creator.

Every overlapping record reports the identity strategy used. Title-only matching is not allowed. Ambiguous editions, volumes, and franchises remain visible future work rather than being silently merged.

Metrics include:

- overlap count;
- overlap share for each source;
- union size;
- Jaccard overlap;
- source-A-only and source-B-only candidates;
- overlap rank pairs and rank distance.

Unique candidates are evidence of complementarity, not automatic evidence of superiority.

## Machine comparison metrics

Machine metrics remain separate by source and case:

- activation and terminal state;
- failure reason and diagnostic counts;
- slate size, target, underfill count, and underfill status;
- metadata field coverage;
- unique creators, genres, formats, and series;
- duplicate comparison-identity pressure;
- query-family contribution;
- fallback-selected count;
- document-evidence coverage;
- overlap and unique contribution.

Source-native scores are intentionally not compared. Scores may have different scales and policy meanings across adapters.

## Metadata quality

Phase 1 reports field coverage, not a subjective metadata-quality grade. The measured fields are:

- stable identifier;
- title;
- creators;
- description;
- genre or theme evidence;
- format;
- publication year;
- query provenance;
- document evidence.

The report gives numerator, denominator, and missing fields by candidate. Completeness does not prove accuracy.

## Candidate diversity

Diversity metrics describe composition without claiming quality:

- unique creators;
- unique genres;
- unique formats;
- unique nonempty series roots;
- duplicate comparison identities;
- concentration by query family.

A diverse slate may still be irrelevant. A coherent slate may legitimately be less diverse. Human Review is required to judge usefulness.

## Human Review integration

Human Review records remain separate artifacts. If provided, a record is counted only when it identifies:

- source;
- profile;
- candidate stable ID;
- reviewed source artifact hash;
- review status;
- rubric version.

The Comparison Harness may report review coverage, fit classifications, and concerns separately by source. It must not convert those judgments into a combined pass/fail badge or rewrite machine metrics.

Phase 1 fixtures contain no completed reviews. Reports therefore state `not_reviewed` with zero coverage. This is intentional and must not be interpreted as approval.

## Outputs

The harness writes deterministic artifacts beneath `artifacts/comparison-harness/`:

- `comparison.json`: canonical structured comparison data;
- `comparison.md`: human-readable report generated from the same data.

Artifacts contain no generation timestamp. They include fixture identity, input SHA-256, source artifact hashes, comparison schema version, profile identity, metrics, overlap records, unique records, and Human Review coverage.

Generated outputs are ignored by Git. Frozen input fixtures and regression expectations are committed.

## Determinism and isolation

Fixture comparison must be deterministic:

- no network access;
- no source adapter invocation;
- no production imports;
- stable object ordering and numeric rounding;
- identical JSON and Markdown for identical input bytes;
- explicit input and source artifact hashes.

The regression suite installs a network trap and proves that comparison completes without using it.

## Intended workflow

1. Generate or select two immutable source-characterization artifacts for one profile.
2. Verify both artifacts describe the same profile and comparable execution mode.
3. Run the Comparison Harness.
4. Inspect terminal states and failures before interpreting slate metrics.
5. Review overlap, unique contribution, metadata coverage, underfill, diversity, and route-family contribution.
6. Attach future Human Review artifacts by exact source-artifact hash.
7. Use the evidence to form a narrow engineering hypothesis.
8. Test proposed changes against the frozen comparison baseline.

The harness informs route-ownership questions; it does not decide route ownership automatically.

## Non-goals

Phase 1 does not:

- tune queries, timeouts, routing, eligibility, scoring, ranking, or selection;
- call Open Library, Google Books, ComicVine, or any other source;
- merge sources into a production slate;
- compare raw source-native scores;
- certify recommendation usefulness;
- implement Human Review Mode;
- implement Local Collection comparison;
- resolve edition, volume, or franchise identity beyond the documented keys;
- establish acquisition or patron-facing behavior.

## Future work

Future phases may add:

- adapters from native Source Competence artifacts into the common comparison envelope;
- ComicVine and other source fixtures;
- Local Collection artifacts while preserving deployment boundaries;
- edition/work clustering and series-entry analysis;
- richer maturity and publication-shape comparison;
- repeated-run stability summaries;
- cross-source composition experiments as a distinct mode;
- validated Human Review sidecar ingestion;
- comparison across engine versions for the same source;
- sampling and aggregation across larger representative-profile suites.

Each addition should preserve the rule that comparison consumes evidence and never changes recommendation behavior.
