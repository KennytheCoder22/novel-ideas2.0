# Borrowed Light: persistent unlocked padlock

Branch: `codex/borrowed-light-unlocked-padlock`, based on merged main
`bdbd16070a704aab764c9fd6511779f58367d799`.

The first visit still starts with a locked chest and the existing three-wheel
puzzle. Solving it saves `unlocked:true` immediately in the existing
`dreamscapes.chest.v1.<age-band>` session record. The same record still owns
completion, replay round, and legacy prop state. No storage key or separate
persistence mechanism was introduced.

After release, the renderer keeps the approved reference's open-shackle lock
on the front wall. It stops applying the existing closed-lock patch when the
lid reaches its closed position. The original source PNGs, chest body, hinge
geometry, lid easing, contents, light movement, and tour are unchanged.

The unlocked chest remains the replay target. Its accessible name describes
replaying the Borrowed Light journey. Activating it prepares the existing
scenes and starts the same journey directly; the lock puzzle does not reopen.
Skip remains available only after the first completed journey. The existing
completion event and later story consequences are preserved.

Older saves with a completed journey or previously opened lid are read as
unlocked. All states remain isolated by age band. Removing or clearing the
existing chest save and reloading deliberately restores the original locked
interaction. Resetting the unsolved puzzle's wheels simply changes the puzzle
arrangement, as before. Resetting reading interests remains unrelated to the
chest or its story completion.

## Verification

Local results: 64 focused tests passed, all eight age-band/layout padlock
cases passed, and all 18 focused carousel scene checks passed. See
`verification/unlocked-padlock-results.json` for the saved results. Browser
coverage is Microsoft Edge desktop and emulated mobile touch; native
Firefox/Safari were not part of this run.

- `node --test tools/chest-state.test.mjs tools/trunk-geometry.test.mjs` covers
  saved unlocks before completion, legacy saves, age isolation, intentional
  reset, malformed/blocked storage, and the approved hinge geometry.
- `node tools/chest-browser.cjs` exercises all four age bands on desktop
  keyboard and emulated mobile touch: first-time puzzle, wheel reset, release,
  full tour, return/closure, open shackle, puzzle-free replay, skip, reload,
  ordinary scene navigation, age switching, legacy saves, and deliberate reset.
  Additional cases refresh immediately after release before first completion,
  and switch age bands while a replay is underway.
- The browser check compares the entire closed chest canvas before and after
  the first journey. Differences above one channel level must stay within the original lock patch
  (scene coordinates x=1100..1145, y=718..769). The rest of the closed chest must
  remain identical within one color-channel level (also observed when redrawing
  an unchanged locked frame), and hinge coordinates must remain identical at entry,
  full opening, and final closure.
- `node tools/carousel-scene-ownership.cjs` remains the carousel regression
  runner. `SMOKE=1` selects desktop/mobile carousel entry, Zora/return, direct
  scene URLs, and refreshes.
- `node build.mjs` verifies all 217 runtime file hashes and the approved 20
  Ornate and 40 variant mount assets.

Browser scripts accept `PLAYWRIGHT_MODULE`, `BROWSER_EXE`, and `BASE_URL`.
The chest runner accepts `TEST_BANDS` and `CHEST_EVIDENCE` for selecting bands
and keeping screenshots/results outside committed reference evidence.

This branch is for preview review only; its unrelated NovelIdeas automatic
deployment is disabled in the root Vercel configuration.
