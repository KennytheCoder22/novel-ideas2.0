# Source Competence Harness

This diagnostic-only harness characterizes recommendation sources with deterministic offline inputs. It does not call live sources and does not replace source, normalization, scoring, eligibility, or selection policy.

## Certified fixture sets

- **Open Library Phase 1** remains available through `run-source-competence-harness.mjs`.
- **Google Books Phase 1** is available through `run-googlebooks-certification.mjs` and is documented in `docs/GOOGLE_BOOKS_SOURCE_CERTIFICATION.md`.

Each source keeps source-native fixtures and diagnostics while using the same lifecycle and terminal-state vocabulary.

## Modes

- `fixture` validates and inventories versioned profiles and captured response shapes without running the recommendation pipeline.
- `replay` feeds fixtures through the existing exported Taste Profile, routing, source adapter, normalization, scoring, final-eligibility, and selection functions.

Run the locked Open Library replay:

```powershell
node scripts/source-competence/run-source-competence-harness.mjs --mode replay --profile all --verify-no-network --verify-determinism
```

Run Google Books certification:

```powershell
node scripts/source-competence/run-googlebooks-certification.mjs --mode replay --profile all --verify-no-network --verify-determinism
node scripts/source-competence/run-googlebooks-certification-regressions.mjs
```

Generated JSON and Markdown are written beneath `artifacts/source-competence/`, which is intentionally ignored. Human Review fields remain `not_reviewed`; machine terminal states must not be interpreted as human usefulness certification.

## Graphic Novel Source Competence Phase I

The GCD characterization is fixture-only because no production GCD adapter exists and live access is not authorized. It maps wholly synthetic GCD-shaped records into the approved source-neutral reading-unit contract, freezes the structured result, and explicitly reports the production lifecycle as `adapter_not_implemented`.

```powershell
node scripts/source-competence/run-gcd-characterization.mjs --mode replay --profile all --verify-no-network --verify-determinism --verify-frozen
node scripts/source-competence/run-gcd-characterization-regressions.mjs
```

This characterizes source-record, publication, readable-work, reading-unit, and recommendation identity evidence. It does not exercise production routing, scoring, eligibility, selection, live transport, source comparison, or human usefulness.

## Scope boundary

The harness supports fixture and replay modes. It contains no live mode, production routing decision, cross-source comparison, production behavior change, or human quality score.

Open Library and Google Books certification artifacts remain independent. Cross-source conclusions belong in the locked Source Comparison Harness after equivalent independently characterized profiles exist.
