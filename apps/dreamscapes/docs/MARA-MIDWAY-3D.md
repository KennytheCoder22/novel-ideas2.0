# Mara: local Midway character review

Branch: codex/mara-midway-3d. Based on approved main 360d420.
Local only: do not merge or deploy before the user's visual review.

Preview: http://127.0.0.1:4204/experiments/carnival/index.html?mara-review=1
Replay Mara and the timeline are enabled only for localhost/127.0.0.1 with the review query. On portrait, Look right reveals her established resting spot. The initial framing, barrel/EXIT vignette, and artwork are unchanged.

## Source inspection and preservation

The supplied Meshy GLB has one textured mesh: 9,705 triangles, 19,232 render vertices, no skeleton, no skin weights and no animation clips. The four-legged pose supports a lightweight runtime quadruped skeleton. mara-rig.js adds 21 bones and normalized skin weights to a clone of the existing geometry, with separate legs, body/hips/chest, neck/head, tail, scarf and tag. The only bind-space geometry transform is a rigid coordinate-system rotation; no remeshing, proportion changes or repainting.

The runtime GLB uses lossless WebP in place of the embedded PNGs, with EXT_texture_webp. It is 20,533,344 bytes, down from 27,731,416. Every texture's decoded RGBA pixels and dimensions match the source, and all non-image buffer views are byte-identical. Source SHA-256: 70ac2a005c41af0d0e234fb9875d320a04f0c27b1d9bb25d1a040de24e88d0a4. The complete asset report is alongside the runtime GLB. The original user file is untouched.

## Motion and scene

A 2.85-second, depth-aware route enters from outside the viewport, runs through the extreme foreground and brakes at the established lower-right location. The short desktop route enters from the right. Portrait uses a longer offscreen continuation from the left so the first glimpse is visible without changing the approved camera framing. Much of the running fox is cut off by the bottom edge. Paw timing follows travelled distance with stance/swing IK.

Front legs buckle, the torso loses support, the head tips, rear legs fold asymmetrically and the tail drops. Scarf and tag have damped secondary motion. The same skinned mesh remains for the entire run, collapse and stationary resting pose. There is no swap to a sprite, particle system, disintegration or magical effect. Grounding follows the deformed mesh's lowest surface. Warm key light, cool moon fill, a contact shadow and a faint broken reflection fit the scene. Depth-only foreground crate volumes sit behind the near-camera route. Canvas pointer events are disabled, and EXIT remains on its higher existing layer.

The old fox button now examines the actual resting 3D character instead of starting the old sprite/disintegration cinema. The old implementation is retained as a loading-failure fallback. This change is included in the visual review.

## Lifecycle and verification

The model is fetched once and cached in this mounted scene. Each visit starts at most one entrance; departure cancels RAF and hides the canvas. Return starts a fresh visit. Once settled, no RAF or repeated render loop remains. Reduced motion (or motion=still) goes straight to the same final pose. Page hiding pauses; full page disposal releases listeners, rig geometry, textures, renderers and the inspection viewer.

verification/mara-midway.cjs checks desktop, phone portrait and landscape. It exercises actual elapsed playback, grounded skinned bounds, independent bone changes, no idle loop, one download across visits, departure mid-run, return, reduced motion, 3D inspection, EXIT keyboard navigation and preserved landing controls. Detailed pose snapshots and screenshots are in the local mara-review artifact folder. A separate barrel-arm/EXIT regression checks the unchanged arm and fallen-sign state with Mara present. Appearance and motion quality still require the user's approval.
