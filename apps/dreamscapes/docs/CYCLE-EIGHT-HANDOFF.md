# Cycle Eight — Afterimages: development checkpoint

Branch: `codex/dreamscapes-cycle-eight`. Base: `8814524` (approved Zora trunk repair).
This is an IMPLEMENTATION checkpoint, not a tested release. Do not merge to main or promote to production.

## Experience

After completing Borrowed Light, reflections appear at the Midway puddle and Forest’s Edge. Each offers a different shape sequence. Discovery order determines the reunion pattern on Zora’s empty stool. The clues remain visible in the reunion dialog: no timing test, audio requirement or punishment for a wrong answer. Closing a dialog discards only the entered answer; discoveries remain. Revisit either source in any order, or ignore both and continue the existing game.

Reuniting the patterns offers two reversible consequences: leave a place beside Zora (steady light and settled reflections) or open a way between the reflections (moving light and changed return encounters). Both change the three existing scenes. Revisiting the stool permits changing the outcome. Existing artwork is reused unchanged; new lighting is CSS, not replacement artwork. A small native button sits over each effect, with keyboard camera framing, minimum 44-pixel touch targets and native modal dialogs.

Kids use one shape per source (two total); other bands use two (four total). Each band has distinct narrative copy. All progress, discovery order, choices and raw local observations use separate sessionStorage keys per age band, surviving reload within the tab session. No account sync or cross-session persistence is promised. Storage failures fall back to in-memory state. Existing chest completion saves awaken the experience on load; new completions emit a band-scoped event. No polling or continuous JS animation loop was added.

Potential research hypotheses: interest in revisiting a changed place, connecting separated clues, and choosing a settled or wandering ending. These are NOT validated reading-preference signals. No genres, scores, weights, inferred preferences, timing, or recommendation calls are added. Only bounded raw narrative actions (last 32 per band) are stored separately. Other gameplay remains available without playing Afterimages.

## Files

- `public/cycle-eight/memory.mjs`: pure validated state transitions and persistence schema.
- `public/cycle-eight/afterimages.js`: additive scene controls, reunion puzzle, age copy and lifecycle.
- `public/cycle-eight/afterimages.css`: light/reflection effects and responsive native dialog styling.
- `public/cycle-seven/echo.js`: one completion event; chest choreography and rules preserved.
- `public/experiments/carnival/index.html`: stylesheet/module activation for ordinary Carnival visits.
- `runtime-overrides.json`: deliberate hashes for changed/new runtime files; original checkpoint untouched.
- `tools/afterimages-state.test.mjs`: state/order/age isolation/recovery/observation tests, NOT RUN.
- `tools/afterimages-browser.cjs`: focused eight post-tour browser journeys, NOT RUN.
- `tools/chest-browser.cjs`: full existing chest tour now also asserts Afterimages awakening, NOT RUN.

## Mandatory Sol checkpoint — do not run until user confirms model switch

No build, syntax checks, automated tests, browser tests, screenshots or deployment verification have been performed in this development phase. Read and inspect the implementation before running. Correct routine defects and refresh runtime hashes for deliberate fixes; retain original asset hashes. Test tooling itself is also unexecuted.

Run from this repository root:

```
node --check apps/dreamscapes/public/cycle-eight/afterimages.js
node --check apps/dreamscapes/public/cycle-eight/memory.mjs
node --check apps/dreamscapes/public/cycle-seven/echo.js
node --check apps/dreamscapes/tools/afterimages-browser.cjs
git diff --check
node --test apps/dreamscapes/tools/afterimages-state.test.mjs apps/dreamscapes/tools/chest-state.test.mjs apps/dreamscapes/tools/observations.test.mjs apps/dreamscapes/tools/carousel-choice.test.mjs
node apps/dreamscapes/build.mjs
node apps/dreamscapes/tools/afterimages-browser.cjs
node apps/dreamscapes/tools/chest-browser.cjs
```

The browser tools use `PLAYWRIGHT_MODULE` and `BROWSER_EXE` if needed. Default startPlaytestServer serves built `apps/dreamscapes/dist`; `BASE_URL` targets an existing preview. Do not assume Playwright is locally installed. Existing package scripts and `verification/verify-age-bands.cjs`, `tools/onboard-browser.cjs`, `tools/playtest.cjs` provide broader preservation coverage; inspect their expectations and run applicable existing suites for carousel/mounts/dream playback, Skee-Ball, Mara and navigation. The retired Woods/Home Zora test is superseded by chest-browser.cjs, as documented in BORROWED-LIGHT-CHEST.md.

Focused browser tests seed only existing chest completion to model returning players; they do NOT replace real-tour integration testing. They cover all four bands at desktop 1440x900 and mobile 390x844, both discovery orders, repeat visits, wrong answers, Escape/abandonment, reload, changing endings and age isolation. Full chest-browser.cjs exercises real awakening from the chest across all bands and both sizes.

Also playtest independently: visit Zora after only one source; change age with a reflection/reunion dialog open and during the chest tour; navigate rapidly/replay chest after choosing an ending; ignore reflections; test actual touch panning and tab focus, normal and reduced motion, still mode, disabled storage and corrupt saves. Confirm callbacks cannot consume progress in another band. Inspect mobile effects and focus framing especially: pixel placement and apparent reflected light have not been visually verified. Check inactive animation pause and console/network errors. Confirm approved Zora/ticket/vision, fixed-hinge chest/book/plant, carousel/mount/dream, Skee-Ball, Mara and all routes remain intact.

Pass conditions: all applicable automated checks pass; all eight new browser journeys and eight full chest journeys pass without uncaught errors; both outcomes are visibly distinct at all three sites; wrong/abandoned/repeated/rapid interactions never soft-lock or duplicate discoveries; band switches and reload preserve exactly the intended context; original gameplay/art remains intact; mobile and keyboard access work without overlap; no production recommendation changes. Simulated success cannot establish real player enjoyment or predictive accuracy.

## Preview and remaining delivery

No public preview has been created for Cycle Eight yet. After local tests pass, follow dedicated project deployment instructions (read applicable Vercel skill): ONLY `dreamscapes-novelideas`, project `prj_uDp3rgzYWVvnP82Lv8dD2HFVTQNv`, team `team_qwZFQgAcD4WFkLZmhTMjxnbX`, app root `apps/dreamscapes`. Deploy a public HTTPS PREVIEW, verify it and provide its direct Carnival link. Do not promote or assign production domains. Record all results, limitations, final commit and preview URL in the final delivery report; commit logical fixes before handing back.

## Astra review follow-up

Scene reflections now display the actual circle/star clues, with the discovered sequence visible at Zora. Dialogs retain readable equivalents. Added a per-key in-memory persistence fallback, preserved awakening for the original band when a tour returns after switching bands, and prevented focus restoration to a disabled source. These changes are untested. Sol should specifically exercise storage denied + band switch + late tour completion, and visually inspect clue legibility/overlap at both viewport sizes. The endings currently offer environmental variation and revisit dialogue; meaningful player enjoyment remains unestablished. No additional environment or replacement artwork was introduced.
