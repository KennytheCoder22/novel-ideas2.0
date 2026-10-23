# Skee-Ball forward flight repair

Local branch: `codex/skee-ball-forward-flight`, based on main `9fd70ca`.
Preview: http://127.0.0.1:4204/experiments/carnival/index.html?scene=skee-ball&skee-review=1

The former screen-space sine arc added 60–102 pixels of lift and made the ball grow during flight. Lower-strength shots visibly overshot their landing height and dropped back, resembling a vertical hop. The flight now uses the machine proxy camera and scoring-board plane. Depth advances at constant velocity across the collection well, height follows a downward-accelerating quadratic, and projected size decreases naturally with distance. The floor shadow also advances in world space. Target entry preserves the projected radius. The optional-character load failure path retains a smaller forward screen-space arc.

Target values, strength/angle mapping, nine-ball lifecycle, machine artwork, controls, clown and other scenes are unchanged.

Validation: `skee-ball-forward-flight.cjs` samples all eight scoring/miss destinations for strictly increasing depth, shrinking radius, continuous target entry and arrival behind the return well. It then uses keyboard controls at normal animation speed to score both 100 cups, 50, 40, 30, 20 and 10, plus a miss and weak roll, in desktop, portrait phone and landscape layouts. All three rounds finish with 350 points, exactly nine balls, one clown sequence, no tenth ball after completion, and a clean explicit Play Again reset. Existing `skee-ball-art.cjs` also passes all three layouts, covering real mouse/touch dragging, keyboard, reduced motion, scoring, resize and scene navigation. Build verification passes all 170 runtime hashes and 60 carousel variants.

This repair is saved locally for review; it has not been merged or deployed.
