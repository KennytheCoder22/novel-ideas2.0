# Cycle Nine — The Person Between Reflections

## Outcome

Dreamscapes now has an initial story → choice → explicit reading reaction → tentative profile → real-title shortlist pathway in the existing Hall of Mirrors. Kit is bound to watch the carnival mirrors. Helping, investigating, bargaining or leaving leads through different decisions to seven outcomes. The existing mirror inspections and Tent Row unlock remain available.

Players may express whether they want more or less connection, mystery or strange-world wonder in their reading, or remain uncertain or skip. These statements are editable. Story actions are recorded separately and never contribute to ranking. Compassionate help plus an expressed mystery interest yields the same suggestions as bargaining plus that same interest. Replaying cannot multiply preference weight. Uncertain-only or cleared reactions remain insufficient evidence.

The experimental matcher uses a seven-title editorial shelf, separate from production NovelIdeas algorithms, weights, accounts and swipe evidence. Every card gives a reason, suitability note and publisher/author source link. The shelf contains The Wild Robot, The Invention of Hugo Cabret, The Westing Game, A Good Girl’s Guide to Murder, Piranesi, The Very Secret Society of Irregular Witches, and The Wishing Game. Publisher/author listings were checked during development on November 13, 2026; current stock and local library holdings are not checked.

## Scope and limits

- Reading-interest evidence comes from explicit desire statements, not moral choices or assumed psychological traits. These are still unvalidated hypotheses about future enjoyment.
- One encounter and three broad dimensions provide a starting point, not a calibrated or comprehensive preference profile. Evidence does not yet accumulate across multiple authored encounters.
- The small catalogue cannot cover every combination. No-match states explain this; no-signal suggestions are labeled starting points rather than personalized matches.
- Kids recommendations currently emphasize illustrated middle-grade/shared reading. Coverage for the youngest independent readers is limited. Older-teen and adult material carries explicit suitability notes, but the broad age bands do not establish an individual reader’s readiness.
- Story and reactions are separate per age band within the tab session. Denied storage preserves in-memory progress across band changes, but cannot preserve it across reload.
- No library account, live holdings service, checkout or live stock integration is included. Linked publisher pages support finding real editions; “available now” is not claimed.
- Seven branch outcomes have different text and a few restrained mirror treatments. There are no new character animations or new locations. Human review must judge whether these narrative consequences feel substantial and whether the optional reactions feel natural.
- Physical-device performance, actual reader enjoyment and recommendation accuracy are unestablished by simulated testing.

## Verification

77 automated contracts passed: six new story/matching contracts plus 71 preserved state, observations, carousel, chest, renderer, narrative, dream-asset and server contracts. Tests cover graph reachability, illegal transitions, malformed state, action-independent ranking, reaction-sensitive ranking, uncertainty, repeats, no-match and band filtering.

Eight local story journeys passed across all four bands at 1440×900 desktop and 390×844 touch emulation. Each journey exercised all seven endings (56 outcome playthroughs total), unfinished/resumed dialogue, optional reading reactions, selected-state focus, real-title cards, persistence, age changes with a dialog open, clearing, Escape, and original mirror/exit behavior.

A separate browser edge test passed no-match disclosure, skipping and clearing interests, denied-storage cache and age isolation. Routine corrections kept keyboard focus in the selected reaction group, changed uncertain-only profiles to insufficient, and avoided counting an unfinished encounter as completed.

The build verified 215 registered runtime assets, 20 Ornate models and 40 variants. The public Vercel preview build also passed after the corrections. Syntax and patch hygiene were checked. Selected phone and desktop story/card screenshots were inspected for legibility and scrolling. Simulated touch and bounded visual review do not replace physical-device or human narrative approval.

Four public HTTPS story journeys passed: Kids and Adults, desktop and mobile, each covering all seven branches through the recommendation outcome, reload and age isolation. All four age bands were tested locally.

All eight Afterimages and eight full chest journeys passed on Cycle Nine. These include ordinary/reduced-motion chest tours, replay/skip, geographic return, original prop state and age switching from the puzzle. The separate dragon ride smoke also passed.

All 22 fresh preservation journeys passed: six Mara scenarios, two Skee-Ball scenarios, eight age-band exploration journeys, and six carousel style/device samples. No test failures remain. Full local screenshots and recordings are in verification/story-nine, verification/story-nine-hosted, verification/afterimages, verification/chest and playtest-artifacts/2026-11-13T18-57-37-171Z. Compact results are committed beside this report.

## Preview

Public HTTPS preview: https://dreamscapes-novelideas-lfb6v7swp-kennythecoder22s-projects.vercel.app/carnival/

Direct story location: append `?scene=fun-house`. In ordinary play, enter Rides & Games, then the Fun House, and choose “Someone taps from inside the glass.”

Dedicated project: dreamscapes-novelideas. Deployment: dpl_HuG3SMZtcmfeUyDTou8xsqC69NXa. Runtime commit: 4f0d38e0df016d1a8d3e35062ebb66a6015beb57. Subsequent commits add tests and delivery notes only. Branch: codex/dreamscapes-cycle-nine, based on provisionally accepted Cycle Eight. No main merge or production promotion.
