# Skee-Ball clown: perspective environment review

This supersedes the screen-plane movement and lighting description in SKEE-BALL-SHELF-CLOWN-REVIEW.md.

Local review: http://127.0.0.1:4204/experiments/carnival/index.html?scene=skee-ball&clown-review=1
Choose Replay clown to see the entire sequence immediately without playing or consuming any balls. The timeline, pause/resume, reset-shelf control and proxy-outline checkbox are localhost-only review tools. Normal play still waits for the ninth ball's scoring result. Nothing merged, pushed or deployed.

## Camera and proxy dimensions

The machine now uses a perspective camera, a fixed physical toy scale, and meter-scale proxy geometry. No screen-position interpolation or depth-dependent model scaling drives the path. Positive X points toward the painted left side, Y is up, and Z increases away from the player. The origin is the center of the front wooden runway.

The 2 m wide, 6 m long runway is fitted to source-image corners (462,714), (1208,714), (625.5,497.46), (1044.5,497.46), with a vanishing point at (835,220). The fitted camera is approximately 1.319 m above the alley and 7.572 m in front of it, with a 2856.69 px focal length. These dimensions establish a coherent approximate environment for the painted perspective; they are not a claim about the dimensions of a real machine.

- Runway: X +/-1 m, Y=0, Z=0..6 m. Foot contacts remain inside this surface during the approach.
- Rear scoring plane: Z=6..9 m, with back vertices obtained from the painted upper target-board corners. A small curved lip proxy occupies the far end of the runway; the clown lands before it.
- Side wooden rails: approximately X +/-1.02 m, Y=.025 m, radius .045 m.
- Protective fence: top rises from .16 m at the front to 1.52 m at Z=6; its top flares outward from X +/-1.0 m at the back to +/-1.38 m at the front. Wire-grid depth geometry, wooden top rails and posts write depth but not color. The proxy grid approximates the painted mesh spacing.
- Left middle shelf: foot anchor projected from pixel (379,403) at Z=6.5, approximately (2.250,.420,6.5) m. Shelf, canopy and back-wall proxies follow the painted shelf corners.

Proxy meshes are invisible during normal rendering. Depth-only rails, fence wires, scoring plane, shelf and canopy occlude the character according to camera depth. Their default material colorWrite=false prevents visible replacement geometry. The optional local outlines reveal the calibration for inspection.

## Movement and grounding

The clown starts motionless and seated. It turns toward the alley, then follows a world-space ballistic jump using gravity 9.81 m/s². It tucks its legs while clearing the fence. A preflight sweep of posed mesh samples and all shoe vertices checks the entire fence-crossing interval, including a conservative padding and a minimum clearance target of 4.5 cm; the flight duration is increased if needed. Dense full-mesh verification independently checks the resulting path.

The landing point is fixed at (0,0,4.4) m: back-middle of the wooden alley, before the scoring ramp. Two-bone landing IK and iterative sole contacts settle both shoes on the wood. A short compression and turn precede the run. The root stays at X=0 throughout the run and stops at Z=.35 m, before the front machine panel. At least one shoe is planted on the surface throughout the running cycle; the swinging foot follows the original animation above it. No shoe penetrates the alley.

Forward speed is derived from the original clip's measured planted-foot stride, approximately .508 m per .633-second cycle. The 4.05 m center run takes about 5.05 seconds. Natural apparent growth comes from the perspective camera at a constant model scale. Original animation tracks are evaluated with Three.js's track interpolants and property bindings on every sampled frame so manual seated/landing poses do not leak into replayed running poses. The existing source loop seam remains unchanged.

## Lighting and vapor

The character's original albedo, normal and packed PBR textures remain untouched. Low amber hemisphere light, an amber key and a local bulb replace the earlier strong even lighting. Canopy/back geometry shades the waiting toy. Shelf contact occlusion, soft variance shadow maps and per-shoe contact shadows tie it to the shelf and runway. Static proxy shadows are not applied across the painted runway; only the character adds its ground shadow during the approach.

At the near end, the running pose freezes and the approved bottom-up wispy vapor replaces the body. The vapor briefly preserves the sampled silhouette, then curls upward and fades. The upper geometry and actual yellow albedo texels identify the hat pom-pom; it lingers after the main body and hat disappear, rises slightly, then fades into the vapor. There is no dust, debris, explosion, face morph or costume repaint.

## Lifecycle, compatibility and validation

Gameplay, scoring, target hit regions, brass controls, image scaling and scene navigation are unchanged. Asset initialization is split into short chunks and waits for an active ball shot to settle before parsing the downloaded GLB. Failed character loading leaves the approved painted fallback intact. Idle rendering has no continuous animation loop. Scene/document hiding pauses the sequence. Play again resets the round and shelf pose. Reduced motion skips the sequence to the completed state.

Source artwork, the approved empty-shelf patch, separated-cup patch, and rigged GLB are byte-identical to the prior review commit. All new lighting, occlusion, contact and perspective changes are runtime overlays; no raster image has been repainted.

Checks:
- skee-ball-clown-perspective.cjs: desktop, portrait and landscape; camera corner registration, depth-only proxies, fence clearance, back-center landing, shoe contacts, centerline run, perspective size growth with fixed scale, delayed pom-pom, complete fade, quick replay controls, unchanged ball count, no shader/runtime errors, original artwork hash.
- skee-ball-art.cjs: mouse/touch/keyboard brass controls, every target score, nine-ball round/replay, short rolls, ramp/airborne flight, reduced motion, resize and scene retention on all three layouts. It now waits for both renderers to finish loading before checking transient ball phases.
- skee-ball-clown.cjs: stillness through eight balls and ninth-ball flight, trigger after the ninth result, replay reset, scene pause/resume and reduced motion. Timeline assertions follow the actual physical sequence timing.
- build.mjs: runtime hashes and all 60 carousel GLBs.

Review and evidence are local. User approval is required before merging or deployment.
