# NovelIdeas Tuning Knowledge Log

## Purpose of this file
This is the handoff file for the next assistant working on NovelIdeas recommender tuning.

The goal is to let the next assistant pick up immediately, preserve the current working state, and tune a single lane without breaking the others.

---

## Current state at handoff

### Known-good baseline
- The repo was rolled back locally and force-pushed back to the working commit `39713a3`.
- A fresh empty commit was then pushed to force a new deployment:
  - commit message: `Redeploy restored working version`
- Horror was confirmed working again after that redeploy.

### Why this matters
This baseline must be treated as the safe recovery point.
Do not casually overwrite shared recommender logic from a later broken branch without comparing against this state first.

---

## How to diagnose breakage fast

### If raw pool is large but final results are zero
Look at:
- `filterCandidates.ts`
- `finalRecommender.ts`

### If postFilter is zero
If a source shows:
- raw > 0
- postFilter = 0

Then:
- the failure is definitively in filterCandidates.ts
- do NOT investigate finalRecommender.ts yet
- do NOT assume ranking, scoring, or selection issues

This is a hard stop condition:
Filtering is eliminating the entire source before ranking is ever reached.

Corollary:
If postFilter > 0 but final = 0, THEN investigate finalRecommender.ts.
