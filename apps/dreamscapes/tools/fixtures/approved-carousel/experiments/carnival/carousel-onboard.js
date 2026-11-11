import * as T from './vendor/three.module.js';
import {sharedMountRenderer} from './shared-mount-renderer.js';
import {ferrisEnvironment,mountFerrisEnvironment} from './carousel-environment.js';
import {preloadDream,mountDream} from './carousel-dream.js';
import {ridePainting} from './carousel-sky.js';

// The outside view is SVG + fixed orthographic mount renders, not a 3D room.
// This additional perspective view reuses the current, registered GLB meshes.
// Painted outdoor scenes stay fixed on a surrounding cylindrical stage. They
// are never translated as screen layers. The camera is a child of the seat rig.
const PERIOD=18000,BOARD=2800,EXIT=2800,TURNS=2,UNIT=300/(.7324974536895752*1.5);
const images=['rides-games','tent-row','ferris-platform','behind-carnival'];
const state={active:false,rideId:null,status:'outside',elapsed:0,frames:0};
let assets,environment,dreamAsset,world,dialog,canvas,name,progress,leave,svg,ride,start,finish,pause,frame,returnStart=null;
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||new URLSearchParams(location.search).get('motion')==='still';
const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const sourceEntries=()=>[window.carouselHorseComparison,...(window.carouselAnimalComparisons||[])].filter(Boolean);

async function preload(){
 const dreaming=preloadDream().then(asset=>{dreamAsset=asset;});
 if(!assets)assets=Promise.all([...images.map(n=>'./locations/'+n+'.png'),'./carousel/structure.png'].map(async url=>{const img=new Image();img.src=url;await img.decode();return img;})).then(async originals=>{const pictures=originals.map((image,i)=>ridePainting(image,images[i]));environment=await ferrisEnvironment(pictures[2]);return pictures;}).catch(e=>{assets=null;throw e;});
 await dreaming;return assets;
}
function textureFromCanvas(canvas){const t=new T.CanvasTexture(canvas);t.colorSpace=T.SRGBColorSpace;return t;}
function surround(pictures){
 // Complete outdoor paintings retain their established scene sectors.
 // Wheel dressing is projected onto this fixed stage as separate curved layers.
 const width=4096,height=1024,sector=width/4,overlap=64;
 const out=document.createElement('canvas');out.width=width;out.height=height;
 const ctx=out.getContext('2d');ctx.fillStyle='#10141c';ctx.fillRect(0,0,width,height);
 [pictures[0],pictures[1],environment.staticCanvas,pictures[3]].forEach((img,i)=>{
  const tile=document.createElement('canvas');tile.width=sector+overlap*2;tile.height=height;const c=tile.getContext('2d');
  const sx=0,sw=img.width;c.drawImage(img,sx,0,sw,img.height,0,0,tile.width,height);
  c.globalCompositeOperation='destination-in';const g=c.createLinearGradient(0,0,tile.width,0);g.addColorStop(0,'transparent');g.addColorStop(overlap/tile.width,'white');g.addColorStop(1-overlap/tile.width,'white');g.addColorStop(1,'transparent');c.fillStyle=g;c.fillRect(0,0,tile.width,height);
  for(const wrap of [-width,0,width])ctx.drawImage(tile,i*sector-overlap+wrap,0);
 });
 const texture=textureFromCanvas(out);texture.repeat.x=-1;texture.offset.x=1;texture.wrapT=T.MirroredRepeatWrapping;return texture;
}
function cropTexture(image,x,y,width,height){const c=document.createElement('canvas');c.width=512;c.height=512;c.getContext('2d').drawImage(image,x,y,width,height,0,0,512,512);return textureFromCanvas(c);}
function makeDialog(){
 if(dialog)return;
 dialog=document.createElement('dialog');dialog.className='carousel-onboard';dialog.setAttribute('aria-label','Riding the carousel');
 canvas=document.createElement('canvas');canvas.setAttribute('aria-label','First-person view from your selected carousel mount');
 const hud=document.createElement('div');hud.className='carousel-onboard-hud';
 const copy=document.createElement('div');name=document.createElement('strong');progress=document.createElement('span');progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');copy.append(name,progress);
 leave=document.createElement('button');leave.onclick=()=>{if(reduced())depart(true);else requestReturn();};hud.append(copy,leave);dialog.append(canvas,hud);document.body.append(dialog);
 dialog.addEventListener('cancel',e=>{e.preventDefault();requestReturn();});
 addEventListener('resize',resize);
 document.addEventListener('dreamscapes-age-band',()=>{if(state.active)depart(false);});
}
function resize(){if(!world)return;const {renderer,camera}=world;const scale=Math.min(1,1280/innerWidth,1000/innerHeight);renderer.setSize(innerWidth*scale,innerHeight*scale,false);camera.aspect=innerWidth/innerHeight;camera.fov=innerWidth<600?68:58;camera.updateProjectionMatrix();}
async function prepare(style){
 const pictures=await preload();makeDialog();
 if(world?.style===style)return;
 if(world){world.renderer.dispose();for(const t of world.textures)t.dispose();for(const g of world.ownedGeometry)g.dispose();for(const m of world.ownedMaterials)m.dispose();}
 const scene=new T.Scene();scene.background=new T.Color('#10141c');scene.add(new T.HemisphereLight(0xfff2de,0x39313b,1.5));
 const light=new T.DirectionalLight(0xffecd3,2);light.position.set(-3,5,4);scene.add(light);
 const renderer=sharedMountRenderer(T,canvas);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.setClearColor('#10141c');
 const camera=new T.PerspectiveCamera(58,innerWidth/innerHeight,.025,70);
 const rotor=new T.Group();scene.add(rotor);const seats=new Map(),ownedGeometry=[],ownedMaterials=[],textures=[];
 function mesh(geometry,material,parent=rotor){ownedGeometry.push(geometry);ownedMaterials.push(material);const m=new T.Mesh(geometry,material);parent.add(m);return m;}
 const panorama=surround(pictures);textures.push(panorama);

 const surroundGeometry=new T.CylinderGeometry(14,14,24,160,1,true),uv=surroundGeometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setY(i,(uv.getY(i)*24-10)/14);
 const backdrop=mesh(surroundGeometry,new T.MeshBasicMaterial({map:panorama,side:T.BackSide}),scene);backdrop.position.y=-4.1;
 const wood=cropTexture(pictures[4],1020,834,240,22);wood.wrapS=wood.wrapT=T.RepeatWrapping;wood.repeat.set(5,5);textures.push(wood);
 const floor=mesh(new T.CircleGeometry(2.65,96),new T.MeshStandardMaterial({map:wood,color:0x9b7651,roughness:.85,side:T.DoubleSide}));floor.rotation.x=-Math.PI/2;floor.position.y=-.05;
 const rim=mesh(new T.CylinderGeometry(2.65,2.65,.15,96,1,true),new T.MeshStandardMaterial({map:wood,color:0x573a27,roughness:.7}));rim.position.y=-.12;
 const roofTexture=cropTexture(pictures[4],250,445,1000,110);textures.push(roofTexture);
 const roof=mesh(new T.CircleGeometry(2.85,96),new T.MeshBasicMaterial({map:roofTexture,color:0x826443,side:T.DoubleSide}));roof.rotation.x=Math.PI/2;roof.position.y=2.8;
 const bulbGeometry=new T.SphereGeometry(.022,8,6),bulbMaterial=new T.MeshBasicMaterial({color:0xffc57d});ownedGeometry.push(bulbGeometry);ownedMaterials.push(bulbMaterial);
 for(let i=0;i<56;i++){const bulb=new T.Mesh(bulbGeometry,bulbMaterial),a=i/56*Math.PI*2;bulb.position.set(Math.cos(a)*2.55,2.72,Math.sin(a)*2.55);rotor.add(bulb);}
 const brass=new T.MeshStandardMaterial({color:0xb98c4c,metalness:.76,roughness:.32});ownedMaterials.push(brass);
 const poleGeometry=new T.CylinderGeometry(.0145,.0145,2.9,12);ownedGeometry.push(poleGeometry);
 const entries=sourceEntries();if(entries.length!==20)throw Error('The mount assemblies are not ready');
 for(const entry of entries){
  const id=entry.name||'horse',slotNumber=id==='horse'?entry.slot:entry.slotIndex+1,index=slotNumber-1;
  const slot=svgForMount(slotNumber),base=window.CarnivalCarousel.pose(index,0),angle=Math.atan2(base.depth,base.x-768);
  const seat=new T.Group();seat.position.set((base.x-768)/UNIT,0,base.depth/UNIT);seat.rotation.y=Math.PI-angle;rotor.add(seat);
  const registration=entry.registration.clone(true),heading=new T.Group();heading.rotation.y=entry.turn.rotation.y-(Math.PI-angle);heading.add(registration);seat.add(heading);
  // The same registered socket carries mount and eye; no visible rider is added.
  const anatomy=new T.Box3().setFromObject(heading),eye=new T.Object3D();eye.position.set(-.07,Math.max(.46,Math.min(.75,anatomy.max.y+.2)),-.5);seat.add(eye);
  const pole=new T.Mesh(poleGeometry,brass);seat.add(pole);
  seats.set(id,{seat,eye,pole,index,slotNumber,height:Number(slot.dataset.mountHeight||135),bob:Number(slot.dataset.bobAmplitude||28),registration,heading});
 }
 const environmentView=mountFerrisEnvironment(T,scene,environment,{textures,ownedGeometry,ownedMaterials});
 const dreamView=mountDream(scene,dreamAsset,{textures,ownedGeometry,ownedMaterials});
 world={style,scene,camera,renderer,rotor,seats,textures,ownedGeometry,ownedMaterials,environmentView,dreamView};resize();
}
function svgForMount(slot){return document.querySelector(`.carousel-dressing [data-carousel-slot="${slot}"]`);}
function changeStatus(status){if(state.status===status)return;state.status=status;progress.textContent={boarding:'Taking your seat…',first:'First turn',second:'Second turn',dismounting:'Returning to the carnival…',still:'A still ride — motion is reduced.'}[status]||'';}
function begin(savedRide,clock,onFinish,onPause){
 if(state.active&&state.rideId===savedRide.rideId)return;
 if(!world||world.style!==savedRide.style)throw Error('Onboard view not prepared');
 ride=savedRide;svg=clock;finish=onFinish;pause=onPause;start=Number(svg.dataset.elapsed||0);state.active=true;state.rideId=ride.rideId;state.frames=0;state.status='';returnStart=null;leave.disabled=false;
 world.dreamView.begin(ride.selected);
 name.textContent=window.DreamscapesCarouselCatalog.byId[ride.selected].label;leave.textContent=reduced()?'Finish still ride':'Return to carnival';
 document.documentElement.dataset.carouselOnboard=ride.rideId;dialog.style.opacity='0';dialog.showModal();leave.focus({preventScroll:true});tick();
 document.dispatchEvent(new Event('carousel-onboard-changed'));
}
const eyePosition=new T.Vector3(),target=new T.Vector3(),walkPosition=new T.Vector3(),walkTarget=new T.Vector3(),followQuaternion=new T.Quaternion(),walkQuaternion=new T.Quaternion(),matrix=new T.Matrix4();
function tick(){
 if(!state.active)return;frame=requestAnimationFrame(tick);if(document.hidden)return;
 const elapsed=Number(svg.dataset.elapsed||0),phase=(elapsed%PERIOD)/PERIOD;if(state.frames<2)start=elapsed;state.elapsed=Math.max(0,elapsed-start);world.rotor.rotation.y=phase*Math.PI*2;
 for(const item of world.seats.values()){
  const pose=window.CarnivalCarousel.pose(item.index,phase);item.seat.position.y=(item.height+pose.lift*item.bob/28)/UNIT;item.seat.scale.setScalar(pose.scale);
  // Shaft endpoint compensation matches the external rig: bob at the socket,
  // continuous pole between deck and canopy, no independently moving rider.
  item.pole.position.y=(1.4-item.seat.position.y)/pose.scale;item.pole.scale.y=1/pose.scale;
 }
 const selected=world.seats.get(ride.selected);world.scene.updateMatrixWorld(true);selected.eye.getWorldPosition(eyePosition);target.set(-.10,selected.eye.position.y-.15,1.4);selected.seat.localToWorld(target);
 matrix.lookAt(eyePosition,target,new T.Vector3(0,1,0));followQuaternion.setFromRotationMatrix(matrix);
 const seatPosition=selected.seat.getWorldPosition(new T.Vector3()),outward=new T.Vector3(seatPosition.x,0,seatPosition.z).normalize();walkPosition.copy(seatPosition).addScaledVector(outward,3.1);walkPosition.y=1.1;walkTarget.copy(seatPosition);walkTarget.y+=.25;matrix.lookAt(walkPosition,walkTarget,new T.Vector3(0,1,0));walkQuaternion.setFromRotationMatrix(matrix);
 let blend=1;
 if(reduced()){changeStatus('still');}
 else if(returnStart!==null){blend=1-ease((state.elapsed-returnStart)/EXIT);changeStatus('dismounting');}
 else if(state.elapsed<BOARD){blend=ease(state.elapsed/BOARD);changeStatus('boarding');}
 else if(state.elapsed<BOARD+PERIOD){changeStatus('first');}
 else if(state.elapsed<BOARD+PERIOD*TURNS){changeStatus('second');}
 else{blend=1-ease((state.elapsed-BOARD-PERIOD*TURNS)/EXIT);changeStatus('dismounting');}
 world.camera.position.copy(walkPosition).lerp(eyePosition,blend);world.camera.quaternion.copy(walkQuaternion).slerp(followQuaternion,blend);dialog.style.opacity=String(reduced()?1:ease(blend*1.7));
 if(state.status==='dismounting'&&blend<.4)delete document.documentElement.dataset.carouselOnboard;
 world.environmentView.update(elapsed,reduced());
 state.dream=world.dreamView.update(state.elapsed,followQuaternion,world.camera,reduced());
 world.renderer.render(world.scene,world.camera);state.frames++;
 state.cameraInSeat=world.camera.position.clone().applyMatrix4(selected.seat.matrixWorld.clone().invert()).toArray();state.camera=world.camera.position.toArray();state.eye=eyePosition.toArray();state.eyeLocal=selected.eye.position.toArray();state.phase=phase;state.seat=ride.selected;state.style=ride.style;state.blend=blend;
 if(returnStart!==null&&state.elapsed>=returnStart+EXIT)depart(false);else if(!reduced()&&state.elapsed>=BOARD+PERIOD*TURNS+EXIT)depart(true);
}
function requestReturn(){if(!state.active||returnStart!==null)return;returnStart=state.elapsed;leave.disabled=true;}
function depart(completed){
 if(!state.active)return;cancelAnimationFrame(frame);state.active=false;state.status='outside';delete document.documentElement.dataset.carouselOnboard;dialog.close();dialog.style.opacity='0';
 const elapsed=state.elapsed;document.dispatchEvent(new Event('carousel-onboard-changed'));if(completed)finish?.(elapsed);else pause?.();
}
window.DreamscapesCarouselRide=Object.freeze({preload,prepare,begin,get active(){return state.active;},diagnostics:()=>JSON.parse(JSON.stringify(state))});
