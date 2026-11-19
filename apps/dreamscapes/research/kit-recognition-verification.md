# Kit recognition verification

Branch: `codex/kit-recognition`. Production remains on `717b795`.

## Visual and motion

Edge browser captures at 1440×900 and emulated touch 390×844 cover the entire 34-second arrival at 14 timed checkpoints. The final desktop trace rendered 1,019 frames; mobile emulation rendered 1,021 (about 30 frames per story second on this test machine). These are not physical-device performance measurements.

The screenshots show Kit seated small in the left mirror, slowly rising, crossing behind the center, peeking from the fixed right doorway with her head and tiny fingertips while her torso and forearm stay hidden, withdrawing, reappearing as a head behind the middle beam, approaching with perspective growth, and resting her hand at the center glass. The same single PerspectiveCamera, character mesh and fixed depth-writing walls remain in use; no phase visibility mask or moved wall was added. Choices first appear at 34 seconds. The intro has no spoken lines, taps or audio.

The revised FBX had a connected hand/skirt contact. The prepared GLB and reproducible repair transfer garment weights and remove contact bridge triangles while retaining the face, hair and clothing. Sampled seated, rising, crossing, peeking and close poses show no long cloth strip. No facial morphs or separate eye controls exist in the source, so a held head pose suggests Kit's gaze; independent eye motion is unavailable. The right peek is deliberately small at the rear-wall distance; fingertips are distinguishable in a close crop but subtle in the full hall view.

## Focused checks

- Build passed: 243 hashed runtime files, 20 Ornate and 40 variant GLBs.
- `node --test apps/dreamscapes/tools/kit-evidence.test.mjs`: 4/4 pass for all six authored outcomes, explicit preference evidence, replay deduplication, contradiction, reset, age isolation and prior context.
- `kit-browser.cjs`: all six outcomes, nine deduplicated evidence items, reset/reload, mirror refraction, phone touch and keyboard plank input pass.
- `kit-lifecycle-browser.cjs`: modal pause, leave/return resume, reduced-motion completion and legacy Kit/Cycle Eleven/Afterimages/Borrowed Light continuity pass.
- `kit-visual-capture.cjs`: 14 checkpoints on desktop and emulated mobile; no page errors; three planks after 34 seconds.
- The new `recognitionSeen` flag lets a returning player who watched the prior 19-second arrival experience the new sequence once, without resetting story choices or outcomes.

Review media: `/cycle-twelve/review/`. The recording and all screenshots there were refreshed from this 34-second implementation. It is a browser recording with no sound; physical-device performance and subtle emotional pacing remain for human review.
