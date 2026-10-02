# Cascade 2.0: The Hidden Bell (preview experiment only)

Branch: `codex/cascade-school-experiment`, based on main `092d2a9`.
Entry: `/games/cascade-schools?playerId=qa-schools&libraryId=default&ageBand=teens`.
This separate opt-in route is an experimental variant of recipe 3, Copper Rain. No campaign routes, rules, evidence adapters, stars, Living Atlas, or recommendation-delivery code is changed. It is intentionally not linked from the production game portal. Do not merge before human testing.

## Rules

- Both schools use the existing seeded 7×7 engine, matches, gravity, cascades, reshuffles, row/column/burst specials and scoring. Shared targets: 20 moves, 2,700 points, 18 Ember Saffron and 14 Thorn Mint.
- **Oracle's Lens:** one optional inspection per move reveals the exact points, goal ingredients and reaction count of a proposed legal swap, including its deterministic cascades/refills. Inspecting consumes neither a move nor RNG. The player may use the inspected swap or choose another, but cannot inspect a second swap that turn. It adds no tiles, points, or specials.
- **Veiled Crucible:** after every fourth full-recipe move, one seeded ordinary tile becomes a row/column rune. No points or ingredients are awarded merely for transformation. The rune must participate in a match to activate; it can help later cascades. Future outcomes remain hidden. Surprise selection uses a separate deterministic RNG stream, without altering the refill stream.
- Trials use the same initial board/seed/RNG for both schools, with counterbalanced order assigned once and saved. Two valid moves each; Oracle must actually inspect both practice moves. Veiled demonstrates a transformation after the first practice move (the UI explicitly distinguishes this from the full recipe's four-move cadence).
- Only after both trials: choose Oracle, Veiled, or neutral Fate. The displayed full-recipe board is the board on which the choice is recorded.
- After move 10, once all reactions resolve: Keep, Switch, or Fate. The board, score, ingredients, moves and any existing runes carry over. Early completion ends normally without manufacturing a post-win preference decision.
- Both schools uncover the same brass bell and greenhouse story payoff. Neither changes campaign rewards or book access. Failed recipes can retry with the next deterministic seed, retaining trial completion and earlier observations.

## Observations and limits

Versioned `cascade-schools-v1` events are saved atomically with the experimental run in a separate local-storage namespace, scoped by player/library/age/source configuration. Every displayed committed move is saved first. Malformed saves are not silently overwritten. Field Notes offers a local JSON download; nothing is uploaded automatically. The download omits player/library identifiers.

Events: trial completion, first informed choice, midpoint choice, result, retry, and explicit Save & Back. Capture experiment/board versions, recipe, age, seed, attempt, trial order/completion, alternatives, actual choice/Fate, resulting school, board/checksum/RNG, moves, score, collected goals, per-school opportunities/uses and inspected swaps actually played. Veiled uses explicitly mean **automatic transformations**, not voluntary expressions of interest. Ordinary tab closure is not asserted to be abandonment. No pointer traces or response-time profiling.

Each choice includes a bounded one-move progress diagnostic: best exact normal progress, spread of legal outcomes, and an immediate special-transformation upper-bound comparator. Utility is remaining ingredient hits plus score deficit filled / 300. A gap of at least 3 units or four-or-fewer remaining moves flags an obvious confound. This is not a win-probability estimate (that field is null), not a validated skill model, and not proof that unflagged decisions are unconfounded. The comparator imagines an immediate rune rather than forecasting every future schedule, deliberately making it only a warning diagnostic.

Every event has `recommendationEligible: false`; it also fails the production Cascade event normalizer. There are no imports/calls to the recommendation hook, taste adapter, production event creator, transport, or campaign transactions. No Oracle→predictability or Veiled→imagination mapping exists.

## Balance findings

Initial common targets (24/18 ingredients, 18 moves) were too severe: 1/12 wins for each school under the small visible-goals policy. The same targets were openly relaxed for both schools; no school-specific outcome manipulation. The final 12-seed check gives 10/12 wins each. Oracle uses only one actual forecast; other choices use visible immediate matches. Equal totals are coincidental and **not evidence of equivalence**: individual seeds and moves-left vary, and one Veiled seed finishes before midpoint. The check script is reproducible, not a large autonomous playtest.

The central design limitation remains: Oracle asks for extra inspection effort, while Veiled acts automatically. A switch can mean saving time, avoiding extra taps, chasing a tactical benefit, or enjoying a method. Existing special tiles also carry over after switching. Human testing must evaluate that distinction; these data must remain gameplay observations, never reading-taste evidence.

## Validation

All six focused test groups pass, covering trial gating/order, matched starts, actual mechanics, Fate, Keep/Switch, round-trip saves, both-school wins/losses/retries, context and recommendation exclusion. Existing 20 Cascade groups, recipe-11 hint/certificate checks and 200 fairness simulations pass; 86 shared recommendation tests pass. Changed-file ESLint passes and the web export succeeds (54 routes). Project-wide typechecking is not green; the changed-file diagnostic filter reports no errors in these four TypeScript files.

The bounded browser check is complete (no broader autonomous campaign):

- Oracle trials, full Oracle run and midpoint Keep: finished in loss at 6,220 points, 12/18 Ember Saffron and 4/14 Thorn Mint.
- Separate profile, counterbalanced trials, Veiled run and midpoint Switch to Oracle: finished in a win at 8,600 points and both ingredient goals met. Field Notes showed five events, ten Oracle inspections and two Veiled transformations, with recommendation eligibility false.
- Reload after five full-recipe Oracle moves reproduced the entire rendered snapshot exactly, including board and counters.
- Midpoint controls worked in both runs. Exact board/RNG preservation across Keep/Switch/Fate is asserted in unit tests; a literal browser-snapshot comparison across Switch differed because the paused board's disabled controls become interactive.
- Desktop 1280px and mobile 390px screenshots inspected. All seven columns fit mobile; the page scrolls vertically. Temporary viewport override reset. Reused title artwork still has some decorative title lettering visible at desktop edges; this is prototype polish, not a control.
- Both runs used the visible possible-match helper, not a human strategy. These outcomes do not establish balance. No additional browser playthroughs were performed.

The browser still reports React #418 hydration errors on initial load (also observed in earlier app testing); the game recovers and both flows work. This preview is not a clean-console production release. No hydration investigation or unrelated app refactor was added to the experiment.

No motion is required: settled boards, persistent rune marks, forecast text and polite live feedback remain usable with reduced motion. Keyboard buttons, arrow/WASD neighbor selection and Escape are supported. Local data is not cross-device synced; retain or download notes before clearing browser storage.
