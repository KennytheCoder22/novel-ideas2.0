import struct,json,io,hashlib,sys
from pathlib import Path
from PIL import Image
import numpy as np
if len(sys.argv) < 2: raise SystemExit('Usage: python tools/prepare-kit.py PATH_TO_SOURCE_GLB')
source=Path(sys.argv[1])
root=Path(__file__).resolve().parents[1]
b=source.read_bytes(); n=struct.unpack_from('<I',b,12)[0]; j=json.loads(b[20:20+n]); binary=b[28+n:]
def accessor(i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];typ={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']];k={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
 return np.frombuffer(binary,dtype=typ,count=a['count']*k,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,k)
p=j['meshes'][0]['primitives'][0];pos=accessor(p['attributes']['POSITION']);idx=accessor(p['indices']).ravel().reshape(-1,3)
# Weld UV seams for analysis only. No vertex data is changed.
_,weld=np.unique(np.round(pos,5),axis=0,return_inverse=True);parents=np.arange(weld.max()+1)
def find(a):
 while parents[a]!=a: parents[a]=parents[parents[a]];a=parents[a]
 return a
for tri in weld[idx]:
 a=find(tri[0])
 for v in tri[1:]: parents[find(v)]=a
roots=np.array([find(x) for x in weld]);components=[]
for r in np.unique(roots):
 ids=np.where(roots==r)[0]; pts=pos[ids]; components.append({'vertices':len(ids),'min':pts.min(0).tolist(),'max':pts.max(0).tolist()})
components.sort(key=lambda c:-c['vertices'])
images=[];replacements={}
for im in j['images']:
 v=j['bufferViews'][im['bufferView']]; raw=binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']];image=Image.open(io.BytesIO(raw));original=image.size;image.thumbnail((1024,1024),Image.Resampling.LANCZOS)
 out=io.BytesIO();image.convert('RGB').save(out,format='PNG',optimize=True);replacements[im['bufferView']]=out.getvalue();images.append({'name':im.get('name'),'original':original,'prepared':image.size,'bytes':len(out.getvalue())})
chunks=[];offset=0
for i,v in enumerate(j['bufferViews']):
 raw=replacements.get(i,binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]); v['byteOffset']=offset;v['byteLength']=len(raw); raw+=b'\0'*((-len(raw))%4);chunks.append(raw);offset+=len(raw)
j['buffers'][0]['byteLength']=offset;rawj=json.dumps(j,separators=(',',':')).encode();rawj+=b' '*((-len(rawj))%4);rawb=b''.join(chunks);out=struct.pack('<III',0x46546c67,2,12+8+len(rawj)+8+len(rawb))+struct.pack('<II',len(rawj),0x4e4f534a)+rawj+struct.pack('<II',len(rawb),0x004e4942)+rawb
folder=root/'public/cycle-twelve';folder.mkdir(exist_ok=True);(folder/'kit.glb').write_bytes(out)
report={'sourceSha256':hashlib.sha256(b).hexdigest(),'sourceBytes':len(b),'preparedBytes':len(out),'vertices':len(pos),'triangles':len(idx),'skeletonJoints':len(j['skins'][0]['joints']),'clips':[{'name':x['name'],'channels':len(x['channels']),'duration':max(j['accessors'][s['input']].get('max',[0])[0] for s in x['samplers'])} for x in j['animations']],'textures':images,'components':components,'geometryPolicy':'Original vertex positions, skin weights, triangles, skeleton and animation channels preserved. Sampled original walk poses showed no detached leg artifact; large gestures use the free right hand to avoid the bind mesh left-hand/skirt contact.'}
(folder/'asset-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
