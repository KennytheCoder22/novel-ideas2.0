# Rides & Games playable paths — October 19, 2026

Rides & Games now supports three forward choices, authorized together by Ken:

- The Fun House sign and clown-mouth entrance lead to the Hall of Mirrors. Each of three mirrors changes its reflection when examined. Looking at all three opens a passage to Tent Row. The player can return to Rides & Games at any time.
- The SKEE BALL sign, booth front, and GAMES direction sign open a playable nine-ball round. The player aims by mouse/touch or native keyboard-accessible sliders, selects power, and rolls. Cups score 10/20/30/40/50/100; a miss scores zero. Double activations are blocked. A roll settles once when interrupted by travel or document visibility; the round remains when returning. Completed rounds can replay. Reduced motion resolves the roll immediately.
- The RIDES direction sign connects to the existing Ferris Wheel platform. Other scenes retain their existing destination mappings.

The new rooms each retain the native EXIT link to Dreamscapes. Portrait camera controls and keyboard focus reveal all mirrors. The game controls fit the viewport independently of its background crop. No skill or score is used to infer book preferences; the round is browser-local and has no backend, account, recommendation, or persistence beyond the current page.

## Files

Room logic and styles: `public/experiments/carnival/play-rooms.js` and `play-rooms.css`. Navigation integrates the rooms through `locations.js`, `navigation.js`, `exit-sign.js`, and the carnival entry HTML. Verified asset hashes are in `runtime-overrides.json`.

New generated artwork, copied into the project and required at runtime:

- `public/experiments/carnival/locations/fun-house.png` — 1671 × 941.
- `public/experiments/carnival/locations/skee-ball.png` — 1672 × 941.

Both were made with the built-in image generation tool using the existing `locations/rides-games.png` as a style reference. The reference and existing scene backgrounds remain unchanged. There is no runtime dependency on the generation tool or the local generated-images directory. Skee Ball's interactive lane, cups, ball, and aiming marker are native SVG.

## Exact image prompts

### Fun House

Use case: stylized-concept. Project asset: a new full-screen game background, landscape 16:9, inside the Fun House of the reference carnival. The reference image is STYLE REFERENCE ONLY; create a different scene. Keep the same richly detailed painterly realism, aged timber, tarnished gold, burgundy circus fabric, warm amber tungsten bulbs, deep navy shadows, rain-soaked vintage creepy carnival atmosphere. Eye-height view inside an empty hall of distorted mirrors. Three large tall antique mirror frames are clearly visible across the middle of the picture: left at x 24%, middle at x 50%, right at x 76%; their glass surfaces show softly distorted reflections of the EMPTY room, no people or faces. All three mirror glass panels should be unobstructed so interactive effects can be overlaid. A worn wooden floor leads into the hall, ceiling festoons and a dim deeper corridor give depth. Lower left foreground stays visually quiet for a small exit control. No UI, no text, no logos, no watermark, no characters, no gore. Polished production illustration consistent with the reference rather than a modern haunted-house photograph.

### Skee Ball booth

Use case: stylized-concept. New landscape 16:9 game background viewed from inside the Skee Ball booth at this reference carnival. Reference is STYLE ONLY, do not reproduce its composition. Eye-height, centered symmetrical view into a richly painted aged wooden carnival game stall: burgundy canvas striped awning above, tarnished brass trim, amber bulbs, worn timber walls, shelves of slightly eerie vintage stuffed toy prizes around both far sides, a few old tickets and wooden balls on the outer counter edges. Deep navy night glimpsed at the margins. The center half of the image is a visually quiet dark recessed empty bay with shadowy worn wood, with a plain unobstructed central opening extending from near the top to the floor. This empty bay will hold an interactive Skee Ball lane drawn by the game: do not paint a game lane, scoring holes, game machine, targets, balls, counters, controls or signs in the center. Keep the central 45% of image empty, darkest, balanced for a vertical game board overlay. Match the reference's high-detail painterly cinematic illustration, warm practical lighting, melancholy creepy traveling carnival materials. Empty of people, no text, no UI, no watermark, no gore.

## Verification

`verification/playable-rooms.cjs` covers real entrances, keyboard mirror panning, forward passage, RIDES-to-Ferris travel, touch/mouse aiming, keyboard rolling, double-activation prevention, misses, interrupted rolls, retained rounds, all nine balls, replay, reduced motion, EXIT, and failed-room cleanup on desktop and mobile.

`verification/midway-arm/verify-navigation-state.cjs` now includes context-specific signs, room returns, and the unlocked passage. Its route graph covers 25 directed links across nine scenes, with 58 transitions per desktop/mobile layout, keeping the Midway sign fallen throughout.

Set `PLAYWRIGHT_MODULE` to an installed Playwright module, optionally set `BROWSER_PATH`, and run either script with Node. Defaults use the local port 4204 preview. `DREAMSCAPES_URL`, `CARNIVAL_PATH`, and `DREAMSCAPES_EVIDENCE_DIR` support deployed checks and separate evidence folders. The normal production entry is `/carnival/`; direct room checks use `?scene=fun-house` or `?scene=skee-ball`.
