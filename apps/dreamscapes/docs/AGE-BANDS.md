# Age-band mount-style selection

Portal artwork and layout are unchanged. Native transparent buttons overlay the four painted age labels, support touch, Tab/Enter/Space and expose aria-pressed selection. A small bottom-left indicator shows band/style; loading and Ornate fallbacks are identified.

Kids -> Stuffed; Pre-Teens -> Stuffed; Teens -> Plain; Adults -> Ornate. Adults is the default for a new/invalid preference. `dreamscapes.age-band` in localStorage persists across reloads and Carnival scenes; no network/account tracking is added. Storage access errors are caught (selection is then in-memory only). The band is used only for mount model style, not other scene behavior.

The portal preloads only the selected style, using four concurrent downloads and a versioned browser cache shared with Carnival navigation. The Carousel initializes the verified fixed rig without downloading Ornate placeholders. Three model-loading jobs parse/prepare requested models; each canvas stays hidden until its correct model has rendered. Missing mappings or genuine load failures request only that mount's Ornate fallback. Loaded models are reused on revisits and style changes. Existing fixed transforms, poles, timing, crop cameras, scales and rendering behavior are unchanged. Original Ornate files and all variant GLBs are unchanged.

Review locally:
```
node apps/dreamscapes/build.mjs
python -m http.server 4204 --bind 127.0.0.1 --directory apps/dreamscapes/dist
```
Open http://127.0.0.1:4204/ and choose a band before entering Creepy Carnival. Optional model-review controls remain at /experiments/carnival/index.html?scene=rides-games&carousel-dev=1 . Those explicit developer controls can override the displayed style without changing the saved age preference.

Regression checks:
```
node apps/dreamscapes/verification/verify-variants.mjs
node apps/dreamscapes/verification/verify-age-bands.cjs
```
Browser test requires Playwright (PLAYWRIGHT_MODULE may point to an existing install), BROWSER_EXE for an installed Chromium browser, and a server on BASE_URL (default http://127.0.0.1:4204). RESULT_FILE optionally selects the JSON output path. Tests cover four bands, native keyboard activation and phone-size touch emulation, reload persistence, all seven geographic scenes, twenty-slot preservation, unchanged canonical settings, and a forced missing Plain Griffin request. Phone tests use touch for band selection and portal entry, then the scene navigation API because the existing Rides sign falls outside the narrow viewport. Physical-device hardware performance is not measured.

Not deployed. Await visual approval of all three sets before release.
