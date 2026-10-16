# Carnival exit sign

All seven scenes reuse the exact supplied Weathered EXIT Carnival A-Frame Sign.png
as `exit-sign.png` (1122 x 1402, transparent RGBA). The native link returns to `/`.
Its accessible name explains both the destination and the sign wording. Hover and
keyboard focus highlight the artwork without enlarging its clickable silhouette.

## Scene-specific ground placement

`exit-sign.js` contains an explicit entry for every scene. Each pose stores the
sign centre x, feet y, and height as fractions of the scene camera plane. Desktop
and portrait compositions are reviewed separately. The scene ID is passed to the
mount function; missing placement definitions fail explicitly rather than silently
using a universal lower-left fallback.

| Scene | Desktop anchor x / feet y / height | Portrait anchor x / feet y / height | Ground patch |
| --- | --- | --- | --- |
| Main Midway | .105 / .89 / .22 | .68 / .90 / .20 | Open foreground, clear of the poster, puddle, figure and fox |
| Ferris platform | .332 / 1.025 / .17 | .65 / .915 / .18 | Desktop gap between barrel and LINE STARTS HERE; portrait keeps its reviewed open approach |
| Tent Row | .13 / .92 / .20 | .62 / .81 / .17 | Desktop tucked left of and behind the GOOD GAMES GOOD PEOPLE barrel; portrait uses the open walkway |
| Madame Zora | .034 / .84 / .32 | .60 / .985 / .145 | Wide view: left of the black stars placard, top-aligned; narrow view: front rug corner |
| Rides & Games / Carousel | .73 / .965 / .15 | .64 / .805 / .17 | Clear ground beyond the carousel fence and Ride Laugh Repeat sign |
| Behind the Carnival | .075 / .985 / .2625 | .50 / .90 / .2375 | Far-left foreground, 25% larger; clear of the tent doorway and forest path |
| Forest's Edge | .785 / .80 / .19 | .53 / .81 / .18 | Open trail shoulder, clear of the return path and fences |

An aspect ratio below 1.2 selects the portrait pose (below 1.7 for Zora, whose left-side placard falls outside narrower camera crops). On resize, the pose fits the
scene's entry camera with a 12 px horizontal inset and a 10 px bottom inset; height
is capped at 29% of the viewport, with a 34% allowance for Zora's taller wide-view sign. Zora's portrait scale also fits the right gutter
beside the existing look controls, including at 320 px phone width.

The sign remains registered to the artwork when panning. It can naturally leave
the camera crop, like other scene objects; it no longer slides along the viewport
edge over unrelated props. Keyboard focus restores the scene's entry framing and
clears the browser's automatic focus scroll so the focused sign is visible. The
focus treatment and native Enter activation remain intact.

## Artwork and hit target

Only the native link receives pointer input. The unchanged 124-point CSS clip
polygon traces the PNG alpha boundary (threshold 128, contour tolerance 2.5 source
pixels). Transparent margins and the gaps between the legs pass through to the
scene. The wrapper and ground shadow are noninteractive. No raster image, scene
artwork, story flow, scene route, Carousel geometry, or coaster timing changed.

`checkpoint/manifest.json` retains the original immutable hashes.
`runtime-overrides.json` records the reviewed source changes. The build verifies
97 runtime files and all 20 GLBs against the combined manifests.

## Verification before commit, 2026-10-15

All seven scenes were individually captured and visually inspected at 1366 x 768
and 390 x 844. Each sign fits the entry camera and has zero bounding-box overlaps
with navigation buttons, inspection hotspots, or visible look controls. Madame
Zora was additionally checked at 320 x 740.

339 independent opaque/transparent sample points from the supplied PNG were
compared with browser hit testing in each view: 5,085 checks, zero mismatches.
All seven desktop pointer exits and all seven mobile keyboard exits returned to
the portal. Native Shift+Tab after panning focused EXIT, displayed its focus
highlight, and restored its camera view. Browser measurements and exit results
are saved in `verification/2026-10-15-exit-placement.json`.

This change is committed only to `codex/dreamscapes-independent`. It does not
release or change the current production deployment.

## Ferris gap adjustment, 2026-10-16

The desktop Ferris EXIT is now in the small gap between the foreground barrel
and LINE STARTS HERE sign. Its pose allows at most the bottom 14% of the artwork
to extend below the viewport, leaving all lettering above the edge. Other scenes
retain their own poses. The existing portrait placement is retained because the
barrel/queue-sign gap is outside that camera's initial crop.

Verified at 1366 x 768: sign box x=401, y=655.44, width=104.61, height=130.72;
18.16 px of feet are clipped. All wording is visible. At 390 x 844 the original
portrait placement remains fully visible. Neither view overlaps a navigation
hotspot. All 644 on-screen independent alpha sample hit checks pass; keyboard and
pointer activation return to `/`. See `verification/2026-10-16-ferris-exit-gap.json`.

## Tent Row barrel adjustment, 2026-10-16

The desktop Tent Row sign now sits just left of and farther back than the GOOD
GAMES GOOD PEOPLE barrel. A source-space clearance profile clips the outer frame
where it passes behind the foreground post and barrel. This reveals the original
background pixels, preserves all lettering, and removes pointer input from those
hidden portions. The PNGs are unchanged. The existing portrait composition keeps
its clear walkway placement because the barrel is outside that initial crop.

Desktop 1366 x 768 and mobile 390 x 844 checks passed. All 80 independently
sampled opaque points across the wording remain clickable in each view. Forty
opaque frame samples hidden behind desktop props correctly pass through, including
separate left-post and right-barrel probes. No transparent sample receives clicks,
and no navigation hotspot overlaps either sign. Keyboard and pointer activation
return to `/`. Measurements are recorded in
`verification/2026-10-16-tent-exit-barrel.json`. No production release is performed.

## Madame Zora sign alignment and Tent Row target, 2026-10-16

The wide-view EXIT is now immediately left of the black WHAT DO THE STARS HOLD
FOR YOU? placard. Its visible top frame aligns with the existing placard's top
frame, at roughly three-quarters of that placard's height. The unused back frame
may extend beyond the left edge; all lettering remains on-screen. A clearance
profile lets the existing placard cover only the EXIT frame's right edge. Narrow
views retain the reviewed rug-corner pose and clear look controls.

The Tent Row target moved from [1,60,12,27] to [1,41,10,9] in scene percentages,
above both sign objects. Its route still leads to Tent Row. The HTML script query
versions were updated so navigation and EXIT changes load together.

Verified at 1366 x 768 and 390 x 844: no overlap between EXIT and the Tent Row
target; 80 independent opaque samples across the wording remain clickable in
each view; no transparent samples accept clicks. Desktop keyboard EXIT and mobile
pointer EXIT return to `/`. The raised Tent Row target opens Tent Row on desktop
and on mobile after looking left. No browser errors were logged. Measurements
are in `verification/2026-10-16-zora-exit-aligned.json`. No deployment performed.

### Behind the Carnival foreground adjustment — 16 October 2026

Moved only this scene’s EXIT to the far-left foreground and increased both desktop and portrait pose heights by 25%. The original artwork, silhouette click boundary and `/` destination are unchanged. Checked at 1366×768 and 390×844: all wording visible, no navigation hotspot overlaps, and 339 silhouette samples per viewport match the clickable area. Keyboard focus/Enter and mobile click return to the portal. Evidence: `verification/2026-10-16-behind-exit-left.json`. Not deployed.

### Forest’s Edge canopy placement — 16 October 2026

Moved the desktop EXIT into the path between the two right-hand trees, preserving its height at .19 of the scene. Portrait height remains .18, with a separate visible crop placement. A scene-specific CSS brightness (.62) and saturation (.8) treatment places the unchanged PNG under the canopy shadow; hover and keyboard focus remain visible. Verified desktop 1366×768 and phone 390×844, 339 alpha/hit samples each, no travel hotspot overlap, keyboard focus/Enter and tap return to `/`. Evidence: `verification/2026-10-16-forest-exit-shadow.json`.
