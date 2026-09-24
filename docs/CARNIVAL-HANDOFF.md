# Carnival interactive Midway — current handoff

## Resume at work — September 24, 2026

Fetch the latest `codex/carnival-visual-proof` branch and read this document first.
Preserve local changes; fast-forward only when clean, or use a separate worktree.
The home fox rebuild is ready for Ken's playtest, not yet accepted by him.
Start the static preview using the Local preview instructions below, then wait
for his feedback. Do not merge to main or expand the experiment.

All runtime fox artwork and animation code are included in this checkpoint.
The extraction script references home-only source paths for provenance; it does
not need to run at work. No school/home shared asset folder is required.
Reload restores the fox for another test; after its breakup it stays gone until
reload. On narrow screens use Look right to reach it. Click once and let the
approximately 11-second sequence run automatically; MARA is not clickable.

Keep the accepted wheel, gondolas, speed, occlusion, crow position, poster,
balloon and original composition unchanged. Await feedback on the fox's motion,
especially the edge-on pose turn and whether the breakup feels like fabric.
Real-device performance and resizing/orientation during the sequence remain
untested. No hosted preview deployment has been verified for this checkpoint.

## Rebuilt fox choreography (home, September 24)

The previous tag-click/wipe implementation was rejected and removed. Fox-only
canvas choreography now lives in fox-cinema.js, called by midway.js. index.html
only adds its script before midway.js; accepted SVG occlusion is unchanged.

Automatic timeline: 1.6s approach/crouch moving the entire original scene plane;
1.35s lift with an edge-on turn between supplied ground/held poses; 2.5s MARA
hold; 2.7s seeded ragged-patch breakup; .3s surviving tag beat; .85s tag fall;
1.6s gaze/stand/pullback. Total 10.9s. Background stays visible, softening behind
the held toy. No tag action, black inspection cut, body wipe or body crossfade.
768 small interlocking ragged body patches and 68 cloth/fiber elements fall
independently. Tufts also sample the supplied broken-fox artwork. The survivor
is the held image's actual tag pixels, excluded from the body patches.

The fox stays gone after deterioration begins until reload. Escape and the
keyboard-accessible Return control still leave immediately; cancellation cleans
up camera styles. Reduced motion uses stationary restrained transitions instead
of travel/particles. Hidden-tab time is excluded. Events remain factual and
session-only. The accepted crow remains at top:48%; no ambient behavior changed.

Checks: node scripts/check-fox-cinema.mjs covers automatic phases, hold, hidden
pause, disappearance, reduced completion and early cleanup. Existing Carnival
checks, syntax and diff checks pass. Desktop 1280x720 and mobile 390x844 sequence
runs checked, with screenshots of inspection, ragged breakup and surviving tag.
Final mobile run returned automatically with the fox absent and no browser
console errors. No physical phone or OS reduced-motion toggle test. No merge.

Limitations: source art is still a flat scene, not reconstructed 3D. Approach
uses bounded whole-scene translation/scale; a continuous edge-on turn bridges
the differing supplied fox poses. Breakup is textured ragged pieces, not a
cloth physics simulation. Camera returns exactly to the prior crop/pan.

Updated September 24, 2026. Work stays on `codex/carnival-visual-proof`. Do not merge.

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


## Setup on either computer

Repository: `KennytheCoder22/novel-ideas2.0`.
Branch: `codex/carnival-visual-proof`. Do NOT start from main.
Previous work-computer implementation commit: `8fdde15` (balloon crossing).
The latest branch checkpoint adds the home fox rebuild described above.
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
