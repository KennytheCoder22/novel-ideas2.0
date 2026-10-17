# Selected-style loading (not deployed)

Kids/Pre-Teens request Stuffed; Teens requests Plain; Adults requests Ornate. The portal starts background fetching immediately on selection, or resumes a saved preference on reload. A versioned CacheStorage cache carries bytes across the full-page portal-to-Carnival navigation. HTTP cache remains enabled; storage-denied/quota cases continue with ordinary fetch. No service worker or deployment change is needed.

Four downloads and three parse/prepare jobs can run concurrently. Only the active style is queued. If a band changes, already-started requests may finish, but the old preload stops enqueueing more; stale model jobs cannot expose their results. Each canvas remains hidden until its requested model has rendered. Missing mapping / failed GLB load requests that individual Ornate fallback. There is no timeout-based fallback. A failed Ornate fallback leaves that slot hidden rather than displaying corrupt data.

Parsed/prepared models are retained per mount/style within the Carnival document. Revisiting its seven scenes does not download, parse or instantiate them again. Across full-page reloads, bytes are reused from persistent cache and Three objects necessarily parse again. Bump the cache version in mount-preload.js when model content changes.

## Fixed rig preservation

Previously the app downloaded and instantiated all Ornate meshes to calculate canonical bounds, shaft endpoints and crops, then loaded variants. mount-rigs.js records those verified values. Mount initialization now needs no placeholder GLB. Slot positions, scale, yaw, registration, bob amplitude/height, cameras, pole endpoints, fixed crop dimensions and 80% buffers are unchanged. verify-variants.mjs independently reparses the source GLB geometry and checks every stored bound/radius plus all 40 variant fit envelopes. loading-baseline-rig.json preserves the old runtime settings and exact rig capture for comparison. Original GLBs/materials/textures are untouched.

## Asset audit

20 Stuffed files: **153,905,860 bytes (153.91 MB / 146.78 MiB)**. Ornate equivalents total 159,516,896 bytes. Old startup fetched both sets: 313,422,756 bytes; normal Stuffed startup now needs only 153,905,860 bytes (about 51% less).

| Largest Stuffed files | MB |
| --- | ---: |
| Cat | 9.08 |
| Snail | 8.79 |
| Grizzly | 8.44 |
| Wolf | 8.30 |
| Stag | 7.98 |

Stuffed Horse is 4.35x its Ornate file size, Zebra 3.08x, Polar Bear 2.88x. These deserve the next targeted optimization review. All Stuffed models already have approximately 76–78k triangles and one 2048x2048 texture. Their JPEG payloads alone are about 3.8–4.7 MB each. Zebra and Polar Bear Ornate use 1K textures; do not assume 1K will preserve Stuffed appearance. Audit mesh/texture encoding and visual equivalence before reducing resolution or polygons. No assets were changed in this pass. Full per-file size/triangle/texture data: verification/loading-asset-sizes.json.

## Timing and evidence

Measured locally using headless Edge, loopback HTTP and the actual 20 assets. This is a development-machine comparison, not a remote/mobile latency guarantee; OS disk/cache and rendering contention affect results.

| Case | Navigation to final visible mount | First visible mount | Carousel GLB network requests |
| --- | ---: | ---: | ---: |
| Previous serial Ornate then Stuffed | 219.7 s | Ornate placeholder | 40 |
| New immediate entry after Kids selection | 75.1 s | 27.8 s (Stuffed) | 20 |
| New, all bytes preloaded on portal | 40.4 s | 16.1 s (Stuffed) | 0 |
| New, missing Stuffed Dragon | 84.2 s | 22.2 s | 19 (other bytes cached) |

An immediate full-page navigation can interrupt in-flight portal fetches before they reach the persistent cache: that case recorded four partial portal requests plus twenty Carousel requests. The fully preloaded case fetched twenty total, with no repeated Carousel requests. No duplicate parsed model instances were created.

Portal preload completed in 23.1 s in the preloaded case, including portal setup/selection. The earlier 60.7/30.7 s console measurements start after DOMContentLoaded and exclude page setup; use navigation-relative firstRender metrics above for comparisons.

In the immediate-entry case GLB network activity spans 45.0 s and overlaps parsing. In the preloaded case all 20 cache reads succeeded with no GLB network traffic. Per-model parse/image-decode elapsed times sum to 61.9 s (median 3.26 s, max 7.23 s), but overlap across three jobs and include scheduling contention; they are not 61.9 s of CPU or an additive wall-clock stage. Registration preparation totals 1.07 s. Synchronous first-render calls total 7.23 s (including shader/texture-upload submission and rendering). GPU completion time was not independently measurable here; do not label these CPU submission timings as pure GPU time. Cache reads total 8.64 s across concurrent jobs. Raw measurements: verification/loading-results.json; old baseline: verification/loading-baseline-stuffed.json.

The long initial wait therefore was not just network speed: serial double-set startup, image/model parsing, first texture/shader rendering and page work all contributed. The new path removes wrong-style display and duplicate-set transfer, but prefetch alone does not make parsing/upload instantaneous. Entering Carnival before reaching the Carousel gives that initialization additional time.

## Verification

- Immediate entry, fully preloaded entry, and missing Stuffed Dragon: all 20 populated, zero wrong-style frames, only Dragon falls back in the missing case.
- No Plain or unrelated Ornate downloads in those tests; same-band re-selection does not hide ready models.
- Exact canonical setting comparison (normalizing JSON's signed-zero/undefined representation); revisits do not reparse models.
- All four age mappings, desktop keyboard, phone touch, seven-scene persistence and missing Plain Griffin regression are covered by verify-age-bands.cjs.
- Stored bounds/radii and all variant geometry envelopes are independently checked against the unchanged GLBs.

Run from the repository root:
```
node apps/dreamscapes/build.mjs
python -m http.server 4204 --bind 127.0.0.1 --directory apps/dreamscapes/dist
```
In another terminal (Playwright installed, optionally PLAYWRIGHT_MODULE and BROWSER_EXE pointing to existing installations):
```
node apps/dreamscapes/verification/verify-variants.mjs
node apps/dreamscapes/verification/verify-loading.cjs
node apps/dreamscapes/verification/verify-age-bands.cjs
node apps/dreamscapes/verification/verify-loading-switch.cjs
```

Preview: http://127.0.0.1:4204/ . Deployment remains paused for visual approval.
