# Dreamscapes autonomous playtesting

The November 3 baseline is commit `03f1b914715afa0fb5d3955e822d51f71f865675`. Work stays on a dedicated branch. This suite exercises the static Dreamscapes application, without NovelIdeas services, credentials, recommendation changes, merging, or deployment.

## Setup and commands

From `apps/dreamscapes`, using Node 20 or newer:

```sh
npm ci
npx playwright install chromium
npm run test:server
npm run test:playtest
```

An existing installation can be selected with `PLAYWRIGHT_MODULE` (module name or absolute installed module directory) and `BROWSER_EXE` (browser executable). These variables are optional; the normal path uses the locked local Playwright dependency and its Chromium installation. No runtime packages are added to the shipped application.

For interactive local play, `npm run dev` starts the route-aware server at `http://127.0.0.1:4217/`. `PORT` changes that port. The automated runner uses an available ephemeral loopback port and shuts it down afterward. `/carnival/`, relative scene assets, historical redirects, query strings, and the opening portal follow the hosting configuration. A plain Python static server does not provide those aliases.

Useful targeted commands:

```sh
npm run test:playtest -- --changes-only
npm run test:playtest -- --case=mara-
npm run test:playtest -- --case=skee-
npm run test:playtest -- --case=explore-
npm run test:playtest -- --carousel-only
npm run test:playtest -- --baseline --changes-only
```

`--baseline` intercepts only the three changed gameplay modules with their original bytes from the baseline Git commit. Original visual assets are reused. This permits before/after captures without checking out another branch, copying assets, or rewriting runtime files. Keep that commit available in local Git history. `--headed` shows the browser; `--trace` additionally records Playwright traces. Traces can be large because the scenes contain substantial model assets; video, screenshots, and diagnostic logs are recorded without that option.

`DREAMSCAPES_EVIDENCE_DIR` selects an output directory. Otherwise every invocation gets a fresh timestamped directory under ignored `playtest-artifacts/`. Use distinct directories for comparisons and reruns. Never commit the entire generated directory or overwrite existing evidence from another investigation.

## Coverage and boundaries

- All four age selections, selection persistence, and three mount styles at desktop 1440 × 900 and phone 390 × 844.
- Opening portal, poster inspection, geographic entrances, Hall of Mirrors and its three-mirror unlock, Tent Row, Zora, backstage, forest, Ferris platform, panning and exit.
- Mara's real pickup, initial lift, center arrival, breakup, disappearance, grounded printed tag, and cessation of idle rendering. Center and early-breakup alternatives are local review modes only. The fleeting put-down prompt is absent.
- Exactly three real Skee Ball launches, counter progression, nonzero scoring, no fourth prepared ball, single clown trigger, emergence/approach/evaporation/face/final state, replay, and a second game with reduced motion. Desktop uses keyboard input; phone uses emulated touch dragging. Emulation is not a physical-device performance certification.
- Carousel: all 20 occupied mounts retain their model registrations, ancestor slot, pole endpoints, collar/anchor motion and rotation across two revolutions, sampled every 45 degrees. Only an isolated test's RAF timestamps advance; production timing code is unchanged. The resulting recording is accelerated/sample-based, not a real-time 144-second performance recording. The current carousel has no separately implemented rider system.

The maintained runner drives player controls. Read-only diagnostics assert internal state; it does not launch balls or travel by calling production helper methods. Carousel clock sampling is explicitly instrumented and labeled. Scene transitions wait for arrival and completion before issuing another action.

Historical verification scripts capture earlier cabinet/control designs. `skee-ball-round.cjs`, the clown checks, and the carousel return check have their lifecycle counts updated. Older `playable-rooms.cjs`, `skee-ball-art.cjs`, and `skee-ball-forward-flight.cjs` describe superseded interfaces or nine-ball sequences; use the maintained runner for current end-to-end acceptance rather than interpreting historical assumptions as regressions.

## Evidence and visual review

Every case produces screenshots, a WebM recording, and browser diagnostics. `results.json` stores assertions and failures; `report.html` links the evidence. Unexpected resource failures, HTTP errors, uncaught exceptions, and console errors fail a case. Navigation-aborted requests remain visible in diagnostics but are classified separately; required assets must still satisfy readiness checks. Timeouts retain their stack and attempt a failure screenshot. Optional trace files require `--trace`.

An automated pass does **not** certify visual quality. The report deliberately starts unreviewed. The reviewing agent must open actual screenshots, extracted recording frames, or recordings and record which ones it inspected. For carousel work, inspect each style and viewport across both revolutions; investigate detached poles, crop errors, occlusion, scaling and drift. Transform assertions alone cannot certify the shape of a saddle or whether a pole intersects the wrong body part.

For Mara, compare center versus early breakup at matching animation times and inspect initial lift, start of breakup, mid-breakup, center arrival and the final ground. Reject a fade masquerading as fragmentation, large source-mesh confetti, body remnants, or changed scene composition. The original three-face printed tag remains and lands on the ground; no fur-weighted geometry is retained as a floating remnant.

For Skee Ball, inspect the complete three-shot game and established clown phases. Check the ball's ramp/flight continuity, score/counter legibility and mobile control registration, in addition to the assertions. Preserve intentional dream effects and existing art.

## Repeatable improvement cycle

1. Record the source revision and a before capture; reproduce the reported behavior with player controls.
2. Make only the approved correction on its own branch. Preserve original assets.
3. Run targeted cases, inspect visual evidence, correct introduced defects, and rerun affected cases.
4. Run the full suite before review. Record remaining issues separately from failures introduced by the change.
5. Update only the intentional entries in `runtime-overrides.json`, then run `npm run build` to verify the complete runtime manifest.
6. Commit code, tests, concise review notes and selected evidence. Open a draft PR against the relevant Dreamscapes branch; the creative director decides artistic direction. Do not merge or deploy automatically.
