from pathlib import Path
import json
import hashlib
import shutil

app=Path(__file__).resolve().parent.parent
proof=app/'verification/cycle-four'
destination=app/'playtest-artifacts/cycle-four/recordings'
destination.mkdir(parents=True,exist_ok=True)
results=json.loads((proof/'prototype/results.json').read_text(encoding='utf-8'))
clips=[]
for row in results:
    if not row.get('recorded'): continue
    assert row['passed']
    source=app/row['video']
    device='phone' if row['viewport']['width']<600 else 'desktop'
    name='zora-'+device
    target=destination/(name+'.webm')
    shutil.copyfile(source,target)
    assert hashlib.sha256(source.read_bytes()).digest()==hashlib.sha256(target.read_bytes()).digest()
    clips.append({'name':name,'device':device,'viewport':row['viewport'],'source':row['video'],'file':'recordings/'+name+'.webm','ordinarySpeed':True,'method':'Byte-identical copy of the complete native browser recording. No trimming, frame sampling or retiming.','scope':'Automated prototype walkthrough, not human preference evidence.'})
    page='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+name+'</title><style>body{margin:0;background:#101724;color:#eadfc8;font:16px system-ui}header{height:44px;display:flex;justify-content:center;align-items:center;gap:20px}a{color:#f0c994}video{width:100%;height:calc(100dvh - 44px);object-fit:contain}</style><header>'+name+' <a href="/review/">Research report</a></header><video controls playsinline preload="metadata" src="/review/artifacts/recordings/'+name+'.webm"></video></html>'
    (proof/('ride-'+name+'.html')).write_text(page,encoding='utf-8',newline='\n')
assert len(clips)==2
(proof/'clips.json').write_text(json.dumps(clips,indent=2),encoding='utf-8')
print('Prepared two full ordinary-speed prototype movies without retiming.')
