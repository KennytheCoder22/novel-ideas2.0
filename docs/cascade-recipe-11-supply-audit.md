# Recipe 11 supply audit — September 14, 2026

User reported four attempts with insufficient Moon Dew. Screenshots show a 23 Moon Dew target, completed Sun Peel target, and 13–17 Moon Dew collected with one move left. Screenshots alone do not establish cumulative supply.

## Reproducible offline check

Run `node --import tsx scripts/audit-cascade-supply.ts`.

Uses current recipe 11 configuration, its fixed starting seed, the first offered opening catalyst, and all 19 moves unless won earlier. Two policies each run 100 deterministic policy seeds. The goal-focused policy chooses the move with the most immediate visible hits on unfinished ingredient types, randomly breaking ties. It does not plan special-tile combinations or inspect future refills. These are simulated paths, not the user's attempts and not estimates of human win rates.

| Policy | Wins / 100 | Runs supplied fewer than 23 blues | Total supplied min / median / max | Collected min / median / max |
| --- | --- | --- | --- | --- |
| Random legal moves | 1 | 92 | 17 / 20 / 32 | 7 / 13 / 24 |
| Immediate unfinished-goal matches | 2 | 89 | 17 / 20 / 35 | 10 / 14 / 28 |

Supply counts initial blues plus new blues introduced after clearing, using collected blues + remaining blue inventory. Inventory conservation assertions pass on every simulated move; non-inventory-preserving reshuffles would stop the audit. All runs completed without assertion failures.

## Interpretation

There is a real supply failure along many ordinary-looking paths: 89 goal-focused runs never received enough Moon Dew to collect 23, even counting uncollected blues remaining on the board. This does not prove the initial puzzle has no winning route. A previously verified winning route exists, but existence is not adequate evidence of fair balancing.

Refills choose uniformly among six ingredient types without considering remaining objectives. Attempts reuse the same initial seed; changed moves alter subsequent refills, but retrying is not a fresh random starting board. The score target is not the main constraint in the supplied screenshots.

## Recommended repair and verification

1. Address ingredient availability: introduce a bounded drought-prevention rule for unfinished goals, with sufficient lead time to form matches. Merely guaranteeing total supply by the last move is inadequate.
2. Rebalance recipe 11's target or move allowance using repeated policy tests and human play, not one solver route. Do not select a new number without measuring it.
3. Record per-ingredient initial supply, generated supply, collection, remaining moves, seed, and balance version in QA diagnostics. Keep automated QA out of reader preference inference.
4. Explain retry behavior; consider varied, validated retry seeds separately from the supply fix.
5. Regression-check all recipes, special-tile collection, deterministic replay, and saved campaign compatibility before deployment.

This audit changes no gameplay, campaign storage, server data, or deployment.

## Repair implemented locally

Recipe 11's **new attempts** opt into `rulesVersion: 2`. Its swap refills stock Moon Dew first, Sun Peel second, then two mixed ingredients, repeating for each refill. Existing tiles are not recolored, objectives/move limits are unchanged, and every replacement still advances the deterministic RNG once. This supplies ingredients regularly instead of relying exclusively on independent random colors.

Existing active attempts (missing version or version 1) retain their exact old rules and saved board. Retry opts into version 2; it does not reset the campaign. Opening catalysts are unchanged, so all three offers and the neutral option retain equivalent mechanics. Old queued events remain valid; new move/cascade payloads carry an explicit rule version and replay against the matching engine. Unknown versions are rejected.

### Verified scope

The recipe uses one fixed starting seed, not arbitrarily generated seeds. A fully replayed hint route wins in ten moves, leaving nine, for all three opening offers and tested attempt identifiers 1, 2, 100, and 10000. Attempt identifiers do not alter generation. This certifies a winning path from each fresh recipe-11 attempt; it does **not** claim every possible sequence of player moves wins, or certify the other eleven recipes. Hints only claim a tested route when the exact state matches its certificate.

Updated policy comparison: 100/100 random-legal and 100/100 immediate-unfinished-goal runs won; zero supplied fewer than 23 blues. Goal-focused total blue supply min/median/max: 28/32/41. Random-policy supply: 30/34.5/44. These fixed simulation policies are regression evidence, not human difficulty estimates. The earlier prototype stocking two guaranteed blues per four replacements caused excessive cascades and was reduced before the final tests.

Checks passed: 12 route certificates; old verified route; save round trips; deterministic event replay and cascade source binding; invalid version rejection; 20 existing Cascade regression groups; Living Atlas discovery tests; targeted TypeScript check; lint (zero errors, one pre-existing unused legacy atlas warning); web export to `dist-fairness`. Run `npm run test:cascade-fairness`; the standard Cascade test command also includes these fairness checks.

No campaign/browser storage was accessed or changed. No merge or deployment performed. The new build is separate from the currently open preview; a browser playtest of this repair is still pending.
