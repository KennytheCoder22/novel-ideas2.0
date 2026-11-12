# Madam Zora: hinged trunk repair

The supplied combined open/closed reference is preserved in `public/cycle-seven/trunk-reference.png`. No new artwork was generated. The original scene remains the background; the existing clean plate is masked only over the old trunk and props.

`trunk-geometry.mjs` registers the mouth and both lid faces to one stationary body. A projective camera is calibrated from the supplied views. Each frame rotates the rigid lid in 3D about the two fixed rear hinge endpoints, through 100 degrees. Small edge thickness and attached stays make the edge-on transition visible. The inside and outside are separate textured faces of that same lid. Closing reverses the same path with smooth easing.

`trunk-renderer.mjs` uses clipped, subdivided texture triangles, with overlapping interior edges to avoid antialiasing cracks. Only the supplied loose book area and padlock patch need local texture repairs. The stationary front and side walls occlude the cavity, book, and plant. These contents now stay inside, following the latest animation-repair request. The legacy `fallen` save field is retained for compatibility; it no longer controls prop positions. Puzzle arrangements, age-specific saves, completion, replay/skip, and the light tour are unchanged.

The invisible padlock hit target is aligned with the supplied artwork and retains keyboard focus styling. Focusing it frames the chest on mobile and clears native overflow scrolling.

## Verification

- `node --test tools/trunk-geometry.test.mjs tools/chest-state.test.mjs tools/observations.test.mjs tools/carousel-choice.test.mjs`
- `node build.mjs` verifies all runtime asset hashes and the preserved carousel assets.
- `node tools/trunk-review.cjs` captures deterministic renderer frames at 0/25/50/75/100 percent, closing, and closed again, on desktop and mobile. It asserts identical hinge coordinates at every frame. This harness imports the renderer in the test page; no debug controls are shipped in the player interface.
- `node tools/chest-browser.cjs` tests the real puzzle, timed opening, tour, return, closing, replay/skip, normal Rides & Games exit/revisit, and age-state isolation. `TEST_BANDS` selects comma-separated bands.

Browser scripts accept `PLAYWRIGHT_MODULE`, `BROWSER_EXE`, `CHEST_EVIDENCE`, and optional `BASE_URL` for an HTTPS preview. Otherwise they serve the verified local `dist` build.

Deployment scope: push main and create a Vercel preview. Do not manually promote production.
