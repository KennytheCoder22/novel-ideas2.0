# Cascade playtest improvements — September 13, 2026

Implemented without changing saved campaign schema, seeds, level targets or earned stars:

- Include the cinematic board border in tile sizing, preventing edge clipping.
- Show score status, ingredient counts and retry advice on losses; use a scrollable loss sheet.
- Add a goal-aware legal-move hint to Pause. Hints do not spend a move or guarantee a win.
- Add a session-scoped fast-animation switch; system reduced-motion preference remains respected.
- Give neutral opening choices the same calibrated boost without a preference signal. Server validation replays the outcome, rejects forged scores and continues accepting legacy queued skips.

Verification: 20 regression groups pass, including boosted-neutral compatibility and forgery checks; targeted ESLint and web export pass. Local browser startup, neutral boost (600 points and 7 Ember Saffron on recipe 1), hint feedback and fast-animation toggle verified. All 49 cells fit inside the board border in the inspected viewport. Local static preview has no event API, so its notes correctly remain saved locally. Repository-wide typecheck reports unrelated errors; it is not a clean project-wide gate.

Next playtest: verify detailed loss layout on phone/desktop, boosted-neutral live acknowledgements, recipe 11 with hints, recipe 12 and ending. Full campaign completion is not yet verified. Broader story-choice variation, star/difficulty retuning, recommendation explanation grounding and analytics-wide QA exclusion remain follow-ups, not claimed fixed by this patch.
