# Source Competence Harness - Phase 1

This diagnostic-only harness characterizes Open Library competence with deterministic offline inputs. It does not call live sources and does not replace source, normalization, scoring, eligibility, or selection policy.

## Modes

- `fixture` validates and inventories the versioned profiles and captured response shapes without running the recommendation pipeline.
- `replay` feeds those fixtures through the existing exported Taste Profile, routing, Open Library adapter, normalization, scoring, final-eligibility, and selection functions.

Run all Phase 1 replay cases with the no-network and two-run determinism checks:

```powershell
node scripts/source-competence/run-source-competence-harness.mjs --mode replay --profile all --verify-no-network --verify-determinism
```

Generated JSON and Markdown are written beneath `artifacts/source-competence/`, which is intentionally ignored. Human review fields remain `not_reviewed`; machine terminal states must not be interpreted as human usefulness certification.

## Scope boundary

Phase 1 supports Open Library fixture and replay modes only. It contains no live mode, composition mode, cross-source comparison, production behavior change, or human quality score.
