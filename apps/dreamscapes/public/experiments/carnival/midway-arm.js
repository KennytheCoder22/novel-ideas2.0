import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

// The supplied right-arm GLB is used byte-for-byte: no geometry, weights or maps
// are regenerated. Animation only poses its existing 22-joint skeleton.
const plane = document.querySelector('.composition');
const view = plane?.parentElement;
const sign = plane?.querySelector('.carnival-exit');
const prop = sign?.parentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const review = new URLSearchParams(location.search).get('arm') === 'review';
const END = 11.8;
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t*t*(3-2*t); };
const lerp = (a,b,t) => a+(b-a)*smooth(t);
const v3 = (x,y,z=0) => new THREE.Vector3(x,1024-y,z);
const mix = (a,b,t) => a.clone().lerp(b,smooth(t));
const Z = new THREE.Vector3(0,0,1), Y = new THREE.Vector3(0,1,0);

if (plane && sign) {
 const host = document.createElement('div');
 host.className = 'midway-creature'; host.setAttribute('aria-hidden','true');
 host.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:6;visibility:hidden';
 host.dataset.phase = 'loading'; plane.append(host);
 let renderer, scene, camera, model, bones, rest, restWorldWrist, armReady=false, modelBasePosition;
 let raf=0,delay=0,active=false,done=false,elapsed=0,last=0,loadFailed=false;
 let shoulder, upper, elbow, wrist, palm, L1,L2, emergenceMask;
 const fingerNames = [[9,8,7,6],[17,16,15,14],[21,20,19,18],[13,12,11,10]];
 const world = o => o.getWorldPosition(new THREE.Vector3());
 const boneName = i => `Bone_${String(i).padStart(3,'0')}`;
 const visible = () => !view.inert && view.style.visibility !== 'hidden' && !document.hidden;
 const target = () => { const k=1536/plane.offsetWidth; return v3((prop.offsetLeft+prop.offsetWidth*.81)*k,(prop.offsetTop+prop.offsetHeight*.04)*k,38); };
 function worldQuaternion(b,q) { b.quaternion.copy(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q)); b.updateWorldMatrix(false,true); }
 function aim(b, child, point) {
  const p=world(b), from=world(child).sub(p).normalize(), to=point.clone().sub(p).normalize();
  const delta=new THREE.Quaternion().setFromUnitVectors(from,to);
  worldQuaternion(b,delta.multiply(b.getWorldQuaternion(new THREE.Quaternion())));
 }
 function solveArm(point, reaching) {
  const a=world(upper),delta=point.clone().sub(a),d=Math.min(L1+L2-.1,Math.max(Math.abs(L1-L2)+.1,delta.length()));
  // Bend toward the opening, rather than toward an arbitrary screen side.
  const dir=delta.normalize(), opening=v3(lerp(286,254,reaching),622,-4).sub(a);
  const side=opening.addScaledVector(dir,-opening.dot(dir)).normalize();
  const along=(L1*L1-L2*L2+d*d)/(2*d),h=Math.sqrt(Math.max(0,L1*L1-along*along));
  const e=a.clone().addScaledVector(dir,along).addScaledVector(side,h);
  aim(upper,elbow,e); aim(elbow,wrist,a.clone().addScaledVector(dir,d));
 }
 function occluder(points,z) {
  const shape=new THREE.Shape(); points.forEach(([x,y],i)=>i?shape.lineTo(x,1024-y):shape.moveTo(x,1024-y));shape.closePath();
  const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true,side:THREE.DoubleSide}));
  mesh.position.z=z;mesh.renderOrder=-10;scene.add(mesh);return mesh;
 }
 function resize() {
  if(!renderer)return;
  // One fixed crop; CSS registration and visible pixel density follow the scene.
  const scale=plane.clientWidth/1536;
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
  renderer.setSize(Math.max(1,Math.round(440*scale)),Math.max(1,Math.round(410*scale)),false);
  renderer.domElement.style.cssText='position:absolute;left:3.90625%;top:43.9453125%;width:28.64583333%;height:40.0390625%;pointer-events:none';
  if(armReady && active)renderer.render(scene,camera);
 }
 function pose(t) {
  if(!armReady)return;
  const reach=smooth((t-7.2)/1.8)*(1-smooth((t-9.8)/1));
  model.position.copy(modelBasePosition);model.position.x-=reach*25;model.position.y+=reach*15;
  for(const [b,q] of rest)b.quaternion.copy(q);
  model.updateMatrixWorld(true);
  const contact=target();
  let p,roll,turn,fall=0;
  const rim=v3(287,620,24), feelEnd=rim.clone();
  const reachEnd=contact.clone().add(new THREE.Vector3(18,25,-3));
  if(t<2.6){p=mix(v3(287,684,-26),rim,t/2.6);roll=lerp(-Math.PI,-.45,t/2.6);turn=lerp(-.2,.1,t/2.6);}
  else if(t<7.2){
   const s=t-2.6;
   // Nonperiodic wrist contacts: settle, slide, two quick pats, pause, scratch.
   const keys=[[0,287,620,24],[.55,284,629,32],[1.1,282,633,34],
    [1.35,282,628,39],[1.49,282,632,30],[1.8,282,632,30],
    [2.02,286,628,38],[2.16,286,632,30],[2.7,286,632,30],
    [3.15,293,630,32],[3.5,290,632,30],[3.85,292,629,33],[4.6,287,620,24]];
   const i=keys.findIndex((k,i)=>i<keys.length-1 && s>=k[0] && s<=keys[i+1][0]);
   const k=keys[Math.max(0,i)],n=keys[Math.max(0,i)+1];
   p=mix(v3(...k.slice(1)),v3(...n.slice(1)),(s-k[0])/(n[0]-k[0]));
   roll=-.45+Math.sin(s*2.3)*.09;turn=.1+Math.sin(s*1.7)*.09;
   if(s>4.1){roll=lerp(roll,-.45,(s-4.1)/.5);turn=lerp(turn,.1,(s-4.1)/.5);}
  } else if(t<9){
   const u=smooth((t-7.2)/1.8);
   p=new THREE.QuadraticBezierCurve3(feelEnd,v3(253,610,30),reachEnd).getPoint(u);
   roll=lerp(-.45,-.65,(t-7.2)/1.8);turn=.1;
  } else if(t<9.8){fall=smooth((t-9.12)/.68);p=reachEnd.clone().add(new THREE.Vector3(fall*9,-fall*3,0));roll=-.65;turn=.1;}
  else if(t<10.8){fall=1;const u=smooth(t-9.8),start=reachEnd.clone().add(new THREE.Vector3(9,-3,0));p=new THREE.QuadraticBezierCurve3(start,v3(253,610,30),rim).getPoint(u);roll=lerp(-.65,-.45,t-9.8);turn=.1;}
  else {fall=1;const u=t-10.8;p=mix(rim,v3(287,684,-26),u);roll=lerp(-.45,-Math.PI,u);turn=lerp(.1,-.2,u);}
  aim(shoulder,upper,v3(286-reach*25,653-reach*15,-12));
  solveArm(p,reach);
  // The front wall always occludes the concealed shoulder/upper arm. Only
  // emerging/retracting fingers are additionally hidden below the opening.
  emergenceMask.visible=t<1.7 || t>11.35;
  const rotation=new THREE.Quaternion().setFromAxisAngle(Z,roll).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-.4)).multiply(new THREE.Quaternion().setFromAxisAngle(Y,turn)).multiply(restWorldWrist);
  worldQuaternion(wrist,rotation);
  fingerNames.forEach((chain,i)=>chain.forEach((n,j)=>{
   const b=bones[boneName(n)];let curl;
   if(t<2.6)curl=lerp(.08,.24,t/2.6);
   else if(t<7.2){const s=t-2.6,grip=smooth((s-1.35)/.5)*(1-smooth((s-2.25)/.6));curl=.12+.19*(.5+.5*Math.sin(s*(1.65+i*.17)+i*1.34-j*.28))+.23*grip;}
   else if(t<9)curl=lerp(.28,.08,(t-7.2)/1.8);
   else if(t<9.8)curl=.14;
   else curl=lerp(.14,.05,(t-9.8)/2);
   // Original local axes differ per digit; modest flexion preserves the skin.
   b.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),curl*(j===0?.55:1)));
  }));
  model.updateMatrixWorld(true);
  const settle=t>9.8?Math.sin((t-9.8)*22)*Math.exp(-(t-9.8)*8)*4:0;
  sign.style.transformOrigin='88% 96%';
  sign.style.transform=fall?`translateX(${fall*12}%) scaleY(${1-fall*.65}) rotate(${fall*76+settle}deg)`:'';
  host.dataset.phase=t<2.6?'emerge':t<7.2?'feel':t<9?'reach':t<9.8?'push':t<END?'retreat':'fallen';
  host.style.visibility=t>=END?'hidden':'visible';renderer.render(scene,camera);
 }
 function reset(){cancelAnimationFrame(raf);clearTimeout(delay);raf=delay=0;active=false;done=false;elapsed=0;host.style.visibility='hidden';sign.style.transform='';host.dataset.phase='waiting';}
 function tick(now){if(!active)return;if(!visible()){last=now;raf=requestAnimationFrame(tick);return;}elapsed+=Math.min(.1,(now-last)/1000);last=now;pose(elapsed);if(elapsed<END)raf=requestAnimationFrame(tick);else{active=false;done=true;}}
 function begin(){delay=0;if(!visible()||reduced.matches||done||!armReady)return;active=true;last=performance.now();raf=requestAnimationFrame(tick);}
 function visit(){if(!visible()){if(view.inert||view.style.visibility==='hidden')reset();return;}if(armReady&&!delay&&!active&&!done&&!reduced.matches)delay=setTimeout(begin,15000+Math.random()*5000);}
 new MutationObserver(visit).observe(view,{attributes:true,attributeFilter:['inert','style']});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(delay);delay=0;}else{last=performance.now();visit();}});
 reduced.addEventListener('change',()=>{reset();visit();});
 sign.addEventListener('click',()=>{cancelAnimationFrame(raf);clearTimeout(delay);active=false;host.style.visibility='hidden';});
 async function load(){
  try{
   renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,premultipliedAlpha:true});
   renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0,0);host.append(renderer.domElement);
   scene=new THREE.Scene();camera=new THREE.OrthographicCamera(60,500,574,164,.1,2000);camera.position.z=1000;
   scene.add(new THREE.HemisphereLight(0xc6cedb,0x70533d,1.3));
   const moon=new THREE.DirectionalLight(0xdbe5ef,2.1);moon.position.set(400,900,400);scene.add(moon);
   const warm=new THREE.DirectionalLight(0xffcda0,1.7);warm.position.set(-300,600,200);scene.add(warm);
   const gltf=await new GLTFLoader().loadAsync('./midway-arm/right-arm-rigged.glb');model=gltf.scene;scene.add(model);
   bones={};model.traverse(o=>{if(o.isBone)bones[o.name]=o;if(o.isSkinnedMesh)o.frustumCulled=false;});
   if(Object.keys(bones).length!==22)throw Error('Unexpected arm rig');
   rest=Object.values(bones).map(b=>[b,b.quaternion.clone()]);
   shoulder=bones.Bone_005;upper=bones.Bone_004;elbow=bones.Bone_003;wrist=bones.Bone_002;palm=bones.Bone_001;
   model.updateMatrixWorld(true);restWorldWrist=wrist.getWorldQuaternion(new THREE.Quaternion());
   model.scale.setScalar(84);model.updateMatrixWorld(true);
   model.position.add(v3(286,672,-14).sub(world(shoulder)));model.updateMatrixWorld(true);
   modelBasePosition=model.position.clone();
   L1=world(upper).distanceTo(world(elbow));L2=world(elbow).distanceTo(world(wrist));
   // Depth-only front wood and curved rim: no background pixels are repainted.
   occluder([[241,631],[252,636],[277,640],[308,640],[337,637],[353,631],[363,667],[365,715],[354,744],[336,757],[268,771],[242,754],[235,714],[235,669]],20);
   // Conceal shoulder and everything below the barrel/deck; no sprite masking.
   occluder([[60,763],[500,763],[500,860],[60,860]],200);
   emergenceMask=occluder([[60,638],[500,638],[500,860],[60,860]],200);
   armReady=true;resize();new ResizeObserver(resize).observe(plane);host.dataset.phase='waiting';visit();
  }catch(error){loadFailed=true;host.style.visibility='hidden';host.dataset.phase='unavailable';console.error('Midway arm unavailable; EXIT remains active.',error);renderer?.dispose();}
 }
 if(review)window.MidwayArmReview={seek(t){clearTimeout(delay);cancelAnimationFrame(raf);active=false;pose(t);},reset,begin,state:()=>({active,done,elapsed,phase:host.dataset.phase,ready:armReady,loadFailed}),rig:()=>({scale:model?.scale.toArray(),bones:Object.keys(bones||{}),joints:Object.fromEntries(Object.entries(bones||{}).map(([n,b])=>[n,world(b).toArray()])),wrist:wrist&&world(wrist).toArray(),triangles:renderer?.info.render.triangles}),render:()=>renderer?.render(scene,camera)};
 load();
}
