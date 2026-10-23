# Mara — same-scene 3D pickup review

Branch: codex/mara-3d-pickup, based on main 7aaff1b. No merge or deployment.
Preview: http://127.0.0.1:4204/experiments/carnival/index.html?mara-review=1&pickup-review=1
Use Preview pickup to go straight to the lift, or Replay Mara and click/tap her after she collapses. Put Mara down or Escape lowers her back to her approved resting pose.

The actual existing rig moves from the fitted resting transform to a camera-facing held position in 1.65 seconds. Its scale, the existing PerspectiveCamera, composition transform/filter, background and renderer stay unchanged. Apparent growth comes from world-space travel toward the same camera. Visible-viewport fitting accounts for the mobile cover crop and recomputes on resize. There is no dialog, replacement model, inspection screen, visible hand or pickup prop.

A suspended-pose helper resets the gait and aims each leg chain and the tail toward world gravity. Loosening blends from the approved folded resting bones as Mara clears the ground. Small damped passive offsets move the legs, scarf and tag during the lift; the held root has only a 0.003-radian sway. No walking cycle, head tracking or live behavior runs while held. Ground reflection is hidden during lifting/holding and restored on put-down. Early cancellation smoothly lowers from the current amount. The controls support keyboard/escape and reduced motion.

The existing fox-cinema.js disintegration code and all model/texture/skin binaries are unchanged. The new flow holds indefinitely for inspection; it does not invoke or revise disintegration.

Verification: desktop 1440x900, portrait touch 390x844, landscape touch 844x390. Actual mouse click/touch starts the lift; camera/scale/background stay constant throughout sampled frames. Held bounds remain inside the viewport, centered, with room around the ears/paws and no open inspection dialog. Put-down restores the exact positions, projected bounds and all bone quaternions; early put-down and reduced motion also pass. Median held frame intervals measured 16.7ms in these browser layouts, with no script errors. A baseline comparison against approved main samples the run, walking left turn, pause, collapse and resting endpoint at six times, matching every bone, root position and projected bound exactly.
