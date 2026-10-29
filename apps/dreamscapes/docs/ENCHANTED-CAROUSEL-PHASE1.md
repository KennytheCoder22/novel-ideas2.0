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


## October 29 mechanical attachments - local review only

Branch: codex/carousel-mechanical-attachments. No merge or deployment.

The proxy floor, canopy and center drum previously remained outside the mount/pole rotor, so their surface details could not track the poles as one mechanical assembly. The center drum also stopped below the ceiling. Plain shafts had no visible floor/ceiling bearings or sliding socket collars, and the unlit ceiling read as black space. The existing bob was already applied separately from the fixed shafts; that separation is preserved and now verified on actual rendered world matrices.

The deck, canopy, ribs, center drum, pole bases and bearings now share one rotor, center and angular phase. The center drum reaches the canopy underside. Each shaft extends from just inside the deck to just inside the ceiling; six-thousandths of a world unit of embed at each end prevents cracks. Fixed flanges at both endpoints make those contacts visible. The underside reuses the existing SVG navy gradient and the same extracted star artwork. It no longer depends on a nearly black unlit material to imply a ceiling. No source image, mount material or texture has been changed.

carousel-mechanics.js owns the normal mechanical hardware, with no dream clock. It retains each already-approved registration, model scale and native orientation. The registered pole axis is the approved pommel/socket axis; the surface around that axis is measured on the actual prepared variant mesh. A sliding collar meets that surface and moves only with the mount. Most surfaces intersect the registered axis. The Ornate Rocket's hollow socket needs a 0.0315-unit connecting bracket; Plain and Stuffed Moon Loveseats need 0.1058- and 0.0752-unit brackets respectively. Those short rigid mechanical connections reach the actual mesh without moving or redesigning the model. The texture on the fixed shafts uses the existing carouselPoleMaterial finish.

Only the anchor (model plus sliding socket hardware) receives geared vertical bob. The fixed shaft, deck bearing and ceiling bearing do not bob. The selected camera continues following the same selected anchor. Second-turn dream presentation remains in carousel-dream.js and the separate distort() pass, including reversible roof/shaft elongation and temporary spacing changes. No dream effect is present in the normal mechanical inspection modes.

Local preview links (click Ride the carousel on each page):

- Stationary exterior: http://127.0.0.1:4204/experiments/carnival/index.html?scene=rides-games&carousel-ride-review=1&mechanics-review=stationary
- Normal rotating exterior: http://127.0.0.1:4204/experiments/carnival/index.html?scene=rides-games&carousel-ride-review=1&mechanics-review=rotating
- First-person normal ride: http://127.0.0.1:4204/experiments/carnival/index.html?scene=rides-games&carousel-ride-review=1&mechanics-review=rider
- Normal-to-dream transition: http://127.0.0.1:4204/experiments/carnival/index.html?scene=rides-games&carousel-ride-review=1&mechanics-review=dream

Mechanical inspection controls provide pause/run, replay, a time scrubber and exterior camera azimuth, plus an exterior/rider switch. Optional mount=horse, rocket, unicorn or dragon changes the selected review mount. The localhost-only EnchantedCarousel.reviewFrame({elapsed,view,angle,paused}) API supports repeatable checks. Review sessions never write preference or lifecycle evidence; ordinary rides retain their existing choices and logging. Reduced-motion review stays paused and disables automatic Run.

Verification: all 20 mounts in all four age bands, sampled at 73 points through the first full revolution, including every geared high and low position: 5,840 mount/phase checks. Actual mesh endpoints meet their floor/ceiling bearings, axes stay vertical, socket collars stay concentric, shafts do not bob, feet clear the deck, camera local attachment stays constant, and deck/canopy share an angular quaternion and center. Four exterior azimuth screenshots per age band plus rider/dream screenshots were inspected. Normal live rotation was checked separately from paused sampling; source arrangements are exactly unchanged after exit. Dream expansion and restoration passed. The existing sixteen-rides lifecycle suite also passed across desktop, portrait/landscape mobile and all bands, including reduced motion, keyboard/touch, evidence caps, no extra GLB downloads/context, and cleanup. The initial browser console resource warning did not correspond to a failed game request; response-level checks found no failed game assets, and script errors were absent.


## October 29 revised specification: moving pole/mount assemblies

This section supersedes the fixed-shaft/sliding-mount specification above. Branch codex/carousel-moving-pole-assemblies, local review only; do not merge or deploy without approval.

Reviewed the supplied 27.9-second recording (2026-10-29 13-41-08.mp4). Each mount, rigid socket collar/bracket and its full shaft now share one named moving-assembly parent. The existing normal animation writes only that parent's vertical position. The rider continues to derive its eye and gaze from the selected same parent, so the pole, mount and camera cannot accumulate separate bobbing offsets. Original registrations, per-model attachments, scales, styles, textures and materials are preserved.

Each shaft is now open-ended and longer than the floor-to-ceiling distance. For assembly bob amplitude b, ceiling underside H, canonical mount height h and reserve e=.08, its local center is H/2-h and length H+2b+2e. Thus, at any bob offset u within [-b,b], its bottom is u-b-e (always at least e below the floor) and top is H+u+b+e (always at least e above the ceiling underside). At the least extended extreme it still passes completely through the .06 deck and .035 canopy thicknesses. Normal local shaft size/position never change; only the common parent moves.

The floor and canopy now have actual triangulated through-holes at the shared slot coordinates, rather than opaque caps or painted shadows. Open annular guides replace the closed endpoint flanges. They stay fixed to the rotor, centered on the shaft axes; the rods travel through them. Models, rods, collars and brackets move together, while guides, floor, canopy and center drum rotate as one assembly. Slot coordinates are calculated once and reused for the pole positions and both perforated plates. UVs retain the existing floor/ceiling artwork. The separate dream pass may elongate the shafts and expand/displace the proxy structures on turn two, then returns to normal geometry.

Use the existing local mechanics preview URLs with an additional review=moving-poles cache marker. Click Ride the carousel, expand Mechanical inspection controls, and use Highest position / Lowest position. Those buttons pause at exact geared extremes for the selected mount. Exterior/rider views, exterior azimuth, time scrubbing, replay and the separate dream preview remain available. Developer inspection generates no preference evidence. Normal player selection and actual preference observations remain unchanged.

Verification updates replace the obsolete fixed-shaft assertions in carousel-mechanics.cjs. The suite samples 73 phases across the first revolution for all 20 assemblies in all four age bands (5,840 mount-phase checks), including every geared high/low point. It verifies rigid shaft-to-mount deltas, invariant local shaft geometry, common moving parents, pole verticality, concentric fixed guides, positive extension beyond both plate thicknesses, deck clearance and common rotor orientation. Rays must pass through every actual hole; positive control rays must hit solid areas of both plates. External and rider screenshots capture both extremes. Live rotation, untouched source registrations, dream expansion/restoration and absence of developer preference logging are checked. The sixteen-rides lifecycle suite passes on desktop/portrait/landscape mobile with all bands, four selectable mounts, reduced motion, keyboard/touch, replay protections, evidence caps, asset reuse and cleanup.
