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
the balloon crosses slowly left to right once, then leaves the scene (100 seconds,
linear travel with gentle bobbing; no loop). Reload starts a new crossing. Neither is clickable. Reduced motion/static viewing
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


## Resume on the home computer

Repository: `KennytheCoder22/novel-ideas2.0`.
Branch: `codex/carnival-visual-proof`. Do NOT start from main.
Latest implementation commit: `8fdde15` (balloon crossing).
Earlier milestones: `2a9e72e` (complete interactive assembly), `68b8ca8`
(accepted center-facing light string mask), `55ea37d` (roof/right light masks).
The handoff commit itself will be newer than these implementation commits.
All of these implementation commits have been pushed to the experiment branch.
No merge into main has occurred. This experiment is not in the Games menu.

1. Inspect local Git status before switching. Preserve any home-computer edits.
2. Fetch `origin`, then check out `codex/carnival-visual-proof`. If clean and behind,
   update with `git pull --ff-only origin codex/carnival-visual-proof`.
   If diverged, inspect the differences; do not reset or overwrite local work.
3. If necessary use a separate worktree based on the remote experiment branch.
4. Serve `public` using the Python command above (no npm install, app build,
   backend, API keys, or Expo server required). Pick another port if 4180 is busy.
5. Open `http://localhost:4180/experiments/carnival/index.html`.
   The work-computer localhost URL and server do NOT transfer to the home computer.
6. Read this handoff before proposing new work. Ask Ken which element or scene
   to work on next; there is no authorization to build every destination.

Branch pushes may trigger Vercel preview builds. A deployment-specific old URL
stays on its old version. Use the latest deployment for this exact branch and
append `/experiments/carnival/index.html`. Latest hosted deployment status has
not been verified; the final assembly was verified locally.

## Locked behavior and implementation map

Do not change the accepted wheel artwork, scale, placement, colors, brightness,
60-second revolution, upright cabin counter-rotation, supports, or masks.
The wheel remains at 58% left / 13% top / 24% width in a 1536x1024 composition.
`scene.js` owns only the accepted animation and its brief activation response.
`scene.css` owns the accepted wheel geometry and base scene crop.

`index.html` contains the wheel, added objects, modal, camera controls, and
**supplemental inline SVG foreground paths** added after the original mask.
These paths are essential: both roof slopes and BOTH light-string spans at the
middle right pole must stay in front of cabins, spokes, and rim. The span toward
the screen center was the last correction and was explicitly accepted by Ken.
Do not remove these paths after rebuilding `foreground.png`: they are NOT in
`scripts/carnival-foreground.json`. That JSON and its PowerShell builder describe
the older base mask only. Retain the base mask and the SVG supplement together.

`midway.css` adds placement, balloon motion, close-up styling and mobile camera
controls. It translates the whole composition when the user pans; it does not
move the wheel independently. `midway.js` owns modal interactions, raw session
observations, poster state, woman disappearance, crow timing, and camera controls.

Balloon: one 100-second crossing with `forwards` fill. Desktop starts at 30% of
scene width and ends at 110%; portrait starts at 48% and also ends at 110%.
It stays off-scene after finishing. Reduced-motion and `?motion=still` leave it
stationary. Its latest timing/direction CSS was checked in the browser; the full
100-second departure was not separately watched end to end after that final edit.

## Portable assets

All runtime PNGs are committed under `public/experiments/carnival/`:
- Existing: midway, foreground, wheel, wheel-frame, support, gondola-01.
- New: central-tent, rides-entrance, puddle, woman, balloon, fox, poster,
  poster-altered, crow-perched, crow-call.

Do not depend on the school UNC drive or work-computer TEMP paths. Original
reference images and the replacement multi-asset sheet are not committed, but
are not required to run or continue using the extracted assets. If re-extraction
or direct comparison to the original populated reference is needed, ask Ken for
those sources. Do not substitute the earlier RGB/checkerboard versions.
The untracked `crow-states.png` in the work checkout was an intermediate source
and is not used by the final scene; it is not needed on the home computer.

## Focused checks for later edits

```sh
node scripts/check-carnival-visual-proof.mjs
node --check public/experiments/carnival/scene.js
node --check public/experiments/carnival/midway.js
git diff --check
```

The wheel test checks original-art hashes, 12 cabins, timing/wrap, hidden-tab
pause, reduced motion, activation cleanup, and absence of data collection in
`scene.js`. It does not prove visual mask accuracy or exercise `midway.js`.
For relevant edits only, inspect desktop 1280x720 and mobile 390x844 and exercise
the changed flow. Check multiple rotation phases if touching occlusion. Avoid
broad repo tests, full app builds, or an expensive autonomous playtest.

## Scope and next-work caveats

- Do not merge or deploy to main without new explicit permission.
- Do not integrate into the Games menu or production recommendations.
- Do not infer taste from skill, reaction speed, inactivity, or missed objects.
- Keep ambient balloon/crow/woman non-clickable. Fox is stationary and optional.
- No hotspot labels, glow, quest counters, puzzles, or explanatory anomaly text.
- Destination views are intentionally placeholders; no Platform, Tent Row,
  Rides & Games, Fortune Teller, forest, or other scene has been built.
- The initial mobile crop favors the wheel; use the camera controls to see sides.
- Visual story state resets on reload; session observations are local, not synced.
- Physical phone touch performance and actual OS reduced-motion toggling were
  not tested. No production or remote deployment verification was performed.
- Inspection is a modal art close-up, not a continuous spatial camera zoom.

Ken has asked for a portable handoff for tonight, not further visual revisions.
Preserve this checkpoint and wait for his next creative direction.
