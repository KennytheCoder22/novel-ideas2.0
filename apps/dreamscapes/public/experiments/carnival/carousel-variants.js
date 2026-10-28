import {getAgeBand} from '../../age-band.js';
import {fetchMount,preloadMountStyle} from '../../mount-preload.js';
import {mountRigs} from './mount-rigs.js';
import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {sharedMountRenderer} from './shared-mount-renderer.js';
import {mountVariants,resolveMountVariant} from './mount-variants.js';
import {prepareVariant} from './variant-registration.js';

const entries=new Map(),loader=new GLTFLoader();
let requested=getAgeBand().style;
let selected=null,busy=false,panel,status,gallery,angle=Math.PI/2;
const developer=new URLSearchParams(location.search).get('carousel-dev')==='1';

const metrics=[];
export function registerVariantMount(entry){
 const identity=entry.identity;
 if(entries.has(identity))throw new Error('Duplicate Carousel identity: '+identity);
 const rig=mountRigs[identity];
 const bounds=new T.Box3(new T.Vector3(...rig.bounds.min),new T.Vector3(...rig.bounds.max));
 entry.registration.remove(entry.model);
 entries.set(identity,{...entry,bounds,radius:rig.radius,current:null,style:null,transform:null,loaded:new Map()});
 entry.holder.dataset.variant='loading';entry.holder.style.visibility='hidden';
 if(developer&&!panel)createPanel();updateStatus();
 if(entries.size===20)syncAgeBand();
}
async function loadPrepared(entry,style){
 const config=resolveMountVariant(entry.identity,style);
 const actual=config===mountVariants[entry.identity].ornate?'ornate':style;
 if(entry.loaded.has(actual))return entry.loaded.get(actual);
 const task=(async()=>{
  const start=performance.now(),bytes=await fetchMount(config),downloaded=performance.now();
  const model=(await loader.parseAsync(bytes,new URL('./carousel/',import.meta.url).href)).scene;
  const parsed=performance.now();
  const prepared=actual==='ornate'?{wrapper:model,transform:null}:prepareVariant(entry,model,config);
  metrics.push({identity:entry.identity,style:actual,bytes:bytes.byteLength,fetchWaitMs:downloaded-start,parseMs:parsed-downloaded,prepareMs:performance.now()-parsed});
  return {current:prepared.wrapper,style:actual,transform:prepared.transform};
 })();
 entry.loaded.set(actual,task);task.catch(()=>entry.loaded.delete(actual));return task;
}
function updateStatus(message){
  if(!status)return;
  status.textContent=message||`${entries.size}/20 mounts ready · ${(selected||requested)[0].toUpperCase()+(selected||requested).slice(1)}`;
  const inspect=panel.querySelector('[data-inspect]');if(inspect)inspect.disabled=busy||entries.size!==20;
  panel.querySelectorAll('[data-style]').forEach(b=>{b.disabled=busy||entries.size!==20;b.setAttribute('aria-pressed',String(b.dataset.style===selected));});
}
async function changeStyle(style){
 if(busy||entries.size!==20||!['ornate','plain','stuffed'].includes(style)||style===selected)return;
 busy=true;selected=null;let failures=0,unavailable=0,completed=0;
 preloadMountStyle(style);
 document.dispatchEvent(new CustomEvent('carousel-variant-loading',{detail:{style:null,target:style}}));
 for(const entry of entries.values())entry.holder.style.visibility='hidden';
 updateStatus(`Loading ${style} models…`);
 const list=[...entries.values()];let index=0;
 try{
  // Three bounded parse/prepare jobs; fetch queue independently caps downloads at four.
  await Promise.all(Array.from({length:3},async()=>{
   while(index<list.length&&requested===style){
    const entry=list[index++];let next;
    try{next=await loadPrepared(entry,style);if(next.style!==style)failures++;}
    catch(error){
     if(requested!==style)continue;
     if(style==='ornate'){unavailable++;entry.holder.dataset.variant='error';console.warn('Carousel mount unavailable',entry.identity,error);continue;}
     failures++;console.warn(`Carousel ${entry.identity}/${style}: using Ornate after load failure`,error);
     try{next=await loadPrepared(entry,'ornate');}catch(fallbackError){unavailable++;entry.holder.dataset.variant='error';console.warn('Carousel fallback unavailable',entry.identity,fallbackError);continue;}
    }
    if(requested!==style)continue;
    if(entry.current)entry.registration.remove(entry.current);
    entry.registration.add(next.current);entry.current=next.current;entry.style=next.style;entry.transform=next.transform;
    entry.holder.dataset.variant=next.style;entry.holder.dataset.variantTransform=JSON.stringify(next.transform);
    // Render the correct asset before exposing its canvas, never a stale/wrong-style frame.
    entry.carouselFrame.rotation.y=-Number(entry.slot.closest('.carousel-dressing')?.querySelector('.carousel-assembly')?.dataset.yaw||0);
    const renderStart=performance.now();entry.renderer.render(entry.scene,entry.camera);
    metrics.push({identity:entry.identity,style:next.style,firstRenderCpuMs:performance.now()-renderStart,readyAtMs:performance.now()});
    entry.holder.style.visibility='visible';entry.invalidate();completed++;
    const diagnostic=entry.identity==='horse'?window.carouselHorseComparison:window.carouselAnimalComparisons?.find(m=>m.name===entry.identity);if(diagnostic)diagnostic.model=next.current;
    updateStatus(`Loading ${style} models… ${completed}/20`);
   }
  }));
  if(requested===style){
   selected=style;
   document.dispatchEvent(new CustomEvent('carousel-variant-changed',{detail:{style,failures,unavailable}}));
   if(gallery?.open)renderGallery();
   updateStatus(`${style} · ${completed}/20 ready${failures?' · '+failures+' Ornate fallbacks':''}${unavailable?' · '+unavailable+' unavailable':''}`);
  }
 }finally{busy=false;updateStatus(status?.textContent);if(requested!==style)syncAgeBand();}
}
function renderGallery(){
  const grid=gallery.querySelector('.variant-review-grid');
  for(const old of grid.children)old.reviewRenderer?.dispose();
  grid.replaceChildren();
  for(const entry of [...entries.values()].sort((a,b)=>a.slotNumber-b.slotNumber)){
    const card=document.createElement('figure'),caption=document.createElement('figcaption'),canvas=document.createElement('canvas');
    card.dataset.identity=entry.identity;caption.textContent=`Row ${Math.floor((entry.slotNumber-1)/3)+1} · ${['outer','middle','inner'][(entry.slotNumber-1)%3]}: ${entry.identity} · ${entry.style}`;
    card.append(canvas,caption);grid.append(card);
    const renderer=sharedMountRenderer(T,canvas);card.reviewRenderer=renderer;
    renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;
    renderer.setSize(entry.renderer.domElement.width,entry.renderer.domElement.height,false);
    const previous=entry.carouselFrame.rotation.y;
    // Inspection only: draw into a separate shared-renderer canvas, then restore
    // the frame before returning. The running Carousel's pose is never changed.
    entry.carouselFrame.rotation.y=angle-entry.turn.rotation.y;
    renderer.render(entry.scene,entry.camera);entry.carouselFrame.rotation.y=previous;
  }
}
function createPanel(){
  const css=document.createElement('link');css.rel='stylesheet';css.href='./carousel-variants.css';document.head.append(css);
  panel=document.createElement('aside');panel.className='carousel-variant-dev';panel.setAttribute('aria-label','Developer Carousel variants');
  const title=document.createElement('strong');title.textContent='Carousel model review';panel.append(title);
  for(const style of ['ornate','plain','stuffed']){
    const b=document.createElement('button');b.type='button';b.dataset.style=style;b.textContent=style[0].toUpperCase()+style.slice(1);b.addEventListener('click',()=>{requested=style;changeStyle(style).catch(console.error);});panel.append(b);
  }
  status=document.createElement('div');status.setAttribute('role','status');status.setAttribute('aria-live','polite');panel.append(status);
  const inspect=document.createElement('button');inspect.type='button';inspect.dataset.inspect='';inspect.textContent='Inspect all 20';panel.append(inspect);
  gallery=document.createElement('dialog');gallery.className='variant-review';gallery.setAttribute('aria-label','All twenty mount positions');
  const controls=document.createElement('div');controls.className='variant-review-controls';
  const turn=document.createElement('button');turn.textContent='Rotate review 90°';turn.addEventListener('click',()=>{angle+=Math.PI/2;renderGallery();});
  const close=document.createElement('button');close.textContent='Close inspection';close.addEventListener('click',()=>gallery.close());controls.append(turn,close);
  const grid=document.createElement('div');grid.className='variant-review-grid';gallery.append(controls,grid);
  gallery.addEventListener('close',()=>{for(const card of grid.children)card.reviewRenderer?.dispose();grid.replaceChildren();inspect.focus();});
  inspect.addEventListener('click',()=>{if(entries.size!==20||busy)return;gallery.showModal();renderGallery();});
  document.body.append(panel,gallery);
}
// Read-only diagnostics make pose and model registration reviewable without
// exposing geometry mutation through the temporary developer control.
window.carouselVariantDiagnostics=()=>({selected,requested,busy,metrics:metrics.slice(),mounts:[...entries.values()].map(e=>({identity:e.identity,slot:e.slotNumber,style:e.style,visible:e.holder.style.visibility!=='hidden',transform:e.transform,holder:{x:e.holder.getAttribute('x'),y:e.holder.getAttribute('y'),width:e.holder.getAttribute('width'),height:e.holder.getAttribute('height')},mountHeight:e.slot.dataset.mountHeight,bobAmplitude:e.slot.dataset.bobAmplitude,turn:e.turn.rotation.y,registration:e.registration.position.toArray()}))});

function syncAgeBand(){
 if(busy||entries.size!==20)return;
 changeStyle(requested).catch(console.error);
}
document.addEventListener('dreamscapes-age-band',()=>{requested=getAgeBand().style;if(!busy&&requested===selected)return;for(const e of entries.values())e.holder.style.visibility='hidden';syncAgeBand();});

// References for the ride camera; callers clone transform nodes, never assets.
export function carouselRideEntries(){return [...entries.values()].filter(e=>e.current&&e.style===requested&&e.holder.style.visibility!=='hidden');}
