# Mara: fluid walking loop and noticed pause

Local branch: codex/mara-scurry-collapse. No merge or deployment before visual approval.
Preview: http://127.0.0.1:4204/experiments/carnival/index.html?mara-review=1
Use Replay Mara or the keyboard-accessible timeline. Comparison buttons show the approved resting endpoint.

The 3.2-second crossing and approved October 22 endpoint remain unchanged. The old in-place pivot/sideways approach is replaced by a cubic ground-plane curve. Root heading always follows its tangent. Arc-length travel joins the crossing and eases down into the resting spot. Front and rear paw contacts sample that same path at their anatomical distances ahead of and behind the body; the forepaws lead and their corresponding hind paws follow. A small chest/hip bend follows the difference in path heading between shoulders and hips. World-space stance targets and independent foot lifts prevent the paws from rotating with the torso as a rigid unit. The loop takes 3.2 seconds, with short individual walking steps and a lower supported stance so targets remain within leg reach.

At 6.4 seconds, Mara reaches the exact resting location and stands still for 0.5 seconds, as though she has noticed the player. At 6.9 seconds she loses support, collapsing over 0.35 seconds into the unchanged approved pose. No circling spin, sideways slide into the spot, particles or disintegration are used. The last frame calls the same approved resting-pose function; no idle animation remains.

The same textured runtime GLB and 21-bone surface-distance skinning remain throughout. Original source GLB, textures and reference fox.png are unchanged. Source: 9,705 triangles, 19,232 render vertices, no original skeleton or animation clips. Runtime adds procedural bones and weights without remeshing/repainting. Runtime GLB: 20,533,344 bytes. Skin weights: 461,580 bytes. Source/runtime preservation evidence is in mara/asset-report.json; tools/rig-mara.py reproduces the surface weights.

The near-camera approach stays physically in front of the resting spot even when shallow landscape viewports crop the lower artwork. Existing scene framing and mobile pan controls are preserved. Warm lighting, contact shadow, reflection, EXIT layering and pointer behavior remain. Departure cancels playback; returning starts one new visit. Hidden-page playback pauses. Reduced motion shows the endpoint directly. Inspection becomes available after resting.

Verification covers desktop, wide desktop, portrait and landscape: elapsed playback, forward tangent alignment through the loop, planted supporting paws, 0.5-second still pause, no collapse yaw spin, exact final endpoint bones, one model download, no idle loop, comparison controls, reduced motion and navigation. Build validates runtime hashes. Visual motion approval is still required.
