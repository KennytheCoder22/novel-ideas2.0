# Portable Carousel checkpoint

Canonical state: 7 rows (51.428571 degrees), radii 593 / 450 / 307, 19 mounts, 20 usable slots, 1 empty. Outer slot 1 intentionally omitted. Fixed cropped canvases and 80% drawing-buffer resolution are preserved. Cat heading correction included.

## Current cleaned Rocket addition — October 13, 2026

Rocket occupies middle slot 5, row 2, radius 450, between Horse (slot 4) and
Griffin (slot 6). Reference scale .52; local yaw 217.139034084 degrees; original
saddle/socket axis [.01,.242,0]; XYZ registration [-.0052,-.12584,0]. Nose points
along source -X, so its additional quarter turn preserves tangent orientation.
Matching brass spiral pole; lower sleeve .034285 world units, shortened as needed
to remain above the bracket at the lowest bob. Fixed cropped buffer 451 x 171.
145 phases passed drift, tangent, scale/opacity, depth order and connections.
Minimum sampled deck clearance 13.5512 scene pixels; nearest mount gap >=40.1576
and neighboring poles >=86.6398. All 19 mounts render with active contexts.

Original model (8).glb was a single connected mesh. Only exposed pole geometry
was removed (7,881 triangles); 70 socket-edge triangles were clipped at source
y=.242 and y=-.115. Retained vertex positions, normals and UVs are unchanged;
texture bytes, materials, texture mappings and samplers match the source exactly.
The Rocket body, saddle, fins, nose and engine were visually checked from multiple
views and remain intact. Source copy and cleanup script are preserved in the local
task directory. See rocket-cleanup-report.json and rocket-verification.json.
Current occupancy: 19 occupied / 1 empty (slot 17). Seven rows, base radii, Moon
radius override, existing crops and 80% resolution remain unchanged. Rocket joins
the established shared renderer. No merge or deployment.

## Current Griffin addition — October 13, 2026

Griffin occupies slot 6, inner ring / row 2, radius 307, between Snail (slot 3)
and Wolf (slot 9). Reference scale .46; local yaw 130.003823059 degrees; source
front pommel [0,.40,.28]; XYZ registration [0,-.184,-.1288]. Matching brass spiral
pole; short added lower sleeve .0644 world units (.14 source units) below the body.
Original model (7).glb is unchanged. All other mount settings/crops are preserved.
145 phases passed drift, tangent, scale, opacity, depth ordering and pole checks.
Minimum calculated sampled deck clearance 13.7511 scene pixels. Planar separation
uses convex hulls for Griffin/Wolf and conservative rotated bounds for other
mounts: nearest gap >=8.1904, neighboring poles >=87.8578. Normal projected overlap
remains during parts of the revolution; no calculated mount/pole intersections.
Current count: 18 occupied / 2 empty. All inner slots are occupied. Seven rows,
base radii 593/450/307, the Moon radius override, fixed crops and 80% buffers remain.
See griffin-verification.json. Griffin joins Flamingo and Dragon in the shared
render context, so all 18 mounts stay within the 16-context browser limit.

## Current Flamingo addition — October 13, 2026

Flamingo occupies slot 20, middle ring / row 7, radius 450, beside Dragon in
inner slot 21. Inner slot 6 now holds Griffin. Reference scale .50; local yaw
-130.003823059 degrees; source saddle point [0,.32,.23]; XYZ registration
[0,-.16,-.115]. Latest model (6).glb is unchanged: wings fold naturally over the
side tack, with the visible saddle on the body. The matching brass spiral pole
passes through the forward saddle, clear of the curved neck; its added lower
sleeve ends .07 world units (.14 source units) below the body.
145 revolution phases passed drift, tangent, scale/opacity, depth ordering,
and connection checks. Minimum sampled deck clearance is 13.8276 scene pixels;
conservative Dragon separation >=38.4564 and neighboring pole clearance >=90.7178.
Current count: 18 occupied / 2 empty. Seven rows, widened base radii, original mount crops,
and 80% resolution are preserved. See flamingo-verification.json.

The 17th mount exceeded the browser's per-page WebGL context limit. Flamingo and
Dragon now share one offscreen WebGL renderer while retaining independent cropped
output canvases; shared-mount-renderer.js is a required runtime file. Both outputs
match their original direct-renderer pixels at four cardinal rotations. Existing
mount transforms, materials and buffer resolutions remain unchanged. All 17 mounts
render with active contexts. No merge or deployment.

## Current Dragon placement — October 13, 2026

Dragon occupies slot 21, inner ring / row 7, radius 307. Middle slot 20 now holds Flamingo. Reference scale .60 is retained for a large silhouette;
source front pommel [0,.105,.29]; XYZ registration [0,-.063,-.174]; local yaw
-127.139034084 degrees. The original compact wings and body-mounted tack are
unchanged and stay free of the pole. The added lower sleeve extends only .084
world units (.14 source units) below the body, joining the existing shaft.
145-phase checks confirm tangent heading, negligible axis drift, correct depth
layers, clean connections, and minimum sampled deck clearance 16.1573 scene pixels.
Conservative neighboring-mount separation is >=7.8646; neighboring poles >=65.9544.
See dragon-verification.json. Current count is 18 occupied / 2 empty. Existing mount
settings, cropped canvases, widened ring radii and 80% rendering remain unchanged.

## Current Moon Loveseat addition — October 13, 2026

Moon Loveseat occupies slot 2, middle ring / row 1, beside Snail in slot 3.
Its pole is at radius 521.5 (+71.5 from the middle ring), the user-approved halfway position toward the outer ring. All other pole radii are unchanged.
Its unmodified GLB stays one rigid mount, with the +Z seating direction tangent
and its central back socket aligned to the pole. Reference scale .40; local yaw
178.567605512 degrees; XYZ registration [-.0545976,-.3495496,.1608644].
The four earlier lower-pole corrections remain intact. Original layout, existing
mount transforms/crops and 80% rendering are preserved. See moon-verification.json
for 145-phase clearance evidence and mount-settings.json for final settings.
Older revolution-verification.json describes the original 14-mount checkpoint.
Current local preview: http://127.0.0.1:4201/experiments/carnival/index.html?scene=rides-games

## Resume on another computer
Install Git and Python 3.9 or newer. No npm install, API keys, Stability credits, external asset folders, submodule initialization, or Git LFS required. Three.js and its loaders are bundled.

```sh
git clone --single-branch --branch codex/carousel-seven-row-checkpoint-20261012 https://github.com/KennytheCoder22/novel-ideas2.0.git carousel-work
cd carousel-work
python carousel-checkpoint/preview.py
```
On Windows, `py -3 carousel-checkpoint/preview.py` is an alternative. Open http://127.0.0.1:4200/experiments/carnival/index.html?scene=rides-games . This address is local to the computer running the command. If occupied, add `--port 4201` and use that port. Stop with Ctrl+C.

For an existing checkout:
```sh
git fetch origin codex/carousel-seven-row-checkpoint-20261012
git worktree add -b carousel-resume ../carousel-work origin/codex/carousel-seven-row-checkpoint-20261012
cd ../carousel-work
python carousel-checkpoint/preview.py
```

## Continue editing
All scene files live in carousel-checkpoint/public/experiments/carnival. animal-comparison.js contains non-horse scales, source-space pommel points and derived registration/yaw; horse-comparison.js contains the horse registration; carousel.js contains ring/row geometry and SVG ordering; crop-canvas.js contains fixed crops and 80% resolution; carousel-pole-material.js contains matching pole appearance. All 19 GLBs are in carousel/ and are ordinary Git blobs. No absolute machine paths are required by the preview.

manifest.json records exact public-file SHA256 hashes. The launcher checks them to detect transfer damage; after intentionally editing files, regenerate the affected hashes in manifest.json before launching (or remove that verification loop during development).

occupancy/ contains the complete slot map and schematic. PLACEMENT-NOTES.txt records Snail settings and verification limits. revolution-verification.json records the 145 sampled phases. mount-settings.json records runtime transforms for every animal.

The earlier 8/9/10/12-row experiments, raw superseded assets, diagnostic scripts and source-machine screenshots remain local; none is needed to run this checkpoint. This is a portable snapshot of the current 7-row state, not an integration into the production app. Do not merge or deploy this branch. Existing unrelated work was not included.

The checkpoint branch includes vercel.json with Git deployments disabled, solely to prevent this archival push from deploying. Preserve that safeguard on this branch.

Unicorn added locally on 2026-10-13: middle slot 17 / row 6, between Grizzly 16 and Cat 18. Original model (9).glb geometry/textures retained. Reference scale .50; local yaw -78.5752516306842 degrees; XYZ registration [0,-.125,-.10], front pommel source [0,.25,.20]. Matching brass spiral pole with .07-world-unit lower body sleeve; no bottom bracket overrun. Fixed crop [-162,-90,324,249], 518x398 buffer, 80% rendering. 145 full-revolution samples passed; minimum deck clearance 13.9031 scene pixels; minimum neighboring mount separation 41.1685; neighboring pole clearance 100.5076. All prior mount settings/crops/poles retained; all 20 outputs active. Occupancy: 20 occupied / 0 empty (slot 1 remains omitted). Seven rows and base radii 593/450/307 retained. No merge, push, or deployment.
