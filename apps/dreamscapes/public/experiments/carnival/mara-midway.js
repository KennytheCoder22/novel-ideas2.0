import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {createMaraRig,loadMaraSkin} from './mara-rig.js';
// Endpoint approval only: no arrival, gait, collapse timeline or RAF is active.
const plane=document.querySelector('.composition'),view=plane.closest('main'),fox=plane.querySelector('.fox'),reference=fox.querySelector('img');
const local=['127.0.0.1','localhost'].includes(location.hostname)&&new URLSearchParams(location.search).has('mara-review');
let sourceScene,rig,renderer,scene,camera,loaded=false,disposed=false,active=false,draws=0,mode='model',inspectionCleanup=null;
const poseParameters={yaw:-1.4,bodyRoll:1.5,bodyPitch:.03,headYaw:.52,headRoll:.15,headPitch:-.15,headDrop:.18,headLeft:.15,tailDrop:-.16,bellyForward:.4,pawLift:.18};
const canvas=document.createElement('canvas');canvas.className='mara-canvas';canvas.setAttribute('aria-hidden','true');canvas.dataset.review='static-resting-pose';canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3';plane.append(canvas);
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
 if(!loaded)return;const target=targetBounds(),v=new T.Vector3();
 rig.group.rotation.set(0,poseParameters.yaw,0);rig.group.scale.setScalar(.45);rig.group.position.copy(ground((target.left+target.right)/2,target.bottom));
 for(let i=0;i<7;i++){
  rig.restingPose(poseParameters);let box=projectedBounds();rig.group.scale.multiplyScalar((target.right-target.left)/(box.right-box.left));rig.restingPose(poseParameters);box=projectedBounds();
  v.set(rig.group.position.x,0,rig.group.position.z).project(camera);
  const x=(v.x+1)*768+(target.left+target.right-box.left-box.right)/2,y=(1-v.y)*512+target.bottom-box.bottom;
  const point=ground(x,y);rig.group.position.x=point.x;rig.group.position.z=point.z;
 }
 rig.restingPose(poseParameters);fitted={target,actual:projectedBounds(),scale:rig.group.scale.x,position:rig.group.position.toArray()};
}
function draw(){if(!loaded||disposed||!active)return;canvas.hidden=mode==='original';reference.style.visibility=mode==='model'?'hidden':'visible';reference.style.opacity=mode==='overlay'?'.5':'1';fox.style.zIndex=mode==='overlay'?'4':'3';if(mode!=='original'){renderer.render(scene,camera);draws++;}canvas.dataset.phase='resting';fox.disabled=false;if(panel)panel.textContent=mode==='original'?'Original 2D fox':mode==='overlay'?'Original reference over 3D Mara':'3D Mara — static endpoint only';}
function resize(){if(disposed)return;renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setSize(Math.max(1,Math.round(plane.clientWidth)),Math.max(1,Math.round(plane.clientHeight)),false);draw();}
function sync(){if(disposed)return;active=!view.inert&&(document.documentElement.dataset.location||'midway')==='midway';if(!active)canvas.hidden=true;else draw();}
const observer=new MutationObserver(sync);observer.observe(view,{attributes:true,attributeFilter:['inert']});observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-location']});const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(plane);
try{
 const [gltf]=await Promise.all([new GLTFLoader().loadAsync('./mara/mara.glb'),loadMaraSkin(),reference.decode()]);if(disposed)throw new Error('Mara load cancelled');sourceScene=gltf.scene;rig=createMaraRig(sourceScene);scene.add(rig.group);
 const material=rig.mesh.material.clone();material.transparent=true;material.opacity=.07;material.depthWrite=false;material.onBeforeCompile=shader=>{shader.vertexShader='varying float maraReflectionDepth;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvec4 reflected=modelMatrix*vec4(transformed,1.);maraReflectionDepth=reflected.y;reflected.y=-reflected.y-.012;gl_Position=projectionMatrix*viewMatrix*reflected;');shader.fragmentShader='varying float maraReflectionDepth;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','#include <alphatest_fragment>\ndiffuseColor.a*=exp(-maraReflectionDepth*3.)*(.55+.45*sin(gl_FragCoord.y*2.5));');};material.customProgramCacheKey=()=> 'mara-static-wet-reflection';
 reflection=new T.SkinnedMesh(rig.mesh.geometry,material);rig.group.add(reflection);reflection.bind(rig.mesh.skeleton,rig.mesh.bindMatrix);reflection.frustumCulled=false;reflection.castShadow=false;
 loaded=true;fit();fox.hidden=false;document.querySelector('.ground-tag').hidden=true;fox.setAttribute('aria-label','Examine Mara, the abandoned stuffed fox');fox.addEventListener('click',inspect,true);canvas.dataset.ready='true';resize();sync();
}catch(error){canvas.dataset.ready='failed';console.error('Mara could not load',error);}
function inspect(event){
 event?.stopImmediatePropagation();if(!loaded||view.inert||inspectionCleanup)return;
 const dialog=document.querySelector('.inspection'),art=dialog.querySelector('.inspection-art');art.replaceChildren();
 const c=document.createElement('canvas');c.style.cssText='width:min(90vw,850px);height:min(75vh,650px)';art.append(c);
 const r=new T.WebGLRenderer({canvas:c,alpha:true,antialias:true});r.setPixelRatio(Math.min(devicePixelRatio||1,1.5));const s=new T.Scene();s.add(new T.HemisphereLight(0xffd79b,0x252333,1));const light=new T.DirectionalLight(0xffbf7d,2);light.position.set(-2,4,3);s.add(light);
 const model=createMaraRig(sourceScene);s.add(model.group);model.group.rotation.y=poseParameters.yaw;model.restingPose(poseParameters);
 const cam=new T.PerspectiveCamera(38,1,.1,30);cam.position.set(0,1.5,3.6);cam.lookAt(0,.45,0);
 const render=()=>{const b=c.getBoundingClientRect();r.setSize(b.width,b.height,false);cam.aspect=b.width/b.height;cam.updateProjectionMatrix();r.render(s,cam);};dialog.showModal();render();const ro=new ResizeObserver(render);ro.observe(c);
 const close=()=>{ro.disconnect();model.dispose();r.dispose();r.forceContextLoss();dialog.removeEventListener('close',close);inspectionCleanup=null;fox.focus({preventScroll:true});};inspectionCleanup=close;dialog.addEventListener('close',close);
}
function show(value){mode=value;draw();}
if(local){const section=document.createElement('section');section.className='mara-review-panel';section.style.cssText='position:fixed;left:12px;top:12px;z-index:100;background:#10151ded;color:#ffe4b5;padding:10px;border:1px solid #a78c5d;border-radius:6px;max-width:360px;font:13px system-ui';
 for(const [label,value]of[['3D Mara','model'],['Original 2D fox','original'],['Overlay reference','overlay']]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>show(value);b.style.cssText='padding:7px;margin:2px;cursor:pointer';section.append(b);}
 panel=document.createElement('output');panel.style.display='block';panel.style.paddingTop='6px';section.append(panel);document.body.append(section);draw();}
window.MaraMidway={show,regions:()=>({bounds:rig?.regionBounds(),lowest:rig?.lowest()}),configure:local?parameters=>{Object.assign(poseParameters,parameters);fit();draw();}:undefined,state:()=>({loaded,active,playing:false,phase:'static-resting-pose',draws,mode,fitted,poseParameters:{...poseParameters},stats:rig?.stats}),dispose(){if(disposed)return;disposed=true;inspectionCleanup?.();observer.disconnect();resizeObserver.disconnect();fox.removeEventListener('click',inspect,true);rig?.dispose();reflection?.material.dispose();floor.geometry.dispose();floor.material.dispose();sourceScene?.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const v of Object.values(o.material))if(v?.isTexture)v.dispose();o.material.dispose();}});renderer.dispose();renderer.forceContextLoss();canvas.remove();document.querySelector('.mara-review-panel')?.remove();removeEventListener('pagehide',onPageHide);}};
function onPageHide(event){if(!event.persisted)window.MaraMidway?.dispose();}addEventListener('pagehide',onPageHide);
