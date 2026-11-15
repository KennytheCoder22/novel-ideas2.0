# Zora scene entry readiness

Branch: `codex/zora-scene-readiness`, created from current main
`bdbd16070a704aab764c9fd6511779f58367d799`.
The prior padlock refinement `e3d9c739` is retained as a preview dependency to
preserve the requested unlocked/replay behavior. Neither preview change is
merged into main by this task.

## Cause

The approved background PNG contains the original trunk and Palmistry book.
Navigation previously waited for that background alone. Only after its entry
animation completed did the active-location observers mount Zora's character,
table controls and interactive trunk. Sequential asynchronous module imports
and image downloads/decoding could extend the gap. The saved lock state also
could not be painted until that late chest mount. Preloading only the chest
would not fix the observer ordering or guarantee a complete first composite.

## Correction

`public/zora-scene.js` shares one encounter bootstrap between initial Carnival
loading and scene preparation. Nearby Rides & Games and Tent Row start low
priority image preloads; unrelated navigation never waits for those requests.

When mounting Zora, navigation keeps her entire view out of the paint tree
until the background and overlay images are decoded, scene stylesheets have
loaded, the character/controls/Afterimages are mounted, and the chest has drawn
its first frame with the correct saved padlock state. This uses the existing
approved clean plate and composited chest, with unchanged registration and
source PNGs. No replacement artwork or new masking patch is introduced.

The previous scene remains visible with a small lamplight status cue while
readiness is pending. The existing navigation transition begins only after
the composite is ready. There is no fixed loading delay. Asset failure leaves
the source scene intact; retry can build a fresh hidden target. Existing story
visits are recorded only by actual navigation, not by hidden preparation.

Chest visual preparation is separate from loading the Borrowed Light tour,
so preparing Zora cannot deadlock while waiting for a tour that includes Zora.
The first ready frame uses the existing saved state; age changes while loading
update the hidden controls before reveal. No animation paths, carousel models,
story outcomes, or age-band storage keys are changed.

## Verification and evidence

Local results: 64 focused tests, 26 entry scenarios, four full chest browser
cases (ordinary and reduced motion, desktop and touch), and 18 carousel checks
passed. All 24 audited first-visible states were complete and had the correct
padlock state; no incomplete visible frames were observed. The baseline exposed
the original artwork while the chest dependency was held. Results are saved in
`verification/zora-scene-entry-results.json`; the local screenshot gallery is
`.tmp/zora-entry-fixed/index.html`.

`node tools/zora-entry-browser.cjs` tests desktop and emulated mobile touch.
It holds real image/module/style responses, audits every animation frame for
an exposed but undrawn chest, and captures screenshots while loading and at
the first exposed frames. Scenarios include empty storage, cold first entry,
completed-state direct refresh, slow JavaScript/CSS, ordinary navigation,
unrelated scenes during prefetch, all four age bands, three repeated returns,
and image-failure retry. The restored Afterimages clue is checked before entry
completes. `BASELINE=1` replays the previous runtime and reproduces the exposed
original trunk with its image response held.

The runner accepts `PLAYWRIGHT_MODULE`, `BROWSER_EXE`, `ZORA_EVIDENCE`, and
optional `BASE_URL` for HTTPS verification. Screenshots and raw frame audits
live in the selected evidence directory. No test hooks are shipped in player
flows. `SMOKE=1` omits only the deliberate failed-image case.

The existing focused state/artwork/geometry tests, full chest browser runner,
and carousel ownership runner remain the preservation checks. The build also
validates the runtime/prototype hashes and all 20 Ornate plus 40 variant GLBs.

Deployment is a development preview only. Main and production remain unchanged.
