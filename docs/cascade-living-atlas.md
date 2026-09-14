# Living Atlas — first playable pass

Four two-chapter mysteries now sit alongside the twelve recipes. Chapter I unlocks after the first recipe in a realm; Chapter II unlocks after the third. Two opening choices lead to different continuations, each with two distinct endings: sixteen endings across four realms. Keepsakes and companions appear on realm cards. Completed campaigns can explore all stories without replaying recipes.

This changes narrative outcomes, not tile mechanics, scores or stars. A story decision is final within this story journal; leaving without choosing remains possible and costs nothing. Optional reading-interest feedback is separate and editable. No response is required to progress.

The versioned journal is scoped to library, anonymous player and campaign session, saved through the existing cross-tab lock. It never overwrites the puzzle save or sends a new event through the existing strict telemetry endpoint. Corrupt journals fail closed instead of being silently erased. Failed writes keep the last displayed choice unchanged.

**Data limitation:** these new story decisions and interest responses are stored locally only. They do not yet influence book ranking, sync to another device, or establish a validated reading-preference model. The UI discloses this. A future evidence integration should version the exact offer, distinguish exposures/decisions/explicit interest, exclude QA sessions, validate retention/consent and avoid treating gameplay strategy as taste. Do not change v1 story meanings without migrating/versioning the journal.

The atlas uses one header, a real star counter, a completion message and responsive realm cards rather than an image containing stale controls. The old atlas implementation remains available in source pending full migration/cleanup.

Tests: `node --import tsx scripts/test-cascade-discoveries.ts`. Coverage includes every ending, recipe locks, idempotent choices, JSON persistence, non-mutation and corrupt-state rejection.

## Verification of the first pass

- All 20 existing Cascade regression groups passed; new discovery tests passed, including after parser hardening.
- Web export passed. Targeted lint had no errors and one warning for the retained legacy atlas. Filtered TypeScript output showed no errors in the three changed implementation files; this is not a clean full-repository typecheck.
- Browser: completed recipe 1 through normal UI, opened the atlas, chose the glass seed, saw Pip and the chapter-two recipe gate. Reloaded and continued: Pip and the original three stars persisted.
- Local preview routing was corrected by serving the static export without the SPA fallback. Local preview has no event API, so pending puzzle telemetry is expected; this did not test production sync.
- Browser console still reports React hydration error #418 on initial loading. Its source has not yet been isolated. Do not describe this as an error-free browser check or deploy this draft as fully verified.
- All sixteen ending branches are covered by pure tests, not sixteen complete browser campaigns. Ending feedback, mobile layout and cross-device behavior still need review before release.
- Production campaign was not modified during these checks. This is a local prototype, not merged or deployed.
