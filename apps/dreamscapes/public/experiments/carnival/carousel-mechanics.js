// Rigid moving pole/mount assemblies through fixed open guides. No dream timing or source-asset mutation.
export function attachmentSurface(T,registration){
 const model=registration.clone(true);model.updateMatrixWorld(true);
 const box=new T.Box3().setFromObject(model),ray=new T.Raycaster(new T.Vector3(0,box.max.y+.1,0),new T.Vector3(0,-1,0));
 const hits=ray.intersectObject(model,true).filter(h=>Math.abs(h.point.y)<.3).sort((a,b)=>Math.abs(a.point.y)-Math.abs(b.point.y));
 if(hits.length)return{point:hits[0].point.clone(),method:'registered-axis-surface'};
 // Hollow cockpit/bench exports need a short socket bracket, not a new model offset.
 let score=Infinity,point=null;const v=new T.Vector3();
 model.traverse(mesh=>{if(!mesh.isMesh)return;const positions=mesh.geometry.attributes.position;for(let i=0;i<positions.count;i++){
  v.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);if(Math.abs(v.y)>.3)continue;
  const d=v.x*v.x+v.z*v.z+v.y*v.y*.35;if(d<score){score=d;point=v.clone();}
 }});
 if(!point)throw Error('Cannot locate approved mount socket surface');
 return{point,method:'socket-bracket'};
}
// Circular plate with real through-holes, using the same slot coordinates as the assemblies.
export function perforatedPlate(T,{radius,depth,slots,holeRadius}){
 const shape=new T.Shape();shape.absarc(0,0,radius,0,Math.PI*2,false);
 for(const slot of slots){const hole=new T.Path();hole.absarc(slot.home.x,-slot.home.z,holeRadius,0,Math.PI*2,true);shape.holes.push(hole);}
 const g=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:24});
 const positions=g.attributes.position,normals=g.attributes.normal,uv=g.attributes.uv;
 for(let i=0;i<uv.count;i++)if(Math.abs(normals.getZ(i))>.9)uv.setXY(i,.5+positions.getX(i)/(2*radius),.5+positions.getY(i)/(2*radius));
 g.translate(0,0,-depth/2);g.rotateX(-Math.PI/2);g.userData.guideHoles=slots.map(slot=>[slot.home.x,slot.home.z]);g.userData.holeRadius=holeRadius;return g;
}
export function installMountHardware(T,{mount,roofUnder,radius,geometry,mesh,shaftMaterial,hardwareMaterial}){
 const {base,anchor,entry}=mount,surface=attachmentSurface(T,entry.registration),socket=surface.point;
 // The shaft is rigidly parented with the model and rider. Its length accounts
 // for the complete +/- bob travel plus reserve beyond BOTH plate thicknesses.
 const overrun=.08,shaft=mesh(geometry(new T.CylinderGeometry(radius,radius,1,20,1,true)),shaftMaterial,anchor);
 const inner=radius*1.35,outer=radius*3.2;
 const profile=[new T.Vector2(inner,-.0125),new T.Vector2(outer,-.0125),new T.Vector2(outer,.0125),new T.Vector2(inner,.0125),new T.Vector2(inner,-.0125)];
 const guide=geometry(new T.LatheGeometry(profile,24));
 const bottom=mesh(guide,hardwareMaterial,base),top=mesh(guide,hardwareMaterial,base);bottom.position.y=.0125;
 const sleeve=mesh(geometry(new T.CylinderGeometry(radius*1.8,radius*1.8,.035,20)),hardwareMaterial,anchor);sleeve.position.y=socket.y;
 if(surface.method==='socket-bracket'){
  const start=new T.Vector3(0,socket.y,0),delta=socket.clone().sub(start),length=delta.length();
  if(length>.001){const bracket=mesh(geometry(new T.CylinderGeometry(radius*.7,radius*.7,length+.006,12)),hardwareMaterial,anchor);bracket.position.copy(start).add(socket).multiplyScalar(.5);bracket.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());}
 }
 mount.pole=shaft;mount.floorBearing=bottom;mount.ceilingBearing=top;mount.sleeve=sleeve;mount.socket=surface;mount.home=base.position.clone();mount.overrun=overrun;mount.guideRadius=inner;
 // Only dream roof elongation calls for changing this local rigid shaft shape.
 // Actual vertical travel is applied once, on anchor, in the normal animation.
 mount.setRoof=height=>{shaft.scale.y=height+2*mount.bob+2*overrun;shaft.position.y=height/2-mount.height;top.position.y=height-.0125;};mount.setRoof(roofUnder);
}
export function mechanicalSnapshot(T,{orbit,deck,roof,ceiling,mounts,roofUnder,distortion}){
 orbit.updateMatrixWorld(true);const point=(object,x,y,z)=>object.localToWorld(new T.Vector3(x,y,z)).toArray();
 const ray=new T.Raycaster(),holeIsClear=(plate,center)=>{ray.set(new T.Vector3(...center).add(new T.Vector3(0,.1,0)),new T.Vector3(0,-1,0));return ray.intersectObject(plate,false).length===0;};
 return{solidFloorHit:!holeIsClear(deck,point(deck,0,.03,0)),solidCeilingHit:!holeIsClear(ceiling,point(roof,0,roofUnder,0)),distortion,rotorYaw:orbit.rotation.y,floorYaw:deck.getWorldQuaternion(new T.Quaternion()).toArray(),canopyYaw:roof.getWorldQuaternion(new T.Quaternion()).toArray(),floorCenter:point(deck,0,.03,0),canopyCenter:point(roof,0,roofUnder,0),mounts:mounts.map(m=>{
  const bottom=point(m.pole,0,-.5,0),top=point(m.pole,0,.5,0),floor=point(m.floorBearing,0,-.0125,0),ceilingPoint=point(m.ceilingBearing,0,.0125,0),socket=point(m.anchor,0,m.socket.point.y,0);
  return{identity:m.entry.identity,style:m.entry.style,slot:m.entry.slotNumber,bottom,top,floor,ceiling:ceilingPoint,socket,surface:m.socket.point.toArray(),method:m.socket.method,floorClearance:new T.Box3().setFromObject(m.copy).min.y,anchorHeight:m.anchor.position.y,baseHeight:m.base.position.y,modelPosition:m.copy.position.toArray(),modelScale:m.copy.scale.toArray(),shaftLocalPosition:m.pole.position.toArray(),shaftLength:m.pole.scale.y,poleInMovingAssembly:m.pole.parent===m.anchor,collarInMovingAssembly:m.sleeve.parent===m.anchor,floorHoleClear:holeIsClear(deck,floor),ceilingHoleClear:holeIsClear(ceiling,ceilingPoint),overrun:m.overrun,guideRadius:m.guideRadius};
 })};
}
