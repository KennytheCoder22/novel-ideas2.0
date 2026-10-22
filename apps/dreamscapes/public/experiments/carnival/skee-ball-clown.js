import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {createMachineSpace} from './skee-ball-space.js';

export async function mountClown({game,plane,ui,isActive,reduced,onReady,onMachineReady,onComplete}) {
 const canvas=document.createElement('canvas');canvas.className='skee-clown-canvas';canvas.setAttribute('aria-hidden','true');game.append(canvas);
 const renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true});renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.VSMShadowMap;
 const scene=new T.Scene(),space=createMachineSpace(scene,()=>draw()),camera=space.camera;
 // Low warm ambient, shaded shelf recess, amber key. Original PBR colors/maps are untouched.
 const ambient=new T.HemisphereLight(0xf2bd78,0x301c15,.16);scene.add(ambient);
 const key=new T.DirectionalLight(0xffbd70,1.45);key.position.set(3,5,-1);key.target.position.set(0,.3,4);key.castShadow=true;
 key.shadow.mapSize.set(1024,1024);key.shadow.blurSamples=8;Object.assign(key.shadow.camera,{left:-4,right:4,top:5,bottom:-4,near:.1,far:18});key.shadow.bias=-.00015;key.shadow.normalBias=.006;key.shadow.radius=4;scene.add(key,key.target);
 const shelfBulb=new T.PointLight(0xff9e43,2.4,5,2);shelfBulb.position.set(3.1,1.9,5.6);scene.add(shelfBulb);
 const fill=new T.DirectionalLight(0xe2b989,.18);fill.position.set(-3,2,-3);scene.add(fill);
 const clamp=T.MathUtils.clamp,lerp=T.MathUtils.lerp,smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
 let time=0,playing=false,requested=false,roundTriggered=false,previewOnly=false,notified=false,disposed=false,frame=0,last=0;
 let model,root,mixer,mesh,clip,scale,idleOrigin,runOrigin,idleQuats=[],runQuats=[],clipSamplers=[],feet={Left:[],Right:[]},contacts=[],bodyHeight=.7,runDuration=5;
 let timings={launch:.55,land:1.6,run:2.19,evaporate:7.22,bodyGone:9.22,pomGone:9.94,end:12.6};
 const dissolveClock={value:0},cut={value:-20},pomOpacity={value:1},pomLift={value:0},pomFloor={value:.65};
 const fadeNoise=`float vnHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);} float vnNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(vnHash(i),vnHash(i+vec3(1,0,0)),f.x),mix(vnHash(i+vec3(0,1,0)),vnHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(vnHash(i+vec3(0,0,1)),vnHash(i+vec3(1,0,1)),f.x),mix(vnHash(i+vec3(0,1,1)),vnHash(i+vec3(1,1,1)),f.x),f.y),f.z);}`;
const MAX=680,positions=new Float32Array(MAX*3),sizes=new Float32Array(MAX*2),turns=new Float32Array(MAX),alphas=new Float32Array(MAX),seeds=new Float32Array(MAX);
const vaporGeometry=new T.InstancedBufferGeometry();vaporGeometry.index=new T.BufferAttribute(new Uint16Array([0,1,2,0,2,3]),1);vaporGeometry.setAttribute('position',new T.BufferAttribute(new Float32Array([-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0]),3));vaporGeometry.setAttribute('uv',new T.BufferAttribute(new Float32Array([0,0,1,0,1,1,0,1]),2));vaporGeometry.setAttribute('center',new T.InstancedBufferAttribute(positions,3));vaporGeometry.setAttribute('extent',new T.InstancedBufferAttribute(sizes,2));vaporGeometry.setAttribute('turn',new T.InstancedBufferAttribute(turns,1));vaporGeometry.setAttribute('opacity',new T.InstancedBufferAttribute(alphas,1));vaporGeometry.setAttribute('seed',new T.InstancedBufferAttribute(seeds,1));vaporGeometry.instanceCount=MAX;
const vaporMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,blending:T.NormalBlending,uniforms:{clock:{value:0}},vertexShader:`attribute vec3 center;attribute vec2 extent;attribute float turn,opacity,seed;varying vec2 vUv;varying float vAlpha,vSeed;void main(){vUv=uv;vAlpha=opacity;vSeed=seed;vec2 q=position.xy*extent;float c=cos(turn),s=sin(turn);q=mat2(c,-s,s,c)*q;vec4 p=viewMatrix*vec4(center,1.);p.xy+=q;gl_Position=projectionMatrix*p;}`,fragmentShader:`uniform float clock;varying vec2 vUv;varying float vAlpha,vSeed;${fadeNoise} void main(){vec2 p=(vUv-.5)*2.;float bend=.25*sin(p.y*3.5+vSeed*9.+clock*.8);float edge=1.-smoothstep(.2,1.,length(vec2((p.x+bend)*1.35,p.y)));float n=vnNoise(vec3(vUv*5.+vSeed*11.,clock*.25));float strands=.28+.72*vnNoise(vec3(vUv.x*11.+vUv.y*3.,vUv.y*3.,vSeed*19.+clock*.3));float a=edge*edge*strands*(.4+.6*n)*vAlpha;if(a<.001)discard;vec3 color=mix(vec3(.58,.66,.74),vec3(.91,.91,.85),n);gl_FragColor=vec4(color,a);}`});
const vapor=new T.Mesh(vaporGeometry,vaporMaterial);vapor.frustumCulled=false;vapor.renderOrder=2;scene.add(vapor);
let rng=2817;const rand=()=>{rng=(rng*1664525+1013904223)>>>0;return rng/4294967296;};
const wisps=Array.from({length:MAX},()=>({vertex:0,seed:rand(),delay:rand(),size:rand(),twist:rand()*Math.PI*2,anchor:new T.Vector3(),born:0}));

 // Procedural contact occlusion is placed on world-space surfaces, not painted into the image.
 const shadeCanvas=document.createElement('canvas');shadeCanvas.width=shadeCanvas.height=128;
 const sc=shadeCanvas.getContext('2d'),gradient=sc.createRadialGradient(64,64,4,64,64,64);gradient.addColorStop(0,'rgba(0,0,0,.8)');gradient.addColorStop(.4,'rgba(0,0,0,.4)');gradient.addColorStop(1,'rgba(0,0,0,0)');sc.fillStyle=gradient;sc.fillRect(0,0,128,128);
 const shadeTexture=new T.CanvasTexture(shadeCanvas),contactMaterial=new T.MeshBasicMaterial({map:shadeTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
 function contactShade(w,d){const m=new T.Mesh(new T.PlaneGeometry(w,d),contactMaterial.clone());m.rotation.x=-Math.PI/2;m.renderOrder=-8;scene.add(m);return m;}
 const shelfAO=contactShade(.55,.35),footShadows=[contactShade(.24,.16),contactShade(.24,.16)];
 shelfAO.position.copy(space.shelfFoot);shelfAO.position.y+=.004;

 function sampleClip(t){const phase=((t%clip.duration)+clip.duration)%clip.duration;for(const s of clipSamplers)s.binding.setValue(s.interpolant.evaluate(phase),0);}
 function orient(boneName,childName,direction){
  const b=model.getObjectByName(boneName),c=model.getObjectByName(childName);if(!b||!c)return;
  model.updateMatrixWorld(true);const a=b.getWorldPosition(new T.Vector3()),d=c.getWorldPosition(new T.Vector3()).sub(a).normalize(),q=b.getWorldQuaternion(new T.Quaternion());
  q.premultiply(new T.Quaternion().setFromUnitVectors(d,new T.Vector3(...direction).normalize()));b.quaternion.copy(b.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));model.updateMatrixWorld(true);
 }
 function seatPose(){for(const side of ['Left','Right']){orient('mixamorig'+side+'UpLeg','mixamorig'+side+'Leg',[0,.5,1]);orient('mixamorig'+side+'Leg','mixamorig'+side+'Foot',[0,-.45,1]);orient('mixamorig'+side+'Foot','mixamorig'+side+'ToeBase',[0,-.08,1]);}}
 const takeoff=()=>space.shelfFoot.clone(),landing=new T.Vector3(0,0,space.construction.landing),stop=new T.Vector3(0,0,.35);
 let flight=.58;const gravity=9.81/space.construction.metersPerUnit;let jumpPlan=null;
 function motion(t){
  const start=takeoff(),yawFlight=(Math.atan2(-start.x,landing.z-start.z)+2*Math.PI)%(2*Math.PI);
  if(t<timings.launch)return{position:start,yaw:lerp(Math.PI,yawFlight,smooth(.15,timings.launch,t)),stand:0,phase:'preparing'};
  if(t<timings.land){const dt=t-timings.launch,u=dt/flight,v=(.5*gravity*flight*flight-start.y)/flight;return{position:new T.Vector3(lerp(start.x,0,u),start.y+v*dt-.5*gravity*dt*dt,lerp(start.z,landing.z,u)),yaw:yawFlight,stand:smooth(timings.launch,timings.launch+.34,t),phase:'hop'};}
  if(t<timings.run){const u=(t-timings.land)/(timings.run-timings.land);return{position:landing.clone(),yaw:lerp(yawFlight,Math.PI,smooth(0,.7,u)),stand:1,phase:'landing'};}
  const u=clamp((t-timings.run)/runDuration,0,1);
  // Constant world-space travel, timed to the original run cycle's planted-foot stride.
  return{position:new T.Vector3(0,0,lerp(landing.z,stop.z,u)),yaw:Math.PI,stand:1,phase:t<timings.evaporate?'approach':'evaporating'};
 }
 function sampleFeet(){
  const v=new T.Vector3();return ['Left','Right'].map(side=>{let min=Infinity,x=0,z=0,n=0;
   for(const i of feet[side]){mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld);if(v.y<min)min=v.y;x+=v.x;z+=v.z;n++;}
   return{side,y:min,x:x/Math.max(1,n),z:z/Math.max(1,n)};
  });
 }
 function aimWorld(bone,child,target){model.updateMatrixWorld(true);const a=bone.getWorldPosition(new T.Vector3()),from=child.getWorldPosition(new T.Vector3()).sub(a).normalize(),to=target.clone().sub(a).normalize(),q=bone.getWorldQuaternion(new T.Quaternion()).premultiply(new T.Quaternion().setFromUnitVectors(from,to));bone.quaternion.copy(bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));model.updateMatrixWorld(true);}
 function plantLandingFeet(yaw){
  mesh.skeleton.update();const footData=sampleFeet();
  for(const side of ['Left','Right']){
   const thigh=model.getObjectByName('mixamorig'+side+'UpLeg'),shin=model.getObjectByName('mixamorig'+side+'Leg'),foot=model.getObjectByName('mixamorig'+side+'Foot');
   const h=thigh.getWorldPosition(new T.Vector3()),k=shin.getWorldPosition(new T.Vector3()),a=foot.getWorldPosition(new T.Vector3()),sole=footData.find(f=>f.side===side),target=a.clone();target.y-=sole.y;
   const l1=h.distanceTo(k),l2=k.distanceTo(a),delta=target.clone().sub(h),length=clamp(delta.length(),.0001,l1+l2-.0001),dir=delta.normalize(),along=(l1*l1-l2*l2+length*length)/(2*length),bend=Math.sqrt(Math.max(0,l1*l1-along*along));
   const pole=new T.Vector3(Math.sin(yaw),0,Math.cos(yaw));pole.addScaledVector(dir,-pole.dot(dir)).normalize();const knee=h.clone().addScaledVector(dir,along).addScaledVector(pole,bend);
   aimWorld(thigh,shin,knee);aimWorld(shin,foot,target);
  }
 }
 function pose(t){
  const p=motion(t),runTime=t>=timings.run?Math.min(t,timings.evaporate)-timings.run + (t>timings.evaporate?.4*(1-Math.exp(-(t-timings.evaporate)/.4)):0):0;
  sampleClip(t<timings.run?.11:runTime);if(t<timings.run)for(const [bone,q] of runQuats)bone.quaternion.copy(q);
  let seated=1-p.stand;if(t>=timings.launch&&t<timings.land)seated=Math.min(1,seated+1.0*Math.sin(Math.PI*(t-timings.launch)/flight));if(t>=timings.land&&t<timings.run)seated=.18*Math.sin((t-timings.land)/(timings.run-timings.land)*Math.PI);
  for(const [bone,q] of idleQuats){if(seated>=1)bone.quaternion.copy(q);else if(seated>0)bone.quaternion.slerp(q,seated);}
  root.position.copy(idleOrigin.clone().lerp(runOrigin,p.stand)).multiplyScalar(-scale);
  model.position.copy(p.position);model.rotation.y=p.yaw;model.updateMatrixWorld(true);mesh.skeleton.update();
  const raw=sampleFeet(),correction=p.position.y-Math.min(...raw.map(f=>f.y));model.position.y+=correction;model.updateMatrixWorld(true);mesh.skeleton.update();contacts=raw.map(f=>({...f,y:f.y+correction}));
  if(t>=timings.land&&t<timings.run){model.position.y-=.028;model.updateMatrixWorld(true);for(let iteration=0;iteration<4;iteration++){plantLandingFeet(p.yaw);for(const side of ['Left','Right'])orient('mixamorig'+side+'Foot','mixamorig'+side+'ToeBase',[Math.sin(p.yaw),0,Math.cos(p.yaw)]);mesh.skeleton.update();}contacts=sampleFeet();const finalLift=-Math.min(...contacts.map(f=>f.y));model.position.y+=finalLift;model.updateMatrixWorld(true);mesh.skeleton.update();contacts=sampleFeet();}
  return p;
 }
 function tagPom(){
  mesh.geometry=mesh.geometry.clone();const g=mesh.geometry,uv=g.attributes.uv,n=g.attributes.position.count,v=new T.Vector3(),ys=new Float32Array(n);let max=-Infinity,min=Infinity;
  for(let i=0;i<n;i++){mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld);ys[i]=v.y;max=Math.max(max,v.y);min=Math.min(min,v.y);}
  const mask=new Float32Array(n);for(let i=0;i<n;i++)if(ys[i]>max-(max-min)*.115)mask[i]=1;
  // Yellow selection happens on the original sampled albedo in the fragment shader.
  g.setAttribute('clownPom',new T.BufferAttribute(mask,1));return mask.reduce((a,b)=>a+b,0);
 }
 function bakeWisps(){
  pose(timings.evaporate+.5);const bounds=new T.Box3().setFromObject(mesh,true);bodyHeight=bounds.max.y;pomFloor.value=bodyHeight*.932;
  const v=new T.Vector3(),n=mesh.geometry.attributes.position.count,bands=Array.from({length:20},()=>[]),pom=mesh.geometry.attributes.clownPom;
  for(let i=0;i<n;i++){mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld);bands[Math.floor(clamp(v.y/bodyHeight,0,.999)*20)].push(i);}
  let i=0;for(const w of wisps){const band=bands[(i++)%20];w.vertex=band.length?band[Math.floor(rand()*band.length)]:Math.floor(rand()*n);mesh.getVertexPosition(w.vertex,w.anchor).applyMatrix4(mesh.matrixWorld);const h=clamp(w.anchor.y/bodyHeight,0,1);w.pom=pom.getX(w.vertex)>.5;w.born=w.pom?timings.bodyGone+.55:timings.evaporate+(h*2+.12)/2.42*2+(w.delay-.5)*.38;}
 }
 function draw(){
  if(disposed)return;if(!model){renderer.render(scene,camera);return;}const p=pose(time),ev=clamp((time-timings.evaporate)/2,0,1);
  // Leave the recess gradually; brighter machine lighting after landing.
  const lit=smooth(timings.launch,timings.land+.3,time);
  ambient.intensity=lerp(.14,.44,lit);key.intensity=lerp(.48,1.9,lit);
  shelfBulb.intensity=lerp(.35,2.4,lit);fill.intensity=lerp(.06,.23,lit);
  dissolveClock.value=Math.max(0,time-timings.evaporate);
  cut.value=time<timings.evaporate?-20:lerp(-bodyHeight*.06,bodyHeight*1.15,ev);
  pomOpacity.value=1-smooth(timings.bodyGone+.32,timings.pomGone,time);pomLift.value=.065*smooth(timings.bodyGone,timings.pomGone,time);
  model.visible=time<timings.pomGone;mesh.castShadow=time<timings.evaporate;
  shelfAO.visible=time<timings.launch;shelfAO.material.opacity=.6;
  for(let i=0;i<footShadows.length;i++){const shadow=footShadows[i],f=contacts[i];shadow.position.set(f.x,.004,f.z);shadow.visible=time>=timings.land&&time<timings.bodyGone;shadow.material.opacity=clamp(1-f.y/.1,0,1)*.4*(1-ev);}
  space.floorShadow.visible=time>=timings.land;space.shelfShadow.visible=time<timings.launch;
  for(const proxy of space.proxies)proxy.castShadow=time<timings.launch&&(proxy.name==='shelf canopy'||proxy.name==='shelf back');
  space.floorShadow.material.opacity=.4*(1-ev);vaporMaterial.uniforms.clock.value=time;
  let active=0;const unit=bodyHeight/2;
  for(let i=0;i<MAX;i++){const w=wisps[i],age=time-w.born,life=timings.end-.25+w.size*.2,a=age<0||time>life?0:smooth(0,.16,age)*(1-smooth(timings.pomGone+.2+w.size*.3,life,time)),hold=Math.max(0,age),curl=(hold*.07+hold*hold*.055)*unit;
   positions[i*3]=w.anchor.x+Math.sin(w.twist+hold*2.1)*curl;positions[i*3+1]=w.anchor.y+(hold*(.22+w.size*.16)+hold*hold*.12)*unit;positions[i*3+2]=w.anchor.z+Math.cos(w.twist+hold*1.8)*curl*.8;
   const grow=.6+hold*.7;sizes[i*2]=(.11+w.size*.13)*grow*unit;sizes[i*2+1]=(.22+w.size*.22)*grow*unit;turns[i]=Math.sin(w.twist+hold)*.55;alphas[i]=a*(.14+w.size*.09);seeds[i]=w.seed;if(a>0)active++;
  }
  for(const k of ['center','extent','turn','opacity','seed'])vaporGeometry.attributes[k].needsUpdate=true;vapor.visible=active>0;
  game.dataset.clownPhase=!requested?'waiting':time<timings.land?p.phase:time<timings.run?'landing':time<timings.evaporate?'approach':time<timings.bodyGone?'evaporating':time<timings.pomGone?'pompom':time<timings.end?'vapor':'gone';
  if(reviewControls){reviewControls.slider.value=time;reviewControls.label.textContent=game.dataset.clownPhase+' · '+time.toFixed(2)+' s';}
  renderer.render(scene,camera);
  if(roundTriggered&&!previewOnly&&!notified&&time>=timings.end){notified=true;onComplete?.();}
 }
 function resize(){if(disposed)return;const r=plane.getBoundingClientRect();renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));renderer.setSize(Math.max(1,Math.round(r.width)),Math.max(1,Math.round(r.height)),false);draw();}
 function tick(now){frame=0;if(disposed||!isActive()){last=0;return;}if(playing){time=Math.min(timings.end,time+(last?Math.min((now-last)/1000,.05):0));last=now;draw();if(time>=timings.end){playing=false;last=0;}}if(playing)frame=requestAnimationFrame(tick);}
 function sync(){if(disposed)return;if(!isActive()){cancelAnimationFrame(frame);frame=0;last=0;return;}if(requested&&reduced.matches){time=timings.end;playing=false;}draw();if(playing&&!frame)frame=requestAnimationFrame(tick);}
 function begin(preview=false){notified=false;previewOnly=preview;requested=true;playing=true;time=0;last=0;sync();}
 function complete(){if(roundTriggered||disposed)return;roundTriggered=true;begin(false);}
 function reset(){notified=false;requested=false;roundTriggered=false;previewOnly=false;playing=false;time=0;last=0;cancelAnimationFrame(frame);frame=0;draw();}
 let reviewControls=null,pomVertices=0,stride=.5;
 space.floorShadow.visible=false;space.shelfShadow.visible=false;resize();onMachineReady?.(space.construction);
 try{
  const response=await fetch(new URL('./skee-ball/clown-running.glb',import.meta.url));if(!response.ok)throw new Error('Clown GLB unavailable');const data=await response.arrayBuffer();while(game.dataset.phase==='rolling')await new Promise(resolve=>setTimeout(resolve,80));const g=await new GLTFLoader().parseAsync(data,new URL('./skee-ball/',import.meta.url).href);model=new T.Group();root=g.scene;const extra=root.getObjectByName('Icosphere');if(extra)extra.visible=false;
  mesh=root.getObjectByName('output_unwrapped');mixer=new T.AnimationMixer(root);clip=g.animations[0];clipSamplers=clip.tracks.map(track=>{const binding=T.PropertyBinding.create(root,track.name);binding.bind();return{binding,interpolant:track.createInterpolant()};});model.add(root);scene.add(model);sampleClip(.11);model.updateMatrixWorld(true);mesh.skeleton.update();
  const runBox=new T.Box3().setFromObject(mesh,true);runOrigin=new T.Vector3((runBox.max.x+runBox.min.x)/2,runBox.min.y,(runBox.max.z+runBox.min.z)/2);
  model.traverse(o=>{if(o.isBone)runQuats.push([o,o.quaternion.clone()]);});seatPose();mesh.skeleton.update();model.traverse(o=>{if(o.isBone)idleQuats.push([o,o.quaternion.clone()]);});const seatBox=new T.Box3().setFromObject(mesh,true);idleOrigin=new T.Vector3((seatBox.max.x+seatBox.min.x)/2,seatBox.min.y,(seatBox.max.z+seatBox.min.z)/2);
  const targetHeight=space.atZ(379,270,6.5).y-space.shelfFoot.y;scale=targetHeight/(seatBox.max.y-seatBox.min.y);root.scale.multiplyScalar(scale);
  const weights=mesh.geometry.attributes.skinWeight,indices=mesh.geometry.attributes.skinIndex;
  for(let i=0;i<weights.count;i++){for(const side of ['Left','Right']){let w=0;for(let j=0;j<4;j++){const name=mesh.skeleton.bones[indices.array[i*4+j]]?.name||'';if(name.includes(side)&&(name.includes('Foot')||name.includes('Toe')))w+=weights.array[i*4+j];}if(w>.45)feet[side].push(i);}}
  // Measure a full cycle's planted-foot travel after normalizing the toy to the shelf.
  root.position.copy(runOrigin).multiplyScalar(-scale);model.rotation.y=Math.PI;let travel=0,previous=null;
  for(let i=0;i<=60;i++){if(i%10===0)await new Promise(resolve=>setTimeout(resolve,0));sampleClip(clip.duration*i/60);model.updateMatrixWorld(true);mesh.skeleton.update();const f=sampleFeet(),current=f[0].y<f[1].y?f[0]:f[1];if(previous&&previous.side===current.side)travel+=Math.max(0,current.z-previous.z);previous=current;}
  for(let attempt=0;attempt<8;attempt++){
   timings.land=timings.launch+flight;timings.run=timings.land+.59;let margin=Infinity,crossings=0;
   for(let i=0;i<=90;i++){
    if(i%8===0)await new Promise(resolve=>setTimeout(resolve,0));
    const p=motion(timings.launch+flight*i/90);pose(timings.launch+flight*i/90);
    const bound=new T.Box3(),vertex=new T.Vector3(),n=mesh.geometry.attributes.position.count;
    for(let j=0;j<n;j+=12){mesh.getVertexPosition(j,vertex).applyMatrix4(mesh.matrixWorld);bound.expandByPoint(vertex);}
    for(const indices of Object.values(feet))for(const j of indices){mesh.getVertexPosition(j,vertex).applyMatrix4(mesh.matrixWorld);bound.expandByPoint(vertex);}
    bound.expandByScalar(.008);
    if(bound.max.x>1.01&&bound.min.x<space.fenceX(p.position.z)&&bound.max.z>0&&bound.min.z<6){crossings++;margin=Math.min(margin,bound.min.y-space.fenceHeight(clamp(bound.max.z,0,6)));}
   }
   jumpPlan={flight,minimumClearance:margin,crossings,gravity};if(margin>=.045)break;flight+=.01;
  }
  if(!jumpPlan.crossings||jumpPlan.minimumClearance<.045)throw new Error('Clown jump does not clear the protective fence '+JSON.stringify(jumpPlan));
  stride=clamp(travel,.3,.7);stop.z+=stride;runDuration=(landing.z-stop.z)/(stride/clip.duration);
  timings.evaporate=timings.run+runDuration;timings.bodyGone=timings.evaporate+2;timings.pomGone=timings.bodyGone+.72;timings.end=timings.pomGone+2.65;
  pose(0);pomVertices=tagPom();mesh.castShadow=true;mesh.receiveShadow=true;mesh.material=mesh.material.clone();mesh.material.transparent=true;
  mesh.material.onBeforeCompile=shader=>{
   shader.uniforms.dissolveClock=dissolveClock;shader.uniforms.vaporCut=cut;shader.uniforms.pomOpacity=pomOpacity;shader.uniforms.pomLift=pomLift;shader.uniforms.pomFloor=pomFloor;
   shader.vertexShader='attribute float clownPom; varying float vClownPom; varying vec3 vaporWorld; uniform float pomLift;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvClownPom=clownPom;vec4 clownWorld=modelMatrix*vec4(transformed,1.);clownWorld.y+=clownPom*pomLift;vaporWorld=clownWorld.xyz;gl_Position=projectionMatrix*viewMatrix*clownWorld;');
   shader.fragmentShader='varying float vClownPom; varying vec3 vaporWorld; uniform float vaporCut; uniform float dissolveClock; uniform float pomOpacity; uniform float pomFloor; uniform float pomLift;\n'+fadeNoise+'\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','#include <alphatest_fragment>\nfloat boundary=vaporWorld.y+(vnNoise(vaporWorld*12.+vec3(0.,dissolveClock*.45,0.))-.5)*.19+(vnNoise(vaporWorld*29.)-.5)*.065;float bodyAlpha=smoothstep(vaporCut-.10,vaporCut+.10,boundary);diffuseColor.a*=mix(bodyAlpha,pomOpacity,step(.2,vClownPom)*step(pomFloor,vaporWorld.y-pomLift*vClownPom)*step(diffuseColor.r*.4,diffuseColor.g)*step(diffuseColor.b*1.7,diffuseColor.g));if(diffuseColor.a<.01)discard;');
  };mesh.material.customProgramCacheKey=()=> 'skee-clown-soft-v4';bakeWisps();time=0;resize();onReady();
 }catch(error){space.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();throw error;}
 const local=['127.0.0.1','localhost'].includes(location.hostname)&&new URLSearchParams(location.search).has('clown-review');
 if(local&&ui){
  const panel=document.createElement('section');panel.className='skee-clown-review';panel.setAttribute('aria-label','Clown sequence review');
  function button(text,fn){const b=document.createElement('button');b.textContent=text;b.onclick=fn;panel.append(b);return b;}
  button('Replay clown',()=>{playing=false;begin(game.dataset.roundPhase!=='clown');});button('Reset shelf',()=>{if(game.dataset.roundPhase!=='clown')reset();});button('Pause / resume',()=>{playing=!playing;last=0;sync();});
  const slider=document.createElement('input');slider.type='range';slider.min=0;slider.max=timings.end;slider.step=.01;slider.setAttribute('aria-label','Clown sequence timeline');slider.oninput=()=>{requested=true;previewOnly=game.dataset.roundPhase!=='clown';playing=false;time=+slider.value;draw();};panel.append(slider);
  const debugLabel=document.createElement('label'),debug=document.createElement('input');debug.type='checkbox';debug.onchange=()=>{space.setDebug(debug.checked);draw();};debugLabel.append(debug,document.createTextNode(' Show invisible proxy outlines'));panel.append(debugLabel);
  const label=document.createElement('output');panel.append(label);reviewControls={panel,slider,label};ui.append(panel);draw();
 }
 const observer=new ResizeObserver(resize);observer.observe(plane);
 function diagnostics(t){const original=time;pose(t);const b=new T.Box3().setFromObject(mesh,true),p=motion(t),crosses=b.max.x>1.01&&b.min.x<space.fenceX(clamp(p.position.z,0,6))&&b.max.z>0&&b.min.z<6;
  const corners=[];for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])corners.push(space.project(new T.Vector3(x,y,z)));
  const projectedBounds={left:Math.min(...corners.map(p=>p.x)),right:Math.max(...corners.map(p=>p.x)),top:Math.min(...corners.map(p=>p.y)),bottom:Math.max(...corners.map(p=>p.y))};
  const result={time:t,phase:p.phase,projectedBounds,root:p.position.toArray(),bounds:{min:b.min.toArray(),max:b.max.toArray()},contacts:contacts.map(f=>({...f})),crossesFence:crosses,fenceClearance:crosses?b.min.y-space.fenceHeight(clamp(b.max.z,0,6)):null,footProjection:space.project(new T.Vector3(p.position.x,p.position.y,p.position.z))};pose(original);return result;}
 return{complete,reset,sync,
  state:()=>({phase:game.dataset.clownPhase,time,requested,playing,previewOnly,bodyVisible:model.visible,position:model.position.toArray(),scale:model.scale.x,contacts:contacts.map(f=>({...f})),pomOpacity:pomOpacity.value,pomVertices,stride,runDuration,jumpPlan,timings:{...timings}}),
  inspect:()=>({calibration:space.calibration,collision:space.collision,proxies:space.proxies.map(p=>({name:p.name,colorWrite:p.material.colorWrite,depthWrite:p.material.depthWrite,vertices:p.geometry.attributes.position.count})),trajectory:Array.from({length:121},(_,i)=>diagnostics(timings.evaporate*i/120))}),
  seek:t=>{requested=true;playing=false;time=clamp(t,0,timings.end);draw();},
  dispose(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();reviewControls?.panel.remove();mixer.stopAllAction();for(const s of clipSamplers)s.binding.unbind();const gs=new Set(),ms=new Set(),ts=new Set();scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m){ms.add(m);for(const v of Object.values(m))if(v?.isTexture)ts.add(v);}});for(const g of gs)g.dispose();for(const m of ms)m.dispose();for(const t of ts)t.dispose();contactMaterial.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();}
 };
}
