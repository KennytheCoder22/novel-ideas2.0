# Architecture

## Source lifecycle

1. A source adapter retrieves candidates and emits explicit source lineage metadata.
2. Normalization converts source-native payloads into shared candidate shape without changing source identity.
3. Source admission applies source-scoped certification policy and returns admitted/rejected candidates plus reasons.
4. Shared scoring runs only on normalized, admitted candidates.
5. Final selection composes the cross-source result set from scored candidates.

## Certification and freeze rules

- A certified source may not acquire taste logic, ranking logic, cross-source diversity logic, or final-selection responsibility.
- Changes to a frozen source require one of: defect correction, upstream compatibility maintenance, or formally scoped certification revision.
- Certification evidence must be reproducible with committed regressions before and after boundary-sensitive changes.

## Ownership boundaries

- Source adapters own retrieval, source-native identity handling, and source-scoped admission controls.
- The Shared Scorer owns taste inference across normalized, admitted candidates. It does not retrieve candidates, reinterpret source identities, or silently override source admission policy.
- Selection owns final cross-source assembly and any diversity/ranking composition policy outside source admission.

## Evidence-first method

1. Define the boundary under change and the invariants that must remain true.
2. Add or update regression evidence that directly exercises those invariants.
3. Implement only within the scoped boundary.
4. Re-run boundary and integration regressions and keep artifacts tied to commit history.

## ComicVine declared certified infrastructure (v1)

- Certified line: `ea18365fbd68775d8247b823831448cb2c2c5b1c` -> `1a349263125f618e88ea23c080551bfa61d1ca4c` -> `9f7e0b0790780812e29f6bb736f69112fe557f6b`
- Certification coverage:
  - Retrieval audit and identity diagnostics
  - Source admission policy and freeze boundaries
  - Certification gap-closure regressions
  - Kitsu/ComicVine integration contract regressions
- Certification tag: `comicvine-source-certification-v1`

## Next architectural focus: Shared Scorer

- Consolidate taste inference in the Shared Scorer with explicit, source-agnostic inputs.
- Preserve source certification boundaries while improving scoring explainability and calibration.
- Keep source admission decisions observable and unchanged by scorer evolution.
