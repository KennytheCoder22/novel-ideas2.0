# Melanie's Game: secret hand

## Rules

- Six anonymous real-book premises per deal, whenever six unseen books remain. A limited catalog's last deal is explicitly labeled with its actual remaining count; no invented or recycled books fill it.
- Select zero through all six. Confirming saves only those selections, in selection order. The entire deal leaves the board. The next deal excludes every previously dealt or held book.
- Target five saved picks. Ranking is available from three; a combined save-and-rank action also accepts pending selections. Additional deals remain optional.
- On genuine catalog exhaustion, one or two held books may also proceed. Zero picks produces a clear stopping screen with no positive or negative preference evidence.
- Ranking includes every held book, no fillers. Move-up/down buttons support any hand size. Reveal uses precisely that final order and the original real-book identities.
- The illustrated library, typography, age controls, navigation, and privacy explanation remain. Concealed card backs are used instead of identifiable cover images before reveal. The saved-hand dock is in normal document flow, never over candidate descriptions; it has a horizontal thumbnail strip and expandable anonymous synopsis review.
- Selection borders and polite saved-count announcements provide feedback without motion, so reduced-motion users lose no information.

## Evidence

`held` records confirmed interest in save order. `deals` records each offered set and saved subset, including empty selections. `selected` holds the draft during collection and the final ordering during ranking/reveal. Historical v1 `rounds` are retained for migration.

Unselected books generate **no dislike signals**. Each held book contributes one positive signal, weight 0.6 while collecting; after reveal, weights descend from 1 to 0.45 over the reader's ranking. Passed-over comparisons remain on-device context, not explicit negative preferences. Final ranked book identities use the existing durable feedback queue. Its larger payload allowance is restricted to Melanie's final slate; other games retain their five-book/12,000-character limits.

## Persistence

Version 2 uses the existing context/tab storage key. Every selection, saved deal, ranking move, and reveal is persisted before display. Scope includes player/library/age/source configuration. Existing v1 tournaments migrate with confirmed selections and historical rounds retained; an already-revealed slate is not changed. Book catalog and anonymous premises are preserved on reload, not regenerated. Existing tab-isolation behavior is unchanged.

## Verification

Before changes: 41 Melanie tests passed. New coverage exercises zero/one/two/three/five/six saves, disjoint fresh deals, three-pick selective completion, small-catalog exhaustion, no false dislikes, exact reveal, malformed rankings, context-isolated restore, legacy migration, and feedback for 1–180 held books. Shared recommendation-game tests verify other game behavior remains unchanged.

Verified locally: 51 Melanie tests and 86 shared recommendation tests pass; changed-file ESLint passes. Web export succeeds (53 routes). Repository-wide TypeScript still reports pre-existing errors reproduced on the unchanged baseline; no diagnostics name the changed files.

Two real-browser flows reached reveal: pass six, save one, exhaust the catalog and reveal Blood Orbit; and save five, receive a fresh six, reload, rank all five, move the fifth pick upward, reload again, and reveal precisely that order. The latter revealed Remember Me, The Deep Dark Descending, See Also Deception, Blood Orbit, and Four Promises to Love. Final preference saved to the local queue. Space toggles selection and the accessibility tree reports checked state. Desktop and 390px dock layouts were inspected; age switching preserved separate Kids/Adults hands. Automated tests cover all four age routes and source-scope restoration.

Caveats: local static preview has no feedback API, so browser success confirms local persistence/queueing, not server delivery. Existing hydration warnings also occur on the unchanged baseline. Public-source quality/availability can produce small catalogs and occasional marketing language; this change does not loosen synopsis filters or invent replacement books. Production build status is checked separately during the merge workflow.
