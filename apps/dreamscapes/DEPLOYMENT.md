# Dreamscapes deployment handoff

Branch: codex/dreamscapes-independent
Base: current main 5782023c (not the historical checkpoint branch).
Deployed application commit: a33f9d89ffff313235d9517c78a545ddc36b6e93.
Separate Vercel project: dreamscapes-novelideas / prj_uDp3rgzYWVvnP82Lv8dD2HFVTQNv.
Team: kennythecoder22s-projects / team_qwZFQgAcD4WFkLZmhTMjxnbX.
Deployment: dpl_By7RxQShyjTe3DVfg5NuKJ64MieQ (READY).
Stable URL: https://dreamscapes-novelideas.vercel.app
Carousel: https://dreamscapes-novelideas.vercel.app/experiments/carnival/index.html?scene=rides-games
Immutable deployment URL: https://dreamscapes-novelideas-iq2q0m9r9-kennythecoder22s-projects.vercel.app

All seven connected scenes passed browser checks locally and remotely. All 20 mounts loaded with zero lost WebGL contexts, page errors or failed asset requests. All 91 remote runtime files matched original checkpoint SHA256 values. No visual/runtime changes were made during promotion.

## Remaining custom-domain step
Vercel has attached and verified ownership of dreamscapes.novelideas.app on the new project. Authoritative DNS is GoDaddy (ns07.domaincontrol.com and ns08.domaincontrol.com), not Vercel DNS. Add exactly one record in the existing novelideas.app DNS zone:
- Type: CNAME
- Name/Host: dreamscapes
- Value/Target: ef27401e8a23338e.vercel-dns-016.com
- TTL: default
Do not change @, www, MX, TXT, or nameservers. Vercel reported no conflicting record. After propagation run:
```
vercel domains verify dreamscapes.novelideas.app --project dreamscapes-novelideas --scope team_qwZFQgAcD4WFkLZmhTMjxnbX
```
HTTPS on the custom hostname is pending DNS; the vercel.app URL works now.

## Resume from another machine
```
git clone --single-branch --branch codex/dreamscapes-independent https://github.com/KennytheCoder22/novel-ideas2.0.git Dreamscapes
cd Dreamscapes
node apps/dreamscapes/build.mjs
python -m http.server 4200 --bind 127.0.0.1 --directory apps/dreamscapes/dist
```
Node 20+ and Python 3.9+ suffice; no npm install or credentials needed for local preview. Browser runtime needs no network services beyond static assets. Live app observations are local to each browser, as before.

## Future releases
The Dreamscapes project intentionally has no automatic Git connection. Pushes preserve work remotely; they do not auto-release. Keep rootDirectory apps/dreamscapes, build node build.mjs, output dist. Create releases explicitly using the dedicated project ID, never the NovelIdeas project. The existing NovelIdeas project's deployment for this branch is disabled in this branch's root vercel.json. That file is not merged into main.
Example Vercel deployment API request (save as JSON; replace ref with reviewed commit):
```
{"name":"dreamscapes-novelideas","project":"prj_uDp3rgzYWVvnP82Lv8dD2HFVTQNv","target":"production","gitSource":{"type":"github","repoId":"1201541310","ref":"REVIEWED_COMMIT_SHA"}}
```
Run only when a release is authorized:
```
vercel api "/v13/deployments?teamId=team_qwZFQgAcD4WFkLZmhTMjxnbX" --method POST --input release.json
```

NovelIdeas production remains on main with deployment dpl_HP2bb8xcXvENbygBUpfWBQaao6CE. Its original domain assignments remain novelideas.app -> www.novelideas.app, and www.novelideas.app -> the existing novel-ideas2-0 project. No production settings or records were mutated.
