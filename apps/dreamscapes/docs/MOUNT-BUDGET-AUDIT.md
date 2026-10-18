# Plain / Stuffed mount budget audit

Measured the actual 60 GLBs (20 identities × 3 styles), without changing any runtime, GLB, texture, material or transform. Counts are indexed triangles per mesh primitive; all files here use the same static triangle-mesh pattern. JSON includes vertex counts, image roles, texture bytes, attributes, extensions, animation/skinning counts and SHA-256 hashes. Run `python apps/dreamscapes/verification/audit-mount-budgets.py` from the repository root; requires Pillow.

## Findings and safe scope

Most variants are already at their own Ornate counterpart's geometry/resolution budget. The earlier 75k/1K, ~2.5 MB optimization is demonstrated specifically by Ornate Polar Bear and Zebra; it is not the budget of every current Ornate mount. Many current Ornate models remain 7–10 MB, ~77k triangles and 2K.

All forty Plain/Stuffed JPEG textures have quantization tables containing only 1s (quality-100-style encoding). Polar Bear/Zebra Ornate tables range 4–48 and Horse Ornate 5–61. No significant embedded metadata was found. The large textures are encoded image data, not removable EXIF bloat. Re-encoding at the proven counterparts' compression settings is the first trial to prioritize, retaining 2K initially where 1K has not been demonstrated. This is lossy recompression and still needs visual approval; byte counts alone do not certify visual equivalence.

Plain totals **162.23 MB / 1,544,005 triangles**, Stuffed **153.91 MB / 1,545,571**, Ornate **159.52 MB / 1,481,768**. Texture payload is **87.96 MB Plain**, **83.09 MB Stuffed**. Merely capping every variant at 75k would save only **45,800 Plain / 45,571 Stuffed triangles (~3%)**, so aggressive decimation is not the first remedy for their loading cost.

## Every model compared

Each grouped column is **Ornate / Plain / Stuffed**. MB is decimal. All variant textures are a single 2K base-color image. Horse Ornate additionally has a 2K normal map, so its texture configuration is not directly interchangeable with either variant.

| Mount | Triangles O / P / S | File MB O / P / S | Texture O / P / S | Recommended first budget trial |
|---|---:|---:|---|---|
| horse | 21,904 / 77,005 / 77,161 | 1.62 / 6.84 / 7.03 | 2K+2K normal / 2K / 2K | Encoding first; 75k initial, not 22k |
| rocket | 67,709 / 75,041 / 76,201 | 7.20 / 8.37 / 7.78 | 2K / 2K / 2K | Trial ~68k / 2K after encoding |
| griffin | 77,655 / 77,362 / 77,341 | 9.12 / 8.84 / 7.92 | 2K / 2K / 2K | Keep ~77k / 2K; encoding first |
| ostrich | 77,940 / 78,023 / 77,953 | 9.70 / 9.28 / 7.31 | 2K / 2K / 2K | Keep ~77k / 2K; encoding first |
| rabbit | 77,793 / 77,312 / 77,133 | 9.14 / 7.95 / 7.49 | 2K / 2K / 2K | Keep ~77k / 2K; encoding first |
| wolf | 77,936 / 77,821 / 77,474 | 9.39 / 8.78 / 8.30 | 2K / 2K / 2K | Keep ~77k / 2K; encoding first |
| polar-bear | 74,982 / 77,857 / 76,803 | 2.44 / 8.57 / 7.04 | 1K / 2K / 2K | Trial ~75k / 1K; strongest reference |
| fox | 77,882 / 77,702 / 77,704 | 9.17 / 8.96 / 7.24 | 2K / 2K / 2K | Keep ~77k / 2K; encoding first |
| brown-horse | 77,718 / 77,674 / 77,352 | 8.52 / 7.19 / 7.19 | 2K / 2K / 2K | Keep ~77k / 2K; encoding first |
| elephant | 77,897 / 77,308 / 77,214 | 9.43 / 7.52 / 7.59 | 2K / 2K / 2K | Keep ~77k / 2K; encoding first |
| tiger | 77,386 / 77,631 / 77,216 | 8.82 / 8.02 / 7.29 | 2K / 2K / 2K | Keep ~77k / 2K; encoding first |
| stag | 77,902 / 77,278 / 77,610 | 8.62 / 7.62 / 7.98 | 2K / 2K / 2K | Keep ~77k / 2K; encoding first |
| grizzly | 78,157 / 78,347 / 78,376 | 10.13 / 9.40 / 8.44 | 2K / 2K / 2K | Keep ~77k / 2K; encoding first |
| unicorn | 77,910 / 77,480 / 77,100 | 9.49 / 7.79 / 7.03 | 2K / 2K / 2K | Keep ~77k / 2K; encoding first |
| cat | 78,025 / 77,976 / 78,299 | 9.16 / 8.98 / 9.08 | 2K / 2K / 2K | Keep ~77k / 2K; encoding first |
| zebra | 74,988 / 77,309 / 77,368 | 2.50 / 7.62 / 7.72 | 1K / 2K / 2K | Trial ~75k / 1K; strongest reference |
| flamingo | 77,430 / 77,073 / 76,661 | 7.78 / 7.17 / 7.61 | 2K / 2K / 2K | Keep ~77k / 2K; encoding first |
| dragon | 77,683 / 77,669 / 76,897 | 9.32 / 8.09 / 7.43 | 2K / 2K / 2K | Keep ~77k / 2K; encoding first |
| moon-loveseat | 75,628 / 73,205 / 76,747 | 9.09 / 7.42 / 7.66 | 2K / 2K / 2K | Plain already below Ornate; keep mesh |
| snail | 77,243 / 76,932 / 76,961 | 8.88 / 7.83 / 8.79 | 2K / 2K / 2K | Keep ~77k / 2K; encoding first |

## Priorities

1. **Polar Bear Plain/Stuffed and Zebra Plain/Stuffed:** strongest matched-model candidates. Trial ~75k triangles, 1K base color, encoding comparable to their Ornate examples. A ~2.5 MB target is a comparison goal, not a guaranteed achievable size: variant vertex/UV structure differs. Preserve stripe edges and seams/fabric texture in the visual test. Reducing 2K to 1K cuts that image's decoded pixel count by 75%; four such variants would save about 48 MiB of RGBA storage before mipmaps, when all four are resident (24 MiB per active style).
2. **Horse Plain/Stuffed:** compression first while retaining 2K and ~75k triangles. Its 77k geometry is 3.5× the Ornate 21.9k count, but the mesh/detail distribution and normal-map setup differ. Do not jump directly to 22k or promise 1.6 MB. Test a separate intermediate mesh budget only after texture encoding is evaluated.
3. **Rocket Plain/Stuffed:** the only other substantial counterpart triangle gap, 75.0k/76.2k versus 67.7k. A ~68k trial is reasonable, but protecting silhouette, fins and saddle detail remains necessary. Retain 2K first.
4. **Remaining sixteen identities, both styles:** their geometry already roughly matches the Ornate counterpart. Keep it initially; test same-resolution JPEG encoding first. Largest Plain payloads: Grizzly, Ostrich, Cat, Fox, Griffin. Largest Stuffed: Cat, Snail, Grizzly, Wolf, Stag. Do not target arbitrary polygon reductions on fine features such as antlers, wings, ears, tassels and slender legs.

## Additional geometry cost

Triangle count does not capture the complete buffer budget. Polar Bear Plain has 93,933 vertices versus Ornate 52,448, Zebra Plain 95,171 versus 52,951. Their non-texture payloads are ~3.94/3.98 MB versus ~2.13/2.15 MB. Stuffed equivalents have 71,664/76,154 vertices. Exact duplicate-attribute removal or lossless buffer compression may help, but position-only welding can break normals/UV seams and is not authorized by this analysis. A compatible compressed runtime would also need verification before adopting Meshopt/Draco.

## What is and is not proven safe

The existing Ornate budgets are proven in-scene. No reduced Plain/Stuffed assets were created, so **none of the proposed reductions is newly certified visually equivalent**. The four Polar Bear/Zebra variants have the strongest evidence for a matched 1K/~75k trial. Most others already meet their counterpart budget, and reducing their file encoding cost is more justified than reducing polygon count.

Approval test for any later optimized copy: same fixed registration/crop/80% render buffer; compare front/side/rear and a complete revolution at normal playing distance; examine stripes, stuffed seams/fur, eyes, saddle edges, antlers/wings and silhouettes. Verify GLB materials/UV mappings, pole alignment, fallback behavior and all 20 occupied slots. Keep originals and change no active asset until visual equivalence is confirmed.

Raw data: `apps/dreamscapes/verification/mount-budget-audit.json`. No deployment or active asset changes.
