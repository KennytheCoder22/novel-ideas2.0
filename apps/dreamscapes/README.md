# Dreamscapes / NovelIdeas 2.0

Independent application/workstream based on NovelIdeas main at 5782023c. It does not replace NovelIdeas production.

## Sources and layout
- Full Carnival package: codex/carnival-visual-proof, 6017e133b2edaba701ba673a3a12d26a5e9aee96.
- Verified Carousel overlay: b248dba528b5bf547b4cde56f36a22ac918b7a1e.
- All seven connected Carnival scenes are included.
- Seven rows; radii 593 / 450 / 307; 20 occupied mounts; slot 1 omitted.
- Fixed cropped canvases, 80% internal resolution, five-mount shared renderer, cleaned Rocket, shortened poles and Moon offset preserved byte-for-byte.
- `checkpoint/` contains historical handoffs, source asset recovery, transforms, occupancy and verification evidence. Historical launch paths there are superseded by the commands below. Canonical runtime is `public/`, with no dependency on `.tmp` or a prior worktree.

## Run locally
Node.js 20+ and Python 3.9+; no npm packages, secrets or paid services required.
From repository root:
```
node apps/dreamscapes/build.mjs
python -m http.server 4200 --bind 127.0.0.1 --directory apps/dreamscapes/dist
```
Open http://127.0.0.1:4200/experiments/carnival/index.html for the Midway, or append ?scene=rides-games for Carousel.
The build verifies original checkpoint hashes before copying assets. Update the manifest deliberately only when an approved runtime change is intended.

## Isolated deployment
Use only the dedicated Vercel project `dreamscapes-novelideas`, team `kennythecoder22s-projects`, root `apps/dreamscapes`. Build: `node build.mjs`; output: `dist`; framework: Other. No production NovelIdeas environment variables or database are needed. The separate project has no Git connection initially: deploy explicitly from this branch to avoid accidentally serving main through Dreamscapes.
Root vercel.json disables this branch's automatic deployment in the existing NovelIdeas project. It does not change main or its production configuration. Application-specific Vercel configuration lives here and is independent.
Never link this app to `novel-ideas2-0`, reassign novelideas.app/www.novelideas.app, or merge the checkpoint branch into main.

All required assets and code are tracked. Session observations remain browser-local as in the original runtime; remote hosting does not add account sync or editing tools. Continue development by checking out this branch on any computer.
