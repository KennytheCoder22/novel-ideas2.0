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
| Ferris platform | .65 / .985 / .18 | .65 / .915 / .18 | Open front approach, away from the left banner and queue clutter |
| Tent Row | .39 / .98 / .20 | .62 / .81 / .17 | Walkway edge, away from the left booth and barrel cluster |
| Madame Zora | .57 / .985 / .16 | .60 / .985 / .145 | Front rug corner, opposite the black stars sign |
| Rides & Games / Carousel | .73 / .965 / .15 | .64 / .805 / .17 | Clear ground beyond the carousel fence and Ride Laugh Repeat sign |
| Behind the Carnival | .83 / .96 / .21 | .64 / .90 / .19 | Right foreground, clear of the tent doorway and forest path |
| Forest's Edge | .79 / .97 / .19 | .53 / .895 / .18 | Open trail shoulder, clear of the return path and fences |

An aspect ratio below 1.2 selects the portrait pose. On resize, the pose fits the
scene's entry camera with a 12 px horizontal inset and a 10 px bottom inset; height
is capped at 29% of the viewport. Zora's portrait scale also fits the right gutter
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
