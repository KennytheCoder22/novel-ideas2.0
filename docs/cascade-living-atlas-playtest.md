# Living Atlas browser playtest

Scope: local preview on localhost:4174, qa-improvements campaign. Production campaign untouched. One complete realm/story loop tested, not all twelve recipes or all sixteen endings.

## Observed passes

- Continued from recipe 1 and Pip discovery saved in the preceding test.
- Completed recipe 2 with normal UI hints: 4,400 points, three stars.
- Completed recipe 3 with normal UI hints: 8,740 points, three stars, five moves left. Hints are legal-move assistance, not consistently objective-efficient.
- Atlas showed nine stars and unlocked recipe 4.
- Chapter II unlocked after recipe 3. Selected Find the future keeper; received The stair of seasons ending.
- Optional interest changed from Yes, more like this to Not my thing without altering ending or stars.
- Reloaded, continued, revisited: ending and nine stars persisted; screenshot confirmed Not my thing remained visually selected.
- At 390 CSS-pixel viewport, document scrollWidth equaled clientWidth (no document-level horizontal overflow). Screenshot scaling was unsuitable for a complete mobile visual pass. Restored default viewport.

## Findings / next changes

1. High: recommendation dialog says Your choices suggest this story could be a good fit despite neutral first whispers in recipes 2 and 3 and no connected Living Atlas evidence. This is not proof that every underlying signal was absent, but generic attribution cannot explain which evidence was used. Use evidence-specific explanations, or call it an exploratory suggestion.
2. High: recommendation dialog exposes Yes, Maybe, No, Already read it, but no explicit Skip/Not now. Used Maybe only as QA input to proceed; do not interpret this as user taste. Offer a genuine no-feedback dismissal.
3. Medium: story promises footprints and a new atlas path, but displayed consequence is only changed keepsake text. Add visible world changes and an actionable follow-up; the board remains unchanged.
4. Medium: old equal-effect first-whisper choices coexist with meaningful story choices, preserving the original sense of inconsequence. Simplify, remove, or clearly distinguish cosmetic infusion selection.
5. Medium: selected interest is visually highlighted but rendered button lacked aria-selected/pressed and the accessibility snapshot did not expose selection. Use supported toggle/radio semantics and verify keyboard/screen-reader state.
6. Medium: final story view repeats first outcome, then jumps straight to ending, omitting the chapter-II dilemma and chosen action. Preserve that context in the completed journal.
7. Medium: story view can retain scroll position, hiding the header. Scroll to the story heading on navigation and manage focus.
8. Release verification still needed: initial hydration warning, remaining realms/endings, proper mobile visual check, and durable server evidence integration. Local static preview has no event API; 112 pending notes at end are not a production sync regression.

Assessment: the first complete loop functions and retains choices, but narrative consequence is still largely textual. It is a useful prototype, not yet a fully connected preference-collection game. No code changes, merges or deployments performed in this playtest.
