# Recipe 11 solvability and hint repair

A bounded beam search found a legal winning route through the unchanged seeded board and refill stream. It completes in 10 of 19 moves, scoring 18,680 and collecting 23 Moon Dew and 22 Sun Peel. The shortage is not absolute: the route needs setup moves that immediate-match hints overlooked. This does not establish comfortable difficulty for typical players.

The hint system now supplies this tested route when the exact board, RNG, collected counts, score and moves match. Each step is checked against legal moves, and the full route is replayed before being offered. If mechanics change or the player deviates, it falls back to a clearly labeled ordinary suggestion. A fresh retry offers the route again. No campaign resets, score grants, target changes, refill changes or preference signals are added.

Use Pause → Show a move hint after each move, starting from the recipe opening. All three narrative infusions (and their mechanically identical neutral option) support the route. Existing campaigns without the opening boost continue safely with ordinary hints until retried.

Checks: `node --import tsx scripts/test-cascade-eleven-hints.ts` verifies all three offers win with nine moves left, state is not mutated by hints, and mismatched RNG does not claim a tested route. The existing 20 regression groups and targeted lint pass. The bounded audit is reproducible with `node --import tsx scripts/audit-cascade-eleven.ts`.
