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
const END = 17.1;
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
 let shoulder, upper, elbow, wrist, palm, L1,L2, emergenceMask, retreatMask, frontWallMask;
 const fingerNames = [[9,8,7,6],[17,16,15,14],[21,20,19,18],[13,12,11,10]];
 const world = o => o.getWorldPosition(new THREE.Vector3());
 const boneName = i => `Bone_${String(i).padStart(3,'0')}`;
 const visible = () => !view.inert && view.style.visibility !== 'hidden' && !document.hidden;
 const target = () => { const k=1536/plane.offsetWidth; return v3((prop.offsetLeft+prop.offsetWidth*.809)*k,(prop.offsetTop+prop.offsetHeight*.105)*k,72); };
 function worldQuaternion(b,q) { b.quaternion.copy(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q)); b.updateWorldMatrix(false,true); }
 function aim(b, child, point) {
  const p=world(b), from=world(child).sub(p).normalize(), to=point.clone().sub(p).normalize();
  const delta=new THREE.Quaternion().setFromUnitVectors(from,to);
  worldQuaternion(b,delta.multiply(b.getWorldQuaternion(new THREE.Quaternion())));
 }
 function solveArm(point, reaching, guideMix=0) {
  const a=world(upper),delta=point.clone().sub(a),d=Math.min(L1+L2-.1,Math.max(Math.abs(L1-L2)+.1,delta.length()));
  // Bend toward the opening, rather than toward an arbitrary screen side.
  const dir=delta.normalize(), opening=v3(lerp(286,254,reaching),622,-4).sub(a);
  // A fixed relative guide avoids a pole crossing while the shoulder rises.
  opening.lerp(new THREE.Vector3(40,0,40),guideMix);
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
 function poseOpening(t) {
  if(!armReady)return;
  const reach=0;
  model.position.copy(modelBasePosition);model.position.x-=reach*25;model.position.y+=reach*15;
  for(const [b,q] of rest)b.quaternion.copy(q);
  model.updateMatrixWorld(true);

  let p,roll,turn;
  const rim=v3(287,620,24);

  if(t<1.4){
   // Rise fingers-up behind the lip before any part can drape over the front.
   p=mix(v3(287,684,-26),v3(287,590,12),t/1.4);roll=-Math.PI;turn=-.2;
  }else if(t<2.6){
   const u=(t-1.4)/1.2;
   p=mix(v3(287,590,12),rim,u);roll=lerp(-Math.PI,-.45,u);turn=lerp(-.2,.1,u);
  }
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
  }
  aim(shoulder,upper,v3(286-reach*25,653-reach*15,-12));
  solveArm(p,reach);
  // The front wall always occludes the concealed shoulder/upper arm. Only
  // emerging/retracting fingers are additionally hidden below the opening.
  emergenceMask.visible=t<1.4;retreatMask.visible=false;frontWallMask.position.z=t<2.6?lerp(35,20,(t-1.9)/.7):20;
  const rotation=new THREE.Quaternion().setFromAxisAngle(Z,roll).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-.4)).multiply(new THREE.Quaternion().setFromAxisAngle(Y,turn)).multiply(restWorldWrist);
  worldQuaternion(wrist,rotation);
  fingerNames.forEach((chain,i)=>chain.forEach((n,j)=>{
   const b=bones[boneName(n)];let curl;
   if(t<2.6)curl=lerp(.08,.24,t/2.6);
   else if(t<7.2){const s=t-2.6,grip=smooth((s-1.35)/.5)*(1-smooth((s-2.25)/.6));curl=.12+.19*(.5+.5*Math.sin(s*(1.65+i*.17)+i*1.34-j*.28))+.23*grip;}

   // Original local axes differ per digit; modest flexion preserves the skin.
   b.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),curl*(j===0?.55:1)));
  }));
  model.updateMatrixWorld(true);
  sign.style.transform='';
  host.dataset.phase=t<2.6?'emerge':'feel';
  host.style.visibility='visible';renderer.render(scene,camera);
 }
 // Only post-search choreography changes; the opening poses above stay intact.
 const timing=Object.freeze({idea:7.2,reach:8.45,explore:10.25,prepare:12.75,
  flick:13.15,fall:13.27,land:14.0,return:14.25,descend:15.4,end:END});
 const INDEX=2; // Bone_021..018: long digit immediately beside the thumb.
 const pivot={x:.955,y:.918};
 let contactError=0,contactTarget=null,signAngle=0;
 const phaseAt=t=>t<2.6?'emerge':t<timing.idea?'feel':t<timing.reach?'idea':
  t<timing.explore?'reach':t<timing.prepare?'explore':t<timing.flick?'prepare':
  t<timing.land?'flick':t<timing.return?'pause':t<END?'retreat':'fallen';
 function fingertip(i=INDEX) {
  // The terminal joint is the tip in this supplied rig (not an invented digit).
  return world(bones[boneName(fingerNames[i][3])]);
 }
 function wristRotation(roll,turn) {
  return new THREE.Quaternion().setFromAxisAngle(Z,roll)
   .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-.4))
   .multiply(new THREE.Quaternion().setFromAxisAngle(Y,turn)).multiply(restWorldWrist);
 }
 function signFall(t) {
  // Actual right-foot contact in the supplied 1122x1402 artwork. Rotating the
  // clipped native anchor keeps both artwork and hit silhouette rigid/aligned.
  const sideAngle=90+Math.atan2((pivot.x-.809)*prop.offsetWidth,
   (pivot.y-.105)*prop.offsetHeight)*180/Math.PI;
  let angle=0;
  if(t>=timing.fall && t<timing.land){
   const u=(t-timing.fall)/(timing.land-timing.fall);
   // Angular acceleration after the finger has already started its flick.
   angle=sideAngle*u*u;
  }else if(t>=timing.land){
   const s=t-timing.land;
   angle=sideAngle-Math.sin(Math.min(1,s/.32)*Math.PI)*Math.exp(-s*4)*2;
  }
  signAngle=angle;
  sign.style.transformOrigin=(pivot.x*100)+'% '+(pivot.y*100)+'%';
  sign.style.transform=angle?'rotate('+angle+'deg)':'';
 }
 function postSearchCurl(t,i,j) {
  const searchEnd=.12+.19*(.5+.5*Math.sin(4.6*(1.65+i*.17)+i*1.34-j*.28));
  if(t<timing.reach)return lerp(searchEnd,.18,(t-timing.idea)/1.25);
  if(t<timing.explore)return lerp(.18,i===INDEX?.07:.22,(t-timing.reach)/1.8);
  if(t<timing.prepare){
   const s=(t-timing.explore)/2.5;
   // Light edge trace, brief grip, release, then a confirming touch.
   const grip=smooth((s-.35)/.18)*(1-smooth((s-.66)/.16));
   return i===INDEX?.07+.21*grip:i===1?.22+.13*grip:.22+.06*grip;
  }
  if(t<timing.flick)return lerp(i===INDEX?.07:.22,i===INDEX?.38:.46,
   (t-timing.prepare)/.4);
  if(t<timing.return)return i===INDEX?lerp(.38,-.04,(t-timing.flick)/.22):.46;
  return lerp(i===INDEX?-.04:.46,.08,(t-timing.return)/(timing.descend-timing.return));
 }
 function pose(t) {
  if(!armReady)return;
  contactError=0;contactTarget=null;
  if(t<timing.idea){poseOpening(t);return;}
  // The shoulder rises inside the opening; the forearm passes over the near lip.
  const reaching=smooth((t-timing.reach)/1.8)*(1-smooth((t-timing.return)/1.15));
  model.position.copy(modelBasePosition);model.position.x-=reaching*12;model.position.y+=reaching*42;model.position.z+=reaching*32;
  for(const [b,q] of rest)b.quaternion.copy(q);
  model.updateMatrixWorld(true);
  const rim=v3(287,620,24),corner=target();
  let roll=-.45,turn=.1,point=rim.clone();
  if(t<timing.reach)turn=lerp(.1,.19,(t-timing.idea)/1.25);
  else if(t<timing.explore){
   roll=lerp(-.45,-1.25,(t-timing.reach)/1.8);
   turn=lerp(.19,.1,(t-timing.reach)/1.8);
  }else if(t<timing.return){roll=-1.25;turn=.1;}
  else {roll=lerp(-1.25,-Math.PI,(t-timing.return)/1.15);turn=lerp(.1,-.2,(t-timing.return)/1.15);}
  const rotation=wristRotation(roll,turn);
  worldQuaternion(wrist,rotation);
  fingerNames.forEach((chain,i)=>chain.forEach((n,j)=>{
   bones[boneName(n)].quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1,0,0),postSearchCurl(t,i,j)*(j===0?.55:1)));
  }));
  model.updateMatrixWorld(true);
  // Solve from the actual articulated index tip. A moving finger must not be
  // approximated by a fixed wrist offset at the sign.
  const offset=fingertip().sub(world(wrist));
  const touch=corner.clone();
  if(t>=timing.explore && t<timing.prepare){
   const s=(t-timing.explore)/2.5;
   const trace=smooth(s/.32)*(1-smooth((s-.68)/.32));
   touch.x-=trace*1.4;touch.y-=trace*7;
   touch.z+=Math.sin(s*Math.PI*2)**2*1.2;
  }else if(t>=timing.flick){
   touch.x+=lerp(0,9,(t-timing.flick)/.22);
   touch.y+=lerp(0,2,(t-timing.flick)/.22);
  }
  const contactWrist=touch.clone().sub(offset);
  if(t>=timing.reach && t<timing.explore){
   const u=smooth((t-timing.reach)/1.8);
   point=new THREE.QuadraticBezierCurve3(rim,v3(265,592,36),contactWrist).getPoint(u);
  }else if(t>=timing.explore && t<timing.return)point=contactWrist;
  else if(t>=timing.descend){
   // Fingers point upward before descending behind the near rim. The wrist
   // follows the same concealed internal origin used by the approved emergence.
   point=new THREE.QuadraticBezierCurve3(v3(287,590,12),v3(322,638,-35),v3(315,684,-40)).getPoint(smooth((t-timing.descend)/(END-timing.descend)));
  }else if(t>=timing.return){
   const u=smooth((t-timing.return)/(timing.descend-timing.return));
   point=new THREE.QuadraticBezierCurve3(contactWrist,v3(267,570,24),v3(287,590,12)).getPoint(u);
  }
  aim(shoulder,upper,v3(286-reaching*12,653-reaching*37,-12+reaching*42));
  solveArm(point,reaching,smooth((t-timing.reach)/1.8));worldQuaternion(wrist,rotation);model.updateMatrixWorld(true);
  emergenceMask.visible=false;retreatMask.visible=t>=timing.descend;frontWallMask.position.z=lerp(20,35,reaching);
  if(t>=timing.explore && t<timing.fall){contactTarget=touch;contactError=fingertip().distanceTo(touch);}
  signFall(t);host.dataset.phase=phaseAt(t);host.style.visibility=t>=END?'hidden':'visible';
  renderer.render(scene,camera);
 }
 function reset(){cancelAnimationFrame(raf);clearTimeout(delay);raf=delay=0;active=false;done=false;elapsed=0;host.style.visibility='hidden';sign.style.transform='';host.dataset.phase='waiting';}
 // A knocked-over prop belongs to the scene, beyond the arm's animation visit.
 // Navigation makes the source inert before it fades, so never stand it up here.
 function leave(){
  const knockedOver=elapsed>=timing.fall;
  reset();
  if(knockedOver){elapsed=END;done=true;signFall(END);host.dataset.phase='fallen';}
 }

 function tick(now){if(!active)return;if(!visible()){last=now;raf=requestAnimationFrame(tick);return;}elapsed+=Math.min(.1,(now-last)/1000);last=now;pose(elapsed);if(elapsed<END)raf=requestAnimationFrame(tick);else{active=false;done=true;}}
 function begin(){delay=0;if(!visible()||reduced.matches||done||!armReady)return;active=true;last=performance.now();raf=requestAnimationFrame(tick);}
 function visit(){if(!visible()){if(view.inert||view.style.visibility==='hidden')leave();return;}if(armReady&&!delay&&!active&&!done&&!reduced.matches)delay=setTimeout(begin,8000+Math.random()*4000);}
 new MutationObserver(visit).observe(view,{attributes:true,attributeFilter:['inert','style']});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(delay);delay=0;}else{last=performance.now();visit();}});
 reduced.addEventListener('change',()=>{leave();visit();});
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
   // Trace the actual front lip (y~623), not the metal hoop below it (y~640).
   frontWallMask=occluder([[241,618],[252,621],[277,623],[308,622],[337,620],[353,618],[363,667],[365,715],[354,744],[336,757],[268,771],[242,754],[235,714],[235,669]],20);
   // Conceal shoulder and everything below the barrel/deck; no sprite masking.
   occluder([[60,763],[500,763],[500,860],[60,860]],200);
   emergenceMask=occluder([[60,623],[500,623],[500,860],[60,860]],200);
   retreatMask=occluder([[60,623],[500,623],[500,860],[60,860]],200);retreatMask.visible=false;
   armReady=true;resize();new ResizeObserver(resize).observe(plane);host.dataset.phase='waiting';visit();
  }catch(error){loadFailed=true;host.style.visibility='hidden';host.dataset.phase='unavailable';console.error('Midway arm unavailable; EXIT remains active.',error);renderer?.dispose();}
 }
 if(review)window.MidwayArmReview={seek(t){clearTimeout(delay);cancelAnimationFrame(raf);active=false;elapsed=t;pose(t);},playFrom(t){reset();elapsed=Math.max(0,Math.min(END,t));begin();},reset,begin,state:()=>({active,done,elapsed,phase:host.dataset.phase,ready:armReady,loadFailed}),rig:()=>({scale:model?.scale.toArray(),phase:host.dataset.phase,timing,indexTip:armReady&&fingertip().toArray(),contactTarget:contactTarget?.toArray(),contactError,signAngle,pivot,bones:Object.keys(bones||{}),joints:Object.fromEntries(Object.entries(bones||{}).map(([n,b])=>[n,world(b).toArray()])),wrist:wrist&&world(wrist).toArray(),triangles:renderer?.info.render.triangles}),render:()=>renderer?.render(scene,camera)};
 load();
}
