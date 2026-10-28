import * as T from './vendor/three.module.js';
import {getAgeBand} from '../../age-band.js';
import {carouselRideEntries} from './carousel-variants.js?v=20261028-ride';
import {sharedMountRenderer} from './shared-mount-renderer.js';
import {recordChoice,recordObservation,handoff} from './carousel-evidence.js';

const local=['127.0.0.1','localhost'].includes(location.hostname)&&new URLSearchParams(location.search).has('carousel-ride-review');
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),still=new URLSearchParams(location.search).get('motion')==='still';
const DURATION=36,BOARD=1.8,DISMOUNT=1.5,TAU=Math.PI*2;
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
function observeChoice(stage,choice){const s=current;if(!s)return;recordChoice({rideId:s.id,stage,choice:choice.id,ageBand:s.band.id,signals:choice.signals});}
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
 const s=current={id:crypto.randomUUID(),band,svg,trigger,source,shell,canvas,exit,skip,panel,heading,description,choices,caption,phase:'loading',elapsed:0,boardTime:0,exitTime:0,selected:null,answer:null,prompted:false,entries:[],world:null,startPhase:Number(svg.dataset.phase||0),reduced:reduced.matches||still,reason:null};
 source.inert=true;heading.focus();
 try{
  let attempts=0;while(current===s&&attempts++<900){const diag=window.carouselVariantDiagnostics?.();s.entries=carouselRideEntries();if(diag?.selected===band.style&&!diag.busy&&s.entries.length===20)break;await new Promise(r=>setTimeout(r,80));}
  if(current!==s)return;if(s.entries.length!==20)throw Error('Carousel mounts are not ready');await structure.decode();if(current!==s)return;
  s.phase='choosing';description.textContent='Which saddle draws you closer?';
  for(const choice of catalog){const entry=s.entries.find(e=>e.identity===choice.id);if(!entry)continue;const b=element('button','carousel-ride-mount','',choices);b.type='button';b.dataset.mount=choice.id;b.setAttribute('aria-label','Ride '+choice.name);const thumb=element('canvas','','',b);thumb.width=240;thumb.height=160;thumb.setAttribute('aria-hidden','true');const c=entry.renderer.domElement,k=Math.min(240/c.width,160/c.height);thumb.getContext('2d').drawImage(c,(240-c.width*k)/2,(160-c.height*k)/2,c.width*k,c.height*k);element('strong','',choice.name,b);element('small','',choice.line,b);b.onclick=()=>selectMount(choice);}
 }catch(error){if(current!==s)return;s.phase='error';description.textContent='The attendant is checking the saddles. Please leave the ride and try again.';console.error('Carousel boarding unavailable',error);}
}
function makeWorld(s){
 const scene=new T.Scene(),renderer=sharedMountRenderer(T,s.canvas);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;
 const camera=new T.PerspectiveCamera(62,innerWidth/innerHeight,.04,100),orbit=new T.Group();scene.add(orbit);
 scene.add(new T.HemisphereLight(0xfff2de,0x514958,1.5));const key=new T.DirectionalLight(0xffecd3,2);key.position.set(-2,3,4);scene.add(key);
 const geometries=[],materials=[],textures=[],mounts=[];
 function geometry(g){geometries.push(g);return g;}function material(m){materials.push(m);return m;}
 function mesh(g,m,parent=scene){const o=new T.Mesh(g,m);parent.add(o);return o;}
 function sourceTexture(x,y,w,h){const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(structure,x,y,w,h,0,0,w,h);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;textures.push(t);return t;}
 const outside=s.source.querySelector('.location-background'),outsideCanvas=document.createElement('canvas');outsideCanvas.width=outside.naturalWidth;outsideCanvas.height=outside.naturalHeight;outsideCanvas.getContext('2d').drawImage(outside,0,0);const sky=new T.CanvasTexture(outsideCanvas);sky.colorSpace=T.SRGBColorSpace;sky.repeat.x=-1;sky.offset.x=1;textures.push(sky);
 const skyMesh=mesh(geometry(new T.SphereGeometry(45,48,24)),material(new T.MeshBasicMaterial({map:sky,side:T.BackSide})));skyMesh.rotation.y=-Math.PI/2;
 const wood=sourceTexture(1020,834,240,22);wood.wrapS=wood.wrapT=T.RepeatWrapping;wood.repeat.set(4,4);
 mesh(geometry(new T.CylinderGeometry(7.05,7.05,.14,64)),material(new T.MeshStandardMaterial({map:wood,roughness:.8}))).position.y=-.12;
 mesh(geometry(new T.CylinderGeometry(6.75,6.75,.08,64)),material(new T.MeshStandardMaterial({color:0x24272d,roughness:.9}))).position.y=3.22;
 const trim=sourceTexture(90,285,1350,155);trim.wrapS=T.RepeatWrapping;trim.repeat.x=2;
 mesh(geometry(new T.CylinderGeometry(6.8,6.8,.5,64,1,true)),material(new T.MeshBasicMaterial({map:trim,side:T.DoubleSide}))).position.y=3.07;
 const portrait=sourceTexture(708,511,120,319);portrait.wrapS=T.RepeatWrapping;portrait.repeat.x=8;
 mesh(geometry(new T.CylinderGeometry(1,1,2.65,8,1,true)),material(new T.MeshBasicMaterial({map:portrait,side:T.DoubleSide}))).position.y=1.325;
 const brass=material(new T.MeshStandardMaterial({color:0xb48747,metalness:.7,roughness:.4})),shaft=geometry(new T.CylinderGeometry(.022,.022,3.12,12)),beam=geometry(new T.BoxGeometry(5.7,.035,.035));
 for(let i=0;i<12;i++){const a=i*TAU/12,b=mesh(beam,brass);b.position.set(Math.cos(a)*3.55,3.16,Math.sin(a)*3.55);b.rotation.y=-a;}
 const bulbGeometry=geometry(new T.SphereGeometry(.045,8,6)),bulbMaterial=material(new T.MeshBasicMaterial({color:0xffd397})),bulbs=new T.InstancedMesh(bulbGeometry,bulbMaterial,48),matrix=new T.Matrix4();scene.add(bulbs);for(let i=0;i<48;i++){const a=i*TAU/48;matrix.makeTranslation(Math.cos(a)*6.65,2.88,Math.sin(a)*6.65);bulbs.setMatrixAt(i,matrix);}
 for(const e of s.entries){
  const index=e.slotNumber-1,row=Math.floor(index/3),ring=index%3,angle=TAU*row/7+[0,.025,-.025][ring],radius=[5.93,4.5,3.07][ring]+(index===1?.715:0),base=new T.Group();base.position.set(radius*Math.cos(angle),0,radius*Math.sin(angle));base.rotation.y=e.turn.rotation.y;orbit.add(base);
  const anchor=new T.Group(),copy=e.registration.clone(true);anchor.add(copy);base.add(anchor);const bounds=new T.Box3().setFromObject(copy),bob=Number(e.slot.dataset.bobAmplitude||12)*1.098745/300;
  const mount={entry:e,index,angle,radius,base,anchor,bob,height:-bounds.min.y+bob+.075,copy};mounts.push(mount);
  const pole=mesh(shaft,brass,base);pole.position.y=1.52;
 }
 // Low-intensity, static glimmers are enough for the functional prototype.
 const glimmers=new T.Group();scene.add(glimmers);const starG=geometry(new T.SphereGeometry(.04,8,6)),starM=material(new T.MeshBasicMaterial({color:s.selected.id==='rocket'?0xb6d9ff:0xffdc8f}));for(let i=0;i<24;i++){const a=i*2.39996,p=mesh(starG,starM,glimmers);p.position.set(Math.cos(a)*(12+i*.25),3+(i%7)*.6,Math.sin(a)*(12+i*.25));}glimmers.visible=false;
 const selected=mounts.find(m=>m.entry.identity===s.selected.id),exterior=new T.Vector3(11,3.4,12),exteriorLook=new T.Vector3(0,1.2,0);
 function seat(){orbit.updateMatrixWorld(true);const point=selected.anchor.getWorldPosition(new T.Vector3()),angle=selected.angle-orbit.rotation.y,heading=new T.Vector3(Math.sin(angle),0,-Math.cos(angle));point.y+=.60;point.addScaledVector(heading,-.14).addScaledVector(new T.Vector3(-heading.z,0,heading.x),.28);return{point,look:point.clone().addScaledVector(heading,8).add(new T.Vector3(0,-.33,0))};}
 function paint(){
  const p=progress(s.elapsed),phase=s.startPhase+(s.reduced?0:2*p);orbit.rotation.y=phase*TAU;s.svg.carouselRideClock?.setPhase(phase);
  for(const m of mounts){const lift=window.CarnivalCarousel.pose(m.index,phase).lift/28;m.anchor.position.y=m.height+(s.reduced?0:lift*m.bob);}
  const rider=seat();let blend=1;if(s.phase==='boarding')blend=s.reduced?1:smooth(s.boardTime/BOARD);else if(s.phase==='dismounting')blend=s.reduced?0:1-smooth(s.exitTime/DISMOUNT);
  camera.position.copy(exterior).lerp(rider.point,blend);camera.lookAt(exteriorLook.clone().lerp(rider.look,blend));camera.updateMatrixWorld(true);s.canvas.style.opacity=String(blend);
  glimmers.visible=s.phase!=='dismounting'&&(s.answer||p>.51);glimmers.rotation.y=s.reduced?0:Math.sin(s.elapsed*.12)*.025;
  renderer.render(scene,camera);
 }
 function resize(){renderer.setSize(Math.round(innerWidth*Math.min(devicePixelRatio||1,1.4)),Math.round(innerHeight*Math.min(devicePixelRatio||1,1.4)),false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();paint();}
 resize();return{scene,renderer,camera,orbit,mounts,selected,paint,resize,dispose(){renderer.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();scene.clear();}};
}
function selectMount(choice){const s=current;if(!s||s.phase!=='choosing'||getAgeBand().id!==s.band.id)return;s.selected=choice;s.phase='boarding';s.panel.hidden=true;s.skip.hidden=false;s.svg.dataset.riding='true';s.svg.carouselRideClock?.setPhase(s.startPhase);try{s.world=makeWorld(s);}catch(error){console.error('Carousel ride unavailable',error);leave('render-error',true);return;}observeChoice('mount',choice);announce('The saddle settles beneath you. The lights begin to turn.');s.skip.focus();previous=0;schedule();}
function prompt(){const s=current;if(!s||s.prompted)return;s.prompted=true;s.heading.textContent='A light slips between the poles…';s.description.textContent=s.band.id==='kids'?'A tiny bell answers it. Where will you look?':'A little bell sounds from an empty saddle. Where will you look?';s.choices.replaceChildren();for(const answer of responses){const b=button(answer.label,s.choices,()=>answerStory(answer));b.dataset.response=answer.id;}s.panel.hidden=false;s.heading.focus({preventScroll:true});s.world?.paint();}
function answerStory(answer){const s=current;if(!s||s.phase!=='riding'||s.answer||!s.prompted)return;s.answer=answer;observeChoice('story',answer);s.panel.hidden=true;s.skip.focus({preventScroll:true});announce(answer.text);s.world.paint();}
function startRiding(){const s=current;s.phase='riding';s.elapsed=0;announce(s.reduced?'The ride holds still around you. The lamps seem to breathe.':'The familiar midway drifts past. A small bell rings beneath the canopy.');if(s.reduced){s.skip.textContent='Let the lights change';s.skip.onclick=()=>{if(!current)return;if(!s.prompted){s.elapsed=DURATION/2;prompt();s.world.paint();s.skip.textContent='Return to the midway';}else leave('completed');};}}
function leave(reason,immediate=false){const s=current;if(!s)return;if(s.phase==='dismounting'&&!immediate)return;s.reason=reason;if(!s.world||immediate||s.reduced){finish();return;}s.phase='dismounting';s.exitTime=0;s.panel.hidden=true;s.skip.hidden=true;announce('The lights settle. The familiar midway waits beside the steps.');previous=0;schedule();}
function finish(){const s=current;if(!s)return;cancelAnimationFrame(frame);frame=0;previous=0;lastResult={rideId:s.id,ageBand:s.band.id,selected:s.selected?.id||null,answer:s.answer?.id||null,reason:s.reason,revolutions:s.reduced?0:2*progress(s.elapsed)};recordObservation('carousel_ride_ended',s.selected?.id||'none',{experience:'enchanted-carousel',rideId:s.id,ageBand:s.band.id,reason:s.reason,completed:s.reason==='completed'});s.world?.dispose();delete s.svg.dataset.riding;s.svg.carouselRideClock?.release();s.source.inert=false;s.shell.remove();current=null;s.trigger?.focus({preventScroll:true});}
function update(dt){const s=current;if(!s?.world)return;if(s.phase==='boarding'){s.boardTime+=dt;s.world.paint();if(s.reduced||s.boardTime>=BOARD)startRiding();}else if(s.phase==='riding'){s.elapsed=Math.min(DURATION,s.elapsed+dt);if(progress(s.elapsed)>=.5)prompt();if(!s.reduced)s.world.paint();if(s.elapsed>=DURATION)leave('completed');}else if(s.phase==='dismounting'){s.exitTime+=dt;s.world.paint();if(s.exitTime>=DISMOUNT)finish();}}
function tick(now){frame=0;if(!current||document.hidden){previous=0;return;}const dt=previous?T.MathUtils.clamp((now-previous)/1000,0,.1):0;previous=now;update(dt);schedule();}
function keydown(event){if(!current)return;if(event.key==='Escape'){event.preventDefault();leave('early-exit');}else if(event.key==='Tab'){const list=[...current.shell.querySelectorAll('button')].filter(e=>!e.disabled&&e.getClientRects().length);if(!list.length)return;const first=list[0],last=list.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}}
document.addEventListener('keydown',keydown);document.addEventListener('visibilitychange',()=>{previous=0;if(document.hidden){cancelAnimationFrame(frame);frame=0;}else schedule();});
window.addEventListener('resize',()=>current?.world?.resize());document.addEventListener('dreamscapes-age-band',()=>{if(current)leave('age-band-changed',true);});reduced.addEventListener('change',()=>{if(current)leave('motion-preference-changed',true);});window.addEventListener('pagehide',()=>{if(current)leave('pagehide',true);});
function attach(){for(const svg of document.querySelectorAll('.carousel-dressing')){if(svg.dataset.rideReady)continue;svg.dataset.rideReady='true';const plane=svg.parentElement,source=svg.closest('.location-view'),target=element('button','carousel-board','',plane);target.type='button';target.setAttribute('aria-label','Approach and ride the carousel');target.onclick=()=>open(svg,target);const label=element('button','carousel-board-label','Ride the carousel',source);label.type='button';label.onclick=()=>open(svg,label);}}
const observer=new MutationObserver(attach);observer.observe(document.body,{childList:true,subtree:true});attach();
window.EnchantedCarousel=Object.freeze({state:()=>current?{phase:current.phase,selected:current.selected?.id||null,answer:current.answer?.id||null,ageBand:current.band.id,style:current.band.style,reduced:current.reduced,elapsed:current.elapsed,revolutions:current.reduced?0:2*progress(current.elapsed),mounts:current.world?.mounts.map(m=>({identity:m.entry.identity,style:m.entry.style,slot:m.entry.slotNumber}))||[],camera:current.world?.camera.position.toArray(),eyeDistance:current.world?current.world.camera.position.distanceTo(current.world.selected.anchor.getWorldPosition(new T.Vector3())):null,orbitRadians:current.world?.orbit.rotation.y,sharedContextLost:current.world?.renderer.getContext().isContextLost()||false}:null,last:()=>lastResult,evidence:()=>handoff(getAgeBand().id),advance:local?seconds=>{if(!current)return;if(current.phase==='boarding')update(BOARD);if(current?.phase==='riding')update(seconds);else if(current?.phase==='dismounting')update(DISMOUNT);}:undefined,progress});
