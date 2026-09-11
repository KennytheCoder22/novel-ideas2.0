# Media Mania: session flow

Based on production `b1958c2`. This branch contains no Unwritten Map changes.

The first engagement pass gives ongoing play a visible six-choice rhythm, explains the
LIKE/DISLIKE rules before source selection, and uses shorter image-and-title cards
below 760px so comparisons require less scrolling. The existing Back action now
says Save & leave to make its persistence behavior clear.

Set progress derives entirely from the saved completed-round count. Unknown-title
replacements do not advance it; undo retracts it; a resumed session retains it;
changing age bands resets it with the existing state. Finishing a set shows an inline
message without adding a modal or blocking a book reward. After the first media
unlock, the permanently full unlock bar disappears while set progress continues.

Sets do not award points, change preference evidence, change candidate selection,
or guarantee a book. Existing recommendation eligibility and reward delivery apply.

## Checks

- `npm run test:media-mania` includes the new set-boundary and undo regressions.
- `npm run test:media-mania:integration` covers unknown replacements, undo, resume,
  age routing, reward keyboard guards, and rewards at six and twelve choices.
- Changed-file ESLint passes.

## Playtest

Open `/media-mania` and choose a source. Compare all three cards on a narrow phone
and a desktop; inspect long titles and unavailable artwork. Complete six choices,
handle the media unlock and book reward, then continue into the next set. Undo a
choice at a set boundary, reload, and change age bands. Check that the set indicator
tracks the corresponding game state. Confirm Save & leave returns normally and
resuming restores the session.

This is a local engagement iteration; production has not been changed.
