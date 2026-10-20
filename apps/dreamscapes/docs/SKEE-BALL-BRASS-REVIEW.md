# Approved-art Skee-Ball review — October 20, 2026

Status: local visual review only. Branch `codex/skee-ball-approved-art-brass`, based on `origin/main` at `cce5698` (including the pull-release/reset controls saved from home). Do not merge or deploy this implementation before Ken visually approves it.

## Play locally

The preview server serves `apps/dreamscapes/public` on localhost port 4204:

http://127.0.0.1:4204/experiments/carnival/index.html?scene=skee-ball

If restarting the server, run `python -m http.server 4204 --bind 127.0.0.1 --directory apps/dreamscapes/public` from the repository root. No npm install, external image tool, backend, or credentials are needed. Append `&skee-review=1` only for local deterministic diagnostics; this review API is unavailable on public hostnames.

Mouse/touch: drag the left paddle sideways to aim; pull the right paddle toward you and release. The pull becomes progressively stiffer, is bounded, and returns with a damped spring movement. The spindle bases remain fixed. Keyboard: Tab to Angle and use arrows (Shift for larger steps), Home/End for the limits, Escape for neutral. Tab to Pull and release; hold Space/Enter and release, or set pull with arrows then press Enter. Escape cancels without spending a ball. Angle and pull reset after a shot, preserving the home checkpoint behavior.

## Retained logic and isolated changes

Retained the nine-ball round, score accumulation, 10/20/30/40/50/100 values, replay, double-shot guard, per-shot reset, round retention across scene visits, and settling a pending shot once when interrupted. The drawn machine and old plunger are no longer mounted. `play-rooms.js` delegates only the Skee-Ball branch to `skee-ball-art.js`; the Fun House branch is unchanged. Navigation code, other scenes, age-band mappings, carousel assets, arm and coaster timing are unchanged.

The approved scene image is the actual background. The source file is not repainted, cropped, resampled, or overwritten. Responsive CSS preserves its aspect ratio; portrait framing crops only outer side scenery to keep the machine and both controls visible. Every overlay is registered to the same 1672 x 941 image plane. Only the changing scoreboard digits are covered by small background patches; painted labels remain part of the source artwork.

The ball rolls along the illustrated alley, traverses the short S-shaped ramp, flies with a separate ground shadow, and sinks into a scoring cup. Angle affects lateral flight and spring pull determines launch energy; underpowered rolls stop before the ramp. No target crosshair or clickable aim aid is shown. Target hit regions are invisible. The illustrated lower central cup has a repeated 30 on its rim but 20 on its front; it retains the intended 20-point value without modifying the approved artwork.

## Approved sources and dimensional brass

Runtime copies:

- `public/experiments/carnival/skee-ball/approved-alley.png` — SHA256 `2d54822360a3329f1542853c2bf0b295f5c78e6a903f35d8497c4ab82b0c555b`.
- `public/experiments/carnival/skee-ball/brass-reference.png` — SHA256 `d20097cbc71ddf6b1a5951f813e08529bcbdb7548629b642026c60dd8f0c3fde`.

Both are byte-identical copies of the supplied PNGs. No AI-generated replacement art or extracted/repainted paddle sprite is used. Two native Three.js meshes share one lofted paddle geometry and material. The material samples the supplied brass finish through UV coordinates, retaining its tarnish and wear. A 25-unit spindle diameter/height represents one inch. Overall paddle length is approximately 6.02 inches, top width .25 inches, and maximum grip height .786 inches including rounded bevels. Both spindle bases stay at the source-image control points: left `(557,774)`, right `(904,827)`. The left starts vertical with ±35-degree limits; the right starts horizontal and pulls through a 48-degree arc. Geometry, lighting, and transparent cast shadows render in the common image plane; no idle animation loop runs after the spring and ball settle.

## Verification

`verification/skee-ball-art.cjs` checks source-image hashes, dimensional geometry and shared material, fixed pivots, mouse/touch dragging, keyboard limits and hold-release, spring reset, short ramp/flight stages, every target score and misses, complete rounds/replay, reduced motion, responsive image registration, resize during a shot, and departure/return without double scoring. It runs desktop, portrait phone, and landscape phone layouts. Set `PLAYWRIGHT_MODULE` to an installed Playwright module; optional `BROWSER_PATH`, `DREAMSCAPES_URL`, `CARNIVAL_PATH`, `DREAMSCAPES_EVIDENCE_DIR`, and `SKEE_LAYOUT` select the environment. `SKEE_APPROVED_SOURCE_DIR` additionally compares runtime PNGs directly with the supplied originals.

The build validates runtime asset hashes and all 60 carousel GLBs. Verification summaries are saved alongside this test. Visual approval is still required for appearance, handle motion, ramp behavior, and scoring feel.
