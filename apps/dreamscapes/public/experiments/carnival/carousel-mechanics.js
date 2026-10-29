// Rigid rotor and sliding mount hardware. No dream timing or source-asset mutation.
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
export function installMountHardware(T,{mount,roofUnder,radius,geometry,mesh,shaftMaterial,hardwareMaterial}){
 const {base,anchor,entry}=mount,surface=attachmentSurface(T,entry.registration),socket=surface.point;
 const shaft=mesh(geometry(new T.CylinderGeometry(radius,radius,1,20)),shaftMaterial,base);
 const flange=geometry(new T.CylinderGeometry(radius*2.8,radius*3.2,.025,20));
 const bottom=mesh(flange,hardwareMaterial,base),top=mesh(flange,hardwareMaterial,base);bottom.position.y=.012;
 const sleeve=mesh(geometry(new T.CylinderGeometry(radius*1.8,radius*1.8,.035,20)),hardwareMaterial,anchor);sleeve.position.y=socket.y;
 if(surface.method==='socket-bracket'){
  const start=new T.Vector3(0,socket.y,0),delta=socket.clone().sub(start),length=delta.length();
  if(length>.001){const bracket=mesh(geometry(new T.CylinderGeometry(radius*.7,radius*.7,length+.006,12)),hardwareMaterial,anchor);bracket.position.copy(start).add(socket).multiplyScalar(.5);bracket.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());}
 }
 mount.pole=shaft;mount.floorBearing=bottom;mount.ceilingBearing=top;mount.sleeve=sleeve;mount.socket=surface;mount.home=base.position.clone();
 mount.setRoof=height=>{shaft.scale.y=height+.012;shaft.position.y=height/2;top.position.y=height-.012;};mount.setRoof(roofUnder);
}
export function mechanicalSnapshot(T,{orbit,deck,roof,mounts,roofUnder,distortion}){
 orbit.updateMatrixWorld(true);const point=(object,x,y,z)=>object.localToWorld(new T.Vector3(x,y,z)).toArray();
 return{distortion,rotorYaw:orbit.rotation.y,floorYaw:deck.getWorldQuaternion(new T.Quaternion()).toArray(),canopyYaw:roof.getWorldQuaternion(new T.Quaternion()).toArray(),floorCenter:point(deck,0,.03,0),canopyCenter:point(roof,0,roofUnder,0),mounts:mounts.map(m=>{
  const bottom=point(m.pole,0,-.5,0),top=point(m.pole,0,.5,0),floor=point(m.floorBearing,0,-.012,0),ceiling=point(m.ceilingBearing,0,.012,0),socket=point(m.anchor,0,m.socket.point.y,0);
  return{identity:m.entry.identity,style:m.entry.style,slot:m.entry.slotNumber,bottom,top,floor,ceiling,socket,surface:m.socket.point.toArray(),method:m.socket.method,floorClearance:new T.Box3().setFromObject(m.copy).min.y,anchorHeight:m.anchor.position.y,baseHeight:m.base.position.y,modelPosition:m.copy.position.toArray(),modelScale:m.copy.scale.toArray()};
 })};
}
