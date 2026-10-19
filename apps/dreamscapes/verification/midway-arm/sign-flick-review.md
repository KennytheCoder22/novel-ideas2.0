# Approved Midway sign-flick revision

Base: `d526b2174b8253830d9e5e02a9e71f493b2455d7` (PR #339).
Visuals approved by the user. The user authorized publication and merge after changing the once-per-visit delay to 8–12 seconds.

Local review: http://127.0.0.1:4204/experiments/carnival/arm-review.html
Use **Play from start**, **Play after searching**, phase buttons, or the timeline.
Normal visit: http://127.0.0.1:4204/experiments/carnival/index.html

The event begins 8–12 seconds after the arm is ready on each visible Midway visit.

## Motion
- 0–1.4 s: rise fingers-up behind the true lip; 1.4–2.6 s: turn outward only after clearing the opening. The 2.6–7.2 s barrel-searching poses remain unchanged.
- 7.2–8.45 s: deliberate pause and subtle wrist turn.
- 8.45–10.25 s: smooth reach to the barrel-facing wooden corner.
- 10.25–12.75 s: light tracing, curl/release, and confirming touch.
- 12.75–13.15 s: index preparation with the other fingers curled.
- 13.15 s: index flick starts; the sign begins falling at 13.27 s.
- 13.27–14 s: rigid rotation about the right foot, followed by a small bounce.
- 14–14.25 s: brief pause.
- 14.25–17.1 s: turn back above the opening, then descend fingers-up behind the near rim. The descent avoids crossing the shoulder's IK origin.

The native clipped EXIT anchor receives only a rotation about artwork position 95.5% / 91.8%.
No scale, squash, translation, replacement anchor, or geometry/texture alteration is used.
The 22-joint GLB, all four digit chains, uniform scale 84, carousel files, age-band mappings, and lifecycle handlers remain intact.

## Verification
See `sign-flick-results.json` and `verify-sign-flick.cjs`.
- Exact joint equality with the approved version at seven searching samples. Six rendered-pixel checks confirm the initial rise has no hand pixels through the barrel front.
- 601 post-search samples: finite joints, stable segment lengths, no abrupt IK flip, and rigid sign matrices.
- Maximum fingertip target error: 0.00000719 scene units.
- Four age bands × desktop/mobile; 64 real EXIT activations by mouse/touch/keyboard, across upright, exploring, falling and fallen phases.
- Normal real-time completion, no repeat after completion, scene cancellation/return, one reused canvas, reduced motion, and failed-model-load EXIT.
- Visual desktop/mobile inspection of contact, rigid fall, and fingertips disappearing through the opening.
- Normal build passed: 151 runtime files, 20 Ornate GLBs, 40 variant GLBs.

For the test script, set `PLAYWRIGHT_MODULE` to an installed Playwright module path if it is not on Node's normal search path.
Optional: `BROWSER_PATH`, `DREAMSCAPES_URL`, and `DREAMSCAPES_EVIDENCE_DIR`.
The default browser is Microsoft Edge on Windows. Run from any directory with the local server running.

## Barrel-opening correction
The earlier front-wall mask followed the upper metal hoop near y=640, below the actual front lip. The mask now follows the lip at y=618–623. During the reach, the concealed shoulder rises inside the opening and the forearm stays in front of the wood. A fixed relative elbow guide avoids a bend-plane crossing during return. The approved scale, GLB, search joint poses, sign fall and interaction handlers are unchanged.

Additional assertions at the failing reach and contact poses verify the shoulder is within the opening width and behind the lip, the upper arm rises above the lip, and the reaching wrist is in front of the wood. Final results include barrelOpeningOrigin=true, all eight layouts, 64 EXIT activations and failed-load handling.
## Initial emergence correction
The old initial mask ended at y=638 and switched off while the wrist was still below the opening. It now follows y=623. The hand rises fingers-up to a clear point above the opening before turning down onto the front wood. Temporary near-wall depth conceals the upper arm during this turn and returns to the original search depth at 2.6 seconds. Scale, rig, searching poses and all later choreography are unchanged. The rendered WebGL alpha buffer contains zero visible pixels below the lip in all six initial-rise samples.