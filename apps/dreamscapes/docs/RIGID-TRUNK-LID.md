# Rigid trunk lid: construction and verification

Branch: `codex/zora-rigid-trunk-lid`. Baseline: `5338ada43d8da766949172a2c0de472de070c7dd`, containing the approved Zora readiness and unlocked-padlock changes. Main and production must remain unchanged until visual approval.

## Cause and correction

The old lid was one projected panel with a narrow flat-colored edge. The first solid construction inset the top by 0.075 width and 0.06 depth units, producing tapered side walls. The correction removes both insets. Eight vertices now form a rectangular box with constant 0.14 model-unit thickness. Both short walls and the front lip meet the flat top at true right angles in model space. Every vertex uses one rotation about the original rear hinge; no layer has an independent clock, pivot, or translation.

The original camera, 100-degree opening angle, interior texture registration, body mask, hinge knuckles, stays, contents, and animation timing remain unchanged. The inner front lower edge closes on the existing seam `[134,397]` to `[517,445]`. The projected rear hinge remains `[280,342]` to `[729,381]`. The interior silhouette is unchanged; the corrected square outer edges can project beyond it.

The renderer connects the original exterior and interior surfaces with four opaque textured walls. It retains the original body and solved open-shackle artwork. No Borrowed Light, book/plant, Afterimages, navigation, carousel, or persistence logic changes are included.

## Artwork provenance

- Existing `public/cycle-seven/trunk-reference.png`: original exterior, interior, body and lighting; unmodified. Its existing runtime roof material patch, removing the loose red book using adjacent original wood, is retained.
- Existing `public/cycle-seven/chest-clean-plate.png`: unmodified background preparation.
- Supplied `Antique Trunk Lid Asset Sheet.png`: copied byte-for-byte to `public/cycle-seven/lid-components-reference.png`, SHA-256 `6757fda3bd06520359a3b4b2fbe28a4d56cb5e9956d56c6bb736e58996e9e51c`. Only interior UV rectangle `(90,622)` to `(468,668)` is sampled for edge wood and metal. This excludes labels, colored fringes and the generated clasp, preserving the original fitting without duplication.
- Supplied `Trunk Lid Components and Opening Sequence.png`: copied byte-for-byte to `source-assets/trunk-lid/construction-reference.png`, SHA-256 `b7ee05911eef9f918979a28ba382c6c71e42f047e8b5ee7a5e40ec0b6572507f`. Construction reference only, not shipped by the build.

The asset sheet has mostly partial alpha rather than clean opaque pieces. The renderer composites the material onto opaque dark wood before UV sampling. No artwork is regenerated or substituted for the entire trunk. The new image participates in nearby preloading and decoded-image scene readiness.

## Verification and evidence

`tools/trunk-lid-frames.cjs` compares the baseline and candidate at five opening positions and the reverse closing positions. Magnification changes canvas resolution only. `verification/rigid-trunk-lid` contains enlarged comparisons, native desktop/mobile frames and test results.

Geometry regressions sample 201 positions and check the fixed hinge, unchanged inner endpoints, finite projections, perpendicular walls, constant thickness, all vertex-pair distances, and clamped progress. Browser checks use desktop 1440x900 and mobile emulation 390x844.

The chest browser test explicitly waits for scene readiness after navigation commits. Its pixel captures request a consistent canvas raster backend, avoiding Edge's GPU-to-CPU change after readback. These changes affect tests only. The scene-entry test can rerun one layout or the failed-image case alone; it retains the visibility, readiness and retry assertions.

The remaining visual approval concerns the material and corrected silhouette. The original roof patch remains visible under enlargement. No main merge or production promotion is authorized by these results.

## Completed regression results

- 37 focused unit/state/server tests pass.
- Eight full chest browser cases pass: all four age bands on desktop and mobile, including first puzzle, unlock, full tour, closure, open shackle, puzzle-free replay, reload, deliberate reset, age isolation and legacy-save migration. Extra interruption/reload and mid-replay age-change checks pass. No browser errors or failed requests.
- Scene readiness: 13 cases per layout pass, covering cold storage, completed refresh, delayed images/scripts/styles, prefetch without blocking unrelated scenes, age changes, repeated returns and failed-image retry. Desktop failure-case navigation initially timed out waiting for DOMContentLoaded; the focused rerun passed using commit plus explicit scene readiness. Both original and rerun evidence are retained.
- 48 carousel scene-ownership samples cover desktop/mobile, age changes, normal/direct navigation and refreshes in Zora, Hall of Mirrors, Midway and Forest Edge.
- Fourteen native desktop/mobile animation frames plus enlarged five-position opening/closing comparisons were captured and visually inspected.
- Build passes: 219 verified runtime files, 20 Ornate and 40 variant GLBs.

No merge or production promotion was performed.
