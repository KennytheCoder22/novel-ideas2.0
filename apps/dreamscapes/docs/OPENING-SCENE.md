# Opening scene — 2026-10-15

## Current landscape artwork

The current entry uses the exact user-supplied Dreamscapes_ Choose a Dream.png (1672 x 941), copied to public/opening/choose-a-dream.png. The complete illustration fits within both viewport dimensions, centered without cropping or scrolling. A percentage-positioned link follows the Creepy Carnival portal; all seven other portals and age bands remain inactive. The Carnival runtime is unchanged.

## Previous artwork replacement

The user supplied Enchanted Dreamscapes Portal Selection.png after the initial implementation. The current entry page displays that exact image, copied without modification to public/opening/enchanted-portal-selection.png (1316 x 1195). It replaces the earlier assembled banner and portal gallery described below.

Only one transparent, keyboard-accessible link overlays the Creepy Carnival portal (top row, third). It leads directly to experiments/carnival/index.html, the Midway. Percentage positioning tracks the original image as it scales, without cropping or rearrangement. The other seven portals and the illustrated age-band controls are inactive. No JavaScript is needed for the entry page. Earlier artwork and portal configuration are retained as design source material but are not loaded by the page.

No release is performed by this source update; the explicit/manual release policy remains in effect. Carnival runtime files remain unchanged.

Replacement verification: the browser loads the 1316px-wide supplied image, exposes exactly one link and no other interactive controls, and follows that link to the visible Midway. At a 390px viewport, hit-testing all eight portal centers identifies only the third as a link; there is no horizontal overflow. The original 91-runtime-file checksum and 20-model build checks pass.

## Initial implementation record

Implemented on codex/dreamscapes-independent from 08e5d6f. This is a saved source update for the next explicit release; production remains a33f9d8. No merge to main or production NovelIdeas change.

The new public/index.html is the Dreamscapes entry point. The dedicated app's root redirect was removed so the next manual release serves that page. Existing Carnival deep links and all checkpoint runtime bytes are unchanged.

## Branding and destinations

opening/book_logo.png is a byte-for-byte copy of the repository's assets/book_logo.png, the actual two-form yellow logo used by DefaultBookLogo in app/(tabs)/index.tsx. Its navy rounded frame and yellow outline are styled in CSS, following the existing interface. opening/novelideas-icon.png is copied from public/icons/novelideas-512.png for the favicon.

opening/portals.js owns ordered portal definitions. Only Creepy Carnival has a title and route, at index 2 (top row third on desktop). The other seven are unnamed placeholder destinations, exposed as noninteractive illustrations. Their descriptive accessibility text is not a destination name.

Each portal has independent artwork configuration. To replace one, change its art to { src: './opening/new-portal.webp' }; the default is a standalone cover image. The generated atlas is only a shared initial illustration source. Route, title, placeholder state and artwork can all be replaced without changing other portals or importing any Carnival runtime code.

Desktop uses four columns and two rows; screens 700px and narrower use two columns. Age buttons are text-only visual previews and explicitly marked aria-disabled; they do not select, filter, or persist an age band.

## Verification

- Live DNS CNAME matches ef27401e8a23338e.vercel-dns-016.com.
- Vercel reports domain ownership verified, misconfigured false, no conflicts, and the expected a33f9d8 production deployment.
- Custom-domain HTTP returns the expected Carnival redirect. Custom-domain HTTPS fails the TLS handshake from the current school machine/browser; HTTPS is not confirmed. No DNS changes were made.
- The Vercel hostname serves HTTPS. All 91 deployed checkpoint runtime files, including all 20 GLBs, match the saved SHA256 manifest exactly (verification/2026-10-15-live-assets.json).
- Browser: rides-games has 20 occupied slots, 20 ready mounts and 20 canvases, with no page errors. All five other location backgrounds completed their transitions and loaded (verification/2026-10-15-browser-scenes.json); Midway was also loaded directly.
- node build.mjs passes the original 91-file checksum and 20-model checks.
- node --check passes for opening.js and portals.js.
- Desktop DOM: eight portals, seven placeholders, Carnival position 3, four correct text-only age labels, no broken logo images or horizontal overflow.
- 390px viewport: two portal columns, scrollWidth 390, correct four age labels. Screenshots visually reviewed.

No changes were made to Carnival radii, slot placement, crops, render resolution, renderer sharing, transforms, Moon offset, opacity, depth, pole lengths, bobbing or headings.

## Art provenance

Generated with the built-in image_gen tool, using the user's attached concept as a style/subject reference for the portal atlas. The logo was not generated.

Portal prompt:

Use case: stylized-concept. Asset type: production fantasy portal atlas for Dreamscapes website. The attached image is a STYLE AND SUBJECT reference only. Generate an exquisite high-detail fantasy illustration atlas, exactly 8 equal rectangular tiles in a precise 4-column by 2-row grid, all tiles flush with no gutters, each isolated within its own tile. Landscape overall ratio 4:3, each tile ratio 2:3. Each tile contains one complete ornate arched portal with its full frame, steps and a beautiful environment inside, richly painterly golden storybook lighting matching reference. Top row left to right: enchanted forest portal with twisting branches and warm lanterns; underwater kingdom portal with seashell frame and swimming dolphins; CREEPY CARNIVAL portal with red curtains, small sinister jester mask, glowing carnival Ferris wheel (no text/sign); celestial palace portal with purple stars and a luminous golden staircase. Bottom row: golden fairytale castle stone portal with blue pennants; desert palace stone portal at sunset; blue winter ice-castle snowflake portal; vine-covered jungle ruins waterfall portal. Each tile fills its cell with its complete portal entirely visible and no cross-tile objects, matching portal size and camera angle in all eight. Outside each portal is dark midnight blue magical sky and stone terrace. No title banner, no logos, no text, no lettering, no buttons, no book. Do not reproduce the reference logo. This atlas will be used as eight independent CSS background crops. Make the grid exact and the illustrations gorgeous.

Scroll prompt:

Use case: stylized-concept. Asset type: standalone blank fantasy parchment scroll banner for the top of a magical book-discovery website. Generate a wide horizontal antique ivory parchment scroll, isolated with truly transparent background, ratio around 4:1. Elaborate curling rolled parchment ends at far left and far right, luminous gold hand-painted rim, delicate antique celestial compass roses near both ends, tiny filigree and star ornaments, warm cream parchment center providing a very large EMPTY legible area for HTML text. Ornate fairytale painted realism, golden amber edges, subtle brown paper fibers, soft glowing light. Symmetrical front view. Keep the broad center very pale cream with no distracting drawing. No writing, no text, no lettering, no logo, no books, no buttons. Full uncut scroll and ornaments entirely visible within image with modest transparent margin. Designed to frame the title Dreamscapes which will be rendered separately in HTML; DO NOT draw that title.
