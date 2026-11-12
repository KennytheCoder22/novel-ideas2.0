# Borrowed Light: the locked chest

Development replaces the Cycle Seven Woods/Home experiment with a curiosity reward. The padlock on the existing trunk opens a modal linked-wheel lock. Aligning all arrows automatically unlocks it, opens the lid, releases a light, tours existing attractions, returns and relocks the trunk. The previous Trees/Here choice and Borrowed Light forest greeting/moon controls are retired.

The PALMISTRY book and its plant are separate layers. The book starts sliding before the plant tips; both drop behind the trunk, whose original front face occludes them. Per the final user direction, they remain behind the trunk after closure and on replays within that age-band session. No restoration animation is performed. A new age-band session starts with its original objects.

The tour visits Rides & Games, Skee-Ball, the Ferris platform, Midway, Tent Row, backstage, and Forest's Edge, then returns through backstage and Tent Row. Established scenes are preloaded before presenting the puzzle. Normal-motion travel is approximately 24 seconds, plus opening/emergence/closure. Reduced motion uses short dissolves and reduced decorative motion. Skip becomes available after the first completion. Age changes during a sequence request an orderly return, then load the new band's state. Session saves contain only round, completion, and fallen-object state; no genre inference or recommendation weights are emitted.

Implementation uses localized SVG compositing over the unchanged approved background. Lid, book, plant, and chest body remain registered to the same scene plane. Two generated background plates supply the newly exposed surfaces; only the local chest mask/lid uses their pixels. Original Zora, carousel, Skee-Ball, Mara, age-band module, and recommendation source remain unchanged. The navigation extension only preloads existing scene definitions and exposes guarded tour transitions.

Generated assets: `public/cycle-seven/chest-clean-plate.png` and `chest-bare.png`, produced with the built-in image-generation tool using the original fortune-teller background. Prompts requested, respectively, removal of only the trunk/book/plant with matching background reconstruction, and removal of only the book/plant while preserving the closed trunk and reconstructing its bare lid. All other scene content was constrained to remain unchanged; runtime compositing further confines the output to the local mask.

Validation commands:

- `node apps/dreamscapes/build.mjs`
- `node --test apps/dreamscapes/tools/chest-state.test.mjs apps/dreamscapes/tools/observations.test.mjs apps/dreamscapes/tools/carousel-choice.test.mjs`
- `node apps/dreamscapes/tools/chest-browser.cjs` (set `PLAYWRIGHT_MODULE` and `BROWSER_EXE` if required; `BASE_URL` selects a hosted preview).

The prior `zora-integration.cjs` script describes the retired Woods/Home experiment and is superseded by `chest-browser.cjs`. Visual review of the localized artwork, simulated hinge and staggered falls remains part of preview approval; automated completion alone does not judge cinematic quality.

Release is preview-only. Do not merge this branch or assign production domains without approval.
