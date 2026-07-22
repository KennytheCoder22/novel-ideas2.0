# OL-F1B — Open Library bounded timeout recovery

## Scope

This step captures the OL-F1B implementation handoff after Codex completed the bounded timeout-recovery experiment but could not finish the report write due usage limits.

No Strategy D promotion is included in this step.

## What was implemented

A bounded Open Library first-main-fetch timeout retry path was added for Adult Open Library, along with Teen Open Library lineage/recovery observability and regression plumbing for query-level lineage validation.

The implementation is intentionally bounded:

- No query-family promotion
- No Fantasy routing promotion
- No broad recommendation-policy changes outside the intended recovery path

## Codex-reported OL-F1B live findings (preserved)

Four live rounds succeeded consistently:

- `young adult fantasy series`: **4/4 successful**, always **8 retrieved / 5 accepted**
- `young adult magical adventure`: **4/4 successful**, always **8 / 6**
- `teen fantasy adventure`: **4/4 successful**, always **8 / 4**

Across successful rounds:

- No missing works
- No added works
- No order changes

## Phase-2 Strategy D carry-forward (unchanged)

Strategy D reproduced its prior result exactly:

- **10 eligible**
- **5 contributed**
- **60% precision**
- same five titles
- one adult concern
- one later-series entry
- one younger crossover
- no duplicate pressure

Strategy D remains **unpromoted** in this step.

## Regression outcomes in this handoff

### Focused OL-F1B stability regression

Command:

`node scripts/run-v2-openlibrary-presets.mjs --teen-fantasy-stability`

Result:

- Historical Codex capture reported 4/4 successful rounds for all three constituent queries.
- Later live reruns can still produce occasional `teen fantasy adventure` per-query timeout events; those runs confirm Teen is not using the new first-run retry gate.

### Existing Open Library query-lineage regression

Command:

`npm run --silent test:v2:openlibrary-query-lineage`

Result:

- Passed.
- Includes explicit assertion that per-query lineage reconciliation occurs **without changing recommendations**.

## Conclusion

OL-F1B is captured as a bounded recovery/diagnostics implementation with stable repeated retrieval outcomes and passing query-lineage regression coverage. No Strategy D promotion or Fantasy route promotion was performed in this step.
