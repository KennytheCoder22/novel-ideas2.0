import * as T from './vendor/three.module.js';
const smooth=(a,b,x)=>{const u=T.MathUtils.clamp((x-a)/(b-a),0,1);return u*u*(3-2*u);};
const mix=T.MathUtils.lerp;
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
  const tailWeight=smooth(.29,.52,-x)*smooth(-.2,-.015,y)*(1-smooth(-.08,.12,z));
  const scarfWeight=smooth(.34,.44,x)*smooth(.45,.56,z)*(1-smooth(-.08,.04,y))*smooth(-.46,-.36,y);
  const tagDistance=Math.sqrt(((x-.14)/.095)**2+((y+.205)/.15)**2+((z-.563)/.06)**2);
  const tagWeight=(1-smooth(.65,1.2,tagDistance))*.95;
  const headWeight=Math.max(smooth(-.04,.08,y)*smooth(.14,.3,z),smooth(-.32,-.17,y)*smooth(.36,.47,z));
  if(tailWeight>.1){part=tail;amount=tailWeight;add(tip,amount*smooth(.43,.69,-x));add(tail,amount*(1-smooth(.43,.69,-x)));}
  else if(scarfWeight>.15){part=scarf;amount=scarfWeight;add(scarf,amount);}
  else if(tagWeight>.1){part=tag;amount=tagWeight;add(tag,amount);}
  else if(headWeight>.1){part=head;amount=headWeight;add(head,amount);}
  if(!part){
   const nearest=legs.map(l=>{const u=smooth(.12,.52,-y),cz=mix(l.hipZ,l.z,u);return{l,d:Math.hypot(x-l.x,z-cz)};}).sort((a,b)=>a.d-b.d)[0];
   amount=smooth(.12,.31,-y)*(1-smooth(.13,.25,nearest.d));
   if(amount>0){const l=nearest.l,lower=smooth(.21,.45,-y),foot=smooth(.47,.59,-y)*.45;add(l.upper,amount*(1-lower));add(l.knee,amount*lower*(1-foot));add(l.paw,amount*lower*foot);}
  }
  const front=smooth(-.4,.18,z);add(hips,(1-amount)*(1-front));add(chest,(1-amount)*front);
  const selected=[...values].sort((a,b)=>b[1]-a[1]).slice(0,4),total=selected.reduce((n,v)=>n+v[1],0);
  for(let j=0;j<4;j++){const entry=selected[j];indices.push(entry?index(entry[0]):0);weights.push(entry?entry[1]/total:0);}
  const dominant=selected[0][0].name;counts[dominant]=(counts[dominant]||0)+1;
 }
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
  head.rotation.z=Math.sin(cycle*Math.PI*2+.6)*.035*running;
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
 return{group,mesh,bones,named,legs,pose,stats:{triangles:9705,vertices:pos.count,bones:bones.length,weightedParts:counts},dispose(){geometry.dispose();mesh.material.dispose();}};
}
