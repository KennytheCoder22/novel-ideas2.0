import bpy,json,sys
from pathlib import Path
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
source=Path(r'\\yvhs-site-fs2\UserDocs$\Staff\braggk\Desktop\Meshy_AI_bohemian_circus_girl_20261117_animated_mixamo_Running\Meshy_AI_bohemian_circus_girl_20261117_animated_mixamo_Running\Meshy_AI_bohemian_circus_girl_20261117_animated_mixamo_Running.fbx')
bpy.ops.import_scene.fbx(filepath=str(source),use_anim=True)
report={'objects':[{'name':o.name,'type':o.type,'location':list(o.location),'scale':list(o.scale),'rotation':list(o.rotation_euler),'dimensions':list(o.dimensions),'vertices':len(o.data.vertices) if o.type=='MESH' else None,'polygons':len(o.data.polygons) if o.type=='MESH' else None,'shapeKeys':list(o.data.shape_keys.key_blocks.keys()) if o.type=='MESH' and o.data.shape_keys else [],'bones':[{'name':b.name,'head':list(b.head_local),'tail':list(b.tail_local)} for b in o.data.bones] if o.type=='ARMATURE' else []}for o in bpy.data.objects], 'actions':[{'name':a.name,'range':list(a.frame_range)}for a in bpy.data.actions],'materials':[{'name':m.name,'nodes':[(n.type,n.name,n.image.filepath if n.type=='TEX_IMAGE' and n.image else '') for n in m.node_tree.nodes] if m.use_nodes else []}for m in bpy.data.materials],'images':[{'name':i.name,'size':list(i.size),'filepath':i.filepath}for i in bpy.data.images]}
root=Path(r'\\yvhs-site-fs2\UserDocs$\Staff\braggk\Desktop\NovelIdeas_2.0_v2 (1) (1)\dreamscapes-animation\apps\dreamscapes')
(root/'research/kit-recognition-fbx-inspection.json').write_text(json.dumps(report,indent=2))
print('KIT_INSPECTION',json.dumps({**report,'objects':[{k:v for k,v in o.items() if k!='bones'}for o in report['objects']]}))
# Preserve authored geometry, weights, skeleton and source clip; repair imported
# texture references and downsample only the derivative web textures.
import hashlib
for mat in bpy.data.materials:
 if not mat.use_nodes: continue
 for node in mat.node_tree.nodes:
  if node.type!='TEX_IMAGE' or not node.image: continue
  old=node.image.name
  suffix='_normal.png' if 'normal' in old else '_roughness.png' if 'roughness' in old else '_metallic.png' if 'metallic' in old else '.png'
  file=source.with_name(source.stem+suffix)
  if file.exists():
   image=bpy.data.images.load(str(file),check_existing=True)
   image.colorspace_settings.name='sRGB' if suffix=='.png' else 'Non-Color'
   target=2048 if suffix=='.png' else 1024
   if max(image.size)>target:image.scale(target,target)
   image.pack();node.image=image
for action in bpy.data.actions: action.name='Running'
for o in bpy.data.objects:
 o.select_set(o.type in ['MESH','ARMATURE'])
 if o.type=='ARMATURE': o.data.pose_position='REST'
out=root/'public/cycle-twelve/kit-recognition.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_animations=True,export_force_sampling=True,export_yup=True)
report['sourceSha256']=hashlib.sha256(source.read_bytes()).hexdigest();report['sourceBytes']=source.stat().st_size;report['preparedBytes']=out.stat().st_size
report['preparation']='New supplied FBX converted to GLB. Original mesh, skin, rig and Running clip preserved. Base-color 2048px; normal/roughness/metallic 1024px. No facial morphs or independent eye joints supplied.'
(root/'public/cycle-twelve/recognition-asset-report.json').write_text(json.dumps(report,indent=2))
print('KIT_PREPARED',out.stat().st_size)
