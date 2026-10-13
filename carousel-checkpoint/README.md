# Portable Carousel checkpoint

Canonical state: 7 rows (51.428571 degrees), radii 593 / 450 / 307, 14 mounts, 20 usable slots, 6 empty. Outer slot 1 intentionally omitted. Fixed cropped canvases and 80% drawing-buffer resolution are preserved. Cat heading correction included.

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
All scene files live in carousel-checkpoint/public/experiments/carnival. animal-comparison.js contains non-horse scales, source-space pommel points and derived registration/yaw; horse-comparison.js contains the horse registration; carousel.js contains ring/row geometry and SVG ordering; crop-canvas.js contains fixed crops and 80% resolution; carousel-pole-material.js contains matching pole appearance. All 14 GLBs are in carousel/ and are ordinary Git blobs. No absolute machine paths are required by the preview.

manifest.json records exact public-file SHA256 hashes. The launcher checks them to detect transfer damage; after intentionally editing files, regenerate the affected hashes in manifest.json before launching (or remove that verification loop during development).

occupancy/ contains the complete slot map and schematic. PLACEMENT-NOTES.txt records Snail settings and verification limits. revolution-verification.json records the 145 sampled phases. mount-settings.json records runtime transforms for every animal.

The earlier 8/9/10/12-row experiments, raw superseded assets, diagnostic scripts and source-machine screenshots remain local; none is needed to run this checkpoint. This is a portable snapshot of the current 7-row state, not an integration into the production app. Do not merge or deploy this branch. Existing unrelated work was not included.

The checkpoint branch includes vercel.json with Git deployments disabled, solely to prevent this archival push from deploying. Preserve that safeguard on this branch.
