from pathlib import Path
import json,struct,io,hashlib
from PIL import Image
root=Path('apps/dreamscapes/public/experiments/carnival/carousel');out=[]
for style in ['ornate','plain','stuffed']:
 for identity in ['horse','rocket','griffin','ostrich','rabbit','wolf','polar-bear','fox','brown-horse','elephant','tiger','stag','grizzly','unicorn','cat','zebra','flamingo','dragon','moon-loveseat','snail']:
  path=root/(('horse-comparison' if identity=='horse' else identity)+'.glb') if style=='ornate' else root/'variants'/style/(identity+'.glb')
  b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);binstart=28+n
  tris=vertices=0;attrs=set();prims=[]
  for mesh in j.get('meshes',[]):
   for p in mesh['primitives']:
    a=j['accessors'][p['attributes']['POSITION']];vertices+=a['count'];count=j['accessors'][p['indices']]['count'] if 'indices' in p else a['count'];mode=p.get('mode',4);tris+=count//3 if mode==4 else max(0,count-2) if mode in [5,6] else 0;attrs.update(p['attributes']);prims.append(p)
  images=[]
  for idx,img in enumerate(j.get('images',[])):
   v=j['bufferViews'][img['bufferView']];start=binstart+v.get('byteOffset',0);payload=b[start:start+v['byteLength']];im=Image.open(io.BytesIO(payload));roles=[]
   for m in j.get('materials',[]):
    for name,part in [('baseColor',m.get('pbrMetallicRoughness',{}).get('baseColorTexture')),('metallicRoughness',m.get('pbrMetallicRoughness',{}).get('metallicRoughnessTexture')),('normal',m.get('normalTexture')),('occlusion',m.get('occlusionTexture')),('emissive',m.get('emissiveTexture'))]:
     if part is not None and j['textures'][part['index']].get('source')==idx:roles.append(name)
   q=[value for table in getattr(im,'quantization',{}).values() for value in table]
   images.append({'jpegQuantizationRange':[min(q),max(q)] if q else None,'width':im.width,'height':im.height,'bytes':len(payload),'format':im.format,'roles':sorted(set(roles)),'metadataBytes':sum(len(x) for x in im.info.values() if isinstance(x,(bytes,str))),'sha256':hashlib.sha256(payload).hexdigest()})
  out.append({'identity':identity,'style':style,'bytes':len(b),'triangles':tris,'vertices':vertices,'primitives':len(prims),'attributes':sorted(attrs),'images':images,'textureBytes':sum(x['bytes'] for x in images),'nonTextureBytes':len(b)-sum(x['bytes'] for x in images),'skins':len(j.get('skins',[])),'animations':len(j.get('animations',[])),'extensions':j.get('extensionsUsed',[]),'sha256':hashlib.sha256(b).hexdigest()})
Path('apps/dreamscapes/verification/mount-budget-audit.json').write_text(json.dumps(out,indent=2)+'\n')
for identity in [x['identity'] for x in out if x['style']=='ornate']:
 rows=[next(x for x in out if x['identity']==identity and x['style']==s) for s in ['ornate','plain','stuffed']]
 print(identity,[(x['triangles'],round(x['bytes']/1e6,2),[(i['width'],i['roles'],i['metadataBytes']) for i in x['images']]) for x in rows])
