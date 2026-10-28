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
