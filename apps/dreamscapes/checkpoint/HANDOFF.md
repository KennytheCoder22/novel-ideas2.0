# October 13, 2026 — current 7-row Carousel checkpoint

Branch: `codex/carousel-checkpoint-20261013` in `KennytheCoder22/novel-ideas2.0`.
This is the current end-of-day working scene, including Unicorn. It continues
from `ea4599e8f4ef03d2cbf03da36cc77ed0d82179b0` with all October 13 changes.
`HISTORY.md` and `PLACEMENT-NOTES.txt` describe earlier intermediate states;
this README and `HANDOFF.md` describe the final state.

## Resume on Windows

Install Git and Python 3.9+ if absent. No Node, npm install, build, Vercel account,
network access after checkout, or optional Python libraries are needed for preview.
Run in PowerShell from the folder where you want the checkout:

```powershell
git clone --filter=blob:none --sparse --single-branch --branch codex/carousel-checkpoint-20261013 https://github.com/KennytheCoder22/novel-ideas2.0.git NovelIdeas-Carousel
Set-Location NovelIdeas-Carousel
git sparse-checkout set carousel-checkpoint
py -3 carousel-checkpoint/tools/verify-portable.py --require-tracked
py -3 carousel-checkpoint/preview.py --port 4201
```

If this dedicated checkout already exists at home, instead run:

```powershell
Set-Location NovelIdeas-Carousel
git fetch origin codex/carousel-checkpoint-20261013
git switch codex/carousel-checkpoint-20261013
git pull --ff-only origin codex/carousel-checkpoint-20261013
py -3 carousel-checkpoint/tools/verify-portable.py --require-tracked
py -3 carousel-checkpoint/preview.py --port 4201
```

If your Python install uses `python` rather than the Windows `py` launcher,
replace `py -3` with `python`. Keep the server terminal open; Ctrl+C stops it.
Preview: http://127.0.0.1:4201/experiments/carnival/index.html?scene=rides-games

## Current occupancy

20 occupied / 0 empty among 20 existing mountable slots. The 21-position lattice
has slot 1 deliberately omitted. Outer 6, middle 7, inner 7.

| Row | Outer (593) | Middle (450) | Inner (307) |
|---|---|---|---|
| 1 | Slot 1 omitted | 2 Moon Loveseat* | 3 Snail |
| 2 | 4 Horse | 5 Rocket | 6 Griffin |
| 3 | 7 Ostrich | 8 Rabbit | 9 Wolf |
| 4 | 10 Polar Bear | 11 Fox | 12 Brown Horse |
| 5 | 13 Elephant | 14 Tiger | 15 Stag |
| 6 | 16 Grizzly | 17 Unicorn | 18 Cat |
| 7 | 19 Zebra | 20 Flamingo | 21 Dragon |

*Moon retains middle slot 2 but its pole is at radius 521.5: the authorized +71.5
outward offset halfway toward the outer radius. Base radii remain 593 / 450 / 307.
`occupancy/top-down.png`, `slots.csv`, `REPORT.txt`, and `scene-data.json` agree.

## Added mount transforms

Yaw is the fixed local Three.js Y rotation; registration offsets are applied
before that yaw. The common carousel rotation/depth/bob clock stays unchanged.

| Mount | Slot / ring / row | Reference scale | Local yaw (degrees) | XYZ registration offset |
|---|---|---|---|---|
| Moon Loveseat | 2 / middle / 1 | 0.40 | 178.567605512 | [-0.0545976, -0.3495496, 0.1608644] |
| Dragon | 21 / inner / 7 | 0.60 | -127.139034084 | [0, -0.063, -0.174] |
| Flamingo | 20 / middle / 7 | 0.50 | -130.003823059 | [0, -0.16, -0.115] |
| Griffin | 6 / inner / 2 | 0.46 | 130.003823059 | [0, -0.184, -0.1288] |
| Rocket | 5 / middle / 2 | 0.52 | 217.139034084 | [-0.0052, -0.12584, 0] |
| Unicorn | 17 / middle / 6 | 0.50 | -78.575251631 | [0, -0.125, -0.1] |

`mount-settings.json` records every mount transform, source mounting point,
actual final crops/buffers, pole endpoints and sleeve lengths. The original Horse
uses its dedicated unchanged `horse-comparison.js`; its transform is also in
mount-settings. `verification/current-mount-snapshot.json` captures all 19 mounts
from animal-comparison (including Moon); Horse is the twentieth mount.

## Visuals, pole corrections and performance

Seven rows; widened base radii 593 / 450 / 307; tangent headings; normal shared
crank bobbing; depth scaling and ordering preserved. Snail, Polar Bear, Cat and
Zebra have the shortened lower-pole corrections above their bottom brackets.
New mounts use matching brass spiral poles through their registered pommel,
saddle or Moon socket axes with short lower sleeves. Pole values are recorded
in mount-settings; actual generation is in animal-comparison.js,
horse-comparison.js and carousel-pole-material.js.

All fixed all-yaw crops are retained. crop-canvas.js uses 80% of the original
render-buffer dimensions after cropping (two render pixels per CSS pixel before
the .8 reduction). The five additions Unicorn/Rocket/Griffin/Flamingo/Dragon share
an offscreen WebGL context through shared-mount-renderer.js and retain separate
transparent cropped output canvases. This keeps all 20 outputs active within the
16-context browser limit. All original mounted models and their existing
transforms, crops, poles and rendering settings are preserved.

## Rocket cleanup and unfinished issues

The mounted Rocket is the cleaned `public/experiments/carnival/carousel/rocket.glb`.
The original baked-in pole was removed successfully: 7,881 exposed pole triangles
removed, 70 socket-edge triangles clipped at source y=.242 and y=-.115. Retained
vertex attributes, embedded texture bytes, material definitions and mappings are
preserved. Body/saddle/fins/nose/engine were visually checked. There is no remaining
Rocket baked-pole blocker; normal mounting sockets are retained.

Original source with baked-in pole: `source-assets/rocket-original.glb` (unmounted).
Optional reproducible cleanup: install numpy, then run `py -3 carousel-checkpoint/tools/clean-rocket.py`
from repository root. It writes a separate candidate into source-assets and
never overwrites the current runtime asset. Preview needs no numpy.
See rocket-cleanup-report.json and rocket-verification.json for hashes/evidence.

There are no known unfinished placement blockers. Dense projected occlusion is
normal during parts of the revolution. The recorded checks sample 145 positions
rather than asserting every mathematically possible angle; browser/GPU rendering
may vary slightly on another computer. Unicorn minimum calculated deck clearance
13.9031 scene pixels; no calculated neighbor intersections. All 20 outputs were
active with no console errors in the current preview.

## Present but not mounted

All 20 runtime GLBs are mounted. The only additional checkpoint GLB is the original
Rocket recovery source above. Horse-test front/back/left/right PNGs, shell-column
repair PNG/notes and optimized/stats JSON files are retained experimental/support
files, not extra mounts. `previews/` holds proof screenshots; no temporary QA
HTML/JS pages are required by or included in the public runtime.

## Portability and deployment control

All 91 public runtime files are in manifest.json with bytes/SHA256. Each of the
20 mounted GLBs embeds its buffers/textures; none depends on an external URI.
Three.js, loaders and utilities are vendored. Runtime references are relative;
no required file remains on the school share or in the temporary task folder.
Source assets, Rocket cleanup helper, verification records, occupancy and this
handoff are committed with the runtime. Local scratch browsers/processes are
not needed at home.

The repository-root vercel.json inherited by this branch contains
`{"git":{"deploymentEnabled":false}}`. This disables automatic Git deployments
for all branches. The branch contains no .github/workflows files. Keep this guard:
https://vercel.com/docs/project-configuration/git-configuration
No main merge, PR, deployment, or production settings change is part of this
checkpoint. Detailed live Vercel project inspection was unavailable (connector
403); the tracked repository deployment guard was inspected directly before push.

## Validation

Run `py -3 carousel-checkpoint/tools/verify-portable.py --require-tracked` at home.
It checks manifest bytes/hashes, all scene GLBs, embedded dependencies, local
imports/assets, occupancy, Git tracking and the deployment guard. Preview startup
also checks every runtime hash. Verification files retain today's full-revolution
checks, pole corrections, cleanup evidence and shared-renderer comparisons.
A fresh extraction of the committed snapshot is tested before publishing.
