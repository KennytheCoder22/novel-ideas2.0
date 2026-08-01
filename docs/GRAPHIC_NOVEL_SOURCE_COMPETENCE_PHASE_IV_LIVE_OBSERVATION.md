# Graphic Novel Source Competence Phase IV — Live Observation

## Status

**Phase IV is NOT complete. This is the completion record template.**

Live observation cannot begin until all pre-probe checklist items in `docs/GRAPHIC_NOVEL_LIVE_EVIDENCE_LICENSING_DECISION.md` are resolved. No live requests have been made. No live observation artifacts have been captured.

- Branch: `kennythecoder22-graphic-licensing-live-evidence-plan`
- Planning baseline: `26a7b8bf815a61ebba4498a16788e543b5acaca7`
- Phase III comparison consumed: `comparison_complete` (from `GRAPHIC_NOVEL_SOURCE_COMPETENCE_PHASE_III_COMPARISON.md`)
- Live GCD calls made: **no**
- Live ComicVine calls made: **no**
- Production adapter modified: **no**
- Production recommendation behavior changed: **no**
- Comparative conclusion: **none**
- Human Review: **not performed**

This document will be updated to record the actual outcome when Phase IV is completed.

---

## Gate Card

### Objective

Separate contract stability from point-in-time source transport and composition. Validate whether the frozen fixture-class characterization evidence from Phases I–III resembles current external source behavior by capturing a bounded, terms-compliant set of live observations for GCD and ComicVine, using the same six representative profiles used in the fixture-class phases.

This phase does NOT make production routing or source-selection decisions. It produces evidence only.

### Prerequisites

All of the following must be satisfied before any live request:

1. Phase III comparison is complete (`comparison_complete`) — **satisfied**
2. `docs/GRAPHIC_NOVEL_LIVE_EVIDENCE_LICENSING_DECISION.md` pre-probe checklist is fully checked — **not yet satisfied**
3. For ComicVine: CV-1, CV-2, CV-3, CV-4, and CV-6 resolved with written clarification — **not yet satisfied**
4. For GCD: GC-4 and GC-5 resolved — **not yet satisfied**
5. `scripts/live-evidence/request-manifest-v1.json` predeclared — **satisfied**
6. `scripts/live-evidence/capture-protocol.md` documented — **satisfied**
7. GCD and ComicVine probe runners implemented and regression suite passing — **satisfied**
8. No cover URLs or binaries in capture scope — **enforced by runners**

### Deliverables

| # | Artifact | Status |
|---|---|---|
| D-01 | `docs/GRAPHIC_NOVEL_LIVE_EVIDENCE_LICENSING_DECISION.md` | **Complete** |
| D-02 | `scripts/live-evidence/request-manifest-v1.json` | **Complete** |
| D-03 | `scripts/live-evidence/capture-protocol.md` | **Complete** |
| D-04 | `scripts/live-evidence/run-gcd-live-probe.mjs` | **Complete** |
| D-05 | `scripts/live-evidence/run-comicvine-live-probe.mjs` | **Complete** |
| D-06 | `scripts/live-evidence/frozen/gcd-live-observation-v1.json` | **Pending — legal clearance required** |
| D-07 | `scripts/live-evidence/frozen/comicvine-live-observation-v1.json` | **Pending — legal clearance required** |
| D-08 | `scripts/live-evidence/run-live-evidence-regressions.mjs` | **Complete** |
| D-09 | `scripts/live-evidence/run-frozen-live-delta.mjs` | **Complete** |
| D-10 | This document | **Template complete; outcome pending** |

### Deterministic Acceptance Criteria

Phase IV is complete when ALL of the following pass:

1. **Legal clearance satisfied:**
   ```
   All pre-probe checklist items in docs/GRAPHIC_NOVEL_LIVE_EVIDENCE_LICENSING_DECISION.md
   are checked with written confirmation recorded.
   ```

2. **Replay regression green (no network):**
   ```
   node scripts/live-evidence/run-live-evidence-regressions.mjs
   ```
   All tests pass, including prior phase locks (Phase I, II, III).

3. **GCD probe runner validates in replay mode:**
   ```
   node scripts/live-evidence/run-gcd-live-probe.mjs --mode replay --profile all --verify-no-network --verify-frozen
   ```

4. **ComicVine probe runner validates in replay mode:**
   ```
   node scripts/live-evidence/run-comicvine-live-probe.mjs --mode replay --profile all --verify-no-network --verify-frozen
   ```

5. **Delta report runs without error:**
   ```
   node scripts/live-evidence/run-frozen-live-delta.mjs
   ```

6. **Prior phase locks all green (no regression):**
   ```
   node scripts/source-competence/run-gcd-characterization.mjs --mode replay --profile all --verify-no-network --verify-determinism --verify-frozen
   node scripts/source-competence/run-comicvine-characterization.mjs --mode replay --profile all --verify-no-network --verify-determinism --verify-frozen
   node scripts/comparison-harness/run-gcd-comicvine-comparison.mjs --verify-no-network --verify-determinism
   node scripts/comparison-harness/run-gcd-comicvine-comparison-regressions.mjs
   ```

7. **Secrets absent from all committed artifacts:**
   ```
   git grep -r "COMICVINE_API_KEY\|GCD_API_KEY" -- scripts/live-evidence/frozen/
   ```
   Must return no matches.

8. **Cover URLs and binaries absent from committed artifacts:**
   ```
   git grep -r "imageUrl\|coverImageUrl\|original_url\|super_url" -- scripts/live-evidence/frozen/
   ```
   Must return no matches (presence flags are recorded, not URL values).

9. **Evidence class labels correct:**
   - Frozen artifacts carry `evidenceClass: "Representative Frozen Class"` or `"Live Observation Class"`
   - No Tier 1 artifact carries `evidenceClass: "Fixture Class"`

10. **`git diff --check` passes.**

### Stop Conditions

Any of the following halts Phase IV and locks the result as `live_evidence_unavailable_*`:

| Condition | Lock outcome |
|---|---|
| CV-1 not resolved | `live_evidence_unavailable_legal_block_cv_commercial` for ComicVine |
| CV-4 not resolved | `live_evidence_unavailable_legal_block_cv_storage` for ComicVine |
| ComicVine key absent or invalid | `live_evidence_unavailable_credentials_missing` |
| GC-4 not confirmed | `live_evidence_unavailable_legal_block_gcd_access` for GCD |
| Access refused or key revoked | `live_evidence_unavailable_access_refused` |
| Critical field absent in live response | `live_evidence_unavailable_schema_drift` |
| Session budget exhausted | `live_evidence_budget_exhausted` |
| Cover URL required in capture scope | `live_evidence_unavailable_cover_rights` |

A stop condition result is a valid, correct Phase IV outcome. It does not mean the phase failed — it means the phase completed with the finding that live evidence collection was not possible under the current constraints.

### Unsupported Conclusions

Phase IV does **not** establish any of the following:

1. **Long-term source availability or stability.** A bounded live observation produces a point-in-time sample. It does not establish that either source will be available, stable, or accessible under the same terms in the future.
2. **Source superiority or recommendation usefulness.** Live field-presence rates are not a proxy for usefulness. Human Review is separately required.
3. **Production readiness or routing authorization.** Phase IV is evidence collection only. Production decisions require Phase V (Human Review) and Phase VI (production decision gate) per roadmap.
4. **Commercial permission for ComicVine.** Completing Phase IV does not resolve any licensing question. Each CV-1 through CV-6 answer must be documented separately.
5. **That live evidence matches fixture evidence.** Differences are findings, not errors to be corrected.
6. **Schema stability from a single probe window.** The delta report describes point-in-time field presence. Longitudinal stability requires repeated observation over time.
7. **GCD or ComicVine production adapter recommendation.** No production adapter change is authorized by this phase.
8. **That stop conditions indicate source defects.** A stop condition reflects the current state of legal or operational access constraints, not a judgment about source quality.

### Merge/Lock Criteria

Phase IV closes when:

1. All deterministic acceptance criteria above pass from a clean checkout.
2. All live evidence artifacts are committed with `evidenceClass` correctly set.
3. All stop conditions are documented as `live_evidence_unavailable_*` results in artifacts, not as missing files.
4. Frozen artifacts carry provenance blocks (GCD: CC BY-SA 4.0; ComicVine: linkback + commercial-use status).
5. The delta report is committed as a separate observation artifact.
6. This completion record is updated with the actual outcome, artifact hashes, and capture timestamps.
7. Certification registry is updated with Phase IV evidence class and stop condition status.

Live observation evidence must be committed as a separate, isolated change from any production code change. No production adapter, routing, or recommendation behavior change may be included in the Phase IV merge.

---

## Outcome (to be filled at completion)

- **Outcome:** _(pending)_
- **GCD live observation status:** _(pending)_
- **ComicVine live observation status:** _(pending)_
- **GCD stop conditions:** _(pending)_
- **ComicVine stop conditions:** _(pending)_
- **Frozen GCD Tier 1 artifact hash:** _(pending)_
- **Frozen ComicVine Tier 1 artifact hash:** _(pending)_
- **Delta report ID:** _(pending)_
- **Capture timestamps:** _(pending)_
- **Phase I/II/III locks at merge:** _(pending)_

---

## Hypotheses Carried Forward from Phase III

The following Phase III hypotheses remain to be tested in Phase IV:

| # | Hypothesis | Required evidence | Status |
|---|---|---|---|
| H1 | GCD live records supply language values at a materially higher rate than ComicVine live records at the search endpoint | Representative Frozen evidence | Pending |
| H2 | GCD live records supply sequence ordering evidence at a higher rate than ComicVine live records | Representative Frozen evidence | Pending |
| H3 | ComicVine's relevance-ranked search endpoint returns a larger raw candidate pool per query than GCD's series/issue-lookup surface | Representative Frozen evidence | Pending |
| H4 | Neither source alone — without shared eligibility filtering, Human Review, and routing refinement — can be assumed to produce useful recommendations | Human Review | Pending (requires Phase V) |

H4 cannot be tested in Phase IV. It requires Human Review (Phase V).

---

## Next Authorized Phase After Phase IV

After Phase IV completes (including any `live_evidence_unavailable_*` results documenting stop conditions), the next authorized phase is Human Review (roadmap §6 prerequisite), which requires:

- Representative frozen/live observation complete or stop conditions documented
- Human Review design from `docs/HUMAN_REVIEW_MODE_SPEC.md` implemented
- Reviewed slates hash-linked to specific machine artifacts
- Independent per-source and per-age-band review coverage
