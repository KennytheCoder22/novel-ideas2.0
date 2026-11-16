import * as T from '../experiments/carnival/vendor/three.module.js';
import {GLTFLoader} from '../experiments/carnival/vendor/GLTFLoader.js';
const clamp=v=>Math.max(0,Math.min(1,v));
export const ease=v=>{v=clamp(v);return v*v*(3-2*v);};
export const INTRO_SECONDS=19.2;
// One position on a shared hall coordinate system. Frame gaps occlude traversal;
// we never switch a visible character from one mirror to another.
export function choreography(t){
 const v={x:397,feet:592,height:188,turn:0,sit:1,notice:0,walk:0,tap:0,phase:'sitting',door:false};
 if(t<3.6)return v;
 v.notice=ease((t-3.6)/.8);v.phase='noticing';
 if(t<4.6)return v;
 v.sit=1-ease((t-4.6)/1.5);v.phase='standing';
 if(t<6.1)return v;
 v.sit=0;v.walk=ease((t-6.1)/.45);v.phase='crossing-left';v.turn=1.02;
 if(t<11.4){const p=(t-6.1)/5.3;v.x=397+970*p;v.height=188+38*p;v.feet=592+13*p;v.phase=v.x<600?'crossing-left':v.x<1060?'crossing-center':'crossing-right';v.turn=1.02-.55*Math.sin(clamp((t-8.1)/1.4)*Math.PI);v.door=v.x>1270;return v;}
 v.door=true;v.walk=0;v.height=226;v.feet=605;v.x=1370;v.turn=-.2;v.phase='behind-door';
 if(t<11.8)return v;
 if(t<12.7){v.phase='peeking';v.x=1370-25*Math.sin(ease((t-11.8)/.9)*Math.PI);v.lean=.40;return v;}
 if(t<13.15){v.phase='ducking';return v;}
 // The return is a visible leftward walk across the same occluded gaps.
 if(t<15.05){v.phase='returning';v.x=1370-535*ease((t-13.15)/1.9);v.turn=-1.1;v.walk=1;v.run=.3;v.door=v.x>1270;return v;}
 v.x=835;v.door=false;v.turn=0;v.phase='approaching';const p=ease((t-15.05)/2.05);v.height=226+210*p;v.feet=605+42*p;v.walk=1-ease((t-16.65)/.45);
 if(t<17.15)return v;
 v.phase='tapping';v.reach=ease((t-17.15)/.4);v.tap=[17.65,18.15,18.65].reduce((n,at)=>n+Math.max(0,1-Math.abs(t-at)/.13),0);
 if(t>=INTRO_SECONDS){v.phase='waiting';v.reach=.7;}
 return v;
}
export async function createKit(){
 const gltf=await new GLTFLoader().loadAsync('/cycle-twelve/kit.glb');
 const model=gltf.scene,scene=new T.Scene(),pivot=new T.Group();pivot.add(model);scene.add(pivot);
 const renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power',preserveDrawingBuffer:true});
 renderer.setSize(384,512,false);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
 scene.add(new T.HemisphereLight(0xffead7,0x4e3448,2.5));
 const light=new T.DirectionalLight(0xffdfb1,2.6);light.position.set(-2,3,4);scene.add(light);
 const fill=new T.DirectionalLight(0xa5c5ff,1.3);fill.position.set(3,2,-2);scene.add(fill);
 const camera=new T.OrthographicCamera(-.75,.75,1,-1,.01,100);camera.position.set(0,.85,5);camera.lookAt(0,.85,0);
 const mesh=[];model.traverse(o=>{if(o.isMesh){o.frustumCulled=false;mesh.push(o);o.material.roughness=.85;o.material.metalness=0;o.material.side=T.FrontSide;}});
 const mixer=new T.AnimationMixer(model),walk=mixer.clipAction(gltf.animations.find(c=>c.name==='Walking')),run=mixer.clipAction(gltf.animations.find(c=>c.name==='Running'));
 walk.play();run.play();run.setEffectiveWeight(0);
 const bones={};model.traverse(o=>{if(o.isBone)bones[o.name.replace('mixamorig','').replace(':','')]=o;});
 const point=new T.Vector3(),origin=new T.Vector3(),direction=new T.Vector3(),target=new T.Vector3(),q=new T.Quaternion(),parentQ=new T.Quaternion(),worldQ=new T.Quaternion();
 function aim(name,childName,xyz,weight=1){const b=bones[name],child=bones[childName];if(!b||!child||weight<=0)return;model.updateMatrixWorld(true);b.getWorldPosition(origin);child.getWorldPosition(point);direction.copy(point).sub(origin).normalize();target.set(...xyz).sub(origin).normalize();q.setFromUnitVectors(direction,target);b.getWorldQuaternion(worldQ);q.multiply(worldQ);b.parent.getWorldQuaternion(parentQ).invert();q.premultiply(parentQ);b.quaternion.slerp(q,weight);}
 mixer.setTime(0); const base=Object.values(bones).map(b=>({b,p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}));
 let lastPose;
 function draw(t=0,spec={walk:1}){
  if(typeof spec==='string')spec={walk:1};
  for(const v of base){v.b.position.copy(v.p);v.b.quaternion.copy(v.q);v.b.scale.copy(v.s);}
  pivot.rotation.set(0,0,0);pivot.position.set(0,0,0);
  const s=clamp(spec.sit||0),moving=clamp(spec.walk||0),running=clamp(spec.run||0);
  walk.setEffectiveWeight(1-running);run.setEffectiveWeight(running);mixer.setTime(moving>0?t:0);
  // Existing gait supplies the locomotion; stationary poses use its first sample
  // with fitted joint targets. Never deform vertices to manufacture limb motion.
  bones.Hips.position.x*=moving;bones.Hips.position.z*=moving;bones.Hips.position.y-=.48*s;
  if(moving<1){
   for(const [side,sign] of [['Left',1],['Right',-1]]){
    aim(side+'UpLeg',side+'Leg',[sign*.125,.43+.18*s,.03+.40*s],1-moving);
    aim(side+'Leg',side+'Foot',[sign*.13,.095,.025+.48*s],1-moving);
    aim(side+'Foot',side+'ToeBase',[sign*.13,.07,.18+.48*s],(1-moving)*.8);
    aim(side+'Arm',side+'ForeArm',[sign*(.25-.02*s),1.05-.40*s,.03+.25*s],(1-moving)*.8);
    aim(side+'ForeArm',side+'Hand',[sign*(.22-.12*s),.84-.22*s,.05+.40*s],(1-moving)*.9);
   }
  }
  const head=bones.Head;head.rotation.x+=(.32*(1-(spec.notice||0))-.10*(spec.notice||0))*s;
  head.rotation.y+=moving ? -.22*Math.sin(t*1.2):.045*Math.sin(t*.8);head.rotation.z+=spec.lean||.025*Math.sin(t*.7);
  bones.Spine2.rotation.x+=.13*s+.012*Math.sin(t*2);bones.Spine.rotation.z+=spec.lean||0;
  const reach=spec.reach||0;
  if(reach){aim('RightArm','RightForeArm',[-.30,1.12,.18],reach);aim('RightForeArm','RightHand',[-.28,1.42,.40+(spec.tap||0)*.045],reach);aim('RightHand','RightHandMiddle1',[-.27,1.53,.43+(spec.tap||0)*.045],reach);}
  // The supplied left hand touches the skirt in its bind mesh. Keep that hand
  // close to the fabric; use the free right hand for expansive gestures.
  if(spec.point){aim('RightArm','RightForeArm',[-.30,1.18,.18],spec.point);aim('RightForeArm','RightHand',[-.45,1.25,.25],spec.point);aim('RightHand','RightHandMiddle1',[-.53,1.29,.27],spec.point);}
  pivot.rotation.y=spec.turn||0;pivot.position.y=spec.bob||0;model.updateMatrixWorld(true);renderer.render(scene,camera);lastPose=spec;
 }
 draw(0,{walk:1});
 return {canvas:renderer.domElement,draw,bones,model,pivot,mixer,walk,run,renderer,scene,camera,mesh,get pose(){return lastPose;},dispose(){mixer.stopAllAction();mesh.forEach(m=>{m.geometry.dispose();for(const v of Object.values(m.material))if(v?.isTexture)v.dispose();m.material.dispose();});renderer.dispose();}};
}
