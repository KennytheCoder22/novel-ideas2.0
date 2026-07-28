# Phase I Closing Comparison — Open Library and Google Books

## Purpose and boundary

This report answers:

> What do the completed frozen characterizations currently tell us about the relative behavior of Open Library and Google Books?

It does not tune either source, change the Comparison Harness, or propose production behavior. It compares only profiles whose age band, positive signals, negative signals, skip signals, format intent, route intent, and characterization purpose are equivalent.

The machine comparison used:

- Open Library replay summary SHA-256: `471ce00fce2cca3e3bc1ab0274ebea800a82d5dc35ef5a2db10440beb1364b4e`
- Google Books replay summary SHA-256: `4bd73133ff51e4a94df5042ca24256164760ce43335d834ad7a23d353a64fdf9`
- Comparison run: `comparison-ed68a4a545eb221c`
- Identity strategy: the existing Comparison Harness fallback, normalized title plus first creator. The certifications do not share canonical work identifiers, so none were invented.

The generated input, provenance record, JSON comparison, and Markdown comparison are under `artifacts/comparison-harness/phase1-closing/`.

## Comparable profile inventory

Six profiles are genuinely equivalent:

| Comparison | Open Library certification | Google Books certification |
| --- | --- | --- |
| Teen Fantasy | `ol-teen-useful` | `gb-teen-fantasy` |
| Adult Mystery | `ol-adult-useful` | `gb-adult-useful` |
| Preteen Fantasy/Adventure filtering | `ol-preteen-filtering` | `gb-preteen-filtering` |
| Teen Science-Fiction honest underfill | `ol-honest-underfill` | `gb-honest-underfill` |
| Teen Fantasy artifact-heavy | `ol-artifact-heavy` | `gb-artifact-heavy` |
| Adult Mystery valid-empty | `ol-valid-empty` | `gb-valid-empty` |

Three Google Books profiles are intentionally not compared:

**Comparison unavailable — equivalent certified profile does not exist.**

- Kids Fantasy/Friendship: **Comparison unavailable — equivalent certified Open Library profile does not exist.**
- Adult invalid-response shape: **Comparison unavailable — equivalent certified Open Library invalid-response characterization does not exist.**
- Teen disabled-source skip: **Comparison unavailable — equivalent certified Open Library disabled-source characterization does not exist.**

No profile was broadened, weakened, or remapped to avoid an unavailable result.

## Summary

| Profile | Source | Fixture candidates | Accepted | Selected | Underfill | Source-policy attrition | Post-acceptance attrition |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Teen Fantasy | Open Library | 6 | 6 | 6 | 0 | 0 | 0 |
| Teen Fantasy | Google Books | 6 | 1 | 1 | 4 | 5 | 0 |
| Adult Mystery | Open Library | 5 | 5 | 5 | 0 | 0 | 0 |
| Adult Mystery | Google Books | 6 | 6 | 6 | 0 | 0 | 0 |
| Preteen Fantasy/Adventure | Open Library | 4 | 2 | 2 | 3 | 2 | 0 |
| Preteen Fantasy/Adventure | Google Books | 4 | 2 | 2 | 3 | 2 | 0 |
| Teen Science-Fiction underfill | Open Library | 1 | 1 | 1 | 4 | 0 | 0 |
| Teen Science-Fiction underfill | Google Books | 1 | 1 | 1 | 4 | 0 | 0 |
| Teen Fantasy artifact-heavy | Open Library | 3 | 2 | 0 | 5 | 1 | 2 |
| Teen Fantasy artifact-heavy | Google Books | 3 | 0 | 0 | 5 | 3 | 0 |
| Adult Mystery valid-empty | Open Library | 0 | 0 | 0 | 5 | 0 | 0 |
| Adult Mystery valid-empty | Google Books | 0 | 0 | 0 | 5 | 0 | 0 |

“Fixture candidates” is the frozen fixture row count. Adapter raw-result totals can be larger because the same frozen response is replayed across multiple planned queries; accepted counts are deduplicated source-policy handoffs.

## Profile findings

### Teen Fantasy

Observed evidence:

- Open Library accepted and selected all six fixture candidates.
- Google Books accepted and selected one of six: `The Glass Familiar`.
- Overlap is 1 of a 6-title union (Jaccard `0.1667`).
- Five titles are unique to Open Library: `Crown of Lanterns`, `Ember Academy`, `River of Runes`, `Stormbound Heirs`, and `The Moonlit Map`.
- Google Books contributes no unique selected title.
- Google Books rejects five candidates at publication-shape policy: three for insufficient story evidence, one for insufficient narrative identity, and one as nonfiction.
- Open Library has six distinct selected creators; Google Books has one. Neither selected slate contains a duplicate comparison identity.

Interpretation:

- For this frozen Teen Fantasy composition, the relative difference is source-policy admission, not downstream scoring or final eligibility.
- Open Library produces the broader and denser machine-eligible slate here.
- This does not establish that Open Library’s five unique titles are better recommendations.

### Adult Mystery

Observed evidence:

- Open Library accepted and selected five of five candidates.
- Google Books accepted and selected six of six candidates.
- Five titles overlap in a 6-title union (Jaccard `0.8333`).
- Google Books uniquely contributes `A Quiet Verdict`; Open Library contributes no unique title.
- Both slates have one distinct creator per selected title and no duplicate comparison identities.
- No source-policy or post-acceptance attrition occurs.

Interpretation:

- The two frozen characterizations strongly agree on Adult Mystery.
- Google Books adds one machine-eligible candidate without displacing the five shared titles.
- The evidence demonstrates density and agreement, not that the Google Books slate is more useful.

### Preteen Fantasy/Adventure filtering

Observed evidence:

- Both sources begin with four fixture candidates, accept two, and select the same two: `Dragon Club Detectives` and `The Library Door`.
- Overlap is 2 of a 2-title union (Jaccard `1.0`).
- Both honestly underfill by three.
- Both selected slates contain two distinct creators and no duplicate comparison identities.
- Open Library and Google Books reach the same result through source-specific filtering rules.

Interpretation:

- For this frozen profile, the sources are behaviorally equivalent at final selection.
- The underfill is shared evidence, not a source failure and not permission to add filler.

### Teen Science-Fiction honest underfill

Observed evidence:

- Both sources accept and select the single fixture candidate, `Orbit Academy`.
- Overlap is 1 of a 1-title union (Jaccard `1.0`).
- Both honestly underfill by four.
- Neither source introduces a duplicate or a unique contribution.

Interpretation:

- Both sources preserve the same relevant singleton rather than manufacturing a full slate.
- This case validates comparable underfill behavior; it does not measure broader science-fiction competence.

### Teen Fantasy artifact-heavy

Observed evidence:

- Neither source selects a recommendation.
- Open Library accepts two candidates into normalization/scoring, then rejects both at final eligibility; its terminal state is `normalized_but_final_ineligible`.
- Google Books rejects all three at source publication-shape policy; its terminal state is `source_policy_rejected_all`.
- The final union is empty.

Interpretation:

- Both sources protect the final slate, but at different enforcement stages.
- Zero overlap on two empty slates is not evidence of similarity or quality; the meaningful evidence is the differing rejection boundary.

### Adult Mystery valid-empty

Observed evidence:

- Both sources receive a valid empty fixture response.
- Both report `valid_empty_response`, make no candidate handoff, and select nothing.

Interpretation:

- Both correctly distinguish valid emptiness from failed dispatch.
- This is a lifecycle-state comparison, not a recommendation-quality comparison.

## Metadata coverage

For every nonempty selected slate, the generated Comparison Harness reports:

- Open Library artifact-field completeness: `0.8889`
- Google Books artifact-field completeness: `1.0`

The difference is entirely explained by the older Open Library characterization artifact not serializing candidate format, while the Google Books artifact does. Creators, descriptions, genre/theme evidence, publication year, query provenance, and document evidence are present for the compared selected candidates after joining them to their frozen source fixtures.

Therefore:

- observed: Google Books exposes all nine fields measured by the Comparison Harness; Open Library exposes eight;
- not established: Google Books has intrinsically richer live source metadata.

This is an artifact-schema asymmetry and must not be converted into a source-quality claim.

Provider genre counts are also not directly comparable because the sources use different taxonomies. Creator counts and duplicate identities are safer slate-diversity observations.

## Source-specific states

- No comparable profile has a transport failure.
- Teen Fantasy exposes Google Books publication-shape attrition.
- The artifact-heavy profile exposes different rejection stages.
- Valid-empty is preserved as a non-failure for both sources.
- Google Books invalid-response and disabled-skip states remain unavailable for comparison because Open Library lacks equivalent certified profiles.
- Kids remains unavailable rather than being inferred from a different age band or purpose.

## What we currently know

1. Open Library supplies substantially more machine-eligible Teen Fantasy candidates in the frozen equivalent profile.
2. Open Library and Google Books strongly agree on Adult Mystery; Google Books adds one unique machine-eligible title.
3. The two sources produce identical selected Preteen and sparse Teen Science-Fiction slates in their equivalent fixtures.
4. Both sources reject artifact-heavy Teen Fantasy material, but Google Books rejects at source policy while Open Library carries two records to final eligibility.
5. Both sources preserve honest underfill and valid-empty outcomes.
6. Selected-slate duplicates are absent in every nonempty comparison.
7. The existing characterization artifacts are sufficient for six comparisons and insufficient for three others.

## What we intentionally do not know

This comparison does not establish:

- **human recommendation quality;**
- **route ownership;**
- **routing policy;**
- **production preference;**
- **recommendation superiority.**

It also does not establish live transport health, live ranking stability, comparative latency, quota behavior, or whether the synthetic selected titles would satisfy real readers.

Those conclusions remain pending structured Human Review. No source should be promoted, avoided, or preferred in production from this report alone.

## Phase I conclusion

Phase I closes with a bounded relative-behavior result:

- Open Library is machine-denser for the certified Teen Fantasy profile.
- Adult Mystery shows high cross-source agreement plus one Google Books unique contribution.
- Preteen filtering and sparse Teen Science-Fiction underfill converge on identical final slates.
- Artifact protection converges on an empty slate through different stages.
- Three comparisons remain correctly unavailable.

This is the maximum conclusion supported by the frozen characterization evidence. Phase II work is intentionally out of scope.
