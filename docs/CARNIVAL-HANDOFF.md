# Carnival interactive Midway — current handoff

## Current checkpoint — September 27, 2026

Continue only on `codex/carnival-visual-proof`. This section supersedes the
older behavior descriptions below. Ready for Ken's playtest; do not merge to
main or expand the experiment without his next instruction.

Serve `public` from this branch with
`python -m http.server 4180 --bind 127.0.0.1 --directory public`, then open
`http://localhost:4180/experiments/carnival/index.html`.
All runtime artwork is included; neither supplied sheet requires a work-computer
folder or a generation/extraction step.

### Resume this exact version from work

Latest gameplay checkpoint: `ca63979fd058b5624b6ff5d60941ae897f3ebd6a`
(complete clickable geography). This document-only portability checkpoint builds
on it; fetch the current remote branch to get both. All runtime assets, including
six production stages, are tracked in Git. No clipboard, Dreamscapes, OneDrive,
home-computer temporary files, npm install, backend or image-generation step is
needed to run the preview. A fresh export of the fetched remote was checked for
linked resources and passed the wheel, geese, poster and fox checks.

On the work computer, ask Codex to inspect the checkout for local changes first,
fetch `origin`, and fast-forward `codex/carnival-visual-proof` to
`origin/codex/carnival-visual-proof`. Preserve unrelated/uncommitted work; use a
separate checkout if needed. Do not reset local changes or merge into main.
Read this handoff before editing anything. Then, from the repository root:

```sh
python -m http.server 4180 --bind 127.0.0.1 --directory public
```

If Windows exposes Python as `py`, use `py -m http.server` with the same options.
Open `http://localhost:4180/experiments/carnival/index.html` and reload the page.
Use `?paths=debug` only when you want visible path bounds for testing.
The localhost server must be started on the work computer; the running home
preview cannot be accessed there. Check what owns port 4180 before reusing an
already-running server, so it does not silently serve an older checkout.

If no repository is available at work, clone the branch from
`https://github.com/KennytheCoder22/novel-ideas2.0.git` using your GitHub access.
GitHub authentication, Python availability and work-network access must be
provided by that computer; they cannot be verified from the home machine.

### Navigation / geography checkpoint

The three existing Midway destination controls now lead to approved empty stages:

- Ferris wheel → Ferris-Wheel Platform (`ferris-platform`)
- Rides & Games entrance → Rides & Games (`rides-games`)
- Central tent → Tent Row (`tent-row`)

Ken approved the initial navigation presentation. The complete geographic graph
now adds invisible, temporary path regions to the empty stages:

- Tent Row → Madame Zora, Behind the Carnival, Main Midway
- Madame Zora → Tent Row
- Behind the Carnival → Tent Row, Forest’s Edge
- Forest’s Edge → Behind the Carnival
- Ferris-Wheel Platform and Rides & Games → Main Midway

No direct Midway shortcuts lead to the deeper stages. Tent Row's central tent
entrance represents Zora; the passage to its right leads backstage. The rear
fence gate in Behind the Carnival leads toward the forest, and the open tent-side
passage returns to Tent Row. Forest's Edge uses the lit path toward the carnival.
Platform and game-area returns use their foreground walkways; Zora's return uses
the left-side aisle. These regions are temporary geographic assignments only:
no attendants, objects or other populated interactions are added.

Paths use percentages on the same aspect-correct artwork plane and stay attached
to the image when panning/resizing. They are invisible during ordinary play, with
keyboard focus feedback only. `?paths=debug` exposes their bounds and the old
small development Back control; normal play returns through the actual paths.
Explicit `?scene=<location-id>` preview links remain available for isolated review.

`locations.js` is the shared stage registry and contains the current navigation
edges and path bounds, intrinsic image dimensions and initial narrow-screen framing.
`navigation.js` mounts each visited stage once and manages a previous-location
stack and a separate transition camera. It never replaces the Midway DOM or
resets its timers, pan, woman approach, poster, fox or MARA state. Midway ambient
clocks continue while away; document-hidden behavior is unchanged. The old
destination-only inspection modal is bypassed; actual object inspections retain
their existing behavior. Escape cannot move the hidden Midway camera while away.

Normal movement lasts 2.4 seconds: the living outgoing scene initially pushes
toward the clicked destination, then dissolves into the fixed arrival viewpoint.
Every clickable return path pushes toward its own region before dissolving. Reduced-motion / `?motion=still` uses
a short 350 ms dissolve without camera scaling. Images decode before departure;
a failed load leaves the current scene usable and can be retried. Transition-time
input is gated, and inactive stages are inert. The small `‹ Back · dev` control exists only in `?paths=debug` mode.

`navigation.css` applies only to new navigation surfaces. New stage backgrounds
use one aspect-correct cover plane, preserving the original image files and
composition. Portrait viewports crop the viewport nondestructively, as the Midway
does; small left/center/right look controls expose the full width. Left/right now move
in overlapping viewport steps so narrow mobile paths cannot fall between fixed
crop positions; the center control recenters. The original Midway controls are unchanged. Backgrounds
remain noninteractive beneath separate path buttons. No objects, ambient overlays, occlusion
layers, scene-state engine or recommendation integration have been implemented.
The common stage plane can support separate layers later.

Original production PNGs copied byte-for-byte into
`public/experiments/carnival/locations/`:

| File | Approved source | Dimensions |
| --- | --- | --- |
| `ferris-platform.png` | FW Platform(empty).png | 1672 × 941 |
| `rides-games.png` | Rides and Games(empty).png | 1671 × 941 |
| `tent-row.png` | Tent Row(empty).png | 1672 × 941 |
| `fortune-teller.png` | Fortune Teller(empty).png | 1672 × 941 |
| `behind-carnival.png` | Behind Carnival(empty).png | 1672 × 941 |
| `forest-edge.png` | Forest's Edge(empty).png | 1672 × 941 |

All assets are committed and portable; no home-machine source folders are needed.
The navigation browser check locks their original SHA-256 hashes and tests all
six desktop/390px stages, actual destination round trips, camera push/dissolve,
Midway node identity/framing and MARA survival, reduced motion, image-load failure
and retry, and the exact approved graph with all directed paths clicked. Screenshots were visually checked.
Run `node scripts/check-carnival-navigation.mjs` with the preview running and
Playwright available. Optional `CARNIVAL_PLAYWRIGHT_MODULE` points to an existing
Playwright module; `CARNIVAL_BROWSER_CHANNEL` selects an installed browser, and
`CARNIVAL_PREVIEW_URL` overrides the local URL. No project dependency was added.
Existing wheel, fox, geese and poster checks also pass. No main merge.

### Balloon

The original red balloon image, size, 100-second path, bobbing, crop rules and
hidden-tab/reduced-motion behavior are unchanged. Its five feature overlays use
the exact supplied transparent `balloon-faces.png`, viewed through individual
SVG viewports. Mouse entry randomly selects a different face from the previous
entry; that face stays fixed until exit. A 220 ms fade and multiply blending
retain the red surface. A hover-only position check also clears the face when
the balloon drifts away from a stationary cursor. Touch remains non-clickable.

`balloon-plane` places the balloon above the tree fragments in the wheel's broad
foreground overlay. An inline `balloon-open-sky` clip traces the actual roof
edge instead of masking a strip of sky/tree above it. This replaces the previous
external multi-mask composition, removing that dependency from balloon
visibility. The original movement and artwork are untouched. Do not alter the
wheel's existing foreground image or supplemental roof/light paths.

### Fox

The camera still lowers/advances for 1.6 seconds. The pickup then enlarges the
ground pose at its natural aspect ratio, uses a 190 ms cross-dissolve with nearly
aligned heads, and lifts the held pose slightly before the existing hold.
There is no edge-on turn, horizontal squash or pickup rotation.

The held pose uses non-destructive canvas grading: brightness .60, saturation
.62, sepia .10. This retains the worn fabric texture with muted orange and dirty
cream under nighttime light. The grade is now cached once on offscreen artwork
canvases, rather than recomputed for every one of hundreds of fragment draws.
This removes the expensive rendering work at breakup entry without changing
the approved grading, pickup pose/dissolve, or fragment choreography. The same
grading continues into the existing ragged-patch/fiber breakup. Tag drop grading
blends into the existing ground tag. Breakup geometry, velocities, timing and
tag persistence are unchanged. The fox remains gone across reloads in the same
tab session after breakup (`carnival-mara-remains`); use a fresh browser session
for another complete test. Do not restore the older reload-resets-fox behavior.

The timeline remains automatic: held pose at 2.95 seconds, breakup at 5.45,
tag fall at 8.45, return at 9.3 and completion at 10.9. No tag click is required.
Real-time browser observation confirmed every phase and automatic completion,
including approximately 2.6 seconds between the held view and breakup. Scripts
and the changed stylesheet have a repair-version query to avoid stale cached
resources after refresh. An already-open older page still needs reloading.

### Migrating geese

`geese.js` and the supplied transparent `geese.png` add a non-clickable, silent
ambient V formation. No observations or taste evidence are recorded. **Temporary
playtest timing:** the first flight starts four visible seconds after the scene
initializes; it no longer waits for the balloon. Subsequent flights start eight
visible seconds after the previous flight ends, so they can be watched repeatedly
without a new UI control. Restore rare randomized 45–120 second intervals only
after Ken approves the appearance/motion. Do not restore the long wait yet.
Hidden tabs pause both flight and waiting time; reduced motion/static viewing
suppresses the event.

The flock starts 42 scene pixels wide, emerges beside the bright star above-left
of the moon, passes behind the small detached cloud below/right of that star,
and curves across the lower moon toward the same far-cloud exit. Its new route
uses a quadratic curve in the original 1536×1024 scene coordinates. The V rotates
clockwise to follow the curve tangent (accounting for the artwork's own heading).
It shrinks to 14 scene pixels wide, one-third of its initial width, by the exit.
The slow 28-second duration, four-second first pass and eight-second playtest
pause are unchanged. No other Midway behavior or artwork changed.

The feathered SVG sky mask now includes the star's opening and a separate
foreground cutout for the small cloud. The accepted far-side cloud contour and
1.4-pixel feather remain unchanged. The original background is not repainted.
Inspect the entry, intermediate cloud crossing, and final disappearance; being
hidden before flight completion alone does not prove correct cloud alignment.

Latest validation: enlarged browser frames inspected at star emergence, partial
small-cloud occlusion, reappearance, moon approach and far-cloud entry. Full
1280×720 desktop and 390×844 mobile checks supplement those close-up frames.

Limitation: the supplied image is one static flock, without separate wing poses.
No artificial per-bird slicing or synchronized flap distortion was added. The
original V stays intact and glides at a distant scale. Cloud occlusion is an
art-aligned 2D mask, not a volumetric cloud simulation.

### Validation for this checkpoint

- Desktop 1280×720 and mobile 390×844 browser checks and screenshots inspected.
- Balloon entrance, tree overlap, roof overlap and exit sampled on the unchanged
  animation; hover fade/non-repeat/drift-away and mobile non-interaction checked.
- Fox approach, growth, dissolve, held lighting, breakup, automatic return and
  persistent tag checked. Real-time desktop/mobile passes supplement the earlier
  frozen-clock frames; the pickup still has no spin.
- Geese lower-moon crossing, small V, diagonal recession, initial delay, hidden
  pause and short playtest recurrence checked. Screenshot comparison verifies the
  far cloud fully hides the flock before the flight ends. No page errors.
- `node scripts/check-carnival-geese.mjs`,
  `node scripts/check-fox-cinema.mjs`,
  `node scripts/check-carnival-poster.mjs`, and
  `node scripts/check-carnival-visual-proof.mjs` pass, plus syntax/diff checks.
- Wheel artwork, masks and animation remain unchanged. Woman/reflection, MARA
  persistence, poster and crow retain their prior behavior. No main merge.

Browser validation includes real-time playback and visual inspection, with
controlled time only for distant balloon path samples and precise comparisons.
Physical mobile-device testing and a hosted deployment check have not been performed.

## Historical notes (superseded where noted above)

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
