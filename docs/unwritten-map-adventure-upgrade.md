# The island between the stars

The Unwritten Map now follows Aster's unfinished atlas. Four existing landmarks reveal clues in any order; all twelve encounters still contribute to the completed journey. The finale joins those clues and recalls the player's last three chosen outcomes.

## Player changes

- Opening mystery, clue journal and illustrated overview with named destinations and relative directions.
- Three brief optional activities for the corresponding choices: decode the orchard message, reason about bridge gears, and answer the paper dragon's riddle. Other approaches receive the same quest progress. Help and bypass are always available.
- Completed bridge, lighthouse, dragon and marsh markers gain thematic symbols.
- Keyboard focus returns to the map; movement is blocked during overlays.
- The completed journey renders pending book rewards, including a late-arriving final milestone, and displays books liked on this device for this player/library/age scope.
- Optional rejection reasons and familiarity follow-ups are attached to the durable recommendation feedback event. Existing responses remain unchanged when no detail is supplied.

## Recommendation boundaries

Activity performance, hints and bypasses emit no additional preference evidence. Quest progress derives from durable decisions, so undo/reload updates clues automatically. A skipped preference still permits the story to advance, but supplies no taste signal.

The Unwritten Map adapter preserves themes and tones without automatically promoting imagination/humor to fantasy/comedy genre votes. Only explicit genre tags assert genre preference. Match explanations prioritize specific matched traits over broad genre facets. Feedback detail is stored for tuning; this change does not silently reinterpret `already_read` as positive feedback in existing consumers.

`responseDetail` is an optional, allow-listed addition to the existing feedback wire contract. Older events remain valid. Deploy the matching server validator with the UI. No database migration is required for the existing event storage.

## Verification

- Existing Unwritten Map regression suite: 31 checks pass.
- Recommendation milestone suite: 79 tests pass.
- Adventure tests cover unordered/skip/undo progress, all-skip epilogues, genre separation, and activity eligibility.
- Web production export passes.
- Browser checks: opening, keyboard focus, atlas, incorrect/correct orchard answers, finale rendering, and optional rejection detail callback. Finale and feedback were also inspected in a local-only fixture that is not included in this change.
- Project-wide TypeScript checking remains blocked by existing errors outside the changed game components; an untouched source snapshot was checked for comparison.

## Review limits

This is a first adventure upgrade, not a replacement game engine. Activities are short untimed puzzles, landmarks remain on the existing map, and the epilogue is authored text composed with recorded outcomes. Route hints are directional rather than obstacle-aware pathfinding. Liked-book shelf persistence is device-local; core feedback retains the existing durable queue. Mobile and a second complete end-to-end twelve-choice playthrough of the upgraded version remain useful follow-up QA before merging.
