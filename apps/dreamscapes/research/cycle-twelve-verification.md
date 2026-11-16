# Kit's Arrival — Cycle Twelve verification

Branch: `codex/kit-living-mirrors`. Based on approved Cycle Eleven and chest input fix `52f837b`. No merge into `main`; no production promotion.

## Visual review

- Rendered the complete 19.2-second introduction in Edge at desktop 1440×900 and mobile-emulated 390×844, capturing at 13 timed checkpoints. Observed sitting (1.5 s), noticing (4.0), rising (5.4), left/center/right crossing (7.0/8.8/10.8), doorway peek (12.3), visible return (14.2), approach (16.7), three tap phases (17.7/18.2/18.7), and choices only after 19.2 s.
- Kit stays inside the original glass apertures; the ornate frames and background artwork remain intact. She is small in the left mirror and grows naturally toward the center glass. The right doorway hides her before the brief head-and-shoulders peek. The crossing passes through occluded frame gaps at shared hall coordinates; she does not jump between independently positioned mirror models.
- The rendered character is 80% opaque. Examination of the wide mirror changed the composited canvas pixels, confirming that the character participates in the existing interactive refraction effect. The refraction is subtle by design.
- No detached geometry appeared between Kit's legs in the inspected sitting, standing, walking, approaching, and tapping frames. The supplied connected mesh retains a left-hand/skirt contact, so broad pointing and tapping use the free right hand. Geometry was not deleted speculatively.
- The desktop and mobile intro recordings were trimmed from actual browser video to 19.8 seconds. First frame shows Kit sitting; last frame shows the completed arrival and choices. Review page: `/cycle-twelve/review/`.
- Emulated desktop recorded 582 rendered frames over 19.2 story seconds (about 30.3 frames per story second); emulated mobile recorded 578 (about 30.1). This measures the test machine with mobile viewport emulation, not physical mobile hardware.

## Story and evidence

Actual browser plank selections reached all six distinct outcomes:

| First option | Second option | Persisted outcome | Relevant explicit signals |
| --- | --- | --- | --- |
| Follow the trail | Solve the loophole | `last-guest-released` | mystery, investigation, puzzle solving, layered complexity, measured pacing |
| Follow the trail | Enter the impossible room | `impossible-route-saved` | mystery, investigation, wonder, adventure, discovery |
| Hear Kit's story | Share the gentle song | `kits-song-remembered` | connection, character history, emotional relationships, lighter tone |
| Hear Kit's story | Uncover her vanished name | `kits-name-anchored` | connection, character history, mystery |
| Face the shadow | Wait for slow suspense | `shadow-boundary-known` | suspense, danger, measured pacing, darker tone |
| Face the shadow | Chase the playful reveal | `paper-bird-returned` | suspense, danger, brisk pacing, lighter tone, mystery |

Each route has a different environmental mark and consequence. The evidence report records the selected labels, preference IDs, confidence, and consequence for every route. Replaying all six paths yielded nine unique authored evidence IDs rather than twelve votes: three first choices and six second choices. Both lighter and darker chosen experiences remained in the ledger. An explicit reading reaction contrary to a Kit choice produced a conflicted profile instead of overwriting either source. Age-band keys remain separate; a Cycle Ten v1 reaction profile migrated without losing its readings. Reset cleared evidence and feedback while retaining narrative outcomes; reopening and reloading an ending did not repopulate cleared evidence. Unsupported narrative signals remain stored but do not create unsupported starter-shelf matches.

## Focused checks

- `node --test tools/kit-evidence.test.mjs`: 4 passing tests for six outcomes, evidence shape and validation, deduplication, contradiction, migration, age isolation, reset, and continuity context.
- `node tools/kit-browser.cjs`: six UI routes; distinct endings; 9 deduplicated evidence IDs; contradiction; reset/reload; age isolation; mirror-refraction pixel change; touch and keyboard plank controls.
- `node tools/kit-lifecycle-browser.cjs`: intro pauses for a Cycle Eleven dialog and when leaving the room; reload resumes elapsed time; reduced motion shows immediate essential encounter and choices; resolved legacy Kit story, Cycle Eleven ticket, Afterimages, and Borrowed Light remain accessible.
- `node tools/kit-return-browser.cjs`: returning player can skip a replay without duplicating evidence; browser storage write failure leaves the current story and evidence usable in temporary memory.
- `node tools/kit-visual-capture.cjs`: timed desktop/mobile captures, video, and screenshots; no page errors; planks appear after the third tap.
- `node build.mjs`: verified 240 tracked runtime files, 20 Ornate GLBs, and 40 variant GLBs before packaging review media.

## Remaining human review

Facial expression is conveyed by head, body, and gesture because the supplied rig has no facial morph targets. The left hand remains near the skirt to avoid stretching connected cloth faces. On a narrow phone, the planks cover part of Kit's lower body at the final close-up while keeping her face and torso visible. A person should assess whether the peek, three taps, and each branch's emotional pacing feel natural, and test performance on physical mid-range mobile devices. The recording is silent because capture did not enable browser audio; the subtle tap sound is available after a user gesture when browser audio permits it. Live NovelIdeas recommendations remain unconnected; the current shelf is an age-filtered local fallback.