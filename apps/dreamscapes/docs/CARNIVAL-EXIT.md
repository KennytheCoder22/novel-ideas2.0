# Carnival exit sign

The shared `exit-sign.js` and `exit-sign.css` mount a wooden A-frame placard
inside each of the seven scene camera planes. Its native link returns to `/`.
Visible copy is “EXIT” and “Get out while you still can”; its accessible name
also explains that it returns to Dreamscapes. Keyboard focus has a visible outline.

Placement tests the foreground corners against existing buttons, including the
mobile look controls. Resizing and camera panning recheck placement. Scene art,
path definitions, inspection controls, and Carousel rendering remain unchanged.
The development Back button and the unconditional LOCAL PREVIEW badge were removed.

`checkpoint/manifest.json` retains the original immutable runtime hashes.
`runtime-overrides.json` records the three reviewed UI source changes and the two
new exit files. The build verifies the combined 93 files and all 20 GLB models;
the other 88 checkpoint files must still match their original hashes.

Verified locally at 1366 × 768 and 390 × 844: all seven signs are visible,
none overlap scene buttons or look controls, and no preview badge remains.
Pointer and keyboard activation return to the portal. Mobile panning and
Rides & Games → Midway travel work. All 20 Carousel mounts reach ready state,
with no browser errors. This change is pushed only; it does not deploy production.
