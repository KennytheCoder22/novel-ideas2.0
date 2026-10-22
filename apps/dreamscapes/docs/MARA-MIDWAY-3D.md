# Mara: scurry and collapse review

Local review branch: codex/mara-scurry-collapse. Do not merge or deploy before visual approval.
Preview: http://127.0.0.1:4204/experiments/carnival/index.html?mara-review=1

The endpoint approved on October 22 is unchanged. Its fitted scale, placement, head tilt and belly-forward pose are calculated before the motion, and the last frame calls that same resting-pose function. The reference buttons show the resting endpoint; Replay Mara starts the full sequence and the keyboard-accessible timeline scrubs it.

Mara starts around 30% of the visible viewport width and scurries directly right for 1.35 seconds. Heading is fixed throughout the run, with small gait motion and no circling or braking turn. The viewport's bottom crop sets the path so the head and upper torso show while the lower body is below the frame. The 0.35-second collapse freezes the gait, blends the independent bones and root orientation into the approved limp pose, and ends all animation. The final short settling movement takes the near-camera route into the established resting location. There are no particles or disintegration effects.

The same textured GLB and 21-bone surface-distance weights remain throughout. The source is an unrigged Meshy mesh (9,705 triangles, 19,232 render vertices); the runtime adds procedural bones and skinning, with no texture repainting or remeshing. The original supplied GLB is untouched. Lossless WebP runtime GLB: 20,533,344 bytes. mara-skin.bin: 461,580 bytes. Historical texture preservation details are in mara/asset-report.json; tools/rig-mara.py reproduces the surface weights.

Warm key light, moon fill, contact shadow and reflection remain. The canvas does not intercept pointer input and EXIT stays above it. Leaving cancels animation and hides the canvas; returning starts one new visit. Hidden-page playback pauses. Reduced motion goes straight to the approved endpoint, including Replay. No idle render loop remains after settling. Inspection is available once Mara is resting.

Verification checks desktop, wide desktop (1920x919), portrait and landscape; actual elapsed replay, fixed running heading and increasing x, bottom-edge cropping, grounded gait/collapse, exact endpoint bones, no idle animation, comparison controls, reduced motion, navigation and one model download. The build validates runtime asset hashes. Motion appearance still requires visual approval.
