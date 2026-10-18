from pathlib import Path
from PIL import Image,ImageDraw
import json
p=Path(__file__).resolve().parent
ids=['horse','rocket','griffin','ostrich','rabbit','wolf','polar-bear','fox','brown-horse','elephant','tiger','stag','grizzly','unicorn','cat','zebra','flamingo','dragon','moon-loveseat','snail']
for stage in ['before','after']:
 for style in ['plain','stuffed','ornate']:
  for g in range(5):
   group=ids[g*4:g*4+4];out=Image.new('RGB',(1280,1080),'#606060');d=ImageDraw.Draw(out)
   for row,id in enumerate(group):
    for col,angle in enumerate([2,4,6,12]):
     f=p/stage/style/f'{id}-{angle}.png'
     if not f.exists():continue
     im=Image.open(f);im.thumbnail((316,240));x=col*320;y=row*270;out.paste(im,(x+(320-im.width)//2,y+25),im);d.text((x+6,y+5),f'{id} / {style} / {angle*22.5} deg',fill='white')
   out.save(p/f'{stage}-{style}-{g}.jpg',quality=90)
