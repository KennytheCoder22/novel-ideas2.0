import * as T from '../experiments/carnival/vendor/three.module.js';
import {GLTFLoader} from '../experiments/carnival/vendor/GLTFLoader.js';
const MODEL='/cycle-seven/zora-trunk.glb';
let prepared;
export function preloadTrunk(){
 if(!prepared)prepared=Promise.all([new GLTFLoader().loadAsync(MODEL),(async()=>{const image=new Image();image.src='/cycle-seven/chest-clean-plate.png';await image.decode();return image;})()]).catch(error=>{prepared=null;throw error;});
 return prepared;
}
function polygon(ctx,points){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();}
export function createTrunk(plane){
 const canvas=document.createElement('canvas');canvas.className='chest-art chest-solid';canvas.width=1672;canvas.height=941;canvas.setAttribute('aria-hidden','true');plane.append(canvas);
 const cleanup=document.createElement('canvas');cleanup.className='chest-art chest-cleanup';cleanup.width=1672;cleanup.height=941;cleanup.setAttribute('aria-hidden','true');plane.insertBefore(cleanup,canvas);
 const ctx=cleanup.getContext('2d');let progress=0,unlocked=false,render;
 const ready=preloadTrunk().then(async([gltf,clean])=>{
  const model=gltf.scene.clone(true),scene=new T.Scene();scene.add(model);
  const lid=model.getObjectByName('Trunk_Lid'),padlock=model.getObjectByName('Trunk_Padlock');
  for(const name of ['Trunk_Body','Trunk_Lid','Trunk_Stay_Left','Trunk_Stay_Right','Trunk_Padlock','Trunk_Shackle'])if(!model.getObjectByName(name))throw Error('Trunk component missing: '+name);
  const motion=new T.AnimationMixer(model),lockMotion=new T.AnimationMixer(model);
  for(const clip of gltf.animations){const action=(clip.name==='Trunk_Shackle'?lockMotion:motion).clipAction(clip);action.setLoop(T.LoopOnce);action.clampWhenFinished=true;action.play();}
  const renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
  // No idle loop: only the existing story clock requests new poses.
  renderer.setSize(480,600,false);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
  scene.add(new T.HemisphereLight(0xffecd5,0x655040,2));
  for(const [position,intensity,color] of [[[3,5,4],3,0xffdab0],[[-3,2,-2],1.4,0xffd6a6]]){const lamp=new T.DirectionalLight(color,intensity);lamp.position.set(...position);scene.add(lamp);}
  const camera=new T.OrthographicCamera(-1.3,1.3,1.625,-1.625,.01,100);camera.position.set(2.6,1.2,3.7);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const patch={x:1000,y:496,w:320,h:400};
  Object.assign(canvas.style,{left:`${patch.x/1672*100}%`,top:`${patch.y/941*100}%`,width:`${patch.w/1672*100}%`,height:`${patch.h/941*100}%`});
  ctx.save();polygon(ctx,[[1052,650],[1139,650],[1139,614],[1160,610],[1158,555],[1180,515],[1220,488],[1261,518],[1287,600],[1290,845],[1052,845]]);ctx.clip();ctx.drawImage(clean,0,0,1672,941);ctx.restore();
  const project=point=>{const p=point.clone().project(camera);return {x:patch.x+(p.x+1)*patch.w/2,y:patch.y+(1-p.y)*patch.h/2};};
  model.updateMatrixWorld(true);canvas.dataset.hinge=JSON.stringify(lid.getWorldPosition(new T.Vector3()).toArray());canvas.dataset.model='Zora_Trunk_Prepared';
  const lockPoint=project(new T.Box3().setFromObject(padlock).getCenter(new T.Vector3()));
  plane.style.setProperty('--chest-lock-left',`${lockPoint.x/1672*100}%`);plane.style.setProperty('--chest-lock-top',`${lockPoint.y/941*100}%`);
  render=()=>{
   const start=performance.now();
   // Sample the synchronized opening half backwards to close. The shackle has
   // its own saved-state clock, so closing never relocks an already solved chest.
   motion.setTime(1/30+2*progress);lockMotion.setTime(unlocked?8/30:1/30);renderer.render(scene,camera);
   canvas.dataset.progress=String(progress);canvas.dataset.lockState=unlocked?'unlocked':'locked';canvas.dataset.triangles=String(renderer.info.render.triangles);canvas.dataset.drawMs=(performance.now()-start).toFixed(2);
  };
  if(renderer.compileAsync)await renderer.compileAsync(scene,camera);render();
 });
 return {ready,canvas,pose(value){const next=Math.max(0,Math.min(1,value));if(next!==progress){progress=next;render?.();}},setUnlocked(value){if(unlocked!==Boolean(value)){unlocked=Boolean(value);render?.();}}};
}
