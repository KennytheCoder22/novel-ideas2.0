# Cycle Ten — cumulative evidence and tested fallback

## Delivery status

Cumulative reading-interest evidence across Kit and Afterimages is implemented. The recommendation display uses that evidence and offers real titles through the existing Cycle Nine starter shelf. **Live NovelIdeas recommendation integration is NOT implemented.** The adapter explicitly returns live:false. This delivery follows the brief’s documented-blocker/tested-fallback route, not its live-integration route.

## Evidence and persistence

Each age band has a separate versioned localStorage profile, keyed dreamscapes.reading.v1.<band>. It stores only explicit, editable more/less/unsure reactions by story source and dimension. Repeating a story updates that source rather than multiplying votes. Conflicting reactions remain source-labeled and uncertain; they are not averaged into an inferred preference. Unknown, skipped and conflicted dimensions do not drive fallback matching.

Narrative actions remain in the existing temporary story state. Optional reaction-opened observations use a separate capped sessionStorage record. Book-card interested/not-now feedback uses its own per-band localStorage key and does not change interests. No names, school identifiers, contact details, accounts or server analytics were added. No preference data is transmitted to book providers.

Kit’s existing explicit reading controls contribute to the cumulative profile only when the player answers them now. Older actions and legacy saved reactions are not silently promoted. Afterimages adds an optional “What stayed with you?” opportunity after choosing an ending at Zora’s stool, with a “Revisit” label after answering. Questions ask what the player wants to read, not whether a puzzle was solved.

Reset erases the current band’s reading evidence and feedback and clears Kit’s corresponding legacy reaction state. It preserves narrative outcomes. Other bands remain separate. With denied storage, the current page uses memory. If an erase cannot update device storage, a warning explains that previous data can return on reload and asks the player to restore storage access and erase again. Cross-tab changes invalidate current/inactive-band caches. This does not erase other browsers or devices.

## Exact NovelIdeas boundary

The parent NovelIdeas checkout is a separate Expo application with pre-existing uncommitted work. No parent production file was changed. The architecture investigation found:

- screens/recommenders/types.ts: RecommenderInput uses deckKey, tagCounts, tasteProfile and additional query/history options. Established deck IDs are k2, 36, ms_hs, adult.
- screens/recommenders/recommenderRouter.ts:getRecommendations invokes providers, quality filtering, enrichment, normalizeCandidates and finalRecommenderForDeck. Expansion depends partly on swipe evidence thresholds.
- screens/recommenders/filterCandidates.ts, finalRecommender.ts and provider-specific modules contain protections that raw provider search does not execute.
- screens/swipe/recommendationsByBand.ts shapes queries by age/deck. Unknown input must be rejected by this adapter, rather than inheriting its teen default.
- screens/SwipeDeckScreen.tsx constructs RecommendationPipeline with component-ref persistence callbacks. It is not an exposed shared-profile backend.
- api/openlibrary.ts returns raw provider documents. The inspected API directory also has Hardcover and NYT provider routes, but no full recommendation HTTP endpoint was found.

Cycle Ten’s requestEnvelope preserves source-specific expressed interests and uncertainty, associates them with a validated band/deck, and excludes moral actions, behavior, book feedback, invented numeric confidence and fake swipe counts. It is a proposed transport contract, NOT a validated RecommenderInput. No endpoint is configured and no production request is made.

The remaining integration work is substantial: select the canonical approved NovelIdeas revision; review a translation from explicit story interests/dislikes/conflicts to its established taxonomy without fabricating swipe evidence; package the complete existing pipeline behind an isolated development service; retain its age/content, metadata/quality and availability-related checks; configure provider dependencies server-side; validate returned metadata and deck; add request cancellation/stale-age/reset protection; then verify real recommendations end to end. Lack of an existing full endpoint is an identified integration boundary, not proof that building one is impossible.

## Safeguards and limits

Live requests fail closed, so Dreamscapes cannot bypass production safeguards through the raw search proxies. The fallback reuses Cycle Nine’s seven-title matcher and editorial age pools; it does NOT execute NovelIdeas’ production safety/quality pipeline, and no such parity is claimed. It is labeled a limited starter shelf. Cards use the existing publisher-grounded title/author data and suitability notes. Stock, lending availability and current inventory remain unknown.

An insufficient or conflicting profile offers further exploration rather than invented personalized confidence. The small catalogue cannot satisfy every combination; coverage for young independent readers remains limited. The profile supports only three initial dimensions across two encounters. This is not a validated genre taxonomy or a calibrated predictor of enjoyment. Broader taxonomy, authentic reader enjoyment and recommendation accuracy remain unvalidated.

## Verification and corrections

82 automated contracts passed: five new accumulation/adapter contracts plus the 77 preserved contracts. Coverage includes source upserts, conflicts, invalid data, unknown-band rejection, explicit fallback status, separation of actions/observations/feedback, legal story paths, original chest rules, observations, renderer, dream assets and server behavior.

Eight cumulative browser journeys passed locally: all four age bands, desktop 1440×900 and mobile touch emulation 390×844. Each completes Kit’s choice/reaction through the UI, uses a returning-player Afterimages ending fixture, collects its second reaction through the UI, creates and resolves a conflict, saves separate feedback, reloads, checks a new tab, switches bands, resets, reloads and confirms narrative state is preserved. The fixture seeds ONLY the existing chest/Afterimages ending; it never seeds reading preferences. Separate real chest and Afterimages suites cover their gameplay.

A focused privacy browser check passed with both storage getters throwing from startup, temporary-memory operation, explicit reset-failure disclosure, and inactive-band cache invalidation after a second-tab reset. Storage failures cannot guarantee erasure of previously saved bytes; the warning explicitly preserves that limitation.

Routine corrections made during testing: guarded Borrowed Light’s initial storage reads so denied storage cannot prevent later modules from loading; exposed reset failure; invalidated cross-tab caches; loaded Cycle Ten before enabling Kit so fast play cannot reach the old shelf during initialization. Updated legacy test selectors for the second native dialog and new shelf labels without dropping path, preference or age assertions.

The local build verified 217 registered runtime files plus 20 Ornate models and 40 variants. Selected phone screenshots were reviewed for readable source disagreement, fallback disclosure, scrolling and reset controls. Physical-device performance, immersive quality and enjoyment prediction are not established.

## Preview provenance

Dedicated preview project: dreamscapes-novelideas. Branch: codex/dreamscapes-cycle-ten, based on completed Cycle Nine while retaining Cycle Eight. No merge to main, production promotion or production algorithm changes.

All eight revised Kit browser journeys passed, covering all seven endings in each band/device combination (56 outcome playthroughs), explicit interests and the cumulative shelf, reload, clearing and age switching. All eight Afterimages and eight full chest journeys passed. All 22 full preservation journeys passed: six Mara scenarios, two Skee-Ball scenarios, eight exploration/exit journeys across the four bands and six carousel style/device samples. The separate dragon ride-entry/return smoke passed. No application test failures remain in these suites. Earlier test-selector failures were corrected, and the actual loading race was fixed and rechecked across all eight Kit journeys.

Public preview: https://dreamscapes-novelideas-cbeqmn7wq-kennythecoder22s-projects.vercel.app/carnival/

Direct Kit entry: append ?scene=fun-house, finish the story and express an optional reading interest. For Afterimages, complete Borrowed Light, discover both reflections, reunite them at Zora, choose an ending and select “What stayed with you?”. A player may continue exploring at any point.

Deployment dpl_7TnkS8C1Hnfvx9v5ckpxQg53ACDT, runtime commit d22cb1f763e133a39fd3036b546b784a0bfeb61e. Final documentation/test-only commits do not change the deployed runtime. Full local evidence remains in verification/cycle-ten, verification/cycle-ten-hosted, verification/story-nine, verification/afterimages, verification/chest and playtest-artifacts/2026-11-13T19-46-04-653Z. Compact results are committed in CYCLE-TEN-TEST-SUMMARY.json.

A subsequent targeted Kids desktop/mobile rerun passed switching age bands with the Afterimages dialog and its reaction shelf both open; all native dialogs closed and band evidence stayed isolated. The compact summary retains the original eight-band/device results plus this two-case rerun, while the local cycle-ten/results.json reflects the latest targeted run.

Public HTTPS verification passed the two cumulative Kids journeys on desktop and mobile, including two-source reactions, conflict resolution, feedback, reload/new-tab persistence, age isolation, reset and preserved narrative state. All four bands were covered locally. The final hosted run is representative coverage, not all four hosted bands. Human narrative approval, young-reader suitability beyond the existing notes, physical-device performance and predictive recommendation accuracy remain unestablished.
