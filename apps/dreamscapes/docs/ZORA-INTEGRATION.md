# Madam Zora / Borrowed Light integration

The approved Zora and Cycle Seven features load for every Carnival visit. No activation parameters are needed. The existing `scene` parameter remains available for direct scene links.

From the Main Midway, use the existing Rides & Games entrance or sign. In Rides & Games, choose **Madame Zora →**. At Zora, **← Rides & Games** returns to the rides. The existing Tent Row route, painted Rides/Games signs, all other scene paths and gameplay remain available.

The encounter artwork, ticket/crystal-ball choices, linked-window puzzle, both light outcomes, forest greeting and guided return use the approved implementations. Only activation and navigation were changed.

Verification:

- `node apps/dreamscapes/build.mjs` verifies runtime and prototype hashes, 20 Ornate GLBs and 40 variant GLBs before producing `dist`.
- `node --test apps/dreamscapes/tools/cycle-five-contract.test.mjs apps/dreamscapes/tools/observations.test.mjs apps/dreamscapes/tools/carousel-choice.test.mjs`
- `node apps/dreamscapes/tools/zora-integration.cjs` tests the built output across all four age bands, desktop keyboard and mobile touch, including reduced motion. It enters from `/carnival/` without query parameters, visits from Rides & Games, uses Zora's ticket/vision, solves the puzzle, exercises both outcomes, visits the forest and returns through Zora to Rides & Games. Set `BASE_URL` to test production; `PLAYWRIGHT_MODULE` and `BROWSER_EXE` can select installed test tooling.

Release through the dedicated `dreamscapes-novelideas` Vercel project (`prj_uDp3rgzYWVvnP82Lv8dD2HFVTQNv`), team `team_qwZFQgAcD4WFkLZmhTMjxnbX`, with `apps/dreamscapes` as the root. This project requires an explicit deployment after pushing main; it has no automatic Git connection.
