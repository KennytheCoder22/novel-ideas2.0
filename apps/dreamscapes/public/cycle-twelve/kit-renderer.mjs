import * as T from '../experiments/carnival/vendor/three.module.js';
import {GLTFLoader} from '../experiments/carnival/vendor/GLTFLoader.js';
import {ROOM,clamp,ease,choreography,INTRO_SECONDS} from './recognition-space.mjs';
export {ease,choreography,INTRO_SECONDS};
export async function createKit(){
 const gltf=await new GLTFLoader().loadAsync('/cycle-twelve/kit-recognition.glb');
 const scene=new T.Scene(),model=gltf.scene,pivot=new T.Group();pivot.name='Kit-world-root';pivot.add(model);scene.add(pivot);
 const camera=new T.PerspectiveCamera(ROOM.camera.fov,ROOM.camera.aspect,.05,40);camera.position.fromArray(ROOM.camera.position);camera.lookAt(...ROOM.camera.target);camera.updateMatrixWorld();
 const renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power',preserveDrawingBuffer:true});renderer.setSize(1280,721,false);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
 scene.add(new T.HemisphereLight(0xffe7c8,0x4e4055,2.2));
 const light=new T.DirectionalLight(0xffdbad,2.1);light.position.set(-3,4,5);scene.add(light);const fill=new T.DirectionalLight(0xa8b6dd,.9);fill.position.set(4,2,-4);scene.add(fill);
 const occluders=[],depthMaterial=new T.MeshBasicMaterial({colorWrite:false,depthWrite:true,depthTest:true,side:T.DoubleSide});
 for(const spec of ROOM.solids){const solid=new T.Mesh(new T.BoxGeometry(...spec.size),depthMaterial);solid.name=spec.name;solid.position.fromArray(spec.center);solid.renderOrder=-10;scene.add(solid);occluders.push(solid);}
 const meshes=[],bones={};model.traverse(o=>{if(o.isSkinnedMesh){o.frustumCulled=false;o.material.metalness=0;o.material.roughness=.86;meshes.push(o);}if(o.isBone)bones[o.name.replace(/^mixamorig:?/,'')]=o;});
 model.updateMatrixWorld(true);
 const base=Object.values(bones).map(b=>({b,p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}));
 const worldPosition=b=>b.getWorldPosition(new T.Vector3());
 const hipRest=worldPosition(bones.Hips),point=new T.Vector3(),origin=new T.Vector3(),direction=new T.Vector3(),target=new T.Vector3(),q=new T.Quaternion(),parentQ=new T.Quaternion(),worldQ=new T.Quaternion();
 function aim(name,childName,xyz,weight=1){const b=bones[name],child=bones[childName];if(!b||!child||weight<=0)return;model.updateMatrixWorld(true);b.getWorldPosition(origin);child.getWorldPosition(point);direction.copy(point).sub(origin).normalize();target.set(...xyz).sub(origin).normalize();q.setFromUnitVectors(direction,target);b.getWorldQuaternion(worldQ);q.multiply(worldQ);b.parent.getWorldQuaternion(parentQ).invert();q.premultiply(parentQ);b.quaternion.slerp(q,weight);}
 function shiftWorld(b,delta){model.updateMatrixWorld(true);const p=worldPosition(b).add(new T.Vector3(...delta));b.position.copy(b.parent.worldToLocal(p));}
 function rotateWorld(b,axis,angle){model.updateMatrixWorld(true);q.setFromAxisAngle(new T.Vector3(...axis),angle);b.getWorldQuaternion(worldQ);q.multiply(worldQ);b.parent.getWorldQuaternion(parentQ).invert();b.quaternion.copy(q.premultiply(parentQ));}
 // Analytic two-bone reach: preserve the imported elbow/wrist lengths.
 function reachArm(side,xyz,weight=1){
  model.updateMatrixWorld(true);const upper=bones[side+'Arm'],lower=bones[side+'ForeArm'],hand=bones[side+'Hand'];
  const shoulder=worldPosition(upper),elbow=worldPosition(lower),wrist=worldPosition(hand),goal=new T.Vector3(...xyz);
  const a=shoulder.distanceTo(elbow),b=elbow.distanceTo(wrist),axis=goal.clone().sub(shoulder),d=Math.max(Math.abs(a-b)+.0001,Math.min(a+b-.0001,axis.length()));axis.normalize();
  const along=(a*a-b*b+d*d)/(2*d),height=Math.sqrt(Math.max(0,a*a-along*along));
  const pole=new T.Vector3(0,-1,0).addScaledVector(axis,axis.y).normalize();
  const bend=shoulder.clone().addScaledVector(axis,along).addScaledVector(pole,height);
  aim(side+'Arm',side+'ForeArm',bend.toArray(),weight);aim(side+'ForeArm',side+'Hand',goal.toArray(),weight);
 }
 let lastPose;
 function pose(t,spec){
  pivot.position.set(0,0,0);pivot.rotation.set(0,0,0);pivot.updateMatrixWorld(true);for(const v of base){v.b.position.copy(v.p);v.b.quaternion.copy(v.q);v.b.scale.copy(v.s);}
  const sitting=clamp(spec.sit||0),walking=clamp(spec.walk||0),step=Math.sin(t*5.4),other=-step,lift=Math.max(0,Math.cos(t*5.4));
  shiftWorld(bones.Hips,[0,-.56*sitting-(spec.duck||0)*.15+walking*.015*Math.cos(t*10.8),0]);
  // Low, short steps replace the supplied energetic run for this wary encounter.
  // The source Running clip remains in the asset; no new gait is mislabelled as it.
  for(const [side,sign,wave,footLift] of [['Left',1,step,lift],['Right',-1,other,1-lift]]){
   const knee=[sign*.13,.44+.15*sitting,.02+.34*sitting+wave*.11*walking];
   const ankle=[sign*.15,.095+Math.max(0,footLift-.25)*.07*walking,.03+.48*sitting+wave*.25*walking];
   aim(side+'UpLeg',side+'Leg',knee);aim(side+'Leg',side+'Foot',ankle);aim(side+'Foot',side+'ToeBase',[ankle[0]+sign*.015,.045+Math.max(0,footLift-.25)*.07*walking,ankle[2]+.13],.85);
   aim(side+'Arm',side+'ForeArm',[sign*(.25-.025*sitting),1.07-.48*sitting,.015+.28*sitting-wave*.035*walking]);
   aim(side+'ForeArm',side+'Hand',[sign*(.24-.15*sitting),.85-.23*sitting,.055+.42*sitting-wave*.055*walking]);
  }
  // Knees remain close; the head rises only after the held recognition beat.
  rotateWorld(bones.Spine,[1,0,0],.07*sitting);rotateWorld(bones.Spine2,[1,0,0],.08*sitting);
  rotateWorld(bones.Head,[1,0,0],sitting*(.18-.24*(spec.notice||0))-.035*(spec.reach||0));
  rotateWorld(bones.Head,[0,1,0],spec.headYaw||0);
  if(spec.wallSupport){const a=spec.wallSupport;aim('LeftArm','LeftForeArm',[.30,1.0-.38*sitting,-.08],a);aim('LeftForeArm','LeftHand',[.24,1.09-.45*sitting,-.26],a);}
  if(spec.peek){const a=spec.peek;if(spec.phase==='right-door-peek'){shiftWorld(bones.Hips,[0,0,.03*a]);rotateWorld(bones.Spine,[1,0,0],-.85*a);rotateWorld(bones.Spine2,[1,0,0],-.45*a);rotateWorld(bones.Neck,[1,0,0],-1.05*a);rotateWorld(bones.Head,[1,0,0],2.05*a);rotateWorld(bones.Head,[0,1,0],-Math.PI/2*a);reachArm('Right',[-.10,1.40,-.16],a);aim('RightHand','RightHandMiddle1',[-.10,1.40,-.39],a);rotateWorld(bones.RightHand,[0,0,1],Math.PI/2*a);for(const finger of ['Index','Middle','Ring','Pinky'])for(let joint=1;joint<4;joint++){const name='RightHand'+finger+joint,b=bones[name];if(b){model.updateMatrixWorld(true);const wp=worldPosition(b);aim(name,'RightHand'+finger+(joint+1),[wp.x+(joint===3?.06:0),wp.y,wp.z-.10],a);}}}else{shiftWorld(bones.Hips,[.05*a,0,0]);rotateWorld(bones.Spine,[0,0,1],.90*a);rotateWorld(bones.Spine2,[0,0,1],.25*a);rotateWorld(bones.Neck,[0,0,1],.75*a);rotateWorld(bones.Head,[0,0,1],-1.45*a);aim('RightArm','RightForeArm',[-.22,1.13,.03],a);aim('RightForeArm','RightHand',[-.26,1.45,.09],a);aim('RightHand','RightHandMiddle1',[-.28,1.53,.09],a);}}
  if(spec.reach){const a=spec.reach;aim('RightArm','RightForeArm',[-.28,1.12,.20],a);aim('RightForeArm','RightHand',[-.26,1.37,.43],a);aim('RightHand','RightHandMiddle1',[-.25,1.48,.45],a);}
  if(spec.reach>.5){for(const finger of ['Index','Middle','Ring','Pinky'])for(let joint=1;joint<4;joint++){const name='RightHand'+finger+joint,b=bones[name];if(b){model.updateMatrixWorld(true);const wp=worldPosition(b);aim(name,'RightHand'+finger+(joint+1),[wp.x,wp.y+.1,wp.z],ease((spec.reach-.5)*2));}}}
  if(spec.point){const a=spec.point;aim('RightArm','RightForeArm',[-.31,1.16,.15],a);aim('RightForeArm','RightHand',[-.46,1.24,.22],a);}
  pivot.position.fromArray(spec.position||[0,0,2]);pivot.rotation.y=spec.turn||0;model.updateMatrixWorld(true);lastPose=spec;
 }
 function draw(t,spec){pose(t,spec);renderer.render(scene,camera);}
 const project=(xyz)=>{const p=new T.Vector3(...xyz).project(camera);return {x:(p.x+1)*1671/2,y:(1-p.y)*941/2,z:p.z};};
 const debug=new URLSearchParams(location.search).has('kit-debug-space');if(debug){depthMaterial.colorWrite=true;depthMaterial.wireframe=true;depthMaterial.color.set('#62bbd1');}
 draw(0,choreography(0));
 return {canvas:renderer.domElement,draw,pose,bones,model,pivot,renderer,scene,camera,meshes,occluders,project,sourceAnimations:gltf.animations.map(c=>({name:c.name,duration:c.duration})),get currentPose(){return lastPose;},resize(w,h){renderer.setSize(w,h,false);},snapshot(){return {camera:{type:camera.type,position:camera.position.toArray(),fov:camera.fov},worldPosition:pivot.position.toArray(),worldScale:pivot.scale.toArray(),occluders:occluders.map(m=>({name:m.name,position:m.position.toArray(),dimensions:[m.geometry.parameters.width,m.geometry.parameters.height,m.geometry.parameters.depth]})),phase:lastPose?.phase};},dispose(){for(const m of meshes){m.geometry.dispose();for(const v of Object.values(m.material))if(v?.isTexture)v.dispose();m.material.dispose();}for(const o of occluders)o.geometry.dispose();depthMaterial.dispose();renderer.dispose();}};
}
