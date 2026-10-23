# iOS Carousel registration candidate — 2026-10-22

Branch: codex/carousel-mobile-registration. User authorized merge and deployment on 2026-10-23.

## Cause and reproduction

Reported on iPhone 16 Pro / iOS 26.6.2 / Safari. The mount canvases are HTML content inside SVG foreignObject elements. Accelerated WebKit layers can lose the ancestor SVG transforms (WebKit issues 23113 and 83189). At 402 x 874 CSS pixels, DPR 3, forcing `transform:translateZ(0)` on the original canvases reproduces the reported top-left/above-canopy displacement. SVG pole geometry stays correctly positioned. Ordinary Windows WebKit without forced compositing did not reproduce it. Physical-device causation remains to be confirmed.

## Local candidate

On iOS only, use native SVG image surfaces at the same depth-sorted anchors, with lossless PNG frames from the existing shared renderer. Keep the same cropped drawing buffers, 80% resolution, cameras, models, transforms, poles, style loading and visibility controls. Canvas buffers remain off-DOM on iOS. Other platforms retain the original foreignObject/canvas path.

No individual registration offsets, GLBs, CSS artwork, or animation calculations changed. The native SVG surface keeps positioning, canopy/core occlusion and pole ordering inside one SVG transform/paint hierarchy.

## Checks performed

- WebKit at 402 x 874, DPR 3, iPhone user agent.
- 20 mounts in each of Ornate, Plain and Stuffed; 49 samples per set, crossing two revolution boundaries per set.
- Every sampled mount populated, correct style, native SVG surface with a rendered frame.
- Quarter-turn screenshots captured and representative views inspected. No above-canopy displacement in the native-surface captures, including forced canvas compositing.
- Build succeeds: 170 verified runtime files, 20 Ornate and 40 variant GLBs.
- Desktop comparison passed: all 20 rendered PNG buffers and registration diagnostics exactly identical to pre-fix reference. No independent physical-iPhone verification was performed by the agent.

The regression harness is `carousel-ios-registration.cjs`. Run from repository root with PLAYWRIGHT_MODULE pointing to Playwright and DREAMSCAPES_BASE_URL pointing to the preview. It compares the pre-fix reference modules from commit 9fd70ca0682fd1a26260d4a512dbfac1b8900026 and tests the candidate. Evidence path is configurable with DREAMSCAPES_EVIDENCE_DIR.

## Performance limitation / approval gate

On this Windows WebKit renderer, the existing path measured 2.49 FPS and native SVG frames 1.15 FPS in a short control measurement. These very low desktop-emulation numbers are not physical iPhone FPS, but indicate real PNG encoding/presentation overhead. The user subsequently authorized release. These measurements remain a performance limitation; no physical-device FPS claim is made.

Local evidence is in `.tmp-mobile/` (not tracked): accelerated.png reproduces the bug; *-native-*.png and native-results.json contain candidate evidence. No physical iPhone has been remotely controlled or inspected.

Home-network preview (computer and phone must be on the same LAN):
http://10.0.0.220:4213/experiments/carnival/index.html?scene=rides-games

Start from repo root:
python apps/dreamscapes/verification/serve-mobile-preview.py --bind 10.0.0.220 --port 4213

The LAN address may change. No firewall rules have been changed.


