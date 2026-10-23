# Clown face ending — local review

Preview: http://127.0.0.1:4204/experiments/carnival/index.html?scene=skee-ball&clown-review=1&review=pompom-face
Use Replay ending to jump to the pom-pom cue; Replay clown plays the entire sequence.

Revised at the user's request: the one-second countdown begins when the yellow pom-pom starts losing opacity (bodyGone + 0.32 seconds). The supplied close-up PNG appears exactly one timeline second later and holds for a full second. The previous wait for every vapor wisp to clear is removed. Remaining wisps are cut at the image transition so none reappear when the face leaves. Explicit timeline boundaries prevent frame crossings from shortening either beat. There is no sound yet; the planned horn blast remains for the future soundtrack.

The supplied PNG is copied byte-for-byte to skee-ball/clown-closeup.png and predecoded before the clown becomes ready. It replaces the rendered 3D close-up. A fixed full-screen image uses proportional cover cropping, anchored to the face at the bottom of the source. The original image pixels are unchanged. No new graphics context is created. Navigation/hiding clears the overlay, and return resumes the active sequence. Reset and disposal clean it up. Reduced motion retains the existing sequence skip behavior.

The real-time regression checks the loaded image, pom-pom-to-face timing, full-second hold, one appearance, viewport coverage, navigation cleanup, exact nine-ball completion, score retention, Play Again and reduced motion on desktop, portrait phone and landscape. Results are saved beside the test. No merge or deployment has been performed.
