# Enchanted Carousel - Phase 1 local review

Branch: codex/enchanted-carousel-prototype, based on main 53c04c9, preserving the newer Mara sand-disintegration work. No merge or deployment.

Preview: http://127.0.0.1:4204/experiments/carnival/index.html?scene=rides-games&carousel-ride-review=1

Click the existing carousel or Ride the carousel. Choose Dragon, Rocket, White Horse or Unicorn. Boarding takes 1.8 seconds, the two-turn ride 36 seconds, and dismounting 1.5 seconds. A three-response story prompt appears on the second revolution. Leave, Skip and Escape work without fabricating unanswered choices. No results/recommendation screen or automatic replay appears.

## Existing assets and first-person camera

All 20 identities retain their native model/variant registrations, slots and textures. Kids and Pre-Teens use Stuffed, Teens Plain, Adults Ornate. The ride clones already-loaded transform nodes and shares geometry/materials/textures: zero additional GLB downloads and no additional WebGL context. The existing shared render pool draws the ride canvas. The normal carousel's layout, lighting and artwork are preserved; its phase is externally driven during the ride and its ambient clock resumes afterward.

The ride follows the existing seven-row/three-ring arrangement, retired empty slot, special loveseat radius, native mounting orientations and geared bob. Its perspective camera travels with the selected saddle; no rider avatar exists. Cosine-ramped angular velocity integrates to exactly two revolutions. Temporary first-person floor/canopy/column geometry samples pixels and colors from the approved structure art; the surrounding sphere samples Rides & Games artwork. This is a functional 3D proxy interior, not a full 3D reconstruction of the painted carnival. Phase 2 should refine canopy detailing, outdoor continuity, authored dream events and audio after review. Phase 1 uses soft glimmers and a small mount-specific color variation, with no flashing, violent imagery or sounds.

Only temporary geometry/materials/textures are disposed. Original mounts pause offscreen drawing under the ride and resume afterward; their shared assets are never disposed by the ride.

## Session observations and agreed handoff

The current static Dreamscapes site has no live connection to the NovelIdeas recommendation session. On October 28 the user explicitly selected "Prototype with documented handoff." This prototype records into the existing carnival-experiment-observations sessionStorage log and does not yet affect live recommendations.

carousel-evidence.js is a shared observation writer. Midway's recorder delegates to it, preventing poster/Mara events from overwriting carousel choices. Actual selections store opaque tab-session id, ride id, stage, age band, positive polarity and proposed signals. Ride id plus stage prevents duplicate callbacks and double-clicks. Unchosen options produce no negative evidence. Exiting before choosing produces only a non-preference lifecycle observation.

| Actual selection | Proposed positive signals |
| --- | --- |
| Dragon | fantasy; mythology, adventure |
| Rocket | science fiction; space exploration |
| White Horse | animals, adventure, journeys; no automatic historical-fiction inference |
| Unicorn | fantasy; wonder, magical worlds |
| Reach toward the light | wonder, exploration |
| Look for who rang the bell | mystery; curiosity, discovery |
| Remain aboard and watch | atmosphere, wonder; reflective tone |

DreamscapesSession.handoff(ageBand) returns only the latest explicit selection per stage in the current band. Unlimited replays cannot accumulate influence. Each event has a proposed total budget of 0.25, not 0.25 per tag; at most 0.5 for the attraction. Raw rows remain a bounded audit log. A future consumer must use the capped handoff, rather than sum replay rows.

Required integration: pass trusted NovelIdeas session context to Dreamscapes, add typed experience evidence to the existing SwipeSessionV2/buildTasteProfile path, map pre-teens to preteens and adults to adult, split the small event budget across recognized canonical fields, preserve provenance and the age/maturity plus collection/source filters. Do not synthesize liked books or treat unchosen mounts as dislikes. No separate recommendation engine, account lookup, API, recommendation UI or evidence upload was added here.

## Accessibility and lifecycle

Mouse/touch and native keyboard buttons work. Focus remains in the active ride, Escape leaves, and focus returns to boarding. The underlying scene is inert only while riding. Reduced-motion/still mode offers a stationary seated view and the same choices; Let the lights change advances the story without rotation/bob. Hidden tabs pause the clock. Age changes exit immediately before the new style loads. Page departure releases temporary resources. There are no audio resources in Phase 1.

## Full-story verification

Story: carousel entry, mount choice, first-person ride, story response, shared session log, capped handoff envelope, normal scene.

| Boundary | Evidence |
| --- | --- |
| Entry/assets | Four valid choices and 20 correct-style mounts in all four age bands; slots and registrations unchanged |
| Camera/motion | Eye stays within 0.3-0.9 units of the saddle; real-time ride physically orbits, moves monotonically, completes exactly two revolutions within the target duration |
| Choices/log | Actual mount and response recorded, duplicate callbacks ignored, positive only, latest-per-stage replay cap |
| Recommendation API | Intentionally absent as agreed; pending-handoff status exported |
| Cleanup | No new GLB downloads or contexts; original arrangement/background restored; reduced motion, Escape and age-change exit pass |
| Other attractions | Poster logging preserves carousel choices; Skee-Ball still scores 40 on a normal launch; all 20 mounts render after returning |
| Browser | No script errors or WebGL/context-loss warnings in tested flows |

verification/carousel-ride.cjs covers all four bands/four mounts, portrait and landscape touch, keyboard, replay budget, reduced motion and exit. verification/carousel-ride-normal.cjs checks an unaccelerated ride, poster log continuity, Skee-Ball return and age changes. Result summaries are saved alongside. Screenshots and detailed samples are in the local enchanted-carousel-review artifact folder.


## October 28 perspective correction and deliberate dream expansion

Normal preview: http://127.0.0.1:4204/experiments/carnival/index.html?scene=rides-games&carousel-ride-review=1&perspective=normal

Dream preview: http://127.0.0.1:4204/experiments/carnival/index.html?scene=rides-games&carousel-ride-review=1&perspective=dream

Board the carousel, select a mount, and ride. The localhost-only Perspective review disclosure allows A/B selection and intensity adjustment before boarding. It never appears on the public host. Normal disables spatial effects throughout both revolutions; Dream leaves the first revolution unchanged and expands during the second. The camera system and rider offsets are identical in both modes.

### Cause and correction

The previous ride converted SVG radii by dividing by 100 while preserving imported model scale. The existing orthographic mount cameras actually use 0.003662487 world units per SVG pixel; crop-canvas.js explicitly preserves this density. Thus the old 7.05-unit platform and 5.93/4.50/3.07-unit rings were approximately 2.7 times too large relative to the mounts. One shared generic camera offset also ignored each asset's forward axis and saddle/head dimensions.

The ride now derives units directly from the existing cropped camera width / holder width. Normal deck radius is 2.593; rings are 2.172, 1.648, 1.124, preserving seven rows, the retired slot and the loveseat's extra radius. Mount registrations and model scales are untouched. Shaft thickness and canopy dimensions use the same conversion. The proxy roof has enough clearance for actual mount heights and seated eyes (approximately 1.56 units), rather than copying the flattened artwork's floor-to-canopy pixel gap into an impossible rider clearance.

The camera uses each prepared mount's registration frame and existing base orientation. Horse and Rocket face local -X; Dragon and Unicorn face local +Z. Eyes sit behind the registered front pommel, slightly beside the shaft, looking forward with a small downward gaze so the neck/nose/front remains visible. Measured per-mount back/eye/side offsets are Horse .25/.36/.11; Rocket .24/.27/.11; Unicorn .25/.38/.11; Dragon .30/.47/.12. Prepared age variants retain the canonical dimensions, so these offsets work across bands. The camera shares the selected anchor's exact orbit and geared bob. Normal vertical FOV is 64 degrees, near .015, far 100; aspect updates on resize. No camera teleport or artificial selected-mount enlargement is used.

The floor/canopy/painted midway remain lightweight proxy surfaces sampled from existing approved art, not a newly authored 3D carnival. Existing 20 source models, textures, registrations, normal carousel arrangement and other scenes are unchanged.

### Separate effect

carousel-dream.js contains bounded, adjustable intensity, start, transition, restore timing, FOV change, space scale, canopy rise and environment displacement. Default start is 18 seconds (one revolution); transition 4 seconds, restoration begins at 28 seconds and finishes at 34, before the final deceleration ends at 36. Smoothstep boundaries have continuous velocity. Source geometry/materials are shared but never mutated: only temporary ride-owned presentation groups move. Other mounts drift away relative to the selected mount; the selected anchor and rider attachment stay fixed. Deck and canopy expand, poles reach the raised roof, the environment shifts, and FOV widens slightly. Every transform is recomputed from immutable home positions each frame, avoiding accumulated error. Skip fades the current effect to identity over dismount; disposal explicitly restores identity before releasing the temporary scene. Immediate exits discard only the proxy; originals remain untouched.

For local development, after boarding choices appear and before selecting a mount:

    EnchantedCarousel.configure({intensity:.85,start:18,transition:4,restoreAt:28,restoreDuration:6,fovChange:10,spaceScale:2.7,canopyRise:1.2,environmentDisplacement:.7})

The method is absent outside localhost review, accepts finite known parameters, bounds timing to preserve the first turn and restoration, and rejects changes while riding. Reduced motion forces spatial distortion to zero, holds the viewpoint/rotation/bob stable and keeps the existing atmospheric choice flow.

### Validation

The normal camera was implemented and checked before adding distortion: all four mounts across all four age bands, including portrait/landscape mobile and desktop, passed existing ride/evidence/cleanup checks. The separate A/B suite then passed 64 rides: four mounts x four bands x desktop/mobile x two modes. It checks undistorted first turns, full second-turn effect, invariant local eye attachment and forward-axis orientation throughout the orbit, restore before completion, partial-effect skip, and exact source-arrangement preservation. Screenshots were inspected for mount visibility, nearby mounts, roof/pole proportions and mobile framing. Envelope tests check continuous transitions, first-turn exclusion, bounded extreme parameters and restoration by 35 seconds. Existing lifecycle tests check reduced motion, duplicate guards, positive-only capped observations, GLB reuse, shared context reuse, escape, and no automatic restart. An unaccelerated ride verifies actual duration/two turns and effect timing, then existing poster observations, Skee-Ball scoring, all mounts after returning, and age-change cleanup.

This is a local branch preview. No merge, deployment, book recommendation or cross-app session connection has been made.
