from pathlib import Path
import json,struct,io,hashlib
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'source-assets/carousel-variants'
OUT=Path(__file__).resolve().parent

def read_glb(path):
 b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+n]),b[28+n:],hashlib.sha256(b).hexdigest()
def write_glb(path,j,binary):
 text=json.dumps(j,separators=(',',':')).encode();text+=b' '*((-len(text))%4);binary+=b'\0'*((-len(binary))%4)
 path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(text)+len(binary))+struct.pack('<II',len(text),0x4e4f534a)+text+struct.pack('<II',len(binary),0x004e4942)+binary)
def recompress(src,dest,quality,res=2048):
 j,b,h=read_glb(src);image_views={i['bufferView']:i for i in j['images']};parts=[];length=0;geometry_before=[];geometry_after=[]
 for idx,v in enumerate(j['bufferViews']):
  payload=b[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
  if idx in image_views:
   im=Image.open(io.BytesIO(payload)).convert('RGB');im.thumbnail((res,res),Image.Resampling.LANCZOS);out=io.BytesIO();im.save(out,format='JPEG',quality=quality,subsampling=0,optimize=True);payload=out.getvalue();image_views[idx]['mimeType']='image/jpeg'
  else:geometry_before.append(hashlib.sha256(payload).hexdigest())
  pad=(-length)%4;parts.append(b'\0'*pad);length+=pad;v['byteOffset']=length;v['byteLength']=len(payload);parts.append(payload);length+=len(payload)
  if idx not in image_views:geometry_after.append(hashlib.sha256(payload).hexdigest())
 assert geometry_before==geometry_after
 j['buffers'][0]['byteLength']=length;write_glb(dest,j,b''.join(parts))
 return {'sourceSha256':h,'sourceBytes':src.stat().st_size,'bytes':dest.stat().st_size,'quality':quality,'maxResolution':res,'geometryViewsUnchanged':True}
if __name__=='__main__':
 report=[]
 for profile,q in [('jpeg85',85),('jpeg75',75)]:
  for style in ['plain','stuffed']:
   for src in sorted((SOURCE/style).glob('*.glb')):
    d=recompress(src,OUT/'copies'/profile/style/src.name,q);report.append({'profile':profile,'style':style,'identity':src.stem,**d})
 (OUT/'texture-results.json').write_text(json.dumps(report,indent=2)+'\n')
 for profile in ['jpeg85','jpeg75']:
  for style in ['plain','stuffed']:print(profile,style,sum(r['bytes'] for r in report if r['profile']==profile and r['style']==style))
