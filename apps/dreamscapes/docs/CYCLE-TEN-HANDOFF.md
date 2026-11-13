> Sol verification has now been performed. Read CYCLE-TEN-RESULTS.md and CYCLE-TEN-TEST-SUMMARY.json for delivery status. The implementation-only checkpoint below is historical.

# Cycle Ten — investigation and implementation checkpoint

Branch codex/dreamscapes-cycle-ten, based on b6e004e071bb16affb9044d1d704926dbcdd7721. Development checkpoint only. No tests, build or browser verification run in this Astra phase. No production changes. No live integration claim.

## Architectural findings

The surrounding NovelIdeas workspace is an Expo/React Native application with many pre-existing uncommitted changes. It is a separate Git repository from Dreamscapes. Dreamscapes is a self-contained static app built by apps/dreamscapes/build.mjs and hosted in its dedicated Vercel project. Do not copy the dirty parent application wholesale or assume its local source is the deployed production revision.

Inspected integration points in the parent workspace:

- screens/recommenders/types.ts defines RecommenderInput (deckKey, tagCounts, tasteProfile, bucket plans, prior recommendations/rejections) and RecommendationResult. Deck keys are k2, 36, ms_hs, adult. Taste axes include warmth, darkness, humor, complexity, characterFocus, pacing, ideaDensity, realism. Cycle Nine’s connection/mystery/wonder are NOT a verified numeric mapping to those axes.
- screens/recommenders/recommenderRouter.ts exports getRecommendations around line 826. It calls provider engines, filterCandidates around 990, normalizeCandidates around 1011 and finalRecommenderForDeck around 1069. It includes query strategy, enrichment, quality selection and age/deck routing. Swipe evidence thresholds also govern expansion. Do not forge swipe counts to unlock it.
- screens/recommenders/filterCandidates.ts and finalRecommender.ts supply additional metadata/fiction/ranking decisions. Google Books provider code has publisher-quality rejection logic. These are more than raw search.
- screens/swipe/recommendationsByBand.ts builds queries per deck. Unknown deck fallback defaults to teen, so the adapter must reject unknown bands rather than pass one through.
- screens/SwipeDeckScreen.tsx constructs RecommendationPipeline around line 872 using component ref stores for personality, session swipes and mood. Its candidate callback initially uses deck cards. This is not a deployed shared persistence API.
- api/openlibrary.ts exposes raw Open Library search results, accepting q/limit and returning docs. api/hardcover.ts and api/nyt-books.ts are provider services. No complete recommendation HTTP endpoint was found in the inspected API directory. Raw search does not invoke the full router/filter/rank chain and cannot be used as a safe substitute.
- Cycle Nine’s public/cycle-nine/story.mjs supplies a seven-title editorial shelf and matching function, isolated from all those production systems.

## Integration boundary and remaining work

The new requestEnvelope is an explicit-interest transport contract, NOT a RecommenderInput. It carries validated band/deck, story-specific expressed interests and uncertainty. No behavior, moral actions, PII, invented confidence, numeric axes or fake swipe counts are sent. In fact no network request is made: there is no reviewed endpoint to receive it.

getRecommendations in cycle-ten/profile.mjs returns live:false and mode:starter-shelf-fallback with a precise blocker. It reuses Cycle Nine’s existing recommend function on unconflicted expressed interests. This is a functioning local fallback once tested, not a second production ranking engine. A full live integration remains incomplete.

To enable a real integration: establish an approved canonical NovelIdeas source revision; define/review explicit-interest-to-established-taxonomy translation (including dislikes and conflicting evidence without fake swipes); expose or package the COMPLETE existing getRecommendations pipeline in a dedicated development service; preserve all deck/content/quality/enrichment/availability-related gates; configure only necessary provider credentials server-side; validate the complete return contract and age safety; then connect a same-origin bounded adapter with cancellation/stale-band/reset guards. Do not reuse the raw search API, import only finalRecommender, or report catalogue results as live recommendations. This is an architectural boundary, not a claim that a future endpoint is impossible.

## Implemented

- public/cycle-ten/profile.mjs: pure normalized versioned evidence, per-source upserts, cumulative conflict-preserving aggregation, explicit-interest envelope and fail-closed fallback.
- public/cycle-ten/reading.js: localStorage reading evidence per age band, separate localStorage book feedback, capped sessionStorage behavioral observations, in-memory fallbacks, optional Afterimages reaction dialog, cumulative shelf, reset and age lifecycle.
- Kit’s existing explicit reaction controls now emit validated band-specific events. Legacy completed actions or old Cycle Nine reactions are not automatically promoted. Re-selecting a reaction is an explicit current expression.
- After choosing an Afterimages ending, Zora offers “What stayed with you?”; answered encounters use “Revisit what stayed with you?”. Questions explicitly ask what the player wants to read, not whether they solved the puzzle. Existing outcomes remain intact.
- Each source has one editable response per dimension. Repeated play does not multiply evidence. Conflicting more/less across stories remains conflicted and does not drive fallback matching. Unknown/skipped dimensions stay uncertain.
- Shelf displays actual catalogue metadata, reasons from cumulative unconflicted statements, source-specific disagreement, honest insufficient/no-match guidance, publisher links and separate interested/not-now feedback. Feedback does not silently alter reading interests.
- Current-band reset clears cumulative evidence and book feedback and clears Kit’s corresponding legacy reaction state while preserving story progress. No all-band reset is implied by this control.

## Mandatory Sol checkpoint

Before running tests, switch to Sol and receive confirmation. Then:

1. Inspect the modules and write meaningful pure contracts for accumulation across two sources, edited responses, repeat suppression, conflict/uncertainty, invalid data/bands, mapping to known deck IDs, and exclusion of actions/observations/feedback from preference evidence.
2. Syntax-check, verify runtime manifest hashes, build and run relevant existing unit suites. Runtime files were deliberately registered; approved art and production recommendation files were not modified.
3. Browser journeys in all four bands and desktop/mobile: finish Kit, explicitly react; finish Afterimages, explicitly react; inspect combined shelf; edit one source, produce conflict, verify no invented certainty; reload/new tab persistence where storage permits; switch age with dialogs open; ensure cached state cannot cross bands; reset and reload; verify book feedback persistence/separation.
4. Test blocked storage from startup and after previous writes, corrupt saves, reset failures, nested native dialog focus, Escape, rapid navigation and age switches. Check whether reset failure can leave old persisted data returning after storage is restored; communicate failure explicitly if so. Fix routine issues.
5. Update affected Cycle Nine tests: its book screen now delegates to the cumulative shelf, so old label/clear expectations are superseded. Do not weaken action-independent ranking or age isolation assertions. Test the explicit live:false/unavailable contract and ensure there are no network requests claiming to invoke production recommendations.
6. Run full preservation suites for Afterimages, chest, Mara, Skee-Ball, mirror exits, all 20 mounts and dream ride entry/return. Existing tools use bundled Playwright and Edge paths documented in Cycle Nine. Build first; browser servers must serve dist.
7. Assess the fallback's age boundaries honestly: original editorial pools and suitability notes remain, but the fallback has NOT passed through production NovelIdeas safety/quality gates. Never describe it as preserving those gates by execution. Live requests are disabled precisely to avoid bypassing them.
8. Record tested fallback results and exact live-integration blocker. If connecting the full service is the next necessary step, request Astra for that design/implementation phase rather than calling Cycle Ten live integration complete.
9. After passing checks, a dedicated HTTPS PREVIEW is authorized; main merge and production promotion are not. Read Vercel deployment skill. Project prj_uDp3rgzYWVvnP82Lv8dD2HFVTQNv, team team_qwZFQgAcD4WFkLZmhTMjxnbX, root apps/dreamscapes. Commit before handoff.

Pass for THIS checkpoint: at least two real narrative sources accumulate explicit reading interests; persistent/current-band reset and isolation work; uncertainty survives; behavior/actions/feedback cannot influence matching; fallback is functional and clearly labeled; no raw provider route bypass; original gameplay remains intact. This is NOT evidence of live integration or enjoyment accuracy. Cycle Ten delivery requires either full live integration or a clearly documented technical blocker with a tested fallback, plus regression results and public preview.
