from pathlib import Path
import json, hashlib, math, html

app=Path(__file__).resolve().parent.parent
out=app/'verification/cycle-six'
def read(name): return json.loads((out/name).read_text(encoding='utf-8-sig'))
def write(name,value): (out/name).write_text(json.dumps(value,indent=2),encoding='utf-8')
def stats(values):
    ordered=sorted(values)
    return dict(fps=len(values)*1000/sum(values),frames=len(values),p50=ordered[math.ceil(len(values)*.5)-1],p95=ordered[math.ceil(len(values)*.95)-1],p99=ordered[math.ceil(len(values)*.99)-1],over33=sum(x>33.34 for x in values),over50=sum(x>50 for x in values))
def stages(row):
    groups={}; returned=False
    for s in row['samples']:
        stage=s['stage']
        if stage!='outside': returned=True
        if stage=='outside': stage='outside-returned' if returned else 'outside-before'
        groups.setdefault(stage,[]).append(s['dt'])
    return {k:stats(v) for k,v in groups.items() if v}
base=read('baseline.json'); final=read('final.json')
comparison=[]
for b,a in zip(base,final):
    assert b['name']==a['name'] and b['passed'] and a['passed']
    assert b['canvas']==a['canvas']
    comparison.append(dict(name=b['name'],style=a['style'],before=stages(b),after=stages(a)))
write('comparison.json',comparison)
original=read('baseline-info.json')['publicHashes']; changed=[]
for name,digest in original.items():
    p=app/Path(name.replace('\\','/'))
    if hashlib.sha256(p.read_bytes()).hexdigest()!=digest: changed.append(name.replace('\\','/'))
expected=['animal-comparison.js','carousel-onboard.js','carousel.js','horse-comparison.js','index.html','shared-mount-renderer.js']
assert sorted(Path(x).name for x in changed)==sorted(expected), changed
write('preservation.json',dict(originalPublicFiles=len(original),changed=changed,unchanged=len(original)-len(changed),allArtworkModelsBackgroundsAndObservationSourcesUnchanged=True))
css='''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{background:#16131b;color:#eee;font:16px/1.55 system-ui;margin:24px auto;padding:0 18px;max-width:1200px}a{color:#eac17b}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:7px;border-bottom:1px solid #665;text-align:left}.scroll{overflow:auto}video{width:100%;max-height:70vh;background:black}.pair{display:grid;grid-template-columns:1fr 1fr;gap:15px}@media(max-width:650px){.pair{grid-template-columns:1fr}}select,button{font:inherit;padding:8px}h1,h2{line-height:1.2}small{color:#ccc}</style>'''
cases=[('adults-desktop','dragon'),('adults-phone','horse'),('teens-desktop','rocket'),('teens-phone','griffin'),('kids-desktop','elephant'),('kids-phone','snail')]
movies=[]
for name,mount in cases:
    pair=dict(name=name,mount=mount,clips=[])
    for variant in ['baseline','final']:
        file=out/f'{variant}-video-{mount}.json'
        if not file.exists(): continue
        rows=read(file.name)
        row=next(r for r in rows if r['name']==name)
        assert row['passed']
        path=Path(row['video']).resolve().relative_to((app/'playtest-artifacts/cycle-six').resolve()).as_posix()
        pair['clips'].append(dict(variant=variant,url='/review/artifacts/'+path,alignment=row.get('alignment')))
    if len(pair['clips'])!=2: continue
    movies.append(pair)
    content=css+f'<h1>{name}: {mount}</h1><p><a href="/review/">Performance report</a> · Native ordinary-speed recordings, both complete revolutions and return. No seeking or accelerated playback is needed.</p><button onclick="document.querySelectorAll(\'video\').forEach(v=>v.play())">Play both at normal speed</button><div class="pair">'
    for c in pair['clips']: content+=f'<section><h2>{c["variant"]}</h2><video controls preload="metadata" src="{c["url"]}"></video></section>'
    (out/f'compare-{name}.html').write_text(content+'</div>',encoding='utf-8')
write('recordings.json',movies)
body='''<h1>Dreamscapes · Cycle Six</h1><p>Rendering work was removed without reducing model detail, canvas resolution, artwork, effects or approved ride timing.</p><p><a href="/carnival/?scene=rides-games">Play the carousel</a> · <a href="/carnival/?scene=fortune-teller&cycle-zora=zora">Madame Zora</a> · <a href="release.json">Release receipt</a> · <a href="reproduce.txt">Reproduction</a></p><h2>Unrecorded before / after measurements</h2><p>Four age bands, all three styles, 1440×900 and 390×844 browser viewports, DPR 1. Edge on Intel HD Graphics 620 / ANGLE D3D11. Phone results are desktop browser emulation, not physical-device tests. Eight full rides per version; repeated representative controls are retained separately.</p><label>Ride stage <select id="stage"></select></label><div class="scroll"><table><thead><tr><th>Case / style</th><th>FPS before → after</th><th>Median ms</th><th>p95 ms</th><th>p99 ms</th><th>Frames &gt;50ms</th></tr></thead><tbody id="rows"></tbody></table></div><p>FPS is frames divided by elapsed sample time. Percentiles are animation-frame intervals, including long frames. Exterior samples are separated before boarding and after return. Measurements on one shared computer are indicative, not universal guarantees; cache and other host activity can affect comparisons.</p><h2>What changed</h2><p>The external carousel stops repainting only while the seated view is fully opaque. It refreshes synchronously before the first translucent return frame. Mount rendering reuses its shared GPU buffer instead of reallocating it for every differently sized mount, while keeping every original per-mount viewport and pixel dimension.</p><p>An initial version retained the large buffer during rides and repeatedly slowed boarding. That version was rejected. The final version keeps the original exact-size buffer during the opaque ride; boarding performance recovered. The intermediate and repeated measurements remain available in the raw evidence.</p><h2>Preservation and regressions</h2><p>249 exact image comparisons passed: 180 mount images across 20 mounts, three poses and three styles; nine full seated views; and 60 returned exterior mounts. Camera-to-seat relationships also pass. These frozen-pose checks complement the ordinary-speed recordings below.</p><p>58 unit/contract tests, seven observation cases, three selector/lifecycle cases, eight built-output Zora cases and 22 Carnival regression cases passed. Coverage includes Mara, three-ball Skee-Ball and its clown ending, mirrors, age bands, mechanical selection, interruptions, switching and duplicate protection.</p><p><a href="preservation.json">Public-file preservation audit</a> · <a href="buffer-parity.json">Mount parity</a> · <a href="onboard-parity.json">Ride and returned-view parity</a> · <a href="unit-tests.txt">Unit tests</a> · <a href="observations/results.json">Observations</a> · <a href="wheel-ready/results.json">Selector</a> · <a href="zora/results.json">Zora</a> · <a href="/review/artifacts/regression/report.html">Carnival regression report</a></p><h2>Limits and verified bottlenecks</h2><p>The exterior is still only about 8–10 FPS on this computer, despite improving from roughly 4–5 FPS. Long exterior frames remain. Desktop rides generally reach about 27–32 FPS and phone-sized emulation approaches 58–59 FPS in dream segments. This does not establish physical-phone or Safari performance.</p><p>Separate diagnostic traces show main-thread Paint time falling from about 2933ms to 62ms over a 12-second profile. GPU rendering remains about 26ms median and 30ms p95 in the sampled desktop ride. Profiling itself adds overhead; nested trace regions must not be summed. No verified attribution to specific mesh, shader or texture costs was established. A larger external-renderer redesign needs separate visual validation.</p><p>Existing model/texture loading already caches assets. No artwork compression, resolution reduction, animation simplification or speculative gameplay changes were applied. Capture overhead is excluded from the performance table.</p><h2>Ordinary-speed comparisons</h2><p>Each pair includes selection, boarding, both revolutions, dream transitions and return. Use native controls or play both together at 1×.</p><ul>'''
for p in movies: body+=f'<li><a href="compare-{p["name"]}.html">{p["name"]} · {p["mount"]}</a></li>'
body+='</ul><p><a href="baseline.json">Raw baseline</a> · <a href="final.json">Raw final</a> · <a href="comparison.json">Derived comparison</a> · <a href="runtime.json">Environment</a></p>'
body=body.replace('<h2>What changed</h2>','<h2>Cycle Five hypothesis, tested again</h2><p>The earlier route-injected experiment in tools/cycle-five-performance.cjs measured a 12-second desktop improvement from 26.0 to 32.2 FPS. It skipped SVG updates whenever a ride was active, without proving full boarding/return preservation. This cycle measured complete rides afresh, narrowed the skip to a fully opaque ride, and added synchronous restoration and all-style visual checks.</p><h2>What changed</h2>')
body=body.replace('<h2>Ordinary-speed comparisons</h2>','<p>Initial model/shader preparation and host contention can still produce long boarding stalls; one Stuffed recording showed a severe cold boarding stall. The recorded runs include capture and packaging activity and are not evidence of steady-state FPS. The final unrecorded matrix is the basis for the performance comparison.</p><h2>Ordinary-speed comparisons</h2><p>Movies begin at page load, so loading and selection durations differ between versions. They are not phase-synchronized. Use the frozen-pose image comparisons for exact alignment; watch the complete movies for motion, transitions and return behavior.</p>')
script='''<script>const data=DATA;const select=document.querySelector('#stage');const stages=[...new Set(data.flatMap(x=>Object.keys(x.after)))];select.innerHTML=stages.map(x=>`<option>${x}</option>`).join('');function draw(){document.querySelector('#rows').innerHTML=data.map(x=>{const a=x.before[select.value],b=x.after[select.value];if(!a||!b)return '';return `<tr><td>${x.name} / ${x.style}</td>${['fps','p50','p95','p99','over50'].map(k=>`<td>${a[k].toFixed(1)} → ${b[k].toFixed(1)}</td>`).join('')}</tr>`}).join('')}select.onchange=draw;draw()</script>'''.replace('DATA',json.dumps(comparison))
(out/'index.html').write_text(css+body+script,encoding='utf-8')
print(json.dumps(dict(measurements=len(comparison),recordingPairs=len(movies),preservedFiles=len(original)-len(changed))))
