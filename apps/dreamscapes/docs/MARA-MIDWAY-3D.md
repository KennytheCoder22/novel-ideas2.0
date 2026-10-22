# Mara: static resting-pose review

Branch: codex/mara-midway-3d. Local only; no merge or deployment authorized.

Preview: http://127.0.0.1:4204/experiments/carnival/index.html?mara-review=1

The current controller shows only a static endpoint. There is no entrance, gait, circling, collapse timeline, or idle render loop. Use 3D Mara, Original 2D fox, and Overlay reference to compare. On portrait, Look right reveals the established resting location.

The unchanged fox.png sets the target footprint. The fitter uses its nontransparent bounds and the existing fox button position, fits uniform model scale to the reference width, and grounds the model at the reference bottom edge. Its head, torso, paws, scarf, and tail are posed separately. This remains a pose candidate: the source model has different facial details and scarf proportions, and the deformed silhouette is not identical to the 2D reference. Bounds alone do not establish an exact pose match.

The supplied Meshy GLB has 9,705 triangles, 19,232 render vertices, no skeleton, and no animation clips. Runtime skinning adds 21 bones to cloned geometry. tools/rig-mara.py builds normalized surface-distance weights, welding duplicate positions for consistent weights across UV seams. mara-skin.bin contains only indices and weights. The source file, runtime GLB, original reference, and textures are unchanged in this revision. The runtime GLB remains 20,533,344 bytes with lossless WebP textures verified against source decoded pixels.

Warm key light, moon fill, contact shadow, and a faint reflection remain. The canvas does not intercept pointer input; the existing EXIT remains above it. The original image is retained for comparison and loading failure. Scene departure hides the canvas; returning shows the same static endpoint. Reduced motion also shows this endpoint.

The first draft motion is superseded. Only after the user approves the endpoint should the run be rebuilt: start around 30% screen width, move directly right, keep the head and upper third above the bottom edge, then lose support abruptly into the approved pose. No circling or changing direction. Do not treat the historical animation results as current verification.

verification/mara-midway.cjs now checks the static controller on desktop, portrait, landscape, and reduced motion. It checks reference comparison, fitted placement, no idle rendering, scene departure/return, one model download, and preserved EXIT. Visual resemblance remains subject to user review.

## October 22 local revision

Synced the home deployment fixes through main 78326d3 before branching to codex/mara-belly-forward. Mara now uses 90% of the previous reference-width fit, centered on the same resting location and ground baseline. Uniform model scaling preserves proportions. The torso rolls toward the viewer; paws come forward and tuck higher, the tail no longer forces the torso upright, and the head stays low. This makes a flatter, belly-forward resting candidate. The reference image and original comparison remain unchanged. Playback is still disabled. Local visual approval is required before merging or deploying this revision.
