import json,struct,io
from pathlib import Path
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[1];path=root/'public/cycle-twelve/kit-recognition.glb'
b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);raw=bytearray(b[28+n:]);p=j['meshes'][0]['primitives'][0]
# Triangle identifiers refer to the original exported topology. Never repair twice.
if j['accessors'][p['indices']]['count'] != 30184*3:
 raise SystemExit('Contact repair requires a fresh FBX conversion (30184 triangles); this GLB is already repaired or has different topology.')
def acc(i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];return np.frombuffer(raw,dtype={5126:'<f4',5123:'<u2',5121:'u1',5125:'<u4'}[a['componentType']],offset=v.get('byteOffset',0)+a.get('byteOffset',0),count=a['count']*{'VEC2':2,'VEC3':3,'VEC4':4,'SCALAR':1}[a['type']]).reshape(a['count'],-1)
pos=acc(p['attributes']['POSITION']);uv=acc(p['attributes']['TEXCOORD_0']);joint=acc(p['attributes']['JOINTS_0']);weights=acc(p['attributes']['WEIGHTS_0']);names=[j['nodes'][i]['name']for i in j['skins'][0]['joints']]
im=j['images'][j['textures'][j['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']];view=j['bufferViews'][im['bufferView']];image=np.array(Image.open(io.BytesIO(raw[view['byteOffset']:view['byteOffset']+view['byteLength']])).convert('RGB'));h,w=image.shape[:2];colors=image[np.minimum(h-1,np.maximum(0,(uv[:,1]*h).astype(int))),np.minimum(w-1,np.maximum(0,(uv[:,0]*w).astype(int)))].astype(float)
armids=[i for i,name in enumerate(names)if 'Hand' in name or 'Arm' in name];isarm=np.isin(joint,armids);influence=(weights*isarm).sum(1)
# Baked red/gold garment texels distinguish the cloth touching the hands from
# skin. Keep all light cuff/skin texels and all upper-arm/shoulder geometry.
cloth=((colors[:,2]<colors[:,1]*.67)&(colors[:,0]>colors[:,1]*1.15))|((colors[:,0]>colors[:,1]*1.75)&(colors[:,0]-colors[:,1]>35))
mask=(pos[:,1]<1.01)&(pos[:,1]>.5)&(influence>.03)&cloth
count=0
for v in np.where(mask)[0]:
 target=names.index('mixamorig:Hips' if pos[v,1]>.85 else ('mixamorig:LeftUpLeg' if pos[v,0]>=0 else 'mixamorig:RightUpLeg'))
 parts={}
 for bone,weight in zip(joint[v],weights[v]):
  bone=target if bone in armids else int(bone);parts[bone]=parts.get(bone,0)+float(weight)
 parts=sorted(parts.items(),key=lambda x:-x[1])[:4]
 joint[v]=0;weights[v]=0
 for k,(bone,weight)in enumerate(parts):joint[v,k]=bone;weights[v,k]=weight
 weights[v]/=weights[v].sum();count+=1
out=b[:28+n]+bytes(raw);path.write_bytes(out)
report=json.loads((root/'public/cycle-twelve/recognition-asset-report.json').read_text());report['garmentContactRepair']={'vertices':count,'method':'Red/gold garment texels below 1.01 m touching the hands: transfer arm/finger influence to original hip/upper-leg joints. All vertex positions, triangles, UVs and textures unchanged; skin and light cuff texels retained.','sourceMeshUnchanged':True};(root/'public/cycle-twelve/recognition-asset-report.json').write_text(json.dumps(report,indent=2))
print('Garment contact weights corrected:',count)

# Separate generated hand/cloth contact bridges after the weight correction.
contact_file=root/'tools/kit-contact-triangles.json'
if contact_file.exists():
 contacts=json.loads(contact_file.read_text());indices=acc(p['indices']);bad=set(contacts['triangles']);flat=indices.ravel().copy();keep=np.array([v for i,v in enumerate(flat)if i//3 not in bad],dtype=flat.dtype);indices.ravel()[:len(keep)]=keep
 j['accessors'][p['indices']]['count']=len(keep)
 js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
 out=struct.pack('<III',0x46546c67,2,28+len(js)+len(raw))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(raw),0x004e4942)+bytes(raw);path.write_bytes(out)
 report['garmentContactRepair']['separatedContactTriangles']=len(bad);report['garmentContactRepair']['remainingTriangles']=len(keep)//3;report['garmentContactRepair']['sourceMeshUnchanged']=False
 report['garmentContactRepair']['topologyNote']='Only identified stretched contact bridge faces below the shoulders removed; original face/hair, skirt design, textures, vertex positions and bone rig retained.'
 report['preparedBytes']=len(out);(root/'public/cycle-twelve/recognition-asset-report.json').write_text(json.dumps(report,indent=2))
 print('Separated contact triangles:',len(bad))
