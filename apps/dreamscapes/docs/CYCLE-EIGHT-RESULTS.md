# Cycle Eight — Afterimages delivery report

Cycle Eight connects the completed Borrowed Light chest journey to the Midway puddle, Forest’s Edge and Zora’s empty stool. After the tour, the reflections carry complementary shapes. The order the player discovers them determines their reunion pattern. Clues remain readable while solving; incorrect answers can be retried and unfinished interactions can be abandoned without losing discoveries.

The reunited light can rest beside Zora or wander between the reflections. This changes lighting/motion and revisit dialogue at the three sites. The choice remains reversible. Kids receive a two-shape pattern; the other bands receive four shapes, with distinct age-appropriate prose. Progress is separate for each age band and lasts within the browser tab session. A memory fallback supports disabled storage; reload persistence still requires storage.

Artwork was preserved. No recommendation algorithm or weight changed. Bounded, browser-local narrative actions remain separate from production recommendations. Interest in connecting clues, revisiting changes, or choosing a settled/wandering ending are research hypotheses only, not validated literary preferences.

## Verification

- 71 automated state, observation, carousel, chest, renderer, narrative-contract, dream-asset and server tests passed.
- All eight local Afterimages journeys passed: four age bands at desktop 1440x900 and mobile 390x844, both discovery orders, retries, Escape/abandonment, revisits, reload, reversible endings and age isolation.
- All eight full chest journeys passed: four age bands at desktop/mobile, real linked-wheel solution, tour, new awakening hook, closed chest/fallen props, navigation return, replay/skip and age switch from the open puzzle. Pre-Teens used reduced motion; the others exercised ordinary tour motion.
- A focused browser lifecycle check passed with denied storage, an open-dialog age switch, a late previous-band completion event, repeated inspection and Escape. The late event was injected at the integration boundary; it was not a second real cinematic run.
- All 22 preservation journeys passed: six Mara cases, two Skee-Ball cases, eight exploration cases, and six carousel style/device cases. They cover original interactions, all geographic routes, exits, 20 mounts, Ornate/Plain/Stuffed styles, shared rotation and context survival after Skee-Ball. Passed unchanged Mara/Skee and desktop exploration cases were retained while failed mobile cases were rerun.
- Existing dragon ride smoke passed: mount selection, entry, rendering and return. This is bounded smoke coverage, not a new exhaustive playthrough of every dream.
- Syntax and diff checks passed. The build verified 212 registered runtime files, original checkpoint artwork, 20 Ornate models and 40 variants. Vercel's final preview build also passed with the updated runtime manifest.
- Selected desktop/mobile screenshots were visually reviewed for dialog legibility, environmental placement and the corrected mobile control rows. Physical-device performance and exhaustive frame-by-frame cinematic review were not performed.

Testing repaired the preservation and ride test servers to serve built `dist`, which includes approved Zora modules. It also found existing mobile route/camera overlap, then a mount-selector overlap while correcting it. The final layout separates camera controls, routes and the Rides mount selector. No gameplay rules or artwork were replaced.

Compact results are committed in `CYCLE-EIGHT-TEST-SUMMARY.json`. Full local screenshots, recordings and runner diagnostics remain in `verification/afterimages`, `verification/chest`, `verification/afterimages-hosted`, and `playtest-artifacts/2026-11-13T18-06-47-299Z`; these generated files are locally excluded from Git.

Final public HTTPS verification passed both Kids desktop and mobile full Afterimages journeys, including the environmental screenshots, reunion, ending change, reload and age isolation. All four bands were covered locally; the final hosted run is representative coverage rather than all four hosted bands.

## Preview and limitations

Public preview: https://dreamscapes-novelideas-dhpyferbx-kennythecoder22s-projects.vercel.app/carnival/

Deployment: `dpl_4n4ZZ22Bs9JXg1dVihq8AgpSSz5a`, dedicated `dreamscapes-novelideas` project. Preview runtime commit: `5bbdd1d78ded7d197689f0bd1770977f96772a9a`. Subsequent changes contain test tooling and this report only. Production domains were not reassigned; nothing was merged to main.

Human inspection should assess whether players notice the reflections without prompting, find the reunion satisfying, and perceive the ending differences as meaningful. Simulated checks do not establish enjoyment or recommendation accuracy. The experience offers environmental/narrative consequences; it does not add new travel destinations or alter attraction rewards. Very narrow/short physical screens and hardware performance remain unmeasured.
