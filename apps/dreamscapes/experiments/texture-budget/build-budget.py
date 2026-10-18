from pathlib import Path
import shutil,json
from recompress import recompress,OUT,SOURCE
report=[]
for style in ['plain','stuffed']:
 for src in sorted((SOURCE/style).glob('*.glb')):
  dst=OUT/'copies/budget'/style/src.name;dst.parent.mkdir(parents=True,exist_ok=True)
  if src.stem in ['polar-bear','zebra','rocket']:
   res=1024 if src.stem!='rocket' else 2048
   d=recompress(OUT/'mesh-copies'/style/src.name,dst,75,res);d['originalBytes']=src.stat().st_size
  else:
   shutil.copyfile(OUT/'copies/jpeg75'/style/src.name,dst);d={'bytes':dst.stat().st_size,'originalBytes':src.stat().st_size,'geometryUnchanged':True,'quality':75,'maxResolution':2048}
  report.append({'style':style,'identity':src.stem,**d})
(OUT/'budget-results.json').write_text(json.dumps(report,indent=2)+'\n')
for style in ['plain','stuffed']:print(style,sum(r['bytes'] for r in report if r['style']==style))
