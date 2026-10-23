# Clown face ending — local review

Preview: http://127.0.0.1:4204/experiments/carnival/index.html?scene=skee-ball&clown-review=1&review=face-ending
Use Replay ending for the final vapor fade, pause and face; Replay clown plays the entire sequence.

The original vapor lifespan is retained independently of the extended ending. The final possible wisp expires at vaporGone. A one-second empty beat follows, then a static full-viewport close-up of the approved clown face lasts one second before final score / Play Again. Timeline boundaries are sampled explicitly so a frame crossing cannot shorten either beat. There is no sound yet; the planned horn blast remains for the future soundtrack.

The original rig, materials and cheerful face are rendered with a close-up camera in the existing WebGL context, copied to a full-screen 2D canvas, and restored immediately to the machine scene. This avoids another graphics context. Framing adapts to portrait and landscape screens. Navigation/hiding clears the overlay; return resumes the active sequence. Reset and disposal clean it up. Reduced motion retains the existing sequence skip behavior. The local review panel moves above the landscape replay button.

The real-time regression covers the vapor-free pause, full-second face, one appearance, viewport coverage, navigation cleanup, exact nine-ball completion, score retention, Play Again and reduced motion on desktop, portrait phone and landscape. Results are saved beside the test. No merge or deployment has been performed.
