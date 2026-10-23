import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {createMaraRig,loadMaraSkin} from './mara-rig.js?v=20261023-pickup-upright-3';
// The approved endpoint is fitted first; motion always finishes in that exact pose.
const plane=document.querySelector('.composition'),view=plane.closest('main'),fox=plane.querySelector('.fox');
const local=['127.0.0.1','localhost'].includes(location.hostname)&&new URLSearchParams(location.search).has('mara-review');
// Reference artwork is created only in the explicit local comparison preview.
const reference=local?new Image():null;
if(reference){reference.alt='';reference.draggable=false;reference.style.visibility='hidden';reference.src='./fox.png';fox.append(reference);}
let sourceScene,rig,renderer,scene,camera,loaded=false,disposed=false,active=false,draws=0,mode='model';
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),still=document.documentElement.dataset.motion==='still';
const runEnd=3.2,stepEnd=6.4,turnEnd=6.9,end=7.25;let time=end,playing=false,frame=0,last=0,visit=0,restBones=[],route=null,slider;
const ease=x=>{x=T.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
const poseParameters={yaw:-1.4,bodyRoll:1.5,bodyPitch:.03,headYaw:.3,headRoll:.38,headPitch:-.15,headDrop:-.29,headLeft:.15,tailDrop:-.16,bellyForward:.4,pawLift:.18};
const canvas=document.createElement('canvas');canvas.className='mara-canvas';canvas.setAttribute('aria-hidden','true');canvas.dataset.review='scurry-collapse';canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3';plane.append(canvas);
renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true});renderer.outputColorSpace=T.SRGBColorSpace;renderer.setClearColor(0,0);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
scene=new T.Scene();camera=new T.PerspectiveCamera(40,1.5,.05,100);camera.position.set(0,3,8);camera.lookAt(0,.9,0);camera.updateMatrixWorld(true);
scene.add(new T.HemisphereLight(0xabbfd8,0x22150f,.3));const amber=new T.DirectionalLight(0xffb265,1.2);amber.position.set(-3,5,3);amber.castShadow=true;amber.shadow.mapSize.set(1024,1024);Object.assign(amber.shadow.camera,{left:-8,right:8,top:6,bottom:-6,near:.1,far:30});amber.shadow.bias=-.0003;amber.shadow.normalBias=.01;scene.add(amber);const moon=new T.DirectionalLight(0xabc8ee,.45);moon.position.set(1,5,-4);scene.add(moon);
const floor=new T.Mesh(new T.PlaneGeometry(50,50),new T.ShadowMaterial({opacity:.28}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
function ground(x,y){const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(x/1536*2-1,1-y/1024*2),camera);return ray.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),0),new T.Vector3());}

let fitted=null,reflection,panel;
function targetBounds(){
 const k=1536/plane.clientWidth,left=fox.offsetLeft*k,top=fox.offsetTop*k,width=fox.offsetWidth*k,height=fox.offsetHeight*k;
 // Alpha >32 bounds measured from the unchanged 423x236 reference PNG.
 const referenceBounds={left:left+width*7/423,right:left+width*421/423,top,bottom:top+height};
 // Ten percent smaller than the previous reference-width fit; keep its center and ground contact.
 const center=(referenceBounds.left+referenceBounds.right)/2,halfWidth=(referenceBounds.right-referenceBounds.left)*.9/2;
 return{left:center-halfWidth,right:center+halfWidth,top:referenceBounds.bottom-height*.9,bottom:referenceBounds.bottom};
}
function projectedBounds(){
 const v=new T.Vector3(),out={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
 for(let i=0;i<rig.mesh.geometry.attributes.position.count;i++){
  rig.mesh.getVertexPosition(i,v).applyMatrix4(rig.mesh.matrixWorld).project(camera);
  const x=(v.x+1)*768,y=(1-v.y)*512;out.left=Math.min(out.left,x);out.right=Math.max(out.right,x);out.top=Math.min(out.top,y);out.bottom=Math.max(out.bottom,y);
 }
 return out;
}
function fit(){
 if(!loaded)return;rig.turnSupport(0);const target=targetBounds(),v=new T.Vector3();
 rig.group.rotation.set(0,poseParameters.yaw,0);rig.group.scale.setScalar(.45);rig.group.position.copy(ground((target.left+target.right)/2,target.bottom));
 for(let i=0;i<7;i++){
  rig.restingPose(poseParameters);let box=projectedBounds();rig.group.scale.multiplyScalar((target.right-target.left)/(box.right-box.left));rig.restingPose(poseParameters);box=projectedBounds();
  v.set(rig.group.position.x,0,rig.group.position.z).project(camera);
  const x=(v.x+1)*768+(target.left+target.right-box.left-box.right)/2,y=(1-v.y)*512+target.bottom-box.bottom;
  const point=ground(x,y);rig.group.position.x=point.x;rig.group.position.z=point.z;
 }
 rig.restingPose(poseParameters);fitted={target,actual:projectedBounds(),scale:rig.group.scale.x,position:rig.group.position.toArray()};
 restBones=rig.bones.map(b=>({p:b.position.clone(),q:b.quaternion.clone()}));route=null;
}
function prepareRoute(){
 const rect=plane.getBoundingClientRect(),visibleBottom=Math.min(1024,(innerHeight-rect.top)/rect.height*1024);
 const visibleLeft=Math.max(0,-rect.left/rect.width*1536),visibleWidth=Math.min(innerWidth,rect.right)-Math.max(0,rect.left);
 const startX=visibleLeft+visibleWidth/rect.width*1536*.3;
 const finish=new T.Vector3(...fitted.position);finish.y=0;finish.project(camera);
 const finishX=(finish.x+1)*768;
 // Fit the upright gait's upper third into the current viewport, including cover cropping.
 rig.group.scale.setScalar(fitted.scale);rig.group.rotation.y=Math.PI/2;rig.group.position.copy(ground(startX,visibleBottom));rig.pose({cycle:0});
 const box=projectedBounds(),height=box.bottom-box.top;
 route={startX,finishX,groundY:visibleBottom+height*.28,height};
 const finishPoint=new T.Vector3(...fitted.position);finishPoint.y=0;finishPoint.project(camera);route.finishGroundY=(1-finishPoint.y)*512;
 // Keep the approaching lane physically in front of the resting spot even when
 // a shallow landscape viewport crops the bottom of the artwork.
 route.groundY=Math.max(route.groundY,route.finishGroundY+75);
 rig.group.position.copy(ground(finishX,route.groundY));rig.group.rotation.set(0,Math.PI/2,0);rig.pose({cycle:3.2*1.35});
 const start=ground(finishX,route.groundY),finishGround=new T.Vector3(...fitted.position);finishGround.y=0;
 const facing=new T.Vector3(Math.sin(poseParameters.yaw),0,Math.cos(poseParameters.yaw)),handle=start.distanceTo(finishGround)*.65;
 route.curve=new T.CubicBezierCurve3(start,start.clone().add(new T.Vector3(handle,0,0)),finishGround.clone().addScaledVector(facing,-handle),finishGround);
 route.length=route.curve.getLength();route.beats=32;
 const crossingSpeed=ground(route.startX,route.groundY).distanceTo(start)/runEnd;
 route.entryRate=Math.min(2,crossingSpeed*(stepEnd-runEnd)/route.length);
 let feet=rig.legs.map(l=>l.paw.getWorldPosition(new T.Vector3())),headings=feet.map(()=>Math.PI/2);route.steps=[];
 // Each forepaw leads its corresponding hind paw along the centerline.
 const order=[1,3,0,2];
 for(let beat=0;beat<route.beats;beat++){
  const index=order[beat%4],l=rig.legs[index],lead=l.front?2.1:2.7,progress=beat>=route.beats-4?1:walkProgress((beat+lead)/route.beats),sample=pathStation(progress*route.length+l.z*fitted.scale);
  const next=feet.map(v=>v.clone()),nextHeadings=[...headings];
  next[index].copy(sample.point).addScaledVector(new T.Vector3(sample.tangent.z,0,-sample.tangent.x),l.x*fitted.scale);next[index].y=.035;nextHeadings[index]=sample.yaw;
  route.steps.push({from:feet,to:next,fromHeadings:headings,toHeadings:nextHeadings,swing:[index]});feet=next;headings=nextHeadings;
 }
}
function walkProgress(u){u=T.MathUtils.clamp(u,0,1);return(-2*u*u*u+3*u*u)+(u*u*u-2*u*u+u)*route.entryRate;}
function pathStation(distance){
 const u=T.MathUtils.clamp(distance/route.length,0,1),point=route.curve.getPointAt(u),tangent=route.curve.getTangentAt(u).normalize();
 if(distance<0)point.addScaledVector(tangent,distance);else if(distance>route.length)point.addScaledVector(tangent,distance-route.length);
 let yaw=Math.atan2(tangent.x,tangent.z);if(yaw<Math.PI/2-.001)yaw+=Math.PI*2;
 return{point,tangent,yaw};
}
function turnFeet(progress){
 const t=T.MathUtils.clamp(progress,0,1)*route.beats,index=Math.min(route.beats-1,Math.floor(t)),phase=t-index,step=route.steps[index],u=ease(phase);
 const targets=step.from.map((p,i)=>p.clone().lerp(step.to[i],u)),headings=step.fromHeadings.map((h,i)=>T.MathUtils.lerp(h,step.toHeadings[i],u));
 for(const i of step.swing)targets[i].y+=Math.sin(phase*Math.PI)*.045;
 rig.placeFeet(targets,headings);
 route.feet={targets:targets.map(v=>v.toArray()),actual:rig.legs.map(l=>l.paw.getWorldPosition(new T.Vector3()).toArray()),swing:progress>=1?[]:step.swing,phase,headings};
}

function animatePose(){
 if(pickup){posePickup();return;}
 if(time>=end){rig.turnSupport(0);rig.group.scale.setScalar(fitted.scale);rig.group.position.fromArray(fitted.position);rig.group.rotation.y=poseParameters.yaw;rig.restingPose(poseParameters);return;}
 if(!route)prepareRoute();
 const stepProgress=T.MathUtils.clamp((time-runEnd)/(stepEnd-runEnd),0,1),progress=walkProgress(stepProgress),c=ease((time-turnEnd)/(end-turnEnd));
 rig.turnSupport(time<runEnd?0:ease((time-runEnd)/.2)*(1-c));
 rig.group.scale.setScalar(fitted.scale);
 if(time<runEnd){rig.group.position.copy(ground(T.MathUtils.lerp(route.startX,route.finishX,time/runEnd),route.groundY));rig.group.rotation.set(0,Math.PI/2,0);}
 else{const sample=pathStation(progress*route.length);rig.group.position.copy(sample.point);rig.group.rotation.set(0,sample.yaw,0);route.heading=sample.tangent.toArray();}
 const gaitRate=3.2*1.35/runEnd,cycle=Math.min(time,runEnd)*gaitRate;rig.pose({cycle});
 if(time>=runEnd){
  const fore=pathStation(progress*route.length+.16),rear=pathStation(progress*route.length-.16);
  rig.group.position.y-=.04;rig.group.updateMatrixWorld(true);
  rig.followCurve(T.MathUtils.clamp(fore.yaw-rig.group.rotation.y,-.3,.3),T.MathUtils.clamp(rear.yaw-rig.group.rotation.y,-.3,.3));turnFeet(stepProgress);
 }
 if(c>0){for(let i=0;i<rig.bones.length;i++){const b=rig.bones[i];b.position.lerp(restBones[i].p,c);b.quaternion.slerp(restBones[i].q,c);}
  rig.group.updateMatrixWorld(true);rig.mesh.skeleton.update();let low=Infinity;const v=new T.Vector3();
  for(let i=0;i<rig.mesh.geometry.attributes.position.count;i++){rig.mesh.getVertexPosition(i,v);low=Math.min(low,v.y);}
  rig.group.position.y=-low*rig.group.scale.y;rig.group.updateMatrixWorld(true);rig.mesh.skeleton.update();
 }
}
function draw(){if(!loaded||disposed||!active)return;animatePose();canvas.hidden=mode==='original';if(reference){reference.style.visibility=mode==='model'?'hidden':'visible';reference.style.opacity=mode==='overlay'?'.5':'1';}fox.style.zIndex=mode==='overlay'?'4':'3';if(reflection)reflection.visible=!pickup;if(mode!=='original'){renderer.render(scene,camera);draws++;}canvas.dataset.phase=pickup?pickup.phase:time>=end?'resting':time>=turnEnd?'collapsing':time>=stepEnd?'noticed-pause':time>=runEnd?'walking-left':'running';fox.disabled=!!pickup||time<end;if(panel)panel.textContent=mode==='original'?'Original 2D fox':mode==='overlay'?'Original reference over 3D Mara':canvas.dataset.phase+' - '+time.toFixed(2)+' s';if(slider)slider.value=time;}
function cancel(){cancelAnimationFrame(frame);frame=0;last=0;playing=false;}
function tick(now){frame=0;if(!active||document.hidden||disposed)return;const dt=last?T.MathUtils.clamp((now-last)/1000,0,.06):0;last=now;if(pickup)pickup.elapsed+=dt;else time=Math.min(end,time+dt);draw();if(pickup||playing&&time<end)frame=requestAnimationFrame(tick);else playing=false;}
function replay(){if(!loaded||disposed)return;resetPickup();cancel();mode='model';route=null;time=reduced.matches||still?end:0;playing=time<end;draw();if(playing&&active&&!document.hidden)frame=requestAnimationFrame(tick);}
function seek(t){resetPickup();cancel();time=T.MathUtils.clamp(t,0,end);mode='model';draw();}
function resize(){if(disposed)return;renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setSize(Math.max(1,Math.round(plane.clientWidth)),Math.max(1,Math.round(plane.clientHeight)),false);route=null;if(pickup)pickup.target=null;draw();}
function sync(){if(disposed)return;const next=!view.inert&&(document.documentElement.dataset.location||'midway')==='midway';if(next!==active){active=next;if(!active){resetPickup();cancel();canvas.hidden=true;}else if(loaded){visit++;replay();}}else if(active&&loaded){if(reduced.matches||still){if(pickup){pickup.elapsed=2;draw();}else{cancel();time=end;draw();}}else if(document.hidden){cancelAnimationFrame(frame);frame=0;last=0;}else if((playing||pickup)&&!frame){last=0;frame=requestAnimationFrame(tick);}}}
const pickupControls=document.createElement('section');pickupControls.className='mara-pickup-controls';pickupControls.hidden=true;pickupControls.setAttribute('aria-label','Holding Mara');
const putDown=document.createElement('button');putDown.textContent='Put Mara down';pickupControls.append(putDown);document.body.append(pickupControls);
let pickup=null;const pickupDuration=1.65;

document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
const observer=new MutationObserver(sync);observer.observe(view,{attributes:true,attributeFilter:['inert']});observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-location']});const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(plane);window.addEventListener('resize',resize);
try{
 const [gltf]=await Promise.all([new GLTFLoader().loadAsync('./mara/mara.glb'),loadMaraSkin(),...(reference?[reference.decode()]:[])]);if(disposed)throw new Error('Mara load cancelled');sourceScene=gltf.scene;rig=createMaraRig(sourceScene);scene.add(rig.group);
 const material=rig.mesh.material.clone();material.transparent=true;material.opacity=.07;material.depthWrite=false;material.onBeforeCompile=shader=>{shader.vertexShader='varying float maraReflectionDepth;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvec4 reflected=modelMatrix*vec4(transformed,1.);maraReflectionDepth=reflected.y;reflected.y=-reflected.y-.012;gl_Position=projectionMatrix*viewMatrix*reflected;');shader.fragmentShader='varying float maraReflectionDepth;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','#include <alphatest_fragment>\ndiffuseColor.a*=exp(-maraReflectionDepth*3.)*(.55+.45*sin(gl_FragCoord.y*2.5));');};material.customProgramCacheKey=()=> 'mara-static-wet-reflection';
 reflection=new T.SkinnedMesh(rig.mesh.geometry,material);rig.group.add(reflection);reflection.bind(rig.mesh.skeleton,rig.mesh.bindMatrix);reflection.frustumCulled=false;reflection.castShadow=false;
 active=false;loaded=true;fit();fox.hidden=false;document.querySelector('.ground-tag').hidden=true;fox.setAttribute('aria-label','Examine Mara, the abandoned stuffed fox');fox.addEventListener('click',inspect,true);canvas.dataset.ready='true';resize();active=false;sync();
}catch(error){canvas.dataset.ready='failed';console.error('Mara could not load',error);}
function resetPickup(){pickup=null;pickupControls.hidden=true;if(reflection)reflection.visible=true;canvas.dataset.inspection='none';}
function pickupTarget(){
 const savedPosition=rig.group.position.clone(),savedRotation=rig.group.quaternion.clone();
 rig.group.position.set(0,0,0);rig.group.rotation.set(0,.18,0);rig.heldPose();
 const box=new T.Box3().setFromObject(rig.mesh,true),size=box.getSize(new T.Vector3()),offset=box.getCenter(new T.Vector3()),r=plane.getBoundingClientRect(),tan=Math.tan(T.MathUtils.degToRad(camera.fov/2));
 const depth=Math.max(size.y*r.height/(2*tan*innerHeight*.8),size.x*r.height/(2*tan*innerWidth*.86),camera.near+size.z*1.5);
 const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((innerWidth/2-r.left)/r.width*2-1,1-(innerHeight*.47-r.top)/r.height*2),camera);
 const forward=camera.getWorldDirection(new T.Vector3());const target=ray.ray.at(depth/ray.ray.direction.dot(forward),new T.Vector3()).sub(offset);
 rig.group.position.copy(target);
 // Refine the framing in the visible viewport, including mobile cover crops.
 const right=new T.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new T.Vector3(0,1,0).applyQuaternion(camera.quaternion);
 for(let i=0;i<6;i++){
  rig.group.rotation.set(0,Math.atan2(camera.position.x-rig.group.position.x,camera.position.z-rig.group.position.z),0);rig.heldPose();
  const b=projectedBounds(),w=(b.right-b.left)/1536*r.width,h=(b.bottom-b.top)/1024*r.height,ratio=Math.max(w/(innerWidth*.86),h/(innerHeight*.8));
  const d=-camera.worldToLocal(rig.group.position.clone()).z;
  rig.group.position.addScaledVector(forward,d*(ratio-1));rig.group.updateMatrixWorld(true);rig.mesh.skeleton.update();
  const aligned=projectedBounds(),x=r.left+(aligned.left+aligned.right)/2/1536*r.width,y=r.top+(aligned.top+aligned.bottom)/2/1024*r.height,k=2*tan*(-camera.worldToLocal(rig.group.position.clone()).z)/r.height;
  rig.group.position.addScaledVector(right,(innerWidth/2-x)*k).addScaledVector(up,(y-innerHeight*.47)*k);
 }
 pickup.heldYaw=rig.group.rotation.y;target.copy(rig.group.position);rig.group.position.copy(savedPosition);rig.group.quaternion.copy(savedRotation);return target;
}
function posePickup(){
 const state=pickup,elapsed=state.elapsed,u=reduced.matches||still?1:ease(elapsed/pickupDuration),amount=state.phase==='lowering'?(state.lowerFrom??1)*(1-u):u;state.amount=amount;
 if(state.phase==='lifting'&&u>=1)state.phase='held';
 const sway=state.phase==='held'&&!reduced.matches&&!still?Math.sin((elapsed-pickupDuration)*.85)*.003:0;
 rig.group.scale.setScalar(fitted.scale);const target=state.target?new T.Vector3(...state.target):pickupTarget();state.target=target.toArray();
 rig.group.rotation.set(0,poseParameters.yaw,0);rig.group.quaternion.slerp(new T.Quaternion().setFromEuler(new T.Euler(0,state.heldYaw,0)),amount);rig.group.position.fromArray(fitted.position).lerp(target,amount);rig.group.position.y+=Math.sin(Math.PI*amount)*fitted.scale*.12;
 const right=new T.Vector3(1,0,0).applyQuaternion(camera.quaternion);rig.group.position.addScaledVector(right,sway*fitted.scale);rig.group.rotation.z+=sway;
 const lag=reduced.matches||still?0:.07*Math.sin(elapsed*7)*Math.exp(-elapsed*2.4)+sway*2;
 const loosen=ease((amount-.08)/.62);rig.heldPose(lag,loosen);
 for(let i=0;i<rig.bones.length;i++){const bone=rig.bones[i];bone.position.lerpVectors(restBones[i].p,bone.position,loosen);bone.quaternion.copy(restBones[i].q.clone().slerp(bone.quaternion,loosen));}
 rig.group.updateMatrixWorld(true);rig.mesh.skeleton.update();canvas.dataset.inspection=state.phase;
 if(state.phase==='lowering'&&u>=1){resetPickup();animatePose();fox.focus({preventScroll:true});}
}
function inspect(event){
 event?.stopImmediatePropagation();if(!loaded||view.inert||pickup||time<end)return;
 cancel();mode='model';pickup={phase:'lifting',elapsed:0,target:null};pickupControls.hidden=false;draw();last=0;if(!frame)frame=requestAnimationFrame(tick);putDown.focus({preventScroll:true});
}
function lowerPickup(){if(!pickup||pickup.phase==='lowering')return;pickup.lowerFrom=pickup.amount;pickup.phase='lowering';pickup.elapsed=0;draw();last=0;if(!frame)frame=requestAnimationFrame(tick);}
putDown.addEventListener('click',lowerPickup);
function pickupKeys(event){if(pickup&&event.key==='Escape'){event.preventDefault();lowerPickup();}}document.addEventListener('keydown',pickupKeys);
function show(value){resetPickup();cancel();time=end;mode=local?value:'model';draw();}
if(local){const section=document.createElement('section');section.className='mara-review-panel';section.style.cssText='position:fixed;left:12px;top:12px;z-index:100;background:#10151ded;color:#ffe4b5;padding:10px;border:1px solid #a78c5d;border-radius:6px;max-width:360px;font:13px system-ui';
 for(const [label,value]of[['3D Mara','model'],['Original 2D fox','original'],['Overlay reference','overlay']]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>show(value);b.style.cssText='padding:7px;margin:2px;cursor:pointer';section.append(b);}
 const pickupButton=document.createElement('button');pickupButton.textContent='Preview pickup';pickupButton.onclick=()=>{seek(end);inspect();};pickupButton.style.cssText='padding:7px;margin:2px;cursor:pointer';section.append(pickupButton);
 const replayButton=document.createElement('button');replayButton.textContent='Replay Mara';replayButton.onclick=replay;replayButton.style.cssText='padding:7px;margin:2px;cursor:pointer';section.prepend(replayButton);slider=document.createElement('input');slider.type='range';slider.min=0;slider.max=end;slider.step=.01;slider.value=end;slider.setAttribute('aria-label','Mara sequence timeline');slider.style.cssText='display:block;width:100%';slider.oninput=()=>seek(+slider.value);section.append(slider);
 panel=document.createElement('output');panel.style.display='block';panel.style.paddingTop='6px';section.append(panel);document.body.append(section);draw();}
window.MaraMidway={show,replay,seek:local?seek:undefined,diagnostics:local?()=>({projected:projectedBounds(),route,position:rig.group.position.toArray(),yaw:rig.group.rotation.y,heading:[Math.sin(rig.group.rotation.y),0,Math.cos(rig.group.rotation.y)],support:rig.supportState(),joints:Object.fromEntries(Object.entries(rig.named).map(([name,b])=>[name,b.getWorldPosition(new T.Vector3()).toArray()])),groundMin:rig.lowest().p[1]*rig.group.scale.y+rig.group.position.y,bones:rig.bones.map(b=>({p:b.position.toArray(),q:b.quaternion.toArray()}))}):undefined,regions:()=>({bounds:rig?.regionBounds(),lowest:rig?.lowest()}),configure:local?parameters=>{Object.assign(poseParameters,parameters);fit();draw();}:undefined,state:()=>({loaded,active,playing,time,end,runEnd,stepEnd,turnEnd,visit,phase:canvas.dataset.phase,draws,mode,fitted,poseParameters:{...poseParameters},pickup:pickup&&{...pickup},camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),fov:camera.fov,zoom:camera.zoom},scale:rig?.group.scale.x,stats:rig?.stats}),dispose(){if(disposed)return;disposed=true;cancel();document.removeEventListener('visibilitychange',sync);reduced.removeEventListener('change',sync);resetPickup();pickupControls.remove();document.removeEventListener('keydown',pickupKeys);observer.disconnect();resizeObserver.disconnect();window.removeEventListener('resize',resize);fox.removeEventListener('click',inspect,true);rig?.dispose();reflection?.material.dispose();floor.geometry.dispose();floor.material.dispose();sourceScene?.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const v of Object.values(o.material))if(v?.isTexture)v.dispose();o.material.dispose();}});renderer.dispose();renderer.forceContextLoss();canvas.remove();document.querySelector('.mara-review-panel')?.remove();removeEventListener('pagehide',onPageHide);}};
// Explicit local preview: wait for the Midway to be active, then show the lift.
if(local&&loaded&&new URLSearchParams(location.search).get('pickup-review')==='autoplay'){const preview=()=>{if(disposed)return;if(!active||document.hidden){setTimeout(preview,100);return;}seek(end);inspect();};setTimeout(preview,400);}
function onPageHide(event){if(!event.persisted)window.MaraMidway?.dispose();}addEventListener('pagehide',onPageHide);
