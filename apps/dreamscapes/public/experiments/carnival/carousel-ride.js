import * as T from './vendor/three.module.js';
import {getAgeBand} from '../../age-band.js';
import {carouselRideEntries} from './carousel-variants.js?v=20261028-ride';
import {installMountHardware,mechanicalSnapshot,perforatedPlate} from './carousel-mechanics.js?v=20261029-moving-poles';
import {carouselPoleMaterial} from './carousel-pole-material.js';
import {sharedMountRenderer} from './shared-mount-renderer.js';
import {recordChoice,recordObservation,handoff} from './carousel-evidence.js';
import {dreamDefaults,dreamConfig,dreamAmount} from './carousel-dream.js?v=20261028-perspective';

const local=['127.0.0.1','localhost'].includes(location.hostname)&&new URLSearchParams(location.search).has('carousel-ride-review');
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),still=new URLSearchParams(location.search).get('motion')==='still';
const DURATION=36,BOARD=1.8,DISMOUNT=1.5,TAU=Math.PI*2;
// Positions are in the prepared registration frame (after variant normalization).
// The socket is the pommel, not the rider's eyes. Horse/rocket noses use -X;
// dragon/unicorn noses use +Z. Offsets leave the centered shaft beside the view.
const riderProfiles={
 horse:{forward:[-1,0,0],back:.25,eye:.36,side:.11,pitch:-.22},
 rocket:{forward:[-1,0,0],back:.24,eye:.27,side:.11,pitch:-.28},
 unicorn:{forward:[0,0,1],back:.25,eye:.38,side:.11,pitch:-.20},
 dragon:{forward:[0,0,1],back:.30,eye:.47,side:.12,pitch:-.20}
};
const catalog=[
 {id:'dragon',name:'The Dragon',line:'A watchful companion with folded wings.',signals:{genreFamily:['fantasy'],themes:['mythology','adventure']}},
 {id:'rocket',name:'The Rocket',line:'A polished nose pointed beyond the lights.',signals:{genreFamily:['science fiction'],themes:['space exploration']}},
 {id:'horse',name:'The White Horse',line:'An old saddle, ready for another journey.',signals:{themes:['animals','adventure','journeys']}},
 {id:'unicorn',name:'The Unicorn',line:'A quiet glimmer along an ivory horn.',signals:{genreFamily:['fantasy'],themes:['wonder','magical worlds']}}
];
const responses=[
 {id:'light',label:'Reach toward the drifting light',text:'The light floats beside you, just beyond your fingertips.',signals:{themes:['wonder','exploration']}},
 {id:'bell',label:'Look for who rang the little bell',text:'An empty saddle passes. Its bell rings once more.',signals:{genreFamily:['mystery'],themes:['curiosity','discovery']}},
 {id:'watch',label:'Stay aboard and watch the sky',text:'You let the turning world tell its own story.',signals:{themes:['atmosphere','wonder'],tone:['reflective']}}
];
let current=null,frame=0,previous=0,lastResult=null;
const smooth=x=>{x=T.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
// Integral of a cosine-ramped velocity: exactly two turns, starting/stopping at rest.
function progress(t){t=T.MathUtils.clamp(t,0,DURATION);const ramp=3,travel=DURATION-ramp;if(t<ramp)return(t/2-ramp/(2*Math.PI)*Math.sin(Math.PI*t/ramp))/travel;if(t>DURATION-ramp)return 1-progress(DURATION-t);return(t-ramp/2)/travel;}
const structure=new Image();structure.src=new URL('./carousel/structure.png',import.meta.url).href;
function element(tag,className,text,parent){const e=document.createElement(tag);if(className)e.className=className;if(text)e.textContent=text;parent?.append(e);return e;}
function button(text,parent,handler){const b=element('button','',text,parent);b.type='button';b.onclick=handler;return b;}
function schedule(){if(!frame&&current&&!document.hidden)frame=requestAnimationFrame(tick);}
function announce(text){if(current)current.caption.textContent=text;}
function observeChoice(stage,choice){const s=current;if(!s||s.reviewOnly)return;recordChoice({rideId:s.id,stage,choice:choice.id,ageBand:s.band.id,signals:choice.signals});}
async function open(svg,trigger){
 if(current)return;const source=svg.closest('.location-view');if(!source||source.inert)return;
 const band=getAgeBand(),shell=element('section','carousel-ride');shell.setAttribute('role','region');shell.setAttribute('aria-label','The Enchanted Carousel');
 const canvas=element('canvas','carousel-ride-canvas','',shell);canvas.setAttribute('aria-hidden','true');element('div','carousel-ride-shade','',shell);
 const exit=button('Leave the carousel',shell,()=>leave('early-exit'));exit.className='carousel-ride-exit';
 const skip=button('Skip the ride',shell,()=>leave('skipped'));skip.className='carousel-ride-skip';skip.hidden=true;
 const panel=element('div','carousel-ride-panel','',shell),heading=element('h1','','The Enchanted Carousel',panel);heading.tabIndex=-1;
 const description=element('p','','The carousel turns toward you. Its saddles are waiting…',panel);description.setAttribute('role','status');
 const choices=element('div','carousel-ride-choices','',panel),caption=element('p','carousel-ride-caption','',shell);caption.setAttribute('role','status');caption.setAttribute('aria-live','polite');
 document.body.append(shell);
 const s=current={id:crypto.randomUUID(),band,svg,trigger,source,shell,canvas,exit,skip,panel,heading,description,choices,caption,phase:'loading',elapsed:0,boardTime:0,exitTime:0,selected:null,answer:null,prompted:false,entries:[],world:null,startPhase:Number(svg.dataset.phase||0),reduced:reduced.matches||still,reason:null,dreamEnabled:new URLSearchParams(location.search).get('perspective')!=='normal',dream:{...dreamDefaults}};
 const reviewMode=local&&new URLSearchParams(location.search).get('mechanics-review');
 s.reviewOnly=Boolean(reviewMode);s.reviewView=reviewMode==='stationary'||reviewMode==='rotating'?'exterior':'rider';s.paused=reviewMode==='stationary'||s.reduced;s.reviewAngle=.72;
 if(s.reviewOnly){s.dreamEnabled=reviewMode==='dream';s.startPhase=0;}
 source.inert=true;heading.focus();
 if(local){
  const review=element('details','carousel-ride-review','',shell);element('summary','','Perspective review',review);
  const label=element('label','','Preview ',review),mode=element('select','','',label);mode.setAttribute('aria-label','Perspective preview');for(const [value,text]of [['normal','A — Normal'],['dream','B — Dream']]){const option=element('option','',text,mode);option.value=value;}mode.value=s.dreamEnabled?'dream':'normal';mode.onchange=()=>{if(s.phase==='choosing'||s.phase==='loading')s.dreamEnabled=mode.value==='dream';};
  const intensityLabel=element('label','',' Dream intensity ',review),input=element('input','','',intensityLabel);input.type='range';input.min=0;input.max=1.25;input.step=.05;input.value=s.dream.intensity;input.setAttribute('aria-label','Dream intensity');input.oninput=()=>{if(s.phase==='choosing')s.dream.intensity=Number(input.value);};
  element('small','','Choose before boarding. Both modes use the same seat camera.',review);s.reviewInputs=[mode,input];
 }
 try{
  let attempts=0;while(current===s&&attempts++<900){const diag=window.carouselVariantDiagnostics?.();s.entries=carouselRideEntries();if(diag?.selected===band.style&&!diag.busy&&s.entries.length===20)break;await new Promise(r=>setTimeout(r,80));}
  if(current!==s)return;if(s.entries.length!==20)throw Error('Carousel mounts are not ready');await structure.decode();if(current!==s)return;
  s.phase='choosing';description.textContent='Which saddle draws you closer?';
  for(const choice of catalog){const entry=s.entries.find(e=>e.identity===choice.id);if(!entry)continue;const b=element('button','carousel-ride-mount','',choices);b.type='button';b.dataset.mount=choice.id;b.setAttribute('aria-label','Ride '+choice.name);const thumb=element('canvas','','',b);thumb.width=240;thumb.height=160;thumb.setAttribute('aria-hidden','true');const c=entry.renderer.domElement,k=Math.min(240/c.width,160/c.height);thumb.getContext('2d').drawImage(c,(240-c.width*k)/2,(160-c.height*k)/2,c.width*k,c.height*k);element('strong','',choice.name,b);element('small','',choice.line,b);b.onclick=()=>selectMount(choice);}
  if(s.reviewOnly){selectMount(catalog.find(c=>c.id===new URLSearchParams(location.search).get('mount'))||catalog[0]);s.phase='riding';s.boardTime=BOARD;mechanicalControls(s);s.world.paint();}
 }catch(error){if(current!==s)return;s.phase='error';description.textContent='The attendant is checking the saddles. Please leave the ride and try again.';console.error('Carousel boarding unavailable',error);}
}
function mechanicalControls(s){
 const tools=element('details','carousel-mechanical-review','',s.shell);element('summary','','Mechanical inspection controls',tools);
 const viewLabel=element('label','','View ',tools),view=element('select','','',viewLabel);view.setAttribute('aria-label','Inspection viewpoint');for(const value of ['exterior','rider']){const option=element('option','',value,view);option.value=value;}view.value=s.reviewView;view.onchange=()=>{s.reviewView=view.value;s.world.paint();};
 const play=button(s.paused?'Run carousel':'Pause carousel',tools,()=>{s.paused=!s.paused;if(!s.paused&&s.elapsed>=DURATION)s.elapsed=0;play.textContent=s.paused?'Run carousel':'Pause carousel';});play.disabled=s.reduced;s.reviewPlayButton=play;
 function atExtreme(high){const m=s.world.selected,row=Math.floor(m.index/3),ring=m.index%3,polarity=(row%2===0?1:-1)*(ring===1?-1:1),phase=(high?1:-1)===polarity?0:1/24;let lo=0,hi=18;for(let j=0;j<40;j++){const t=(lo+hi)/2;if(2*progress(t)<phase)lo=t;else hi=t;}s.elapsed=(lo+hi)/2;s.paused=true;play.textContent='Run carousel';s.world.paint();}
 button('Highest position',tools,()=>atExtreme(true));button('Lowest position',tools,()=>atExtreme(false));
 button('Replay from start',tools,()=>{s.elapsed=0;s.paused=s.reduced;play.textContent=s.paused?'Run carousel':'Pause carousel';s.world.paint();});
 const timeLabel=element('label','','Pause at time ',tools),time=element('input','','',timeLabel);time.type='range';time.min=0;time.max=36;time.step=.025;time.value=0;time.setAttribute('aria-label','Inspection time');time.oninput=()=>{s.paused=true;s.elapsed=Number(time.value);play.textContent='Run carousel';s.world.paint();};
 const angleLabel=element('label','','Walk around exterior ',tools),angle=element('input','','',angleLabel);angle.type='range';angle.min=0;angle.max=6.2831853;angle.step=.02;angle.value=s.reviewAngle;angle.setAttribute('aria-label','Exterior inspection angle');angle.oninput=()=>{s.reviewAngle=Number(angle.value);s.world.paint();};
 s.reviewTimeInput=time;announce(s.dreamEnabled?'Mechanical inspection: normal first turn, dream expansion on turn two.':'Mechanical inspection: normal mechanics; dream distortion disabled.');
}
function makeWorld(s){
 const scene=new T.Scene(),renderer=sharedMountRenderer(T,s.canvas);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;
 // The orthographic crop explicitly preserves world units per source SVG pixel.
 const reference=s.entries[0],unit=(reference.camera.right-reference.camera.left)/Number(reference.holder.getAttribute('width'));
 const deckRadius=708*unit,rings=[593,450,307].map(r=>r*unit);
 const slots=s.entries.map(entry=>{const index=entry.slotNumber-1,row=Math.floor(index/3),ring=index%3,angle=TAU*row/7+[0,.025,-.025][ring],radius=rings[ring]+(index===1?71.5*unit:0);return{entry,index,angle,radius,home:new T.Vector3(radius*Math.cos(angle),0,radius*Math.sin(angle))};});
 const mountHeight=e=>e.slot.dataset.mountHeight?Number(e.slot.dataset.mountHeight)*unit:-new T.Box3().setFromObject(e.registration.clone(true)).min.y+20*unit;
 const roofHeight=Math.max(324*unit,...s.entries.map(e=>mountHeight(e)+(riderProfiles[e.identity]?.eye||.45)+.30));
 const camera=new T.PerspectiveCamera(64,innerWidth/innerHeight,.015,100),orbit=new T.Group();scene.add(orbit);
 scene.add(new T.HemisphereLight(0xfff2de,0x514958,1.5));const key=new T.DirectionalLight(0xffecd3,2);key.position.set(-2,3,4);scene.add(key);
 const geometries=[],materials=[],textures=[],mounts=[];
 function geometry(g){geometries.push(g);return g;}function material(m){materials.push(m);return m;}
 function mesh(g,m,parent=scene){const o=new T.Mesh(g,m);parent.add(o);return o;}
 function sourceTexture(x,y,w,h){const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(structure,x,y,w,h,0,0,w,h);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;textures.push(t);return t;}
 const outside=s.source.querySelector('.location-background'),outsideCanvas=document.createElement('canvas');outsideCanvas.width=outside.naturalWidth;outsideCanvas.height=outside.naturalHeight;outsideCanvas.getContext('2d').drawImage(outside,0,0);const sky=new T.CanvasTexture(outsideCanvas);sky.colorSpace=T.SRGBColorSpace;sky.repeat.x=-1;sky.offset.x=1;textures.push(sky);
 const skyMesh=mesh(geometry(new T.SphereGeometry(10,48,24)),material(new T.MeshBasicMaterial({map:sky,side:T.BackSide})));skyMesh.rotation.y=-Math.PI/2;
 const roof=new T.Group();orbit.add(roof);const roofUnder=roofHeight-.0175;
 const wood=sourceTexture(1020,834,240,22);wood.wrapS=wood.wrapT=T.RepeatWrapping;wood.repeat.set(4,4);
 const deck=mesh(geometry(perforatedPlate(T,{radius:deckRadius,depth:.06,slots,holeRadius:4*unit*1.35})),material(new T.MeshStandardMaterial({map:wood,roughness:.8})));deck.position.y=-.03;orbit.add(deck);
 // Reuse the existing SVG ceiling colors and extracted stars, so its contact
 // plane is visible from below rather than reading as an unlit black void.
 const ceilingCanvas=document.createElement('canvas');ceilingCanvas.width=ceilingCanvas.height=1024;const cc=ceilingCanvas.getContext('2d'),gradient=cc.createRadialGradient(512,512,0,512,512,512);gradient.addColorStop(0,'#191d25');gradient.addColorStop(1,'#24272d');cc.fillStyle=gradient;cc.fillRect(0,0,1024,1024);
 const starCanvas=document.createElement('canvas');starCanvas.width=55;starCanvas.height=60;const sc=starCanvas.getContext('2d');sc.drawImage(structure,746,432,55,60,0,0,55,60);const pixels=sc.getImageData(0,0,55,60);for(let i=0;i<pixels.data.length;i+=4){const [r,g,b]=pixels.data.subarray(i,i+3);pixels.data[i+3]=Math.round(255*Math.max(0,Math.min(1,(r-g*1.25)/30))*Math.max(0,Math.min(1,(g-b*1.3)/30)));}sc.putImageData(pixels,0,0);
 for(let i=0;i<36;i++){const angle=(i%12+.5)*TAU/12,r=(300+Math.floor(i/12)*140)*512/675;cc.drawImage(starCanvas,512+r*Math.cos(angle)-14,512+r*Math.sin(angle)-10,28,20);}
 const ceilingTexture=new T.CanvasTexture(ceilingCanvas);ceilingTexture.colorSpace=T.SRGBColorSpace;textures.push(ceilingTexture);
 const ceiling=mesh(geometry(perforatedPlate(T,{radius:675*unit,depth:.035,slots,holeRadius:4*unit*1.35})),material(new T.MeshBasicMaterial({map:ceilingTexture,toneMapped:false})),roof);ceiling.position.y=roofHeight;
 const trim=sourceTexture(90,285,1350,155);trim.wrapS=T.RepeatWrapping;trim.repeat.x=2;
 mesh(geometry(new T.CylinderGeometry(680*unit,680*unit,135*unit,64,1,true)),material(new T.MeshBasicMaterial({map:trim,side:T.DoubleSide})),roof).position.y=roofHeight-55*unit;
 const portrait=sourceTexture(708,511,120,319);portrait.wrapS=T.RepeatWrapping;portrait.repeat.x=8;
 const column=mesh(geometry(new T.CylinderGeometry(100*unit,100*unit,roofUnder,8,1,true)),material(new T.MeshBasicMaterial({map:portrait,side:T.DoubleSide})));column.position.y=roofUnder/2;orbit.add(column);
 const brass=material(new T.MeshStandardMaterial({color:0xb48747,metalness:.7,roughness:.4})),shaftMaterial=material(carouselPoleMaterial(T,roofUnder+24*unit+.16,unit*300)),beam=geometry(new T.BoxGeometry(570*unit,.025,.025));
 textures.push(shaftMaterial.map);
 for(let i=0;i<12;i++){const a=i*TAU/12,b=mesh(beam,brass,roof);b.position.set(Math.cos(a)*355*unit,roofUnder-.0125,Math.sin(a)*355*unit);b.rotation.y=-a;}
 const bulbGeometry=geometry(new T.SphereGeometry(4*unit,8,6)),bulbMaterial=material(new T.MeshBasicMaterial({color:0xffd397})),bulbs=new T.InstancedMesh(bulbGeometry,bulbMaterial,48),matrix=new T.Matrix4();roof.add(bulbs);for(let i=0;i<48;i++){const a=i*TAU/48;matrix.makeTranslation(Math.cos(a)*665*unit,roofHeight-95*unit,Math.sin(a)*665*unit);bulbs.setMatrixAt(i,matrix);}
 for(const {entry:e,index,angle,radius,home} of slots){
  const base=new T.Group();base.position.copy(home);base.rotation.y=e.turn.rotation.y;orbit.add(base);
  const anchor=new T.Group();anchor.name='carousel-moving-assembly-'+e.identity;const copy=e.registration.clone(true);anchor.add(copy);base.add(anchor);const bob=Number(e.slot.dataset.bobAmplitude||12)*unit;
  const mount={entry:e,index,angle,radius,base,anchor,bob,height:mountHeight(e),copy};mounts.push(mount);
  installMountHardware(T,{mount,roofUnder,radius:4*unit,geometry,mesh,shaftMaterial,hardwareMaterial:brass});
 }
 // Low-intensity, static glimmers are enough for the functional prototype.
 const glimmers=new T.Group();scene.add(glimmers);const starG=geometry(new T.SphereGeometry(4*unit,8,6)),starM=material(new T.MeshBasicMaterial({color:s.selected.id==='rocket'?0xb6d9ff:0xffdc8f}));for(let i=0;i<24;i++){const a=i*2.39996,p=mesh(starG,starM,glimmers);p.position.set(Math.cos(a)*(12+i*.25)*100*unit,(3+(i%7)*.6)*100*unit,Math.sin(a)*(12+i*.25)*100*unit);}glimmers.visible=false;
 const selected=mounts.find(m=>m.entry.identity===s.selected.id),exterior=new T.Vector3(4,1.8,4.4),exteriorLook=new T.Vector3(0,.7,0);
 function seat(){
  orbit.updateMatrixWorld(true);const profile=riderProfiles[s.selected.id],forward=new T.Vector3(...profile.forward),side=new T.Vector3(-forward.z,0,forward.x);
  const eye=forward.clone().multiplyScalar(-profile.back).addScaledVector(side,profile.side);eye.y=profile.eye;
  const point=selected.anchor.localToWorld(eye.clone()),look=selected.anchor.localToWorld(eye.clone().addScaledVector(forward,3).add(new T.Vector3(0,profile.pitch*3,0)));
  return{point,look};
 }
 let distortion=0;
 function distort(amount){
  distortion=amount;const stretch=1+(s.dream.spaceScale-1)*amount,rise=roofHeight*s.dream.canopyRise*amount;
  deck.scale.set(stretch,1,stretch);roof.scale.set(stretch,1,stretch);roof.position.y=rise;
  column.scale.y=1+rise/roofUnder;column.position.y=(roofUnder+rise)/2;
  for(const m of mounts){m.base.position.copy(m.home);if(m!==selected)m.base.position.sub(selected.home).multiplyScalar(stretch).add(selected.home);m.setRoof(roofUnder+rise);}
  skyMesh.scale.setScalar(1+amount*.55);skyMesh.position.y=s.dream.environmentDisplacement*amount;
  camera.fov=64+s.dream.fovChange*amount;camera.updateProjectionMatrix();
 }
 function paint(){
  const p=progress(s.elapsed),phase=s.startPhase+(s.reduced?0:2*p);orbit.rotation.y=phase*TAU;s.svg.carouselRideClock?.setPhase(phase);
  for(const m of mounts){const lift=window.CarnivalCarousel.pose(m.index,phase).lift/28;m.anchor.position.y=m.height+(s.reduced?0:lift*m.bob);}
  distort(s.reduced||!s.dreamEnabled?0:dreamAmount(s.elapsed,s.dream)*(s.phase==='dismounting'?1-smooth(s.exitTime/DISMOUNT):1));
  const rider=seat();let blend=1;if(s.phase==='boarding')blend=s.reduced?1:smooth(s.boardTime/BOARD);else if(s.phase==='dismounting')blend=s.reduced?0:1-smooth(s.exitTime/DISMOUNT);
  camera.position.copy(exterior).lerp(rider.point,blend);camera.lookAt(exteriorLook.clone().lerp(rider.look,blend));if(s.reviewOnly&&s.reviewView==='exterior'){
   const distance=deckRadius/(Math.tan(camera.fov*Math.PI/360)*Math.min(1,camera.aspect))*1.4;
   camera.position.set(Math.cos(s.reviewAngle)*distance,roofHeight*.75,Math.sin(s.reviewAngle)*distance);camera.lookAt(0,roofHeight*.45,0);blend=1;
  }
  camera.updateMatrixWorld(true);s.canvas.style.opacity=String(blend);if(s.reviewTimeInput)s.reviewTimeInput.value=s.elapsed;
  glimmers.visible=s.phase!=='dismounting'&&(s.answer||p>.51);glimmers.rotation.y=s.reduced?0:Math.sin(s.elapsed*.12)*.025;
  renderer.render(scene,camera);
 }
 function resize(){renderer.setSize(Math.round(innerWidth*Math.min(devicePixelRatio||1,1.4)),Math.round(innerHeight*Math.min(devicePixelRatio||1,1.4)),false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();paint();}
 resize();return{scene,renderer,camera,orbit,mounts,selected,paint,resize,mechanics:()=>mechanicalSnapshot(T,{orbit,deck,roof,ceiling,mounts,roofUnder,distortion}),metrics:()=>({unit,deckRadius,roofHeight,profile:riderProfiles[s.selected.id],localEye:selected.anchor.worldToLocal(camera.position.clone()).toArray(),localForward:camera.getWorldDirection(new T.Vector3()).transformDirection(selected.anchor.matrixWorld.clone().invert()).toArray(),fov:camera.fov,distortion,dreamEnabled:s.dreamEnabled,dream:s.dream,spaceScale:deck.scale.x,roofRise:roof.position.y}),dispose(){distort(0);renderer.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();scene.clear();}};
}
function selectMount(choice){const s=current;if(!s||s.phase!=='choosing'||getAgeBand().id!==s.band.id)return;s.selected=choice;s.phase='boarding';s.reviewInputs?.forEach(e=>e.disabled=true);s.panel.hidden=true;s.skip.hidden=false;s.svg.dataset.riding='true';s.svg.carouselRideClock?.setPhase(s.startPhase);try{s.world=makeWorld(s);}catch(error){console.error('Carousel ride unavailable',error);leave('render-error',true);return;}observeChoice('mount',choice);announce('The saddle settles beneath you. The lights begin to turn.');s.skip.focus();previous=0;schedule();}
function prompt(){const s=current;if(!s||s.prompted)return;s.prompted=true;s.heading.textContent='A light slips between the poles…';s.description.textContent=s.band.id==='kids'?'A tiny bell answers it. Where will you look?':'A little bell sounds from an empty saddle. Where will you look?';s.choices.replaceChildren();for(const answer of responses){const b=button(answer.label,s.choices,()=>answerStory(answer));b.dataset.response=answer.id;}s.panel.hidden=false;s.heading.focus({preventScroll:true});s.world?.paint();}
function answerStory(answer){const s=current;if(!s||s.phase!=='riding'||s.answer||!s.prompted)return;s.answer=answer;observeChoice('story',answer);s.panel.hidden=true;s.skip.focus({preventScroll:true});announce(answer.text);s.world.paint();}
function startRiding(){const s=current;s.phase='riding';s.elapsed=0;announce(s.reduced?'The ride holds still around you. The lamps seem to breathe.':'The familiar midway drifts past. A small bell rings beneath the canopy.');if(s.reduced){s.skip.textContent='Let the lights change';s.skip.onclick=()=>{if(!current)return;if(!s.prompted){s.elapsed=DURATION/2;prompt();s.world.paint();s.skip.textContent='Return to the midway';}else leave('completed');};}}
function leave(reason,immediate=false){const s=current;if(!s)return;if(s.phase==='dismounting'&&!immediate)return;s.reason=reason;if(!s.world||immediate||s.reduced){finish();return;}s.phase='dismounting';s.exitTime=0;s.panel.hidden=true;s.skip.hidden=true;announce('The lights settle. The familiar midway waits beside the steps.');previous=0;schedule();}
function finish(){const s=current;if(!s)return;cancelAnimationFrame(frame);frame=0;previous=0;lastResult={rideId:s.id,ageBand:s.band.id,selected:s.selected?.id||null,answer:s.answer?.id||null,reason:s.reason,revolutions:s.reduced?0:2*progress(s.elapsed)};if(!s.reviewOnly)recordObservation('carousel_ride_ended',s.selected?.id||'none',{experience:'enchanted-carousel',rideId:s.id,ageBand:s.band.id,reason:s.reason,completed:s.reason==='completed'});s.world?.dispose();delete s.svg.dataset.riding;s.svg.carouselRideClock?.release();s.source.inert=false;s.shell.remove();current=null;s.trigger?.focus({preventScroll:true});}
function update(dt){const s=current;if(!s?.world)return;if(s.phase==='boarding'){s.boardTime+=dt;s.world.paint();if(s.reduced||s.boardTime>=BOARD)startRiding();}else if(s.phase==='riding'){if(s.reviewOnly&&s.paused)return;s.elapsed=Math.min(DURATION,s.elapsed+dt);if(!s.reviewOnly&&progress(s.elapsed)>=.5)prompt();if(!s.reduced)s.world.paint();if(s.elapsed>=DURATION){if(s.reviewOnly){s.paused=true;if(s.reviewPlayButton)s.reviewPlayButton.textContent='Run carousel';}else leave('completed');}}else if(s.phase==='dismounting'){s.exitTime+=dt;s.world.paint();if(s.exitTime>=DISMOUNT)finish();}}
function tick(now){frame=0;if(!current||document.hidden){previous=0;return;}const dt=previous?T.MathUtils.clamp((now-previous)/1000,0,.1):0;previous=now;update(dt);schedule();}
function keydown(event){if(!current)return;if(event.key==='Escape'){event.preventDefault();leave('early-exit');}else if(event.key==='Tab'){const list=[...current.shell.querySelectorAll('button')].filter(e=>!e.disabled&&e.getClientRects().length);if(!list.length)return;const first=list[0],last=list.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}}
document.addEventListener('keydown',keydown);document.addEventListener('visibilitychange',()=>{previous=0;if(document.hidden){cancelAnimationFrame(frame);frame=0;}else schedule();});
window.addEventListener('resize',()=>current?.world?.resize());document.addEventListener('dreamscapes-age-band',()=>{if(current)leave('age-band-changed',true);});reduced.addEventListener('change',()=>{if(current)leave('motion-preference-changed',true);});window.addEventListener('pagehide',()=>{if(current)leave('pagehide',true);});
function attach(){for(const svg of document.querySelectorAll('.carousel-dressing')){if(svg.dataset.rideReady)continue;svg.dataset.rideReady='true';const plane=svg.parentElement,source=svg.closest('.location-view'),target=element('button','carousel-board','',plane);target.type='button';target.setAttribute('aria-label','Approach and ride the carousel');target.onclick=()=>open(svg,target);const label=element('button','carousel-board-label','Ride the carousel',source);label.type='button';label.onclick=()=>open(svg,label);}}
const observer=new MutationObserver(attach);observer.observe(document.body,{childList:true,subtree:true});attach();
window.EnchantedCarousel=Object.freeze({state:()=>current?{phase:current.phase,selected:current.selected?.id||null,answer:current.answer?.id||null,ageBand:current.band.id,style:current.band.style,reduced:current.reduced,elapsed:current.elapsed,revolutions:current.reduced?0:2*progress(current.elapsed),mounts:current.world?.mounts.map(m=>({identity:m.entry.identity,style:m.entry.style,slot:m.entry.slotNumber}))||[],camera:current.world?.camera.position.toArray(),eyeDistance:current.world?current.world.camera.position.distanceTo(current.world.selected.anchor.getWorldPosition(new T.Vector3())):null,geometry:current.world?.metrics(),mechanics:local?current.world?.mechanics():undefined,orbitRadians:current.world?.orbit.rotation.y,sharedContextLost:current.world?.renderer.getContext().isContextLost()||false}:null,last:()=>lastResult,reviewFrame:local?settings=>{const s=current;if(!s?.reviewOnly)return false;if(Number.isFinite(settings.elapsed))s.elapsed=T.MathUtils.clamp(settings.elapsed,0,36);if(Number.isFinite(settings.angle))s.reviewAngle=settings.angle;if(['exterior','rider'].includes(settings.view))s.reviewView=settings.view;if(typeof settings.paused==='boolean')s.paused=settings.paused;s.world.paint();return true;}:undefined,evidence:()=>handoff(getAgeBand().id),advance:local?seconds=>{if(!current)return;if(current.phase==='boarding')update(BOARD);if(current?.phase==='riding')update(seconds);else if(current?.phase==='dismounting')update(DISMOUNT);}:undefined,configure:local?settings=>{if(!current||!['loading','choosing'].includes(current.phase))return false;current.dream=dreamConfig({...current.dream,...settings});return true;}:undefined,progress});
