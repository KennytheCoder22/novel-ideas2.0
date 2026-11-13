> Verification has now been performed. See CYCLE-NINE-RESULTS.md and CYCLE-NINE-TEST-SUMMARY.json for the delivery status; the development checkpoint below is historical.

# Cycle Nine implementation checkpoint — The Person Between Reflections

Branch: codex/dreamscapes-cycle-nine, based on Cycle Eight 72931a8885191765deb45424146f452b7f6603da. Cycle Eight remains provisionally complete for development, not human-approved. Do not merge or promote either cycle without approval.

## Purpose and design

Dreamscapes is a branching interactive story for discovering enjoyable books. The setting serves the story; the recommendation outcome serves the reader. The first vertical slice uses the existing Hall of Mirrors, adding an optional conversation with Kit, a person bound to watch the hall. Helping, investigating, bargaining or leaving open different choices and seven outcomes, including leaving the conversation unfinished. There is no scored correct answer. Existing mirror interactions and their exit unlock remain intact.

An ending offers optional reading reactions on connection, mystery and wonder. Each response is more, less or uncertain. Actions and reactions are separate fields; only explicit reading reactions influence suggestions. No morality or psychological profile is inferred from rescue/abandonment choices. Each dimension has one editable response, so replay cannot multiply weight. The profile is expressly tentative from one encounter, not a calibrated probability. Age bands have independent tab-session saves and in-memory fallback. Kids get a gentler bargain and memory outcome. Other bands share the broadly suitable narrative but have separate title pools.

The initial recommender is a standalone transparent experimental matcher, not an integration into production NovelIdeas weights/accounts. Inspection of recommendationPipeline.ts found it expects swipe evidence and account/session dependencies. Reusing it without a validated evidence adapter would misrepresent this experiment. The starter shelf uses seven real titles checked through publisher/author web listings on November 13, 2026; source links are embedded beside each title. Editorial tags and band assignments are hypotheses, not publisher endorsements. Kids titles are middle-grade/shared-reading starting points: suitability for younger independent readers remains limited and explicitly noted. No live library stock, lending availability or purchase inventory is claimed. No external APIs receive the player's actions or interests.

The catalogue contains The Wild Robot (Peter Brown), The Invention of Hugo Cabret (Brian Selznick), The Westing Game (Ellen Raskin), A Good Girl’s Guide to Murder (Holly Jackson), Piranesi (Susanna Clarke), The Very Secret Society of Irregular Witches (Sangu Mandanna), and The Wishing Game (Meg Shaffer). Sources are linked in story.mjs. Some interest/band combinations can produce no match; the interface reports that rather than inventing a personalized recommendation. With no clear signal, suggestions are labeled age-band starting points.

## Components

- public/cycle-nine/story.mjs: story graph, validated restoration, legal transitions, catalogue and matching.
- public/cycle-nine/encounter.js: native dialog, optional reactions, profile/suggestions, scene and age lifecycle.
- public/cycle-nine/story.css: readable dialogue and small additive consequence styles.
- public/experiments/carnival/index.html: normal-entry activation.
- runtime-overrides.json: registered deliberate changes.

## Mandatory switch to Sol before testing

No syntax, build, unit, browser or visual verification has run for Cycle Nine. This checkpoint is not a completion claim. Sol should inspect the implementation and author/run meaningful contract and browser tests. Repair routine issues without requesting Astra unless a substantial creative/architectural decision is needed.

1. Syntax-check three runtime files and diff hygiene, then build using apps/dreamscapes/build.mjs. Validate the resolved app output path remains in the authorized workspace before its dist deletion.
2. Pure tests: every branch reaches an ending; illegal transitions and malformed saves fail safely; actions alone never alter ranking; explicit reactions change ranking; unsure/skip create no preference; less suppresses conflicting matches; replay does not multiply evidence; no-match and no-signal states are honest; all age-band pools exclude other-band-only titles.
3. Browser journeys: all paths, two-stage choices, unfinished/resume, ending replay, reaction edits/clearing/skipping, publisher links, reload and independent bands. Compare helping with a mystery interest against bargaining with the same interest: suggestions must be identical. Verify no stale dialogue or focus survives age/scene changes, and storage errors remain usable.
4. Inspect desktop/mobile: entry button must not block existing mirrors or exit, dialogue fits viewport and scrolls, keyboard focus remains contained/restored, selected fieldset response is clear. Check Kids copy including the memory bargain. Confirm story outcomes and later revisits communicate consequences, not merely different text labels.
5. Run preserved Cycle Eight unit, afterimages-browser, chest-browser and relevant existing playtest/onboard suites against built dist. Existing scripts accept PLAYWRIGHT_MODULE and BROWSER_EXE. Bundled module is C:/Users/braggk/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright; Edge is C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe. The local .browser-tools directory contains the preservation video encoder.
6. Reassess catalogue breadth and suitability. At this checkpoint publisher listings establish real published titles, not current stock. Verify link destinations and explain this accurately. Do not silently turn unknown availability into available-now. A broader/live catalogue is future work unless necessary for a meaningful tested outcome.
7. Record results and remaining limitations, commit fixes, and create a dedicated Dreamscapes public HTTPS preview only. Existing project ID prj_uDp3rgzYWVvnP82Lv8dD2HFVTQNv, team team_qwZFQgAcD4WFkLZmhTMjxnbX, root apps/dreamscapes. Use the Vercel skill and verify exact commit/environment. No main merge or production promotion.

Pass means a player can enter the story, choose distinct paths, express or decline a reading interest, and receive transparent real-title suggestions with age separation; all relevant preservation tests pass and desktop/mobile journeys have no errors/soft locks. Functional tests do not establish engaging narrative, enjoyment prediction or catalogue adequacy. Escalate substantive deficiencies to Astra after collecting evidence.
