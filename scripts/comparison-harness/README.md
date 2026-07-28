# Source Comparison Harness - Phase 1

This offline engineering harness compares two immutable source-characterization artifacts for the same representative reader profile. It produces evidence only and does not import or invoke production recommendation code.

## Run

```powershell
node scripts/comparison-harness/run-comparison-harness.mjs --verify-determinism --verify-no-network
```

The default frozen fixture compares Open Library and Google Books across Teen Fantasy, Adult Mystery, and a Preteen source-failure case. Generated JSON and Markdown are written to `artifacts/comparison-harness/phase1/` and are ignored by Git.

Run the focused regression:

```powershell
node scripts/comparison-harness/run-comparison-harness-regressions.mjs
```

## Interpretation boundary

The fixture validates the comparator, not live source quality. Machine metrics remain separate from Human Review. Zero review coverage means `not_reviewed`, never approval.

The harness reports overlap, unique contribution, slate size, underfill, source failure, metadata field coverage, candidate diversity, route-family contribution, fallback usage, and optional hash-linked Human Review coverage. It intentionally does not compare source-native scores.
