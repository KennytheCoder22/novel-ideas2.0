# Approved GLB trunk integration

## Change

The scene now draws the approved, unmodified Zora_Trunk_Prepared.glb through Three.js. The previous image-warp lid/body renderer is removed. The existing approved clean plate still removes the baked-in background trunk; surrounding artwork is unchanged.

Source: model-preparation/zora-trunk/delivery/Zora_Trunk_Prepared.glb. Shipped asset: public/cycle-seven/zora-trunk.glb. Byte identity verified. SHA256: 67c078daa22ceeaac2f9e518833ee6e6c1d2d780c4b85bc3d3970c6108f85825. Size 17,957,844 bytes; 230,911 triangles. No geometry, material, texture, UV, hinge, or stay edits.

The synchronized lid/stay clips are sampled at 1/30 + 2 * progress seconds (source frames 1 through 61). Closing samples the same poses in reverse. The shackle has a separate saved-state clock and stays open after the lid closes. Existing puzzle rules, journey timing, tour destinations, persistence and story consequences are unchanged. The padlock hit target is projected from the actual model.

A shared preload promise caches the GLB per document. Scene readiness waits for model/textures, shader compilation and the first rendered saved-state frame. The WebGL canvas belongs to Zora's location plane and is hidden with that scene. Rendering is on demand with a capped 480 x 600 backing buffer, without an idle animation loop or GPU-to-2D copies.

## Focused verification

- Build: PASS, 220 runtime files verified, existing carousel assets verified by the build.
- Desktop 1440 x 900 and mobile emulation 390 x 844 / DPR 2: PASS first locked state, three-wheel puzzle/reset, unlock, full Borrowed Light journey and return, closing while unlocked, puzzle-free replay, completed/interrupted saves, explicit reset, refresh and navigation away/back.
- All tour destinations and afterimage awakening verified. No browser errors or failed requests.
- One GLB request per document across repeated scene navigation. No visible trunk outside Zora.
- Approved GLB byte identity and all six required named components verified.
- Deliberately held GLB request: Zora was not revealed until ready. Puzzle glyphs verified after removing obsolete 2D image preloads.
- Closed, half-open and fully open captures: see review.html.
- No full four-age-band or unrelated carnival regression suite was run.

## Performance

Desktop full-journey sample: median frame 16.7 ms, p95 16.8 ms; p95 trunk draw 2.4 ms. Mobile emulation: median frame 16.7 ms, p95 16.8 ms; p95 draw 3.3 ms.

Additional 4x CPU-throttled mobile opening/closing probe: median frame 16.7 ms, p95 16.8 ms; p95 draw 6.4 ms. An initial probe immediately after full tour preparation stalled. A static control reproduced a 1.7-second frame while the trunk performed no rendering; the subsequent animated probe passed. This separates scene warm-up work from the trunk animation and does not justify altering the approved mesh. Physical mobile hardware was not connected; these measurements are browser emulation, not device benchmarks.

## Reproduction

Set PLAYWRIGHT_MODULE to the installed Playwright package and BROWSER_EXE to Edge/Chromium. From apps/dreamscapes:

- node build.mjs
- node tools/glb-integration.cjs (desktop and mobile; optionally DESKTOP_ONLY=1 or MOBILE_ONLY=1)
- node tools/glb-loading-smoke.cjs (readiness gate, puzzle text and 4x CPU static/animated probes)

The older chest-browser test was updated to assert GLB identity/triangle count in place of its obsolete 2D canvas pixel-patch assertion.
