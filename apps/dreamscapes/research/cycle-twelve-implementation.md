# Kit's arrival — implementation handoff

Dedicated branch: `codex/kit-living-mirrors`, based on Cycle Eleven + chest input fix `52f837b`. No main merge or production deployment.

## Implemented

The existing Fun House background is unchanged. One 384×512 WebGL character render is composited at 80% alpha into three traced glass apertures. Original opaque frame and doorway pixels stay in front. Per-mirror scanline refraction reacts to the existing tall/wide/endless mirror controls; the controls and three-mirror passage unlock remain intact. The hall's compositing surface is capped at 1280 pixels wide, and animation at approximately 30 Hz. No room-wide 3D reconstruction or duplicate character renderers.

A continuous 19.2-second timeline uses shared horizontal hall coordinates: sitting 0–3.6 s, notice 3.6–4.6, rise 4.6–6.1, traverse 6.1–11.4, doorway hide/peek/duck 11.4–13.15, visible return traversal 13.15–15.05, approach 15.05–17.15, reach and three taps at 17.65/18.15/18.65. Only afterward do story planks appear. Mobile framing follows Kit during the introduction, then returns to normal manual room controls. Existing walk/run clips provide gait; fitted skeletal joint targets provide sitting, notice, rise, reach, taps and waiting. No facial morph targets were supplied; emotion is communicated through head, posture, gait and gestures.

Native buttons provide keyboard/mouse/touch choices. Context is one short line plus an optional continuity line. First visits play the introduction; completed visits resume immediately and can replay or skip a replay. Leaving the room, a modal, a background tab, Borrowed Light and travel suspend the clock/render loop. Interrupted first arrivals keep their elapsed time in session storage. Reduced motion presents the essential arrival through an accessible status and a stationary pose with immediate choices. WebGL/model failure leaves the playable choices and a retry control.

## Asset inspection and preparation

The supplied GLB is 53,829,748 bytes: one connected skinned mesh, 61,224 vertices, 30,255 triangles, 66 joints, Walking (1.033 s) and Running (0.633 s). Its three 4096² textures are downsampled to 1024² in the derived 8,542,764-byte `kit.glb`. Original vertices, topology, normals, UVs, skin weights, skeleton and clips are retained. `asset-report.json` records the source SHA-256 and counts. `tools/prepare-kit.py` reproduces the derivative with Pillow and NumPy.

Development samples of the original walking clip did not reveal a separate unwanted object between the legs. The mesh is connected, so no speculative leg/skirt deletion was performed. The bind mesh touches the left hand to the skirt; large left-arm gestures visibly stretch those fused cloth faces. Expansive gestures therefore use her free right hand while the left stays close to the skirt. Formal whole-sequence and leg-geometry inspection belongs to the Sol pass.

## Branches and evidence

Each row is an example two-decision route; all six resolutions persist distinct outcome IDs and rendered marks.

| First choice | Second choice | Remembered consequence | Explicit experience signals |
| --- | --- | --- | --- |
| Follow the trail | Solve the loophole clue by clue | `last-guest-released`: paper door and tiny departing guest | mystery, investigation, puzzle-solving, layered complexity, measured pacing |
| Follow the trail | Enter the impossible room | `impossible-route-saved`: luminous map and saved route | mystery, investigation, wonder, adventure, discovery |
| Hear Kit's story | Share the gentle song memory | `kits-song-remembered`: warm paired lights and notes | connection, character history, emotional relationships, lighter tone |
| Hear Kit's story | Discover why her name vanished | `kits-name-anchored`: KIT remains etched in glass | connection, character history, mystery |
| Face the approaching shadow | Wait for the slow suspense | `shadow-boundary-known`: lit boundary sends shadow away | suspense, danger, measured pacing, darker tone |
| Face the approaching shadow | Chase a playful reveal | `paper-bird-returned`: shadow unfolds into bird with map | suspense, danger, brisk pacing, lighter tone, mystery |

No selection is labeled romance or horror based on helping/risk-taking. Narrative state lives in `dreamscapes.kit-living.v1.<age-band>`; reading evidence extends Cycle Ten's existing `dreamscapes.reading.v1.<age-band>` with an additive `narrativeEvidence` array. Existing reaction maps migrate unchanged. Each ledger item contains authored presented prompt/options, selected label, preference IDs, strength .65, confidence .6, age band, encounter/scene context, earlier decisions/outcomes, prior Cycle Nine/Afterimages/Eleven/Borrowed Light context and resulting consequence. Validation reconstructs authored options so arbitrary action strings cannot enter this ledger.

Stable encounter/decision/option IDs prevent repeated clicks/replays adding duplicate evidence. Aggregation gives one tentative signal per encounter/dimension; repeated paths do not increase weight. Explicit contradictory reading reactions stay conflicted. Both lighter and darker selected experiences remain in the ledger. Age-band keys and envelope filtering keep profiles isolated. Cycle Ten reset clears reactions/evidence/feedback without erasing narrative progress; simply opening or revisiting an ending never re-adds cleared evidence.

Only `mystery`, `connection` and `wonder` map to the existing reviewed starter shelf. Suspense, danger, pacing, tone, complexity and other typed signals are stored and visibly marked as unsupported by that small shelf. A suspense-only route can correctly produce no book match. The age-filtered starter shelf stays local; the request envelope includes typed evidence for future integration. No live endpoint has been invented and the shelf says live NovelIdeas recommendations are unavailable.

## Continuity

Cycle Nine's separate state/actions/reactions and old outcomes are untouched. Returning players with prior Kit progress can access 'Our earlier promise'; fresh visitors receive the live encounter. Prior resolved Kit outcomes frame this visit as her voluntary return, not renewed captivity. Afterimages watermarks/sheltered or wandering light, Borrowed Light, and Cycle Eleven invitation decisions alter current context. Existing Cycle Eleven ticket clue remains available behind the glass. The watcher ticket in this branch is explicitly distinguished from the unpunched invitation. Other carnival rooms/assets are unchanged.

## Handoff / verification status

Astra performed asset/composite development renders and desktop/mobile layout development. These are not final verification claims. Sol must run focused pure-module and browser checks, render/inspect the complete timed introduction, inspect geometry during all poses, play every branch, check interruptions/replay/reset/age changes/storage failure and preserve existing interactions. Sol should generate the requested final screenshots/recording/evidence report, commit and push, and root should deploy a public Vercel preview without merging main or promoting production.

Useful browser inspection API: `window.DreamscapesKit.snapshot()` exposes band, node, outcome list, elapsed introduction seconds, phase, render-frame count and asset readiness; `DreamscapesReading.snapshot()` exposes additive evidence and aggregate. The normal development route is `/carnival/?scene=fun-house`; `&motion=still` is the existing reduced-motion pathway.
