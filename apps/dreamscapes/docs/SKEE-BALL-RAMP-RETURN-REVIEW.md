# Skee-Ball ramp, collection well and nine-ball round review

Local review branch: `codex/skee-ball-ramp-return`, based on main `96a4c48`.
Approved by the user on October 21, 2026, with authorization to merge all of today's work into main.

Preview: http://127.0.0.1:4204/experiments/carnival/index.html?scene=skee-ball&clown-review=1
The local review panel replays/scrubs the clown without consuming game balls. The ordinary game still triggers it only after the ninth result. During a real completion sequence, review replay/scrubbing preserves its completion callback; Reset shelf is ignored until it finishes.

## Construction

The image-calibrated perspective camera now shares a dimensional construction description with the ball animation. The runway is a level Y=0 surface ending at Z=3.2. A full-width, 32-segment S-profile ramp spans Z=3.2 to 3.65; its 0.45 proxy-unit length represents six inches at 0.338667 metres per proxy unit. It begins flush with the runway and ends at Y=0.1, matching separate adjacent launch rail caps.

The ramp ends at a straight lip, with a vertical front wall behind it. A collection well has its own recessed floor (Y=-0.18), two side walls, and rear wall ending at Z=6. The inclined scoring deck starts there, independently of the launch lip. The runway depth and shadow receiver end at the ramp toe; neither spans this well. These are real depth-tested surfaces, not a painted dividing line. The small insert samples the approved image's wood and amber illumination; the original PNG, targets, prize shelves, controls and clown GLB are unchanged.

The clown's fixed-scale trajectory clears the fence, lands at [0,0,2.5] with its whole body on the player side of the toe, stabilizes/turns and runs along X=0. Its earlier shelf lighting and soft vapor transition from home work are retained. Gravity uses the same world-to-metre conversion. Fence clearance and projected grounding are sampled in the perspective verification.

## Round lifecycle fix

Previously every shot-completion handler repainted the resting ball, including the ninth shot. It now transitions through ready -> rolling -> clown -> complete. Finishing a pending shot consumes it once, records its score and prepares another ball only when balls remain. The only rest-ball preparation calls are a nonfinal result and explicit Play Again. A round id guards shot completion, and launching requires an available ball in ready state.

After the ninth result, score and zero balls persist; ball and its shadow are absent, both controls are locked, and the clown starts once. Its completion callback runs after the last vapor has dissipated and reveals the final score/Play Again. Only Play Again resets the round id, score, nine-ball tray, paddles and character. Reduced motion completes the same lifecycle immediately. Leaving/returning preserves round state.

## Verification

- skee-ball-art.cjs: desktop, portrait phone and landscape; mouse/touch/keyboard, all target values, short rolls, ramp/flight phases, round replay, resizing and scene departure.
- skee-ball-clown-perspective.cjs: all three layouts; camera alignment, fence clearance, landing before the ramp, grounded centered run, fixed model scale, delayed pom-pom and local review controls.
- skee-ball-clown.cjs: idle through eight balls; ninth result triggers, vapor, replay, navigation pause/resume and reduced motion.
- skee-ball-round.cjs: real-time full nine-ball rounds in all three layouts; ninth scores, nine balls prepared/used, one clown trigger, no tenth ball after the entire sequence plus a delay, repeated launch attempts, final score preservation, absent ball and shadow, completed-scene departure/return, explicit replay reset and a subsequent reduced-motion round.
- Build checks all 164 runtime hashes, 20 Ornate carousel GLBs and 40 variants. Original approved alley SHA-256 remains 2d54822360a3329f1542853c2bf0b295f5c78e6a903f35d8497c4ab82b0c555b.

Screenshots and detailed results are in the local artifact folder `ramp-return-review`. The user approved the review and requested merging this work together with the landing-page age-band glow.
