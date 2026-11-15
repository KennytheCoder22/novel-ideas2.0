import bpy,bmesh,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];SOURCE=Path(r'C:/Users/KenBR/OneDrive/Desktop/NovelIdeas_2.0_v2 (1)/model-preparation/zora-trunk/delivery/Zora_Trunk_Prepared.blend')
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));bpy.context.scene.frame_set(1)
body=bpy.data.objects['Trunk_Body'];lid=bpy.data.objects['Trunk_Lid'];before=[tuple(v.co) for v in lid.data.vertices]
# Remove the residual source shackle in the body, behind the independent lock.
bm=bmesh.new();bm.from_mesh(body.data);uv=bm.loops.layers.uv.active
remove=[f for f in bm.faces if abs(f.calc_center_median().x)<.13 and f.calc_center_median().y<-.375 and -.29<f.calc_center_median().z<-.06]
bmesh.ops.delete(bm,geom=remove,context='FACES')
# Fill only the new local hardware boundary with the neighboring original wood UV.
boundary=[e for e in bm.edges if e.is_boundary and all(abs(v.co.x)<.15 and v.co.y<-.35 and -.32<v.co.z<-.035 for v in e.verts)]
new=bmesh.ops.holes_fill(bm,edges=boundary,sides=0).get('faces',[]) if boundary else []
for f in new:
 for loop in f.loops:
  candidates=[l for face in loop.vert.link_faces if face not in new for l in face.loops if l.vert==loop.vert]
  if candidates:loop[uv].uv=candidates[0][uv].uv
bm.to_mesh(body.data);bm.free()
# Excise the sculpted shallow insert and repair its wood lining as a recessed
# cavity. These are the actual inner walls and bottom, not a cover near the rim.
bm=bmesh.new();bm.from_mesh(body.data)
insert=[f for f in bm.faces if abs(f.calc_center_median().x)<.755 and -.355<f.calc_center_median().y<.365 and f.calc_center_median().z>-.20]
bmesh.ops.delete(bm,geom=insert,context='FACES');bm.to_mesh(body.data);bm.free()
coords=[(-.755,-.355,-.80),(.755,-.355,-.80),(.755,.365,-.80),(-.755,.365,-.80),(-.755,-.355,.025),(.755,-.355,.025),(.755,.365,.025),(-.755,.365,.025)]
mesh=bpy.data.meshes.new('Repaired_Interior_Wood_Lining');mesh.from_pydata(coords,[],[(0,1,2,3),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]);mesh.materials.append(lid.data.materials[0]);layer=mesh.uv_layers.new(name='UVMap')
for face in mesh.polygons:
 for li,uv in zip(face.loop_indices,[(.03,.26),(.97,.26),(.97,.49),(.03,.49)]):layer.data[li].uv=uv
lining=bpy.data.objects.new('Trunk_Interior_Lining',mesh);bpy.context.collection.objects.link(lining)
assert before==[tuple(v.co) for v in lid.data.vertices]
body.data.update();bpy.context.scene.frame_set(1);bpy.ops.object.select_all(action='DESELECT')
for o in bpy.context.scene.objects:
 if o.name not in {'Original_Meshy_Reference','Body_High_Reference'}:o.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'model-cleanup/Zora_Trunk_Cleanup.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/cycle-seven/zora-trunk.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='SCENE',export_frame_range=True,export_yup=True)
print('LOCAL CLEANUP',len(remove),'legacy hardware faces;',len(insert),'interior insert faces removed; lid vertices unchanged')
