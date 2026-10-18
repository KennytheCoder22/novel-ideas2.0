from pathlib import Path
import json,html
p=Path(__file__).resolve().parent
tex=json.loads((p/'texture-results.json').read_text());budget=json.loads((p/'budget-results.json').read_text());mesh=json.loads((p/'mesh-results.json').read_text())
rows=[]
for identity in sorted({r['identity'] for r in budget}):
 cells=[identity]
 for style in ['plain','stuffed']:
  b=next(r for r in budget if r['style']==style and r['identity']==identity)
  ts=[next(r for r in tex if r['style']==style and r['identity']==identity and r['profile']==profile) for profile in ['jpeg85','jpeg75']]
  cells += [f'{b["originalBytes"]/1e6:.2f}',f'{ts[0]["bytes"]/1e6:.2f}',f'{ts[1]["bytes"]/1e6:.2f}',f'{b["bytes"]/1e6:.2f}']
 rows.append('<tr>'+''.join('<td>'+c+'</td>' for c in cells)+'</tr>')
bench=json.loads((p/'benchmark.json').read_text())+json.loads((p/'benchmark-budget.json').read_text())
def timing_table(data,motion=False):
 out='<table><tr><th>Style</th><th>Trial</th><th>Preload s</th><th>Carousel ready s</th><th>Sum parse elapsed s*</th><th>Sum first render CPU s*</th>'+('<th>Observed FPS*</th>' if motion else '')+'</tr>'
 for r in data:
  m=(r['runtime'] if motion else r['metrics']['runtime'])['metrics'];vals=[r['style'],r['profile'],f'{r["preloadMs"]/1000:.2f}',f'{r["readyMs"]/1000:.2f}',f'{sum(x.get("parseMs",0) for x in m)/1000:.2f}',f'{sum(x.get("firstRenderCpuMs",0) for x in m)/1000:.2f}']
  if motion:vals.append(f'{1000/r["meanFrameMs"]:.1f}')
  out+='<tr>'+''.join('<td>'+x+'</td>' for x in vals)+'</tr>'
 return out+'</table>'
s='''<!doctype html><meta charset="utf-8"><title>Carousel texture experiment</title><style>body{font:16px/1.5 system-ui;max-width:1250px;margin:40px auto;padding:0 24px;color:#19212b}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #bbb;padding:7px;text-align:right}td:first-child,th:first-child{text-align:left}img{max-width:100%}code,pre{background:#eee;padding:4px}h2{margin-top:36px}</style>
<h1>Plain / Stuffed non-destructive texture experiment</h1><p>17 October 2026. Original assets, production mappings, Carousel transforms, crops, 80% render resolution, materials and runtime remain unchanged. No deployment or adoption.</p>
<h2>Smallest acceptable settings tested</h2><p>JPEG quality 75, 4:4:4 chroma, optimized encoding. Keep 2K textures and existing geometry for the 16 ordinary mounts plus Horse. Horse remains approximately 77k triangles; no 22k reduction was tested. Polar Bear and Zebra use 1K textures and approximately 75k triangles. Rocket uses 2K textures and 67,999 triangles. Q85 and Q75 texture-only alternatives are retained.</p>
<p>Normal-distance comparisons at 1920×1080, DPR 1, unchanged scene framing show no obvious meaningful loss in fur, stripes, saddle edges, antlers or silhouettes. Eight phase captures were generated per trial; cardinal phases were reviewed side by side at native screen pixel size. This is an assessment at the current Carousel distance, not a guarantee for close zoom, all displays, or a claim that Q75 is the theoretical minimum. Only Polar Bear/Zebra were downsampled.</p>
<table><tr><th>Set</th><th>Original MB</th><th>Q85 / 2K MB</th><th>Q75 / 2K MB</th><th>Budget candidate MB</th><th>Savings</th></tr>'''
for style in ['plain','stuffed']:
 bs=[r for r in budget if r['style']==style];old=sum(r['originalBytes'] for r in bs);new=sum(r['bytes'] for r in bs);qs=[sum(r['bytes'] for r in tex if r['style']==style and r['profile']==q) for q in ['jpeg85','jpeg75']]
 s+=f'<tr><td>{style}</td><td>{old/1e6:.2f}</td><td>{qs[0]/1e6:.2f}</td><td>{qs[1]/1e6:.2f}</td><td>{new/1e6:.2f}</td><td>{(old-new)/1e6:.2f} MB / {(1-new/old)*100:.1f}%</td></tr>'
s+='''</table><p>Combined: 316.14 MB → 181.84 MB; 134.31 MB (42.5%) saved. Texture-only Q75 already saves 130.69 MB (41.3%); targeted mesh/1K trials add only 3.61 MB savings. All sizes are decimal MB. Recompression alone does not reduce decoded texture/GPU memory. The two 2K→1K textures per set reduce estimated RGBA8+mipmap storage by about 32 MiB per set; this is an estimate, not measured GPU allocation.</p>
<h2>Per-model GLB sizes (MB)</h2><table><tr><th>Mount</th><th>Plain original</th><th>Plain Q85</th><th>Plain Q75</th><th>Plain budget</th><th>Stuffed original</th><th>Stuffed Q85</th><th>Stuffed Q75</th><th>Stuffed budget</th></tr>'''+''.join(rows)+'</table><h2>Targeted triangle counts</h2><table><tr><th>Style</th><th>Mount</th><th>Before</th><th>After</th></tr>'
for r in mesh:s+=f'<tr><td>{r["style"]}</td><td>{r["name"]}</td><td>{r["before"]:,}</td><td>{r["after"]:,}</td></tr>'
s+='''</table><p>All non-image buffer bytes are identical in the 80 texture-only copies. The 34 unchanged-geometry budget copies inherit that guarantee. The six intentionally simplified copies retain exact computed mounting scale/yaw/offset (maximum registration delta 0). SHA-256 checks confirm all 40 original variant files remain unchanged.</p>
<h2>Loading measurements</h2><p>Fresh browser contexts, local loopback server, existing four concurrent preload downloads and three concurrent preparation jobs. Portal preload completed before entering the Carousel. Carousel-ready time is measured from Carousel navigation through first render of all 20 mounts, not from age selection. No wrong-style placeholders, missing mounts or page exceptions were recorded.</p>
<h3>Controlled still-scene capture runs</h3>'''+timing_table(bench)
motion=p/'motion-benchmark.json'
if motion.exists():s+='<h3>Normal rotating Carousel</h3>'+timing_table(json.loads(motion.read_text()),True)
s+='''<p>*Parse times include asynchronous image decoding and scheduling; jobs overlap, so their sum is not CPU time or total wall time. First-render CPU measures submission/initialization and is not isolated GPU duration. Headless local FPS and single-run timings are noisy and not production/network benchmarks. Smaller bytes are a repeatable result; these runs do not establish a consistent parse/render speedup or animation improvement. No isolated GPU timer was collected.</p>
<h2>Visual comparisons</h2><p>Original left; budget candidate right. Crops preserve native display pixels, with no model zoom.</p>'''
for style,phase in [('plain',2),('plain',6),('stuffed',2),('stuffed',6)]:s+=f'<h3>{style}, {phase*45}°</h3><img src="visual-review/{style}-budget-{phase}.png">'
s+='''<h2>Local previews</h2><p><a href="http://127.0.0.1:4211/experiments/carnival/index.html?scene=rides-games&amp;textureTrial=budget&amp;age=teens">Plain budget</a> · <a href="http://127.0.0.1:4211/experiments/carnival/index.html?scene=rides-games&amp;textureTrial=budget&amp;age=kids">Stuffed budget</a>. Change textureTrial to original, jpeg85, or jpeg75 for other retained trials. Working preview on 4204 remains unchanged.</p>
<h2>Reproduce</h2><p>From this experiment directory, with Python/Pillow and Node installed:</p><pre>python -m pip install -r requirements.txt
npm install --prefix tools
python recompress.py
node simplify.mjs
python build-budget.py
node verify-registration.mjs
python serve.py --port 4211</pre><p>For browser measurements, install Playwright separately or set PLAYWRIGHT_MODULE to its installed module path. BROWSER_EXE can select Edge/Chrome. Run compare.cjs (original/Q85/Q75), then with TRIAL_PROFILES=budget run compare.cjs again; run measure-motion.cjs for normal animation. Run make-review.py and make-report.py to regenerate outputs. check-results.py verifies originals.</p>
<p>Generated copies, intermediate meshes and screenshots are local experiment outputs, reproducible from the tracked source GLBs. Nothing under this experiment directory is included by the Dreamscapes public-only build. No production replacement has been made.</p>'''
(p/'report.html').write_text(s,encoding='utf-8')
