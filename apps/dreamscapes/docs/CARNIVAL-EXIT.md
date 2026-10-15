# Carnival exit sign

The shared `exit-sign.js` and `exit-sign.css` now use the exact user-supplied
Weathered EXIT Carnival A-Frame Sign.png, copied unchanged to `exit-sign.png`
(1122 × 1402, transparent RGBA). It appears inside all seven scene camera planes.
Its native link returns to `/`. The artwork reads “EXIT” and “Get out while you
still can”; the accessible name also explains that it returns to Dreamscapes.
Keyboard focus highlights the silhouette, and hover brightens the artwork.

The prop stays in the lower-left foreground, above visible mobile look controls.
Placement selects the clearest available ground level against existing buttons.
Resizing and camera panning recheck placement. Scene art,
path definitions, inspection controls, and Carousel rendering remain unchanged.
The development Back button and the unconditional LOCAL PREVIEW badge were removed.

`checkpoint/manifest.json` retains the original immutable runtime hashes.
`runtime-overrides.json` records the three reviewed UI source changes and the three
new exit files. The build verifies the combined 94 files and all 20 GLB models;
the other 88 checkpoint files must still match their original hashes.

Only the native link receives pointer input. Its 124-point CSS clip polygon traces
the PNG's alpha boundary (threshold 128, contour tolerance 2.5 source pixels).
Transparent margins and the open spaces between legs pass through to the scene;
the positioning wrapper and ground shadow are noninteractive. No raster editing
was applied to the supplied artwork.

Verified locally at 1366 × 768 and 390 × 844: all seven signs are visible at the
left foreground, and look controls remain clickable. Twenty-four independent
opaque/transparent PNG sample points match DOM hit-testing in every scene at
both sizes (336 checks, no mismatches). Pointer activation on desktop/mobile and
keyboard activation return to the portal. Keyboard focus is visible. All 20
Carousel mounts reach ready state. This source update does not deploy production.
