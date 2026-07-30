# Graphic Novel Source Competence Phase II Handoff

## Status

This is a task specification for future work. It does not begin ComicVine characterization, perform source comparison, or authorize production changes.

- Authoritative restart branch: `main`
- Published Phase I source-competence baseline before this handoff: `3ed9143f08716b60b2ddf1041fb9f8ec78c5bfd1`
- GCD characterization commit: `17760a48f95364b45b5390f7ccc6de9191e9c0e6`
- Evidence-class rule commit: `3ed9143f08716b60b2ddf1041fb9f8ec78c5bfd1`
- GCD evidence class: Fixture Class
- Frozen GCD artifact: `scripts/source-competence/frozen/gcd-phase1-summary.json`
- Frozen artifact working-file SHA-256 at handoff: `f12e8e76b0b7c94f4ef76ddb286c735971df5e5772aa8393b73282a0bf224651`

Read these governing records first:

1. `docs/RECOMMENDATION_PHILOSOPHY.md`
2. `docs/GRAPHIC_NOVEL_SOURCE_EVALUATION_INVENTORY_AND_CONTRACT.md`
3. `docs/GRAPHIC_NOVEL_PRE_CHARACTERIZATION_GATES.md`
4. `docs/GRAPHIC_NOVEL_SOURCE_COMPETENCE_PHASE_I.md`
5. `docs/SOURCE_COMPARISON_HARNESS.md`

## Objective

Independently characterize ComicVine under the identical source-neutral reading-unit contract, Fixture Class methodology, frozen representative profiles, and measurements used for GCD.

Phase II is an **equivalence-certification phase**, not a source-comparison phase.

> **ComicVine characterization is complete when its artifacts demonstrate evidence-class, measurement, contract, and profile equivalence with the frozen GCD characterization artifacts, allowing a valid source comparison to be performed without changing comparison methodology.**

A failure in any equivalence dimension makes comparison unavailable. It does not establish that ComicVine is defective.

## Four required equivalence dimensions

### 1. Evidence-class equivalence

Both sources must be characterized using Fixture Class evidence:

- deterministic;
- wholly synthetic or otherwise identically licensed fixture evidence;
- no live requests;
- immutable input and output hashes;
- explicit no-network verification;
- no Human Review or production telemetry mixed into the artifacts.

Fixture evidence must not be compared with current live ComicVine observations or existing production diagnostics.

### 2. Measurement equivalence

Use identical definitions, denominators, and unavailable-state handling for:

- raw record count;
- structurally accepted records;
- source-record identity;
- publication identity;
- readable-work identity;
- reading-unit identity;
- recommendation-capable identity count;
- reading-unit kind histogram;
- ambiguous identity count and lineage;
- collapse groups and evidence;
- missing sequence evidence;
- incomplete creator credits;
- date conflicts;
- metadata field coverage;
- production-adapter boundary;
- valid-empty and invalid-response controls.

Do not substitute ComicVine production diagnostic counts, source-native scores, eligibility results, or selected slates for these measurements.

### 3. Contract equivalence

Apply the same five layers:

```text
Source Record Identity
        ↓
Publication Identity
        ↓
Readable Work Identity
        ↓
Reading Unit Identity
        ↓
Recommendation Identity
```

Apply the same invariants and fail-closed rules from the pre-characterization gate. Do not encode current ComicVine recommendation policy into the source-neutral mapper.

In particular:

- query text is not identity evidence;
- title alone cannot merge records;
- variants remain distinct publications;
- bindings/editions collapse only with sufficient content evidence;
- issues, trades, and omnibuses remain distinct reading units;
- ambiguity remains explicit;
- supporting reference or series entities are not patron-facing reading units merely because production policy currently handles them.

### 4. Profile equivalence

Use the exact six frozen profile purposes without broadening or substituting intent:

- `gn-adult-speculative-ensemble`
- `gn-adult-horror-mystery`
- `gn-teen-fantasy-adventure`
- `gn-teen-superhero-identity`
- `gn-preteen-humor-adventure`
- `gn-teen-manga-volume`

Also retain equivalent valid-empty and invalid-response controls.

A ComicVine fixture may honestly underfill, remain ambiguous, or lack evidence. Do not strengthen it merely to match GCD's counts.

## Architectural safeguards

- Do not modify the production ComicVine adapter.
- Do not modify routing, queries, normalization, scoring, eligibility, ranking, diversity, selection, recovery, or rendering.
- Do not copy `comicVineAdmission.ts` or other production policy into the characterization mapper.
- Do not alter the frozen GCD fixtures, profiles, artifact, measurements, or conclusions to facilitate equivalence.
- Do not modify the locked Comparison Harness during characterization.
- Do not make live ComicVine or GCD requests.
- Do not add a GCD production adapter.
- Do not infer source quality from fixture composition.
- Preserve current ComicVine certification locks and prove production hashes unchanged.

## Required deliverables

1. Source-shaped, wholly synthetic ComicVine Fixture Class corpus covering the exact profile and identity boundaries.
2. Diagnostic-only ComicVine reading-unit characterizer using the source-neutral contract.
3. Deterministic replay command and focused regressions.
4. Frozen ComicVine characterization artifact with immutable hash.
5. ComicVine characterization report separating observations, interpretations, conclusions, and unresolved questions.
6. Equivalence-certification report for the four dimensions.
7. Explicit decision:
   - `comparison_valid`; or
   - `comparison_unavailable_evidence_class_asymmetry`;
   - `comparison_unavailable_measurement_asymmetry`;
   - `comparison_unavailable_contract_asymmetry`; or
   - `comparison_unavailable_profile_asymmetry`.
8. Complete production-invariance and existing ComicVine-lock validation results.

The equivalence report must not contain overlap, ranking, winner, preference, or route-ownership conclusions.

## Stopping conditions

Stop and report before proceeding if:

- the source-neutral reading-unit contract cannot represent a ComicVine entity without changing shared meaning;
- an identical measurement cannot be produced without invoking production recommendation policy;
- a frozen profile cannot be represented honestly at Fixture Class;
- real ComicVine data or live access becomes necessary;
- licensing or redistribution treatment becomes ambiguous;
- production behavior would change;
- the Comparison Harness would need modification merely to accept the artifacts;
- an architectural decision is required.

An unavailable comparison is a successful and valid Phase II outcome when supported by evidence.

## Unsupported Conclusions

Phase II must explicitly state that it does not establish:

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

## Completion boundary

Phase II ends with an equivalence determination.

If and only if all four dimensions pass, a later comparison-only task may consume the two frozen artifacts. That later task must preserve the evidence-class rule and may report differences, not production decisions.

Characterize first. Certify equivalence second. Compare third. Form hypotheses fourth. Validate production changes later.