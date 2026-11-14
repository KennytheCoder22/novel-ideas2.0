# Carousel scene ownership

Development branch: `codex/dreamscapes-carousel-scene-ownership`.
Base: production commit `8814524606dc690a0f3f6cb804d8232e1b42345d`.

## Cause and correction

Navigation caches visited and preloaded scene DOM. It hid the carousel owner
with `visibility:hidden`, while asynchronous mount preparation explicitly set
each SVG mount holder to `visibility:visible`. CSS visibility can be overridden
by descendants, leaving all 20 mount holders eligible to paint in other scenes.
The carousel's mechanical clock already stops while its owner is inert; this
was a scene visibility boundary failure, not incorrect mount registration.

The carousel owner now starts hidden, is revealed for the existing transition,
and becomes hidden after navigation away. A scene-specific `display:none` rule
removes its entire subtree from painting, including SVG foreignObject canvases
and the native SVG image path used on iOS. Failed navigation restores the source
and hides the unsuccessful target. Background mount animation callbacks skip a
hidden owner. One-time asset preparation remains available for cached scenes,
and returning reuses the existing models and approved pose.

Other scenes retain their existing visibility/layout behavior. No artwork,
mount catalogue, registration, styles, poles, carousel timing, dreams, Zora
artwork, chest animation, story state, or navigation paths changed.

## Verification

Results: 48 scene checks passed across desktop and emulated mobile touch,
41 focused Node tests passed, both ride lifecycle scenarios passed, and both
full chest tour scenarios passed. See
`verification/carousel-scene-ownership-results.json` for the compact evidence.
Browser checks use installed Microsoft Edge; native Safari/Firefox are not
covered by this automated run.

`tools/carousel-scene-ownership.cjs` checks the normal painted carnival entrance,
carousel-to-Zora navigation, four age bands and all three mount styles, returning
to the carousel, Hall of Mirrors, Midway, Forest's Edge, scene preloading, direct
URLs and refreshes on desktop and a 390 x 844 touch layout. It asserts that all
20 holders are paintable in the carousel and none are paintable elsewhere.
It records screenshots and scene/variant diagnostics under `.tmp/scene-ownership`.
`BASE_URL` allows the identical checks against an HTTPS preview; `BASELINE=1`
stops at the original Zora regression for reproducing the production failure.

The existing ride lifecycle check now serves built output, including the
production Zora integration that the source-only test server cannot provide.
It covers early step-off, resume, refresh, repeat completion, transparent mount
buffers, and the reduced-motion touch experience. The existing chest browser
check exercises the complete preloaded scene tour and replay on desktop/touch.

The build validates SHA-256 checksums for 209 runtime files, 20 Ornate GLBs and
40 variant GLBs. The runtime manifest changes only the four edited runtime files.
The root Vercel configuration disables this branch's unrelated NovelIdeas
automatic deployment; the requested Dreamscapes preview is created explicitly
in its dedicated project. Production is not promoted or merged.
