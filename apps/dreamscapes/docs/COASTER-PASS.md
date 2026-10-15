# Occasional empty coaster train

Only **Rides & Games** has the wooden coaster backdrop, so only that scene
mounts this atmospheric layer. Main Midway and the other five scenes are unchanged.

`coaster-train-sheet.png` is the exact supplied Vintage Carnival Roller Coaster
Asset Sheet.png (2158 × 729, transparent RGBA). SVG viewports reuse the empty
engine and side-view cars as four small sprites. A source-space clip removes
the unrelated rail above the engine. No generated art, raster edits, riders,
extra track, or new dependencies are introduced.

`coaster-train.js` moves the cars independently along a sampled SVG curve in the
original 1671 × 941 background coordinates. Motion is **JavaScript-based**, using
requestAnimationFrame only during the **3.1-second** pass. Each car follows the
rail tangent. The curve is sampled once at mount; the loop performs no layout
or path queries. The SVG shares the background plane, so resizing and panning
preserve registration. Foreground masks hide the train behind existing poles,
marquee, tent and lighthouse. Carousel dressing remains above the train.

Pass starts are randomized **50–70 seconds apart**. Cars are hidden between
passes. Reduced motion and `motion=still` disable the animation. Leaving the
scene, transitioning, or hiding the browser tab cancels the current pass and
timer. Returning starts a fresh wait, without catch-up. Disposal removes timers,
animation frames and listeners. Artwork loading does not delay scene navigation.

The complete SVG is aria-hidden, nonfocusable and pointer-events:none. Existing
paths, look controls, keyboard navigation and the `/` exit link remain intact.

## Verification

- `node apps/dreamscapes/build.mjs`: 97 protected runtime files and 20 GLBs.
- `node apps/dreamscapes/verification/coaster-lifecycle.mjs`: cadence, duration,
  idle frames, hidden-tab interruption, reduced motion, scene exit, cleanup,
  still mode and the production review guard.
- Browser: one real randomized pass completed, returned to waiting, and all
  20 Carousel mounts loaded without errors. Desktop and 390 × 844 mobile
  checks confirm exact background/layer registration and usable look controls,
  scene travel and keyboard exit. Train adds no tab stops or pointer target.
- Local static visual review only:
  `?scene=rides-games&motion=still&coaster-frame=0.30`. The frame parameter is
  ignored outside localhost/127.0.0.1 and never accelerates production timing.

Source is committed and pushed to `codex/dreamscapes-independent`; no deployment
is part of this change.
