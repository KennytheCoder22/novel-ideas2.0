# Skee-Ball shelf clown — local review

Superseded for movement, lighting and physical registration by [the perspective review](SKEE-BALL-CLOWN-PERSPECTIVE.md).

Branch: codex/skee-ball-shelf-clown. Local preview:
http://127.0.0.1:4204/experiments/carnival/index.html?scene=skee-ball

The approved Meshy clown replaces only the painted clown on the left middle shelf. It stays completely still in a seated skeletal pose while balls remain. Its geometry, materials, costume, face, proportions and original running clip are retained. Seated legs are posed using the existing rig, then blend back into the running clip during the hop. The previously reported extra Icosphere remains in the copied GLB but is hidden by the renderer. The original small running-loop seam remains unchanged.

After the ninth ball finishes scoring, one sequence runs per round: hop off the shelf, run toward the player, feet-to-hat evaporation into translucent wisps, brief vapor silhouette, upward curl, complete disappearance. The animation does not begin on aim, pull, launch, score milestones, or before the final ball settles. Play again resets the score, tray and character. Scene departure / hidden document pauses the sequence; returning resumes. Reduced motion skips the approach and evaporation to the completed state. The overlay accepts no pointer input and does not block navigation or game controls.

The small empty-shelf image patch was generated with the built-in image editor, specifically removing only the original middle-left painted clown and reconstructing dark wood. Only the x325–435 / y264–415 rectangle is displayed from that edited image. The approved original image remains byte-identical; all other artwork and the previous cup correction remain unchanged. The patch is revealed only once the 3D clown successfully loads, preserving the painted source as a fallback if the asset fails.

The character canvas shares the artwork's 1672 x 941 plane, including responsive scaling and portrait cropping. Lighting follows the warm scene. Idle rendering has no continuous animation frame loop. The module handles resize, scene visibility, round reset and resource disposal. A late asset load checks the actual ball count and requests the sequence if the round has already completed.

Files:
- public/experiments/carnival/skee-ball-clown.js
- public/experiments/carnival/skee-ball/clown-running.glb (13,052,352 bytes, copied from the approved review conversion)
- public/experiments/carnival/skee-ball/empty-clown-shelf.png
- Hooks and registration patch in skee-ball-art.js; pointer-transparent canvas style in skee-ball-art.css.
- Updated runtime-overrides.json hashes.

Validation:
- verification/skee-ball-clown.cjs checks motionless idle, eight remaining-ball states, waiting during ninth-ball flight, triggering after its result, hop/approach/vapor/gone frames, replay reset, scene pause/resume, reduced motion, portrait rendering, and absence of runtime/shader errors.
- Existing skee-ball-art.cjs passes desktop, portrait and landscape: scoring, nine-ball rounds, brass mouse/touch/keyboard controls, replay, resize and scene retention.
- Build passes all 163 runtime files and all 60 carousel GLBs.

No changes to Fun House, other Dreamscapes scenes, navigation, age-band mappings or scoring logic. No merge, push, deployment or production update authorized for this review.
