import * as T from './vendor/three.module.js';

export function envelope(model,anchor){
  model.updateWorldMatrix(true,true);
  let radius=0;const p=new T.Vector3();
  model.traverse(mesh=>{if(!mesh.isMesh)return;const a=mesh.geometry.attributes.position;for(let i=0;i<a.count;i++){p.fromBufferAttribute(a,i).applyMatrix4(mesh.matrixWorld).sub(anchor);radius=Math.max(radius,Math.hypot(p.x,p.z));}});
  return radius;
}
export function prepareVariant(entry,model,config){
  if(!Number.isFinite(config.scale)||config.scale<=0||!Number.isFinite(config.yaw)||config.offset?.length!==3||!config.offset.every(Number.isFinite))throw new Error('Invalid variant transform');
  const original=entry.bounds,targetSize=original.getSize(new T.Vector3());
  const wrapper=new T.Group();wrapper.rotation.y=config.yaw;wrapper.add(model);wrapper.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(wrapper),size=box.getSize(new T.Vector3());
  // Register the new source at the same proportional saddle/socket position.
  // Fit inside the original vertical and all-yaw radial envelope: fixed crops,
  // deck clearance and bobbing remain valid even for wider Stuffed models.
  const fraction=entry.mountPoint.clone().sub(original.min).divide(targetSize);
  const anchor=box.min.clone().add(size.clone().multiply(fraction));
  const radius=envelope(wrapper,anchor);
  const fit=Math.min(targetSize.y/size.y,entry.radius/radius);
  const scale=fit*config.scale;
  wrapper.scale.setScalar(scale);
  wrapper.position.copy(entry.mountPoint).sub(anchor.multiplyScalar(scale)).add(new T.Vector3(...config.offset));
  wrapper.updateMatrixWorld(true);
  return {wrapper,model,transform:{fit,scale,yaw:config.yaw,offset:wrapper.position.toArray(),correction:config.offset.slice()}};
}
