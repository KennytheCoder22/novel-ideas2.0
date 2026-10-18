from PIL import Image,ImageDraw
from pathlib import Path
p=Path('apps/dreamscapes/verification/pole-audit')
for style in ['plain','stuffed','ornate']:
 paths=[p/'before'/style/f'ostrich-{i}.png' for i in range(16)]
 if not all(x.exists() for x in paths):continue
 out=Image.new('RGB',(1280,1280),'#606060');d=ImageDraw.Draw(out)
 for i,f in enumerate(paths):
  im=Image.open(f);im.thumbnail((320,290));x=i%4*320;y=i//4*320;out.paste(im,(x,y+25),im);d.text((x+5,y+5),f'{style} Ostrich {i*22.5} deg',fill='white')
 out.save(p/f'{style}-ostrich-before.jpg')
