# Carnival visual proof — isolated, not merged

Branch: `codex/carnival-visual-proof`, based on main `092d2a9`.
Route: `/experiments/carnival/index.html`.
Local preview: `http://localhost:4179/experiments/carnival/index.html`.
This is a self-contained static public page, not an Expo game route. No existing files, game logic, recommendations, telemetry, storage, or progression are modified. No dependencies added. No production deployment or merge.

## Artwork and composition

The supplied empty midway and wheel are copied byte-for-byte to `public/experiments/carnival/midway.png` and `wheel.png`. The populated carnival was used as a visual reference only. Hash assertions preserve both supplied assets.

The background defines a 1536×1024 composition. The wheel is positioned at 58% left, 13% top, 24% width, retaining its own aspect ratio. The whole composition scales/crops as one unit. Portrait cropping favors the right-hand attraction while retaining the midway; some far-right wheel structure falls beyond a narrow portrait viewport. Desktop and mobile use identical relative wheel coordinates.

Two exact copies of the original background, clipped to foreground tent/pole regions with CSS polygons, occlude the lower wheel and its support. No pixels of the background file are edited. Wheel-only brightness/saturation filtering puts the bright supplied cutout into the distant night scene; no blend mode, generated artwork, background removal, matte, or opaque backing. The original perspective is retained, not reconstructed as 3D. Polygon occlusion is an approximation; a proper artist-supplied foreground mask would improve fine roofline/tree/bunting overlap.

## Transparency and animation limitation

Full pixel scan of the supplied wheel (1319×1192, ARGB):

- 731,709 fully transparent pixels;
- 839,521 partially transparent pixels;
- 1,018 fully opaque pixels.

The asset is genuinely alpha-transparent. The sky is visible through its openings in the browser, without a rectangular boundary or checkerboard.

It is also a single flattened raster with gondolas, spokes and fixed supports overlapping. Independent layers cannot be extracted cleanly without inventing the occluded frame/gondola pixels. Therefore the wheel **does not rotate**. Gondolas remain upright because the artwork stays stationary. A subtle 17-second irregular wheel brightness cycle provides only ambient life (brightness .47–.50); it is not represented as a revolution. A future 45–75-second revolution requires a clean rotating frame, fixed supports, and separate upright gondolas with attachment/pivot coordinates. Perspective-aware animation may require further artist preparation.

Click/activation briefly raises brightness to .59 for 900ms, without an on-screen label or UI treatment. Native button semantics provide keyboard access and a screen-reader acknowledgment. Foreground layers intercept pointer input so the hidden parts do not become hotspots on tents. The hotspot otherwise uses the transparent image bounds rather than pixel-perfect alpha hit testing.

`prefers-reduced-motion: reduce` disables ambient animation. `?motion=still` additionally provides explicit stationary viewing. Click feedback remains an immediate temporary brightness change, without animated movement.

## Bounded checks

- Desktop 1280×720 and mobile 390×844 screenshot inspection: loaded artwork, transparent openings, foreground overlap, no visible rectangular matte, aligned crop.
- Browser coordinate checks: left ≈.58, top ≈.13, width ≈.24 at both sizes (rounding only); no wheel drift.
- Desktop and mobile-width pointer activation acknowledged; Enter activation works, including stationary mode. Real touch hardware was not available.
- Stationary-mode computed animation and transform are both `none`. System reduced-motion CSS rule asserted in the focused test; OS preference emulation was unavailable in the browser tool, so it was not claimed as an OS-level test.
- Browser console error scan empty. No API/backend boundaries exist in this page.
- `node scripts/check-carnival-visual-proof.mjs`: passes original-asset hashes, reduced-motion guard, no rotation/data collection, repeated activation and timer cleanup.
- `node --check public/experiments/carnival/scene.js`: passes.
- No broad NovelIdeas tests or app build: only static new files, directly served and tested. Remote export/deployment not verified.

## Added files

- `public/experiments/carnival/index.html`
- `public/experiments/carnival/scene.css`
- `public/experiments/carnival/scene.js`
- `public/experiments/carnival/midway.png`
- `public/experiments/carnival/wheel.png`
- `scripts/check-carnival-visual-proof.mjs`
- `docs/carnival-visual-proof.md`
