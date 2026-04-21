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

## What went wrong before
The system repeatedly broke because lane tuning was being done in shared logic without a stable lane lock.

Symptoms that kept recurring:
- one genre improvement would damage another genre
- Horror would suddenly return `No matches found`
- candidate pools could be healthy upstream but still die later
- regex-heavy edits in shared files caused deployment failures or silent scoring/filtering regressions
- routing, filtering, and ranking were each re-guessing genre instead of respecting one authoritative lane decision

The big lesson:
**The lane must be decided once, then respected everywhere downstream.**

---

## Architecture rule going forward

### Golden rule
When tuning a lane, do **not** make free-floating shared edits that affect all genres unless absolutely necessary.

Instead, lane work must follow this order:
1. decide the lane at the router
2. preserve that lane in the bucket plan
3. let filtering read the lane instead of inferring it again
4. let final ranking use the lane instead of guessing from text alone

If any of those layers re-interpret genre independently, cross-lane breakage becomes likely.

---

## Files that control lane behavior

### 1. `buildBucketPlanFromTaste.ts`
This is the lane router.
It decides the family and should now also explicitly preserve the lane.

This is the safest place to enforce rules like:
- Horror stays Horror
- Thriller stays Thriller
- Romance stays Romance
- a lane does not drift just because a generated query contains overlapping language

### 2. `filterCandidates.ts`
This is the lane filter.
It must consume the router's lane and avoid re-inferring family when a lane is already known.

This file is where off-profile material gets removed, where recovery rules live, and where candidates can be stamped with diagnostics that downstream files can trust.

### 3. `finalRecommender.ts`
This is the final ranker and selector.
This is where canonical author boosts, anchor boosts, and last-step shelf shaping happen.

This file must be lane-aware before it is text-aware.
Do not let this file guess the lane first from title/description if the lane is already known upstream.

### 4. Optional downstream support files
Only touch these if the lane still feels unstable after router/filter/ranker fixes:
- `buildDescriptiveQueriesFromTaste.ts`
- `normalizeCandidate.ts`

These can strengthen a lane, but they should not be the first place to implement protection.

---

## Required lane-protection pattern

The next assistant should preserve this model:

### Step A: lock lane in router
In `buildBucketPlanFromTaste.ts`:
- determine `family` as usual
- determine whether the active lane should be hard-locked
- add a `lane` field to the returned bucket plan

Example idea:
- if Horror signal exists, force the lane to Horror behavior even if the broader family is speculative
- if Thriller is active, keep thriller routing from drifting into romance/fantasy language

### Step B: make filter read lane first
In `filterCandidates.ts`:
- if `bucketPlan.lane` exists, use it
- only fall back to text inference when the lane is missing

This prevents one stage from saying “this is Horror” and the next from saying “actually this looks speculative” or “actually this looks thriller.”

### Step C: make final ranking lane-aware first
In `finalRecommender.ts`:
- canonical boosts and anchor boosts should check explicit lane/family before text-only inference
- old text matching can remain as a fallback, but explicit lane should win

This is how you keep Horror author boosts from turning into broad speculative bias, or Thriller boosts from bleeding into Horror.

---

## The exact protection patch concept already prepared
Three patched files were created and should be treated as the first implementation of lane protection:
- `buildBucketPlanFromTaste.patched.ts`
- `filterCandidates.patched.ts`
- `finalRecommender.patched.ts`

What those patches were intended to do:

### `buildBucketPlanFromTaste.patched.ts`
- preserve normal family routing
- hard-lock Horror when Horror signal exists
- add `lane` to the returned bucket plan

### `filterCandidates.patched.ts`
- use `bucketPlan.lane` before `inferRouterFamily(bucketPlan)`
- stamp diagnostics / `laneKind` onto candidates/docs for downstream use

### `finalRecommender.patched.ts`
- make anchor boosting lane-aware first
- keep the old text-based inference only as backup

If those files have not yet been installed into the repo, they are the first thing the next assistant should examine before inventing a new lane-protection system.

---

## Safe workflow for tuning any single lane

### Before touching anything
1. confirm the currently working deployment for the baseline lane
2. identify which lane is being tuned
3. list the exact files to be touched
4. avoid changing more files than necessary

### During tuning
Only change these in this order:
1. router (`buildBucketPlanFromTaste.ts`)
2. query generation if needed (`buildDescriptiveQueriesFromTaste.ts`)
3. filter (`filterCandidates.ts`)
4. final ranker (`finalRecommender.ts`)

### After each change
Run a live genre session for the target lane and check:
- built query
- fetcher counts
- raw pool summary
- candidate pool summary
- final recommender summary
- top recommendations

If results die between candidate pool and final shelf, the problem is downstream.
If results die before candidate pool, the problem is routing/query/filter upstream.

---

## How to diagnose breakage fast

### If raw pool is large but final results are zero
Look at:
- `filterCandidates.ts`
- `finalRecommender.ts`

This usually means:
- hard reject patterns are too aggressive
- lane is being re-guessed incorrectly
- quality floor is too harsh for the active source
- anchor/penalty logic is suppressing the right candidates

### If query looks wrong
Look at:
- `buildBucketPlanFromTaste.ts`
- `buildDescriptiveQueriesFromTaste.ts`

### If Open Library is dying while Google Books survives
Look at:
- `filterCandidates.ts`
- `normalizeCandidate.ts`

### If deploy fails
Look first for:
- malformed regex arrays
- stray escaped newline sequences
- edited arrays that accidentally included literal `\n`

This happened multiple times before and cost a lot of time.

---

## Hard lessons from prior failures

### 1. Do not paste regex lines with escaped newlines into arrays
Several deployments failed because regex lists ended up with literal `\n` fragments inside TypeScript arrays.
When editing long regex blocks, re-check syntax carefully.

### 2. Do not tune by adding broad global reject rules
Global reject rules hurt other lanes.
If a reject is needed, prefer making it conditional on lane/family.

### 3. Do not rely only on query text for lane identity
Query text is noisy.
Explicit lane routing is stronger and safer.

### 4. Do not fork the whole pipeline unless absolutely necessary
The better pattern is:
- shared engine
- lane-specific routing/query/filter/ranking rules
not a fully duplicated pipeline per genre.

### 5. Confirm where the failure occurs before patching
Do not guess.
Always check whether the break is in:
- query construction
- retrieval
- candidate filtering
- final ranking

---

## Recommended lane-isolation standard
Each lane should eventually have these protections:

### Router-level
- family decision
- explicit `lane`
- compatibility filter for query families

### Query-level
- lane-owned fallback queries
- lane-owned descriptive packs
- no cross-lane fallback pollution unless intended

### Filter-level
- lane-aware reject logic
- lane-aware recovery logic
- lane stamped into diagnostics

### Ranking-level
- lane-aware author boosts
- lane-aware canonical title boosts
- penalties that do not over-punish another lane's natural vocabulary

---

## Practical tuning order for the remaining lanes
The safest order is:
1. Horror protection first
2. Thriller
3. Romance
4. Speculative / Fantasy / Sci-Fi
5. Historical

Reason:
- Horror and Thriller have the most overlap and the highest chance of collateral damage
- Romance has recurring bleed problems with thriller/domestic suspense language
- Speculative lanes can drift into Horror or general fiction if not bounded

---

## If the next assistant wants to continue immediately

### First action
Compare the live repo versions of:
- `buildBucketPlanFromTaste.ts`
- `filterCandidates.ts`
- `finalRecommender.ts`

against the patched files created in this session.

### Second action
Install the lane-protection version if it is not already present.

### Third action
Validate with live sessions:
- Horror still works
- one other lane can be tuned without changing Horror behavior

### Success condition
A lane tune is only successful if:
- the target lane improves
- Horror still works unchanged
- no other working lane regresses unexpectedly

---



---

## Critical Clarification: Lane vs Family
- **family** = broad classification (speculative, thriller, romance, etc.)
- **lane** = enforced behavioral mode for routing, filtering, and ranking

Rule:
> Lane always overrides family when they conflict.

---

## Single Source of Truth Rule
Lane must be:
- decided only in `buildBucketPlanFromTaste.ts`
- preserved in the bucket plan
- respected by `filterCandidates.ts`
- used by `finalRecommender.ts`

Do not let downstream layers re-derive lane from text when explicit lane already exists.

---

## Filter Guardrail
Do **not** tighten filter when final results are already thin.

Practical rule:
- if final results are below 6, debug upstream first
- check query coverage
- check candidate pool size
- check rejection reasons before adding more reject logic

---

## Fast Diagnosis Shortcut

| Symptom | Most likely problem |
|---|---|
| Raw pool is small | query construction / routing |
| Candidate pool is small | filter too aggressive |
| Candidate pool is healthy but final shelf is small | final ranking / selection |
| Open Library repeatedly reaches 0 finals | metadata + filter mismatch |

---

## Open Library Reality
Open Library should not be treated like Google Books.

Recurring pattern:
- page count often missing
- ratings often missing
- narrative metadata is often thinner

Rule:
> Open Library usually needs Hardcover enrichment, authority signals, or lane-specific recovery logic to survive filtering.

---

## Short version for the next assistant
If you only read one section, read this:

- The system broke because lane identity was being guessed separately in multiple places.
- The cure is to decide lane once in `buildBucketPlanFromTaste.ts` and carry it through filtering and ranking.
- The three key files are:
  - `buildBucketPlanFromTaste.ts`
  - `filterCandidates.ts`
  - `finalRecommender.ts`
- Tune one lane at a time.
- Validate upstream and downstream after every change.
- Do not add broad shared rules when a lane-specific rule will do.
- Treat commit `39713a3` and the successful redeploy after it as the recovery baseline.

