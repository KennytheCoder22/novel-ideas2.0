# OL-F1 - Teen Open Library Fantasy Retrieval Path

## Entry condition

The repository regression `teen locked lane tries specific queries before broad fallback` still expects:

1. `fantasy school`
2. `action adventure`
3. `young adult fantasy`

The current fixed-plan planner emits `young adult fantasy`, then `fantasy`. The assertion was introduced by commit `899d90e` on 2026-06-17. The divergence predates the diagnostics-only lineage commit `974f486`; that commit did not change planner construction. Do not update the assertion until OL-F1 determines whether the current planner output is the intended frozen baseline or an older unintended planner drift.

## Reproduction profile

Age band: Teen

- Like `Magic Academy`: fantasy; school, action
- Like `Action Quest`: fantasy; adventure
- Open Library only, limit 5
- Existing production query and timeout behavior unchanged
- Direct fetch path; no Open Library proxy configured

Command:

```text
node scripts/run-v2-openlibrary-presets.mjs --teen-fantasy-ol-f1
```

## Reproduced waterfall (2026-07-21)

| Query | Cascade | Result | Raw | Structural rejects | Accepted after source policy | Merged | Final contribution |
|---|---:|---|---:|---:|---:|---:|---:|
| `fantasy action adventure` | 0 | timed out (`per_query_timeout`) | 0 | 0 | 0 | 0 | 0 |
| `young adult fantasy` | 1 | succeeded | 8 | 4 | 4 | 4 | 0 |
| `young adult mystery` | 4 | succeeded | 8 | 7 | 1 | 1 | 0 |
| `young adult fantasy adventure` | 3 | succeeded | 8 | 6 | 2 | 2 | 0 |
| `young adult contemporary fantasy` | 5 | succeeded | 8 | 5 | 3 | 3 | 0 |
| **Total** |  | **1/5 timed out** | **32** | **22** | **10** | **10** | **0** |

Reconciliation:

- Per-query accepted total: 10
- Aggregate `openLibraryDocsEligibleForScoringCount`: 10
- Per-query merged total: 10
- Aggregate source `rawCount`: 10
- Normalized: 10
- Scored: 10
- Selected/returned: 0

The top final-stage rejection groups were:

- `teen_openlibrary_context_or_generic_only_metadata_taste`: 6
- `teen_openlibrary_single_generic_signal_without_strong_authority`: 3
- `teen_openlibrary_non_narrative_or_adult_shape`: 1

## Initial finding

The zero-result outcome is not explained by retrieval timeout alone. The first targeted query timed out, but four later queries still supplied 10 source-policy-accepted candidates and all 10 reached normalization and scoring. None survived final eligibility. The broad `young adult fantasy` fetch was the largest source contributor (4), but contributed zero final selections.


## Final rejection audit

The zero-final cohort was reproduced twice with the same ten candidates and rejection histogram.

| Title | Originating query | Score | Document-backed positive evidence | Route-only overlap | Final rejection | Gate category |
|---|---|---:|---|---|---|---|
| `Sunshine` | `young adult fantasy` | 13.44 | fantasy | action, adventure | non-narrative/adult shape (`nonfiction or unspecified collection`) | another eligibility rule |
| `Song of Curses` | `young adult contemporary fantasy` | 13.04 | fantasy | none | single generic signal without strong authority | confidence threshold |
| `Lady of Dragons` | `young adult fantasy` | 12.79 | fantasy | action, adventure | single generic signal without strong authority | confidence threshold |
| `Chosen Guardian` | `young adult fantasy` | 12.64 | fantasy | action, adventure | single generic signal without strong authority | confidence threshold |
| `Sudden moves` | `young adult mystery` | 6.91 | none (`book` only) | fantasy, action, adventure | context/generic-only metadata taste | generic/context-only evidence |
| `Born of Fire` | `young adult contemporary fantasy` | 1.41 | none (`book` only) | fantasy | context/generic-only metadata taste | generic/context-only evidence |
| `David Rose and the Forbidden Tournament` | `young adult fantasy adventure` | 1.41 | none (`book` only) | fantasy, adventure | context/generic-only metadata taste | generic/context-only evidence |
| `Warden's Reign` | `young adult fantasy adventure` | 1.41 | none (`book` only) | fantasy, adventure | context/generic-only metadata taste | generic/context-only evidence |
| `Sing Me to Sleep` | `young adult fantasy` | 1.31 | none (`book` only) | fantasy, action, adventure | context/generic-only metadata taste | generic/context-only evidence |
| `Meadow` | `young adult contemporary fantasy` | 0.71 | none (`book` only) | fantasy | context/generic-only metadata taste | generic/context-only evidence |

All ten candidates had:

- no document-backed negative taste evidence,
- no avoid-signal penalty,
- no duplicate suppression,
- no variety-constraint rejection, and
- no selection loss after passing eligibility; all failed the eligibility predicate itself.

### Rejection histogram

| Gate category | Count | Share |
|---|---:|---:|
| Generic/context-only taste evidence | 6 | 60% |
| Confidence threshold: one generic signal without authority | 3 | 30% |
| Other eligibility: non-narrative/unspecified collection shape | 1 | 10% |
| Minimum-overlap gate | 0 | 0% |
| Duplicate suppression | 0 | 0% |
| Variety constraints | 0 | 0% |

## Updated finding

OL-F1 is currently an interaction between retrieval composition and final eligibility, not a timeout-only failure. Retrieval finds records whose query lineage overlaps the requested Fantasy/Action/Adventure route, but that overlap is deliberately excluded from document-backed taste scoring. Six records retain only the generic `book` container signal, three retain only the broad `fantasy` signal without teen-authority or reliable teen-fit evidence, and one is classified as an unspecified/nonfiction collection.

The high scores on the three confidence failures do not represent sufficient final evidence: their positive taste score comes from the broad Fantasy match, while the final gate requires stronger document-backed specificity or authority for a single generic signal. No evidence supports duplicate, variety, negative-taste, or rank-threshold loss as the cause of the zero slate.

Live endpoint variability affects the available cohort: a no-timeout run returned `The Princess Bride` because it had document-backed fantasy, action, and adventure evidence and passed final eligibility. The repeated zero-final cohort remained stable across two instrumented runs.

## Next diagnostic checkpoint

## Controlled Fantasy retrieval-composition experiment

Each query ran alone through the production Open Library adapter, normalization, scoring, and final eligibility. Source underfill recovery was disabled to isolate query composition; the Teen per-query timeout and all policy behavior remained unchanged. Counts below use a successful run for each query; `teen fantasy fiction` succeeded in one run and timed out in the repeat.

| Query | Raw | Structural rejects | Accepted / merged | Fantasy evidence | Teen authority/fit | Book-only | Ambiguous shapes | Scored | Final eligible | Final contribution |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `fantasy action adventure` | 8 | 5 | 3 / 3 | 1 (33%) | 1 (33%) | 1 | 0 | 3 | 1 (33%) | 1 |
| `young adult fantasy` | 8 | 4 | 4 / 4 | 3 (75%) | 0 | 1 | 1 | 4 | 0 | 0 |
| `young adult fantasy adventure` | 8 | 6 | 2 / 2 | 0 | 0 | 2 | 0 | 2 | 0 | 0 |
| `young adult contemporary fantasy` | 8 | 5 | 3 / 3 | 1 (33%) | 0 | 2 | 0 | 3 | 0 | 0 |
| `young adult fantasy fiction` | 8 | 6 | 2 / 2 | 1 (50%) | 0 | 0 | 1 | 2 | 0 | 0 |
| `teen fantasy fiction` | 8 | 1 | 7 / 7 | 6 (86%) | 5 (71%) | 1 | 1 | 7 | 2 (29%) | 1 |
| `young adult magical adventure` | 8 | 2 | 6 / 6 | 6 (100%) | 6 (100%) | 0 | 1 | 6 | 6 (100%) | 5 |
| `young adult fantasy series` | 8 | 3 | 5 / 5 | 4 (80%) | 4 (80%) | 1 | 3 | 5 | 4 (80%) | 4 |
| `teen fantasy adventure` | 8 | 4 | 4 / 4 | 4 (100%) | 4 (100%) | 0 | 0 | 4 | 3 (75%) | 2 |

The three strongest variants reproduced the same composition in both runs:

- `young adult magical adventure`: 6/6 final eligible, 5 final contributions.
- `young adult fantasy series`: 4/5 final eligible, 4 final contributions.
- `teen fantasy adventure`: 3/4 final eligible, 2 final contributions.

Final-eligible count can exceed final contribution because selection still applies the unchanged limit and duplicate-title suppression. Both `teen fantasy fiction` and `teen fantasy adventure` returned duplicate `Teen Titans` records.

The metric is promising but not sufficient for promotion. The high-performing cohorts include questionable adult/crossover or semantically broad titles, including `A Darker Shade of Magic`, `Sufficiently Advanced Magic`, and `Stanley's Christmas adventure`. `young adult fantasy series` also produced three adult/crossover-shape flags. Candidate-level quality and maturity review is required before any query decision.

## Sunshine classification audit

Open Library work: `/works/OL109410W`, Robin McKinley, first published 2003.

Relevant raw fields:

- Subjects include `Vampires`, `Fiction`, `Fiction, romance, fantasy`, `Fiction, occult & supernatural`, and `Fiction, romance, collections & anthologies`.
- The description is a continuous jacket narrative about a protagonist captured by vampires.
- A narrative first sentence is present.
- The classifier independently reports `narrativeFictionShape: true`.

Classification path:

1. `Fiction, romance, collections & anthologies` activates the broad collection-shape pattern through `collections` / `anthologies`.
2. The clear-narrative collection exemption does not match because it expects constructions such as `fiction collection` or `fiction anthology`; the intervening `romance` taxonomy prevents that contiguous match.
3. The record is therefore assigned `nonfiction or unspecified collection`.
4. That shape reason triggers `teen_openlibrary_non_narrative_or_adult_shape`.

This is a publication-shape false positive caused by an internally conflicting Open Library subject facet, not a correct nonfiction classification. The record has strong narrative metadata, but one taxonomy string is interpreted too literally. No classifier change is justified from this single example.

## Fantasy query-order history

- Commit `899d90e` (2026-06-17) introduced the assertion and the expected sequence `fantasy school`, `action adventure`, `young adult fantasy`.
- The exact profile still emitted that sequence at `8d42418^` (`086a4ba`).
- Commit `8d42418` (2026-07-11), titled "Refine teen Open Library fantasy school matching," changed school-lane activation from `hasSchool` to `likedFantasySchoolWeight > 0`.
- `likedFantasySchoolWeight` requires Fantasy and school terms to coexist in the same normalized liked-signal row. The regression profile supplies Fantasy and school/action as separate rows, so the lane stops activating.
- At `8d42418`, the same profile emits `young adult fantasy`, `fantasy`.
- `8d42418` is an ancestor of `main` (`3b30f28`), so the frozen production baseline already contains the tightened behavior.
- The change was intentional; the failure to update the orthogonal assertion appears to be stale regression maintenance. The assertion remains unchanged during OL-F1.

## OL-F1 recommendation

OL-F1 remains a retrieval-query investigation; it should not close as "Open Library metadata insufficient under current policy." The controlled matrix proves that other query constructions can retrieve substantially more document-backed Fantasy and Teen evidence while the existing final gate remains unchanged.

No query is ready for promotion. The next checkpoint is a candidate-quality and maturity audit of the three strongest variants, plus repeat-run stability. If those cohorts remain clean, a separate production-validation phase can compare one candidate query against the frozen baseline.
## Final-eligible candidate quality audit

Classifications are based on the Open Library fields returned by the controlled run. "Maturity" here means audience-position evidence in those fields, not an external content rating.

### `young adult magical adventure`

| Title | Fantasy / Teen evidence | Maturity and shape | Duplicate | Survival basis | Classification |
|---|---|---|---|---|---|
| `Thirteenth Child` | fantasy, adventure, school; YA, juvenile, school-fiction authority | Clear teen/juvenile narrative; no adult flags | Unique work | Multiple document-backed signals | **Strong Teen Fantasy** |
| `A Darker Shade of Magic` | fantasy, action, adventure; YA and juvenile labels | Internally mixed: also explicit `Adult`, adult-romance, and adult-genre flags | Unique work | Multiple document-backed signals | **Adult/crossover concern** |
| `The Inquisitor's Tale` | fantasy, adventure; YA and juvenile authority | Strong narrative but also children/middle-grade positioning | Unique work | Multiple document-backed signals | **Acceptable crossover** |
| `Stanley's Christmas adventure` | fantasy, adventure; generic children/YA taxonomy | Santa/Christmas children's story; substantially younger than representative Teen profile | Unique work | Multiple document-backed signals | **False positive** |
| `Sufficiently Advanced Magic` | fantasy, adventure; only broad `Young Adult` subject | No reliable teen-fit evidence or description; independently published epic fantasy | Unique work | Multiple document-backed signals | **Adult/crossover concern** |
| `Wild Magic` | fantasy, adventure; YA, juvenile, and teen-fantasy authority | Clear teen fantasy narrative; no adult flags | Unique work | Multiple document-backed signals | **Strong Teen Fantasy** |

Precision summary: 2 strong, 1 acceptable crossover, 2 adult/crossover concerns, 1 false positive. Its 100% eligibility rate overstates recommendation precision.

### `young adult fantasy series`

| Title | Fantasy / Teen evidence | Maturity and shape | Duplicate | Survival basis | Classification |
|---|---|---|---|---|---|
| `Carry On` | fantasy, school; explicit YA, boarding-school, and juvenile authority | Clear YA school fantasy; romance taxonomy caused an adult-shape flag | Unique work | Multiple document-backed signals | **Strong Teen Fantasy** |
| `Goldenhand` | fantasy, adventure; YA and juvenile authority | Clear YA fantasy, but a later Old Kingdom entry whose description assumes prior events | Unique work | Multiple document-backed signals | **Weak fit** |
| `Beautiful Creatures` | fantasy, school; explicit YA/high-school evidence | Clear sixteen-year-old YA paranormal fantasy; romance taxonomy caused an adult-shape flag | Unique work | Multiple document-backed signals | **Strong Teen Fantasy** |
| `A Curse for True Love` | fantasy; `Young Adult Fantasy` and reliable description evidence | Explicit conclusion to a trilogy; adult-genre flag conflicts with YA subjects | Unique work | Single fantasy signal plus reliable teen fit and narrative shape | **Weak fit** |

Precision summary: 2 strong and 2 weak because of later-series entry risk. It has no clear too-young false positive, but `series` predictably increases sequel pressure.

### `teen fantasy adventure`

| Title | Fantasy / Teen evidence | Maturity and shape | Duplicate | Survival basis | Classification |
|---|---|---|---|---|---|
| `Teen Titans` (Geoff Johns/DC) | fantasy, action, adventure; children's-fiction authority | Teen-friendly superhero graphic fiction, but genre/format crossover from the requested book profile | Same title as a second work | Multiple document-backed signals | **Weak fit** |
| `I Shall Wear Midnight` | fantasy, action, adventure; teen-fiction and juvenile authority | Clear teen fantasy narrative; no adult flags | Unique work | Multiple document-backed signals | **Strong Teen Fantasy** |
| `Teen Titans` (Ann Marie Harris/Scholastic) | fantasy, adventure; sparse children's-fiction authority | Sparse metadata and no reliable teen-fit evidence; separate adaptation/work | Same title as a second work | Multiple document-backed signals | **Weak fit** |

Precision summary: 1 strong and 2 weak. Duplicate-title pressure and superhero/graphic-format crossover materially reduce its product value.

## `Teen Titans` duplicate analysis

The two records are not multiple editions of one Open Library work:

- `/works/OL5747037W`: Geoff Johns, DC Comics, first published 2004; editions `OL11590976M` and `OL3434977M`.
- `/works/OL8121634W`: Ann Marie Harris, Scholastic Inc., first published 2006; editions `OL10252762M` and `OL7515484M`.

They are separate Open Library works with different authors, publishers, and edition sets that share the same normalized display title. Source merge correctly preserves both because their work/source IDs differ. Normalization also correctly retains two distinct works. Both independently pass eligibility because each carries document-backed Fantasy/Adventure evidence. Final selection then applies duplicate-title suppression and keeps only the higher-ranked Geoff Johns record.

This is intentional late duplicate suppression, not a merge or normalization failure. The final-eligible count includes both policy-eligible works, while final contribution includes one `Teen Titans` plus `I Shall Wear Midnight`.

## Documentation note: Potential Open Library taxonomy false positive

- **Example:** `Sunshine` (`/works/OL109410W`)
- **Triggering taxonomy:** `Fiction, romance, collections & anthologies`
- **Expected classification from the complete record:** narrative fantasy fiction
- **Actual classification:** `nonfiction or unspecified collection`
- **Divergence:** the broad collection pattern sees `collections` / `anthologies`, while the narrative exemption does not recognize `Fiction, romance, collections & anthologies` as a fiction-collection construction because the terms are not contiguous.
- **Status:** one documented example; no classifier change.

## Quality-audit conclusion

None of the three leading queries currently meets promotion criteria.

- `young adult magical adventure` maximizes eligible slate size but has only 50% strong-or-acceptable precision in this cohort and admits both adult/crossover concerns and a too-young false positive.
- `young adult fantasy series` has the cleanest audience/genre precision, but half its eligible cohort consists of later-series entries.
- `teen fantasy adventure` has the lowest precision and the highest duplicate/format pressure.

`young adult fantasy series` is the best precision lead from this single profile, while `young adult magical adventure` remains the best recall/slate-size lead. Neither is production-ready. OL-F1 should continue with representative-profile stability and candidate-quality checks rather than query promotion.

## OL-F1 Phase 2: controlled retrieval combinations

### Method

The representative Teen Fantasy profile remained unchanged. Arms B-E each reused one captured Open Library result per constituent query within the run, so differences between those arms came only from production-equivalent source merge, normalization, scoring, existing final eligibility, and final selection. The harness calls the same source-item merge primitive as the engine through a diagnostics-only wrapper. Arm A ran the actual current production sequence independently.

No query routing, timeout, fallback, score, rank, maturity, eligibility, variety, or duplicate rule changed.

### Successful controlled capture

The first Phase 2 capture returned all three constituent pools:

| Arm | Strategy | Raw | Structural rejects | Accepted | Merged | Final eligible | Final contribution | Strong-or-acceptable precision |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| A | Current production sequence | 32 | 20 | 12 | 12 | 1 | 1 | 1/1 (100%)* |
| B | Series only | 8 | 3 | 5 | 5 | 4 | 4 | 2/4 (50%) |
| C | Magical adventure only | 8 | 2 | 6 | 6 | 6 | 5 | 2/5 (40%) |
| D | Series + magical adventure | 16 | 5 | 11 | 11 | 10 | 5 | 3/5 (60%) |
| E | Series + magical adventure + teen fantasy adventure | 24 | 9 | 15 | 15 | 13 | 5 | 3/5 (60%) |

`*` A's apparent precision is a one-title slate (`The Princess Bride`, acceptable crossover), so it is not comparable to the five-title strategies as evidence of a better retrieval design.

The mixed strategy improved the selected slate over either single-query anchor: D exceeded B and C on the agreed precision class while filling all five positions. Adding `teen fantasy adventure` did not improve aggregate precision beyond D; it changed the type of pressure in the slate.

### Final-slate quality and sequel audit

Every contributed title from the successful capture is classified below. The sequel labels use the publication identity and series context reviewed during the candidate audit; `unclear` is retained where the two distinct `Teen Titans` works do not provide a dependable volume position.

| Arm | Final candidate | Quality class | Sequel class | Pressure note |
|---|---|---|---|---|
| A | `The Princess Bride` | Acceptable crossover | standalone | One-title slate |
| B | `Carry On` | Strong Teen Fantasy | first-in-series | Adult-romance taxonomy flag, but clear YA identity |
| B | `Goldenhand` | Weak fit | later-series entry | Assumes Old Kingdom continuity |
| B | `Beautiful Creatures (Beautiful Creatures Series, Book 1)` | Strong Teen Fantasy | first-in-series | Adult-romance taxonomy flag, but explicit YA/high-school evidence |
| B | `A Curse for True Love` | Weak fit | later-series entry | Trilogy conclusion; adult-genre taxonomy flag |
| C | `Thirteenth Child` | Strong Teen Fantasy | first-in-series | Clean Teen Fantasy fit |
| C | `A Darker Shade of Magic` | Adult/crossover concern | first-in-series | Substantive adult/crossover pressure |
| C | `The Inquisitor's Tale` | Acceptable crossover | standalone | Younger/middle-grade pressure |
| C | `Stanley's Christmas adventure` | False positive | later-series entry | Clear younger-reader pressure |
| C | `Sufficiently Advanced Magic` | Adult/crossover concern | first-in-series | Broad YA taxonomy without reliable Teen fit |
| D | `Thirteenth Child` | Strong Teen Fantasy | first-in-series | Clean Teen Fantasy fit |
| D | `A Darker Shade of Magic` | Adult/crossover concern | first-in-series | Substantive adult/crossover pressure |
| D | `Carry On` | Strong Teen Fantasy | first-in-series | Clear YA identity despite taxonomy flag |
| D | `Goldenhand` | Weak fit | later-series entry | Sequel-entry pressure |
| D | `The Inquisitor's Tale` | Acceptable crossover | standalone | Younger/middle-grade pressure |
| E | `Teen Titans` (Geoff Johns/DC work) | Weak fit | unclear | Duplicate-title and graphic/superhero crossover pressure |
| E | `I Shall Wear Midnight` | Strong Teen Fantasy | later-series entry | Later Tiffany Aching entry |
| E | `Thirteenth Child` | Strong Teen Fantasy | first-in-series | Clean Teen Fantasy fit |
| E | `A Darker Shade of Magic` | Adult/crossover concern | first-in-series | Substantive adult/crossover pressure |
| E | `Carry On` | Strong Teen Fantasy | first-in-series | Clear YA identity despite taxonomy flag |

Sequel histograms for the successful capture:

| Arm | Standalone | First-in-series | Later-series entry | Unclear |
|---|---:|---:|---:|---:|
| A | 1 | 0 | 0 | 0 |
| B | 0 | 2 | 2 | 0 |
| C | 1 | 3 | 1 | 0 |
| D | 1 | 3 | 1 | 0 |
| E | 0 | 3 | 1 | 1 |

Pressure summary:

- B has no substantive adult/crossover classification, but three adult-shape taxonomy flags and two later-series entries.
- C has two substantive adult/crossover concerns and two younger-reader pressures; it has no duplicate pressure.
- D has one substantive adult/crossover concern, one later-series entry, and one acceptable younger crossover; it has no duplicate pressure.
- E has one substantive adult/crossover concern, one later-series entry, and `Teen Titans` duplicate/graphic pressure; it has no younger-reader title in this captured final five.
- Adult-shape diagnostic flags are reported separately from manual adult/crossover classifications so YA romance taxonomy does not inflate substantive adult pressure.

### Repeat-run stability result

A repeat run did not reproduce the complete three-pool capture. `young adult fantasy series` returned no usable pool on that attempt. Because the captured pool was shared across B-E, the failure propagated consistently:

| Arm | Raw / accepted / merged | Eligible / contributed | Result |
|---|---|---|---|
| A | 32 / 12 / 12 | 1 / 1 | `The Princess Bride` again |
| B | 0 / 0 / 0 | 0 / 0 | Series-only arm empty |
| C | 8 / 6 / 6 | 6 / 5 | Same five-title magical-adventure slate |
| D | 8 / 6 / 6 | 6 / 5 | Collapsed exactly to C because the series pool was absent |
| E | 16 / 10 / 10 | 9 / 5 | `Teen Titans`, `I Shall Wear Midnight`, `Thirteenth Child`, `A Darker Shade of Magic`, `The Inquisitor's Tale` |

The repeat E sequel histogram was 1 standalone, 2 first-in-series, 1 later-series entry, and 1 unclear. It retained 60% strong-or-acceptable precision, one substantive adult concern, one duplicate-title pressure, and one younger crossover.

This does not revive the original claim that timeouts explain Fantasy's zero slate: A again retrieved 12 accepted/scored candidates and selected only one. It does show that the proposed mixed strategies have not passed the representative-profile stability gate. No timeout change is warranted from this experiment.

### Phase 2 conclusion

A deliberately mixed pool can outperform either single-query anchor on a successful capture. D is the cleanest mixed strategy in this run because it reaches 60% precision with no duplicate/format pressure, while E reaches the same aggregate precision with three strong Teen Fantasy titles but introduces `Teen Titans` duplicate/graphic pressure. Neither dominates across all quality axes.

No strategy should be promoted. The series pool's repeat-run absence prevents stability validation, and the current comparison covers only one representative profile. If OL-F1 continues, D is the narrower candidate for representative-profile stability testing, with E retained as the recall/Teen-authority comparator. Production validation remains gated on multi-profile stability, maturity review, duplicate pressure, sequel pressure, and no regression against the frozen baseline.
