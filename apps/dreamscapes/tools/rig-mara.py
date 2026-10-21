"""Build Mara weights along the supplied mesh surface, not bounding-box masks."""
from pathlib import Path
import struct,json,math,heapq,collections
root=Path(__file__).resolve().parents[1]/'public/experiments/carnival/mara'
b=(root/'mara.glb').read_bytes();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);blob=b[n+28:]
def accessor(i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];return a,v.get('byteOffset',0)+a.get('byteOffset',0)
p=g['meshes'][0]['primitives'][0];a,off=accessor(p['attributes']['POSITION']);positions=[struct.unpack_from('<fff',blob,off+i*12)for i in range(a['count'])];positions=[(math.cos(.52)*x-math.sin(.52)*z,y,math.sin(.52)*x+math.cos(.52)*z)for x,y,z in positions]
weld={};vertices=[];ids=[]
for v in positions:
 key=tuple(round(c,5)for c in v)
 if key not in weld:weld[key]=len(vertices);vertices.append(v)
 ids.append(weld[key])
a,off=accessor(p['indices']);fmt={5123:'H',5125:'I'}[a['componentType']];ix=struct.unpack_from('<'+fmt*a['count'],blob,off);adj=[{}for _ in vertices]
for i in range(0,len(ix),3):
 tri=[ids[q]for q in ix[i:i+3]]
 for v,w in [(tri[0],tri[1]),(tri[1],tri[2]),(tri[2],tri[0])]:
  cost=math.dist(vertices[v],vertices[w]);adj[v][w]=cost;adj[w][v]=cost
seeds={0:[(0,-.13,0)],1:[(-.04,-.12,-.3),(.1,-.15,-.4)],2:[(0,-.12,.17),(-.15,-.08,.1)],3:[(0,.03,.28)],4:[(0,.22,.45),(-.16,.16,.62),(.18,.14,.5),(.15,.43,.44),(-.25,.17,.46)],5:[(-.4,.01,-.25),(-.65,.04,-.23)],6:[(-.462,.104,-.459),(-.7,.1,-.45)],7:[(.492,-.319,.645),(.55,-.2,.55),(.35,-.1,.52)],8:[(.142,-.208,.563)]}
legs=[(-.103,.397,.30),(.271,.464,.32),(-.259,-.387,-.27),(.206,-.506,-.34)]
for i,(x,z,hipz)in enumerate(legs):
 j=9+i*3;seeds[j]=[(x,-.21,hipz)];seeds[j+1]=[(x,-.41,(hipz+z)/2)];seeds[j+2]=[(x,-.55,z)]
all_d=[]
for bone in range(21):
 distance=[float('inf')]*len(vertices);queue=[]
 for point in seeds[bone]:
  best=min(range(len(vertices)),key=lambda i:math.dist(vertices[i],point));distance[best]=0;heapq.heappush(queue,(0,best))
 while queue:
  cost,v=heapq.heappop(queue)
  if cost!=distance[v]:continue
  for w,length in adj[v].items():
   new=cost+length
   if new<distance[w]:distance[w]=new;heapq.heappush(queue,(new,w))
 all_d.append(distance)
weights=[];indices=[];counts=collections.Counter()
for v in ids:
 ordered=sorted((all_d[i][v],i)for i in range(21));nearest=ordered[0][0];chosen=ordered[:4];ww=[math.exp(-((d-nearest)/.075)**2)for d,i in chosen];total=sum(ww)
 indices.extend(i for d,i in chosen);weights.extend(w/total for w in ww);counts[chosen[0][1]]+=1
raw=struct.pack('<III',0x4d415241,len(ids),21)+struct.pack('<'+'H'*len(indices),*indices)+struct.pack('<'+'f'*len(weights),*weights)
(root/'mara-skin.bin').write_bytes(raw)
print(json.dumps({'vertices':len(ids),'weldedSurfaceVertices':len(vertices),'bytes':len(raw),'dominantVertexCounts':dict(counts)}))
