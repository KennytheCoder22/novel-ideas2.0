# Kit recognition implementation handoff

Branch: codex/kit-recognition, from main 717b795. No commit, build, deployment or formal verification performed in this implementation pass.

## Implemented

- New supplied FBX converted to embedded-texture GLB, retaining the Mixamo body/finger rig and source Running clip. The silent slow choreography uses authored skeletal poses rather than playing the running action.
- One fixed PerspectiveCamera and one character in a shared metre-based scene. Three original mirror apertures clip one full-scene render. Character scale stays one; projected approach size follows depth.
- Fixed depth-writing rear walls, partition, doorway, beam and floor occlude the character. Rear-wall openings allow the continuous return path behind the walls. No phase-based visibility, alpha wipe, sprite switching or repositioned occluders.
- 34-second seated notice, supported rise, rear crossing, right peek, concealed return, middle peek, approach, pause, palm appeal. Intro audio/taps removed. Existing story branches, profile storage, navigation lifecycle and reduced-motion/replay flows retained.
- Derived GLB fixes source hand/skirt contact: 5459 garment vertices have arm/finger weights transferred to hips/legs; 1431 stretched contact bridge triangles removed below shoulders. Face/hair and source vertex positions/textures retained. Current raised-palm development render no longer has the long cloth strip. Conversion then repair is reproducible; repair rejects already-repaired topology.

## Explicit unresolved visual verification

The latest isolated composite peek captures are too subtle to certify head/fingers-only visibility. Sol must measure the projected skinned head and fingers against the FIXED doorway and beam, tune skeletal poses/root path if necessary, and inspect continuous motion. Do not move solids per phase, hide the body manually, or fake scale. The source has no eye joints or facial morphs: independent eye movement and expressive facial animation are unavailable; the staged hold/head motion cannot be described as actual eye animation. Check source neutral face for the requested no-smile expression. Check seated knees, wall support, gait contact, cloth seam holes and palm orientation in motion.

## Development tools

Existing static server is http://127.0.0.1:4218/ serving app public. Start from repository root if needed: node tools/kit-local-server.cjs (inspect actual server script name/port first). tools/kit-recognition-development.cjs is an isolated original-art composite sampling harness; RUN IT FROM REPOSITORY ROOT as node apps/dreamscapes/tools/kit-recognition-development.cjs because output paths are rooted at apps/dreamscapes/research. It exposes window.kit, window.hall, window.choreography. Renderer exposes bones, pivot, camera, scene, occluders, project(world), snapshot(). Latest development files recognition-{seated,rise,rear-middle,right-peek,return-peek,glass}.png are diagnostics, not approved review evidence.

Playwright: C:/Users/braggk/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright. Browser: C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe. ?kit-debug-space renders fixed solids as wireframes. kit-recognition-peek-development.cjs generates a placement grid and projected pose diagnostics; other *-development scripts are exploratory artifacts.

## Sol completion

Inspect full app, refresh old tests that assert 19.2-second/tap behavior, run formal checks, create updated screenshots/video and public review. Existing public/cycle-twelve/review content still depicts the PREVIOUS intro and must not be presented as new recognition evidence. Preserve all story/profile regression checks. Runtime override hashes refreshed for the implementation; repeat node apps/dreamscapes/tools/register-kit-runtime.mjs after further runtime/review edits. Build removes app dist: validate its resolved absolute path is inside app before running. Clean exploratory artifacts as appropriate. Root handles commit/push/preview; no main/production change authorized in this task.
