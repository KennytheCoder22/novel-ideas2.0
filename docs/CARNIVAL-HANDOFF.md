# Carnival interactive Midway — current handoff

Updated September 23, 2026. Work stays on `codex/carnival-visual-proof`. Do not merge.

The accepted wheel and foreground corrections are the baseline at `68b8ca8`.
`scene.js`, `scene.css`, wheel assets, the canonical background, and accepted
foreground paths remain unchanged by the interactive additions. The older
handoff below describes the pre-correction checkpoint, not the current state.

## Interactive additions

`midway.css` and `midway.js` layer independent supplied artwork into `index.html`.
The tent, Rides & Games entrance, and wheel open returnable destination previews;
no destination scene is implemented. The fox and puddle have close inspection
views. The poster starts normal, then changes after the first inspection when
attention moves to another object or destination. The distant woman disappears
while attention is away. Crow poses change at irregular intervals without sound;
the balloon gently drifts. Neither is clickable. Reduced motion/static viewing
stops the added ambient motion. Hidden tabs pause the crow timer and balloon.

Mobile preserves scene scale and the original initial crop. Three small camera
controls move the whole composition left, center, or right to reach objects
outside the crop. They do not label hotspots. Keyboard focus outlines remain for
accessibility. Inspection uses a native modal dialog, Escape, a return button,
and restored focus. The inspection art gently scales in unless motion is reduced.

Session-only raw observations are capped at 200 records under
`carnival-experiment-observations` in sessionStorage. They contain the chosen
object/destination, return events, timestamps, and visible inspection duration
(excluding time in a hidden tab). No network calls, genre inference, book scores,
or production recommendation connections. Reload resets visual story state;
raw observations survive reload for the current browser session only.

## Assets and compromises

The first balloon/woman/fox/poster files and the first replacement sheet were RGB
with baked-in backgrounds; they were not used. The second `Multiple Assets..png`
is RGBA and supplies the extracted woman, balloon, fox, two poster states, and
two crow poses. Original retained RGB/alpha is preserved; polygon exclusions
only separate neighboring pieces. Tent, entrance, and puddle are copied from the
supplied transparent PNGs. The canonical empty background is unchanged.

The populated reference has different architecture, so exact placement matching
is impossible while preserving the canonical background and accepted wheel.
Rides & Games is placed on the left side of the middle distance; the poster is
mounted on the left booth; crow and fox occupy the right foreground. Asset edge
quality and intrinsic perspective are inherited from the supplied art. Inspections
are restrained close-up views, not reconstructed 3D camera travel. The existing
wheel hotspot still includes transparent/occluded areas of its rectangular bounds.

## Bounded validation

Desktop 1280x720 and mobile 390x844 screenshots inspected. Normal/altered poster,
puddle, fox, Tent Row, Rides & Games, wheel destination and return paths exercised.
Mobile pan exposes both side objects and permits inspection/return. Native dialog
focus containment and return focus checked through browser state. Focused wheel
clock/artwork checks and JavaScript syntax checks pass. No full application build
or repository-wide tests are necessary for this static experiment.

## Local preview

Serve `public` with `python -m http.server 4180 --bind 127.0.0.1 --directory public`.
Route: `/experiments/carnival/index.html`. No merge or main deployment.

---

## Historical handoff (September 22)

# Carnival experiment: home-to-work handoff

Updated 2026-09-22. Branch: `codex/carnival-visual-proof`.
This is a checkpoint, not a finished occlusion review. Do not merge or deploy.

## Start here

Fetch and check out this branch in an isolated checkout. Do not overwrite an
existing dirty checkout or start from main and lose the experiment.
Read this document before `docs/carnival-visual-proof.md`; that older document
includes historical implementation details that no longer describe the masks.

Serve `public` using a local static HTTP server, then open
`/experiments/carnival/index.html`. For example, if Python is available:

```sh
python -m http.server 4179 --directory public
```

The home preview URL was `http://localhost:4179/experiments/carnival/index.html`.
The server is not transferred by Git: start a server on the work computer.
No full app build, backend credentials, or new dependencies are needed for this
self-contained HTML/CSS/JavaScript experiment. All runtime PNGs are in the branch.

## Accepted mechanical animation: preserve exactly

The user accepted the wheel animation. Do not change its size, placement,
rotation speed, gondola behavior, colors, brightness, or general appearance.
Static supports, rotating wheel, and twelve counter-rotating upright gondolas
are implemented. One revolution takes 60 seconds. No optional lighting layers
or additional animations may be added.

The scene is 1536 x 1024. Wheel left/top/width are 58%/13%/24%.
The shared composition handles responsive scaling/cropping. `scene.js` and the
wheel geometry remain unchanged from accepted commit `2cf0c6d`.

## Current task: foreground occlusion only

Desired stack: background -> wheel assembly -> foreground environment.
Use exact original background pixels, with silhouette-following alpha masks,
to obscure the wheel behind nearer right-side booths, roofs, posts, lamps,
signage and hanging objects. Preserve legitimate sky gaps. Do not move/shrink
the wheel, repaint, regenerate, redraw structures, or use one rectangular crop.

Current checkpoint replaces the old coarse CSS tent/pole masks with
`public/experiments/carnival/foreground.png`, a full-scene transparent overlay.
It shares the background's dimensions and positioning. Source RGB is copied
from unchanged `midway.png`; only the extraction alpha mask is constructed.
The editable mask definitions are `scripts/carnival-foreground.json`.
Rebuild on Windows with `scripts/build-carnival-foreground.ps1` (System.Drawing).
The optional `-Inspect` switch writes a coordinate-grid inspection crop to TEMP.
No generated artwork or new lighting is used. Existing painted bulb pixels
are included in foreground extraction, not animated or relit.

## Remaining verification / known caveats

- Final desktop 1280 x 720 and mobile 390 x 844 visual checks of this NEW mask
  are pending. Earlier desktop/mobile successes in the old notes refer to the
  mechanical animation and old masks, not acceptance of this checkpoint.
- Inspect several live rotation phases: cabins, rim and spokes should disappear
  behind near objects and reappear without popping or moving mask edges.
- Tighten mask boundaries if necessary. Hand-traced pennant/pole silhouettes
  may retain small sky wedges or omit fine edges. Do not claim pixel-perfect
  silhouettes merely because retained RGB matches the source.
- Check exact registration at both sizes and open sky between objects. No
  broad tree mask has been added; determine actual depth before masking foliage.
- The new overlay has `pointer-events: none`; unlike the old mask it does not
  intercept clicks over hidden portions of the wheel button. Review this
  interaction difference without changing the accepted animation.
- Do not modify any games, recommendations, saved campaigns, or telemetry.

## Checks performed for this handoff

Passed `node scripts/check-carnival-visual-proof.mjs`, JavaScript syntax check,
and `git diff --check`. The focused test checks original-art hashes, 12 cabins,
60-second clock/wrap, hidden-page pause, reduced motion, activation cleanup,
and no data collection. It does NOT validate silhouette accuracy.

## Assets / portability

`midway.png` is the supplied empty midway background, unchanged. The populated
reference and original multipart sheet were supplied in the home conversation;
their original TEMP paths should not be assumed available at work. Runtime
wheel pieces and foreground are committed, so the preview needs no attachments.
If exact reference-image comparison is required, ask Ken for that reference
rather than inventing missing details. The foreground can be regenerated from
the committed background and JSON alone.

## User's success criterion

If the viewer did not already know the Ferris wheel was a separate overlay,
they should not be able to tell. Finish visual review before claiming that goal.
Do not merge without a new explicit request.
