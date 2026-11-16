import bpy,numpy as np,json,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.geometry import barycentric_transform
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'model-cleanup/Zora_Trunk_Cleanup.blend'));bpy.context.scene.frame_set(1)
body=bpy.data.objects['Trunk_Body'];lid=bpy.data.objects['Trunk_Lid'];before=[tuple(v.co) for v in lid.data.vertices]
source=[bpy.data.images[n] for n in ['Image_0','Image_1']];arrays=[]
for im in source:
 a=np.empty(len(im.pixels),dtype=np.float32);im.pixels.foreach_get(a);arrays.append(a.reshape(im.size[1],im.size[0],4))
uvs=[]
for row in range(256):
 for col in range(512):
  x=((row+.5)/256-.5)*1.62;z=-.87+(col+.5)/512*.66
  # Leave the independently animated lock on the front of the chest only.
  if abs(x)<.20 and z>-.48:x=(-1 if x<0 else 1)*(.35+abs(x)*.5)
  hit,loc,normal,index=body.ray_cast(Vector((x,-2,z)),Vector((0,1,0)))
  if not hit:raise RuntimeError('Missing original decorative surface')
  f=body.data.polygons[index];ids=list(f.loop_indices)[:3];pts=[body.data.vertices[body.data.loops[i].vertex_index].co for i in ids];uv=[Vector((*body.data.uv_layers.active.data[i].uv,0)) for i in ids]
  p=barycentric_transform(loc,*pts,*uv);uvs.append((p.x,p.y))
u=np.asarray(uvs);x=np.clip((u[:,0]*2047).astype(int),0,2047);y=np.clip((u[:,1]*2047).astype(int),0,2047)
for channel,name in enumerate(['Lid_Atlas_Color','Lid_Atlas_MetalRough']):
 im=bpy.data.images[name];a=np.empty(len(im.pixels),dtype=np.float32);im.pixels.foreach_get(a);a=a.reshape(2048,1024,4)
 patch=arrays[channel][y,x].reshape(256,512,4).repeat(2,0).repeat(2,1);a[:512,:1024]=patch;im.pixels.foreach_set(a.ravel());im.update()
 im.filepath_raw=str(ROOT/'model-cleanup'/('ornate-lid-color.png' if channel==0 else 'ornate-lid-metalrough.png'));im.file_format='PNG';im.save();replacement=bpy.data.images.load(im.filepath_raw,check_existing=False);replacement.colorspace_settings.name=im.colorspace_settings.name;replacement.pack()
 for material in bpy.data.materials:
  if material.use_nodes:
   for node in material.node_tree.nodes:
    if node.type=='TEX_IMAGE' and node.image==im:node.image=replacement
# Fine aged-brass inlay follows the same star motif as the existing sides.
import math
brass=bpy.data.materials['Aged_Brass_Hardware']
for o in bpy.context.scene.objects:
 if o.name.startswith('Lid_Reinforcement'):o.data.materials.clear();o.data.materials.append(brass)
for index,(x,y,r) in enumerate([(0,-.465,.155),(-.36,-.23,.055),(.36,-.23,.055),(-.36,-.70,.055),(.36,-.70,.055)]):
 points=[]
 for i in range(16):
  angle=math.pi/2+i*math.tau/16;radius=r if i%2==0 else r*.36
  points.append((x+math.cos(angle)*radius,y+math.sin(angle)*radius,.116))
 mesh=bpy.data.meshes.new('Brass_Star_Inlay');mesh.from_pydata(points,[],[tuple(range(16))]);mesh.materials.append(brass)
 inlay=bpy.data.objects.new('Lid_Star_Inlay_'+str(index),mesh);bpy.context.collection.objects.link(inlay);inlay.parent=lid
assert before==[tuple(v.co) for v in lid.data.vertices]
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.context.scene.objects:
 if o.name not in {'Original_Meshy_Reference','Body_High_Reference'}:o.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'model-cleanup/Zora_Trunk_Ornate.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/cycle-seven/zora-trunk.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='SCENE',export_frame_range=True,export_yup=True)
print('PASS ornate top texture transfer; lid vertices unchanged')
