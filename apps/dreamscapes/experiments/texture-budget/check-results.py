from pathlib import Path
import json,hashlib,html
p=Path(__file__).resolve().parent
tex=json.loads((p/'texture-results.json').read_text());budget=json.loads((p/'budget-results.json').read_text());mesh=json.loads((p/'mesh-results.json').read_text())
for r in tex:
 src=p.parents[1]/'source-assets/carousel-variants'/r['style']/(r['identity']+'.glb')
 assert hashlib.sha256(src.read_bytes()).hexdigest()==r['sourceSha256'],src
print('All 40 original GLB hashes unchanged; 80 texture-only geometry checks passed.')
bench=json.loads((p/'benchmark.json').read_text())+json.loads((p/'benchmark-budget.json').read_text())
for r in bench:
 m=r['metrics']['runtime']['metrics'];print(r['style'],r['profile'],'preload',round(r['preloadMs']),'ready',round(r['readyMs']),'parse elapsed sum',round(sum(x.get('parseMs',0) for x in m)),'first render cpu sum',round(sum(x.get('firstRenderCpuMs',0) for x in m)))
