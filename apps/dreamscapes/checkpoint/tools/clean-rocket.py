from pathlib import Path
import struct,json,copy,hashlib
import numpy as np
import argparse
root=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser(description='Reproduce selective Rocket pole cleanup; numpy required only for this optional tool.')
parser.add_argument('--source',type=Path,default=root/'source-assets/rocket-original.glb')
parser.add_argument('--output',type=Path,default=root/'source-assets/rocket-cleaned-candidate.glb')
args=parser.parse_args()
source=args.source.read_bytes();length=struct.unpack_from('<I',source,12)[0];doc=json.loads(source[20:20+length]);binary=source[28+length:];primitive=doc['meshes'][0]['primitives'][0]
def accessor(i):
 a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];components={'VEC3':3,'VEC2':2,'SCALAR':1}[a['type']];dtype={5126:'<f4',5125:'<u4'}[a['componentType']]
 return np.frombuffer(binary,dtype=dtype,offset=v.get('byteOffset',0)+a.get('byteOffset',0),count=a['count']*components).reshape(-1,components).copy()
pos=accessor(primitive['attributes']['POSITION']);uv=accessor(primitive['attributes']['TEXCOORD_0']);normal=accessor(primitive['attributes']['NORMAL']);indices=accessor(primitive['indices']).reshape(-1,3)
positions=list(pos);uvs=list(uv);normals=list(normal);kept=[];removed=0;modified=0
def clip(tri,level,keep_below):
 vertices=[(pos[i],uv[i],normal[i],int(i)) for i in tri];out=[]
 for j,current in enumerate(vertices):
  previous=vertices[j-1];inside=lambda v: v[0][1]<=level if keep_below else v[0][1]>=level
  a,b=inside(previous),inside(current)
  if a!=b:
   t=(level-previous[0][1])/(current[0][1]-previous[0][1]);p=previous[0]+t*(current[0]-previous[0]);p[1]=level;n=previous[2]+t*(current[2]-previous[2]);n/=max(np.linalg.norm(n),1e-12);tex=previous[1]+t*(current[1]-previous[1]);index=len(positions);positions.append(p);uvs.append(tex);normals.append(n);out.append(index)
  if b:out.append(current[3])
 return [(out[0],out[j],out[j+1]) for j in range(1,len(out)-1)]
for tri in indices:
 p=pos[tri];radius=np.hypot(p[:,0]-.01,p[:,2]);upper=np.all(radius<.075) and np.any(p[:,1]>.242);lower=np.all(radius<.115) and np.any(p[:,1]<-.115)
 if upper:
  result=clip(tri,.242,True)
 elif lower:
  result=clip(tri,-.115,False)
 else:
  kept.append(tuple(tri));continue
 if not result:removed+=1
 else:modified+=1;kept.extend(result)
# Keep all original vertex values and UVs; only boundary triangles get interpolated vertices.
outdoc=copy.deepcopy(doc);outbin=bytearray();outdoc['bufferViews']=[]
def add_view(data,target=None):
 while len(outbin)%4:outbin.append(0)
 view={'buffer':0,'byteOffset':len(outbin),'byteLength':len(data)}
 if target:view['target']=target
 outdoc['bufferViews'].append(view);outbin.extend(data);return len(outdoc['bufferViews'])-1
arrays={'POSITION':np.asarray(positions,dtype='<f4'),'TEXCOORD_0':np.asarray(uvs,dtype='<f4'),'NORMAL':np.asarray(normals,dtype='<f4')}
attributes_preserved=bool(np.array_equal(arrays['POSITION'][:len(pos)],pos) and np.array_equal(arrays['TEXCOORD_0'][:len(uv)],uv) and np.array_equal(arrays['NORMAL'][:len(normal)],normal))
used=np.unique(np.asarray(kept).ravel());mapping=np.full(len(positions),-1,dtype=np.int64);mapping[used]=np.arange(len(used));kept=mapping[np.asarray(kept)];arrays={name:data[used] for name,data in arrays.items()}
for name,data in arrays.items():
 i=primitive['attributes'][name];a=outdoc['accessors'][i];a.update({'bufferView':add_view(data.tobytes(),34962),'byteOffset':0,'count':len(data)});a.pop('min',None);a.pop('max',None)
 if name=='POSITION':a['min']=data.min(axis=0).tolist();a['max']=data.max(axis=0).tolist()
idx=np.asarray(kept,dtype='<u4');outdoc['accessors'][primitive['indices']].update({'bufferView':add_view(idx.tobytes(),34963),'byteOffset':0,'count':idx.size})
for i,image in enumerate(doc['images']):
 view=doc['bufferViews'][image['bufferView']];data=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']];outdoc['images'][i]['bufferView']=add_view(data)
outdoc['buffers']=[{'byteLength':len(outbin)}]
while len(outbin)%4:outbin.append(0)
header=json.dumps(outdoc,separators=(',',':')).encode();header+=b' '*((-len(header))%4);total=12+8+len(header)+8+len(outbin)
result=struct.pack('<III',0x46546c67,2,total)+struct.pack('<II',len(header),0x4e4f534a)+header+struct.pack('<II',len(outbin),0x004e4942)+outbin
target=args.output;target.write_bytes(result)
report={'sourceTriangles':len(indices),'removedPoleTriangles':removed,'modifiedSocketBoundaryTriangles':modified,'resultTriangles':len(kept),'originalVertexAttributesPreserved':attributes_preserved,'unreferencedPoleVerticesRemoved':len(positions)-len(used),'materialDefinitionsPreserved':outdoc['materials']==doc['materials'],'textureBytesPreserved':True,'cutPlanes':{'upper':.242,'lower':-.115},'sourceSha256':hashlib.sha256(source).hexdigest(),'cleanedSha256':hashlib.sha256(result).hexdigest()}
target.with_suffix('.report.json').write_text(json.dumps(report,indent=2));print(report)
