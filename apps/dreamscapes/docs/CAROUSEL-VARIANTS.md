# Carousel model variants — review batch, 16 October 2026

This batch adds all 20 Plain and all 20 Stuffed GLBs alongside the 20 existing
Ornate files. Nothing is deployed. Visual approval of all three sets is pending.
The supplied files are copied unchanged. Import names and SHA256 checksums are in
`../verification/2026-10-16-variant-import.json`.

## Review locally

From the repository root:

```powershell
node apps/dreamscapes/build.mjs
python -m http.server 4200 --bind 127.0.0.1 --directory apps/dreamscapes/dist
```

Open `http://127.0.0.1:4200/experiments/carnival/index.html?scene=rides-games&carousel-dev=1`.
The temporary developer control switches **Ornate | Plain | Stuffed**. The
current set stays visible while the next set loads; all 20 swap in one batch.
Missing mappings or load failures retain that identity's Ornate model, with a
fallback count in the control. No new variants load until selected. Refreshing
returns to Ornate. Without `carousel-dev=1`, the developer UI is absent.

Use **Inspect all 20** for a labeled row/ring contact sheet and **Rotate review
90°** for another view. The inspection uses the existing shared WebGL context;
it does not allocate twenty extra contexts or change the running Carousel pose.
Add `&motion=still` to compare styles at the same Carousel phase. Phone users can
use the existing look controls to bring the Carousel into view.

## Mapping and transforms

`public/experiments/carnival/mount-variants.js` maps each identity to its three
model URLs. Test Horse maps to `horse` (row 2 outer), Griffon to `griffin`, and
Loveseat to `moon-loveseat`. The omitted row 1 outer slot stays omitted.

Every variant has `scale`, `yaw` (radians), and `offset: [x,y,z]`. These modify a
model-only wrapper inside the existing registration group. The initial fit
registers the source at the proportional position of the original saddle/socket
and fits within the original vertical and all-yaw radial envelope. `scale` is a
multiplier after that fit; XYZ offsets use the original model's coordinate units,
before the existing mount's world scale and fixed tangent turn. They never move
the slot, pole, or camera. Source artwork/geometry/materials are not edited.

Actual fit and applied model transforms are saved in
`../verification/2026-10-16-variant-browser.json` and exposed on each mount holder
as `data-variant-transform`. Further hand tuning belongs only in the mapping.
Increasing scale or offsets beyond the original envelope needs a fresh crop and
clearance review; the canonical geometry should remain unchanged.

Applied source-axis corrections: Plain Griffin −90°; Stuffed Brown Horse +90°;
Stuffed Flamingo +90°; both Cats +28.933873°. Those corrections compensate for
export orientation and preserve the established tangent heading.

## Individual visual review

All 60 identity/style combinations were inspected in the 20-position review
grid; Plain and Stuffed also received quarter-turn views. All 40 new model
registrations pass the fixed crop/deck envelope checks. This is a first fit,
not a claim that inferred saddle positions are exact. Priorities for individual
transform refinement are listed explicitly below. They do not block reviewing
the entire batch with the temporary switch.

| Row / ring | Identity | Plain review | Stuffed review |
| --- | --- | --- | --- |
| 1 / middle | Moon Loveseat | Needs individual seat-facing yaw and socket XYZ calibration; different seat silhouette | Needs individual seat-facing yaw and socket XYZ calibration; different seat silhouette |
| 1 / inner | Snail | Initial fit clear | Initial fit clear |
| 2 / outer | Horse | Initial fit clear | Initial fit clear |
| 2 / middle | Rocket | Review fore/aft and vertical socket alignment against this different hull | Review fore/aft and vertical socket alignment against this different hull |
| 2 / inner | Griffin | Reversed heading corrected; initial fit clear | Initial fit clear |
| 3 / outer | Ostrich | Initial fit clear | Initial fit clear |
| 3 / middle | Rabbit | Initial fit clear | Initial fit clear |
| 3 / inner | Wolf | Initial fit clear | Initial fit clear |
| 4 / outer | Polar Bear | Initial fit clear | Initial fit clear |
| 4 / middle | Fox | Initial fit clear | Initial fit clear |
| 4 / inner | Brown Horse | Initial fit clear | Source-axis correction applied; initial fit clear |
| 5 / outer | Elephant | Initial fit clear | Initial fit clear |
| 5 / middle | Tiger | Initial fit clear | Initial fit clear |
| 5 / inner | Stag | Review fore/aft registration: shaft is toward the rear of the new saddle | Initial fit clear |
| 6 / outer | Grizzly | Initial fit clear | Initial fit clear |
| 6 / middle | Unicorn | Initial fit clear | Initial fit clear |
| 6 / inner | Cat | Heading corrected; review fine saddle XYZ because this source has a different body angle | Heading corrected; review fine saddle XYZ because this source has a different body angle |
| 7 / outer | Zebra | Initial fit clear | Initial fit clear |
| 7 / middle | Flamingo | Initial fit clear | Source-axis correction applied; initial fit clear |
| 7 / inner | Dragon | Initial fit clear | Initial fit clear |

"Initial fit clear" means no obvious new clipping/heading problem in the views
inspected; final artistic acceptance remains with the user. Moon Loveseat is the
strongest manual-registration candidate; Rocket, Cat and Plain Stag warrant the
next focused saddle/socket pass. The cleaned Ornate Rocket is untouched.

## Preservation and checks

Existing slot/ring geometry, radii 593/450/307, pole endpoints, Moon offset,
tangent turn, bobbing, mount height, depth sorting, opacity, fixed crop cameras,
80% render resolution, shared renderer and navigation are retained. The original
model remains available for exact restoration; only model children of the
registration group are exchanged. Unused replacement meshes/textures are
disposed on subsequent swaps, and gallery canvases share the existing context.

`node apps/dreamscapes/verification/verify-variants.mjs` parses actual GLB geometry
for all 40 variants, checks conservative crop/deck bounds and XYZ registration,
verifies all 20 original GLB hashes, and tests 20 missing-mapping fallbacks.
The normal build verifies 141 runtime files, 20 Ornate GLBs and 40 variant GLBs.

Browser checks: all 20 loaded in every style; Plain/Stuffed preserve every
canonical slot/anchor/crop/mount-height/bob setting at a fixed phase; round-trip
restoration to Ornate; 1440×1000 desktop and 390×844 phone controls and panning;
keyboard style selection and modal focus. A real missing Plain Griffin GLB was
tested only in the generated local dist folder: 19 Plain mounts plus 1 Ornate
Griffin remained visible, then all 20 Plain loaded after restoring that file.
That intentional 404/warning is excluded from normal-runtime error checks.
Physical phone hardware performance has not been measured. This adds about
316 MB of source assets, loaded on demand by style, not on initial page load.

No production release, main merge, DNS change or NovelIdeas production change
is included in this batch.
