import * as T from './vendor/three.module.js';
const smooth=(a,b,x)=>{const u=T.MathUtils.clamp((x-a)/(b-a),0,1);return u*u*(3-2*u);};
const mix=T.MathUtils.lerp;
let surfaceSkin=null,skinPromise;
export function loadMaraSkin(){return skinPromise||(skinPromise=fetch(new URL('./mara/mara-skin.bin',import.meta.url)).then(async r=>{if(!r.ok)throw new Error('Mara surface weights unavailable');const buffer=await r.arrayBuffer(),header=new Uint32Array(buffer,0,3);if(header[0]!==0x4d415241||header[2]!==21)throw new Error('Invalid Mara skin');surfaceSkin={vertices:header[1],indices:new Uint16Array(buffer,12,header[1]*4),weights:new Float32Array(buffer,12+header[1]*8,header[1]*4)};}));}

export function createMaraRig(source){
 const original=source.getObjectByName('output_unwrapped');
 const geometry=original.geometry.clone();geometry.rotateY(-.52);
 const group=new T.Group(),bones=[],named={},rest=new Map();
 function bone(name,p,parent){const b=new T.Bone();b.name=name;const absolute=new T.Vector3(...p);b.position.copy(absolute);if(parent)b.position.sub(rest.get(parent));(parent||group).add(b);bones.push(b);named[name]=b;rest.set(b,absolute);return b;}
 const body=bone('Mara_body',[0,-.08,0]);
 const hips=bone('Mara_hips',[-.04,-.1,-.3],body),chest=bone('Mara_chest',[.035,-.08,.2],body);
 const neck=bone('Mara_neck',[0,.035,.28],chest),head=bone('Mara_head',[0,.13,.43],neck);
 const tail=bone('Mara_tail_base',[-.23,-.03,-.32],hips),tip=bone('Mara_tail_tip',[-.49,.07,-.44],tail);
 const scarf=bone('Mara_scarf',[.2,-.02,.42],neck),tag=bone('Mara_tag',[.14,-.11,.55],neck);
 const legSpecs=[['front_left',-.103,.397,.30,chest,0],['front_right',.271,.464,.32,chest,.5],['rear_left',-.259,-.387,-.27,hips,.5],['rear_right',.206,-.506,-.34,hips,0]];
 const legs=legSpecs.map(([name,x,z,hipZ,parent,phase],i)=>{
  const upper=bone('Mara_'+name,[x,-.12,hipZ],parent),knee=bone(name+'_knee',[x,-.33,(hipZ+z)/2],upper),paw=bone(name+'_paw',[x,-.535,z],knee);
  return{name,x,z,hipZ,phase,upper,knee,paw,L1:rest.get(knee).distanceTo(rest.get(upper)),L2:rest.get(paw).distanceTo(rest.get(knee)),front:i<2};
 });
 group.updateMatrixWorld(true);
 const indices=[],weights=[],pos=geometry.attributes.position,counts={};
 const index=b=>bones.indexOf(b);
 for(let i=0;i<pos.count;i++){
  const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),values=new Map();
  const add=(b,w)=>{if(w>0)values.set(b,(values.get(b)||0)+w);};
  let part=null,amount=0;
  const tailWeight=smooth(.28,.4,-x)*smooth(-.3,-.16,y)*(1-smooth(.1,.28,z));
  const scarfWeight=Math.max(smooth(.29,.37,x)*smooth(.48,.58,z),smooth(.4,.5,x)*smooth(.32,.43,z))*(1-smooth(-.02,.1,y));
  const tagDistance=Math.sqrt(((x-.14)/.095)**2+((y+.205)/.15)**2+((z-.563)/.06)**2);
  const tagWeight=(1-smooth(.65,1.2,tagDistance))*.95;
  const headWeight=Math.max(smooth(-.04,.08,y)*smooth(.14,.3,z),smooth(-.32,-.17,y)*smooth(.36,.47,z));
  if(tailWeight>.1){part=tail;amount=tailWeight;add(tip,amount*smooth(.43,.69,-x));add(tail,amount*(1-smooth(.43,.69,-x)));}
  else if(scarfWeight>.15){part=scarf;amount=scarfWeight;add(scarf,amount);}
  else if(tagWeight>.1){part=tag;amount=tagWeight;add(tag,amount);}
  else if(headWeight>.1){part=head;amount=headWeight;add(head,amount);}
  // Blend anatomical transitions into the nearest leg instead of assigning
  // partially classified scarf/paw-edge vertices back to the torso.
  const special=amount;
  const nearest=legs.map(l=>{const u=smooth(.12,.52,-y),cz=mix(l.hipZ,l.z,u);return{l,d:Math.hypot(x-l.x,z-cz)};}).sort((a,b)=>a.d-b.d)[0];
  const legAmount=(1-special)*smooth(.12,.31,-y)*(1-smooth(.13,.25,nearest.d));
  if(legAmount>0){const l=nearest.l,lower=smooth(.21,.45,-y),foot=smooth(.47,.59,-y)*.45;add(l.upper,legAmount*(1-lower));add(l.knee,legAmount*lower*(1-foot));add(l.paw,legAmount*lower*foot);}
  const front=smooth(-.4,.18,z),remaining=1-special-legAmount;add(hips,remaining*(1-front));add(chest,remaining*front);
  const selected=[...values].sort((a,b)=>b[1]-a[1]).slice(0,4),total=selected.reduce((n,v)=>n+v[1],0);
  for(let j=0;j<4;j++){const entry=selected[j];indices.push(entry?index(entry[0]):0);weights.push(entry?entry[1]/total:0);}
  const dominant=selected[0][0].name;counts[dominant]=(counts[dominant]||0)+1;
 }
 if(surfaceSkin){if(surfaceSkin.vertices!==pos.count)throw new Error('Mara surface weight count mismatch');for(let i=0;i<surfaceSkin.indices.length;i++){indices[i]=surfaceSkin.indices[i];weights[i]=surfaceSkin.weights[i];}for(const key of Object.keys(counts))delete counts[key];for(let i=0;i<pos.count;i++){const name=bones[indices[i*4]].name;counts[name]=(counts[name]||0)+1;}}
 geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
 const mesh=new T.SkinnedMesh(geometry,original.material.clone());mesh.name='Mara original textured mesh';mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;group.add(mesh);group.updateMatrixWorld(true);mesh.bind(new T.Skeleton(bones));
 function aim(b,child,target){const from=child.getWorldPosition(new T.Vector3()).sub(b.getWorldPosition(new T.Vector3())).normalize(),to=target.clone().sub(b.getWorldPosition(new T.Vector3())).normalize();const q=new T.Quaternion().setFromUnitVectors(from,to).multiply(b.getWorldQuaternion(new T.Quaternion()));b.quaternion.copy(b.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));group.updateMatrixWorld(true);}
 function solve(l,target){const start=l.upper.getWorldPosition(new T.Vector3()),scale=group.getWorldScale(new T.Vector3()).x,L1=l.L1*scale,L2=l.L2*scale,delta=target.clone().sub(start),d=T.MathUtils.clamp(delta.length(),Math.abs(L1-L2)+.0001,L1+L2-.0001),dir=delta.normalize(),pole=new T.Vector3(0,0,l.front?-1:1).transformDirection(group.matrixWorld);pole.addScaledVector(dir,-pole.dot(dir)).normalize();const along=(L1*L1-L2*L2+d*d)/(2*d),bend=start.clone().addScaledVector(dir,along).addScaledVector(pole,Math.sqrt(Math.max(0,L1*L1-along*along)));aim(l.upper,l.knee,bend);aim(l.knee,l.paw,start.clone().addScaledVector(dir,d));}
 const v=new T.Vector3(),folds=[[-1.05,.2,.22],[-.6,-.28,-.28],[.8,.3,.45],[.35,-.42,-.52]];
 function pose({cycle=0,collapse=0,settle=0}={}){
  for(const b of bones){b.quaternion.identity();b.position.copy(rest.get(b));if(b.parent.isBone)b.position.sub(rest.get(b.parent));}
  const c=smooth(0,1,collapse),running=1-smooth(0,.35,collapse);
  body.position.y+=Math.sin(cycle*Math.PI*4)*.014*running;
  chest.rotation.x=Math.sin(cycle*Math.PI*2)*.025*running;
  head.rotation.z=Math.sin(cycle*Math.PI*2+.6)*.035*running;head.rotation.x=-.18*running;
  tail.rotation.y=Math.sin(cycle*Math.PI*2-.8)*.13*running;tail.rotation.z=Math.sin(cycle*Math.PI*2-1)*.12*running;tip.rotation.y=Math.sin(cycle*Math.PI*2-1.4)*.1*running;
  scarf.rotation.x=Math.sin(cycle*Math.PI*2-.7)*.12*running;tag.rotation.z=Math.sin(cycle*Math.PI*2+.6)*.13*running;
  group.updateMatrixWorld(true);
  for(const l of legs){const phase=(cycle+l.phase)%1,stance=.58,u=phase/stance,z=phase<stance?mix(.1044,-.1044,u):mix(-.1044,.1044,(phase-stance)/(1-stance)),lift=phase<stance?0:Math.sin((phase-stance)/(1-stance)*Math.PI)*.09;solve(l,group.localToWorld(new T.Vector3(l.x,-.535+lift,l.z+z)));}
  if(c>0){
   const wobble=Math.sin(settle*20)*Math.exp(-settle*8)*.025;
   body.rotation.set(.15*c,-.08*c,1.35*c+wobble);hips.rotation.set(-.2*c,.2*c,-.14*c);chest.rotation.set(.14*c,-.18*c,-.12*c);neck.rotation.set(.05*c,-.14*c,.2*c);head.rotation.set(-.65*c,.2*c,-.45*c+wobble);
   legs.forEach((l,i)=>{const f=folds[i],k=smooth(0,l.front?.65:1,collapse);l.upper.quaternion.slerp(new T.Quaternion().setFromEuler(new T.Euler(...f)),k);l.knee.quaternion.slerp(new T.Quaternion().setFromEuler(new T.Euler(l.front?1.3:-.9,0,(i%2?.18:-.28))),k);l.paw.rotation.x=(i%2?.25:-.2)*c;});
   tail.rotation.set(.2*c,-.24*c,.1*c+wobble);tip.rotation.set(.1*c,.15*c,-.15*c);scarf.rotation.set(.15*c+Math.sin(settle*18)*Math.exp(-settle*7)*.1,.05*c,-1.35*c);tag.rotation.z=-1.2*c+Math.sin(settle*22)*Math.exp(-settle*9)*.2;
  }
  group.updateMatrixWorld(true);mesh.skeleton.update();let minY=Infinity;
  for(let i=0;i<pos.count;i+=3){mesh.getVertexPosition(i,v);minY=Math.min(minY,v.y);}
  // Ground the deformed mesh, not the original bounding box or a rigid proxy.
  group.position.y=-minY*group.scale.y;group.updateMatrixWorld(true);mesh.skeleton.update();
 }
 // Static endpoint study. This does not revise or play the entrance animation.
 function restingPose(options={}){
  const parameters={bodyRoll:-.9,bodyPitch:.03,headYaw:0,headRoll:.08,headPitch:0,headDrop:.14,headLeft:.15,tailDrop:.25,bellyForward:0,pawLift:0,...options};
  for(const b of bones){b.quaternion.identity();b.position.copy(rest.get(b));if(b.parent.isBone)b.position.sub(rest.get(b.parent));}
  body.rotation.set(parameters.bodyPitch,0,parameters.bodyRoll);
  hips.rotation.set(-.04,.08,-.06);hips.position.y-=.12;chest.rotation.set(.02,.03,.02);
  group.updateMatrixWorld(true);
  function worldRotation(b,e){const q=new T.Quaternion().setFromEuler(new T.Euler(...e));b.quaternion.copy(b.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));group.updateMatrixWorld(true);}
  // Head faces the viewer independently of the side-on, slumped torso.
  worldRotation(head,[parameters.headPitch,parameters.headYaw,parameters.headRoll]);
  const down=new T.Vector3(-parameters.headLeft*group.getWorldScale(new T.Vector3()).x,-parameters.headDrop*group.getWorldScale(new T.Vector3()).y,0).applyQuaternion(head.parent.getWorldQuaternion(new T.Quaternion()).invert()).divide(head.parent.getWorldScale(new T.Vector3()));head.position.add(down);group.updateMatrixWorld(true);
  worldRotation(scarf,[-1.05,-.2,-.2]);worldRotation(tag,[-.6,.1,-.2]);
  const tailQ=new T.Quaternion().setFromEuler(new T.Euler(0,Math.PI,-.5,'ZYX'));tail.quaternion.copy(tail.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(tailQ));
  const tailDown=new T.Vector3(0,-parameters.tailDrop*group.getWorldScale(new T.Vector3()).y,0).applyQuaternion(tail.parent.getWorldQuaternion(new T.Quaternion()).invert()).divide(tail.parent.getWorldScale(new T.Vector3()));tail.position.add(tailDown);group.updateMatrixWorld(true);tip.quaternion.identity();
  group.updateMatrixWorld(true);
  const targets=[[-.12,-.47,.48],[.28,-.39,.36],[-.29,-.37,-.35],[.29,-.39,-.18]];
  legs.forEach((l,i)=>{targets[i][0]+=parameters.bellyForward;targets[i][1]+=parameters.pawLift;solve(l,group.localToWorld(new T.Vector3(...targets[i])));l.paw.rotation.x=i<2?-.12:.1;});
  group.updateMatrixWorld(true);mesh.skeleton.update();let minY=Infinity;
  for(let i=0;i<pos.count;i++){mesh.getVertexPosition(i,v);minY=Math.min(minY,v.y);}
  group.position.y=-minY*group.scale.y;group.updateMatrixWorld(true);mesh.skeleton.update();
 }
 function placeFeet(targets,headings){
  // Targets stay in world space while the torso pivots over the planted paws.
  legs.forEach((l,i)=>{solve(l,targets[i]);const q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),headings[i]);l.paw.quaternion.copy(l.paw.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));group.updateMatrixWorld(true);});
  mesh.skeleton.update();
 }
 return{group,mesh,bones,named,legs,pose,restingPose,placeFeet,followCurve(front,rear){chest.rotation.y+=front*.6;neck.rotation.y+=front*.25;hips.rotation.y+=rear*.6;group.updateMatrixWorld(true);mesh.skeleton.update();},regionBounds(){const out={};for(let i=0;i<pos.count;i++){const bone=bones[indices[i*4]].name;mesh.getVertexPosition(i,v);const r=out[bone]||(out[bone]={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]});for(let j=0;j<3;j++){r.min[j]=Math.min(r.min[j],v.getComponent(j));r.max[j]=Math.max(r.max[j],v.getComponent(j));}}return out;},lowest(){let low=Infinity,info;for(let i=0;i<pos.count;i++){mesh.getVertexPosition(i,v);if(v.y<low){low=v.y;info={p:v.toArray(),source:[pos.getX(i),pos.getY(i),pos.getZ(i)],bone:bones[indices[i*4]].name};}}return info;},stats:{triangles:9705,vertices:pos.count,bones:bones.length,weightedParts:counts},dispose(){geometry.dispose();mesh.material.dispose();}};
}
