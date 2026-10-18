from PIL import Image,ImageDraw
from pathlib import Path
import json
p=Path(__file__).resolve().parent
out=p/'visual-review';out.mkdir(exist_ok=True)
for style in ['plain','stuffed']:
 for trial in ['jpeg75','budget']:
  for phase in [0,2,4,6]:
   paths=[p/'review'/style/s/f'scene-{phase}.png' for s in ['original',trial]]
   if not all(f.exists() for f in paths):continue
   im=Image.new('RGB',(1600,830),'#202020');d=ImageDraw.Draw(im)
   for i,f in enumerate(paths):im.paste(Image.open(f).crop((0,0,800,800)),(800*i,30));d.text((800*i+12,8),f'{style} / {f.parent.name} / phase {phase*45} / native display pixels',fill='white')
   im.save(out/f'{style}-{trial}-{phase}.png')
