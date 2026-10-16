import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {sharedMountRenderer} from './shared-mount-renderer.js';
import {mountVariants,resolveMountVariant} from './mount-variants.js';
import {envelope,prepareVariant} from './variant-registration.js';

const entries=new Map(),loader=new GLTFLoader();
let selected='ornate',busy=false,panel,status,gallery,angle=Math.PI/2;
const developer=new URLSearchParams(location.search).get('carousel-dev')==='1';

function dispose(model){
  const textures=new Set(),materials=new Set(),geometry=new Set();
  model.traverse(mesh=>{if(!mesh.isMesh)return;geometry.add(mesh.geometry);for(const m of [].concat(mesh.material)){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});
  textures.forEach(t=>{t.dispose();t.source?.data?.close?.();});materials.forEach(m=>m.dispose());geometry.forEach(g=>g.dispose());
}
export function registerVariantMount(entry){
  const identity=entry.identity;
  if(entries.has(identity))throw new Error('Duplicate Carousel identity: '+identity);
  // Compute canonical bounds before adding any variant parent transform.
  const reference=entry.model.clone(true);
  const bounds=new T.Box3().setFromObject(reference);
  const canonical={...entry,bounds,radius:envelope(reference,entry.mountPoint),ornate:entry.model,current:entry.model,style:'ornate',transform:null};
  entries.set(identity,canonical);
  entry.holder.dataset.variant='ornate';
  if(developer&&!panel)createPanel();
  updateStatus();
}
function updateStatus(message){
  if(!status)return;
  status.textContent=message||`${entries.size}/20 mounts ready · ${selected[0].toUpperCase()+selected.slice(1)}`;
  const inspect=panel.querySelector('[data-inspect]');if(inspect)inspect.disabled=busy||entries.size!==20;
  panel.querySelectorAll('[data-style]').forEach(b=>{b.disabled=busy||entries.size!==20;b.setAttribute('aria-pressed',String(b.dataset.style===selected));});
}
async function changeStyle(style){
  if(busy||entries.size!==20||!['ornate','plain','stuffed'].includes(style))return;
  if(style===selected)return;
  busy=true;updateStatus(`Loading ${style} models…`);
  const staged=[];let failures=0;
  try{
    for(const entry of entries.values()){
      const config=resolveMountVariant(entry.identity,style);
      if(style==='ornate'||config===mountVariants[entry.identity].ornate){if(style!=='ornate')failures++;staged.push({entry,current:entry.ornate,style:'ornate',transform:null});continue;}
      let model;
      try{
        model=(await loader.loadAsync(config.url)).scene;
        const prepared=prepareVariant(entry,model,config);
        staged.push({entry,current:prepared.wrapper,model,style,transform:prepared.transform});
      }catch(error){
        if(model)dispose(model);
        failures++;console.warn(`Carousel ${entry.identity}/${style}: using Ornate`,error);
        staged.push({entry,current:entry.ornate,style:'ornate',transform:null});
      }
      updateStatus(`Loading ${style} models… ${staged.length}/20`);
    }
    // Commit the complete batch in one JS turn. No intermediate mixed styles.
    for(const next of staged){
      const entry=next.entry,old=entry.current;
      entry.registration.remove(old);entry.registration.add(next.current);
      if(old!==entry.ornate)dispose(old);
      entry.current=next.current;entry.style=next.style;entry.transform=next.transform;
      entry.holder.dataset.variant=next.style;
      entry.holder.dataset.variantTransform=JSON.stringify(next.transform);entry.invalidate();
    }
    selected=style;
    document.dispatchEvent(new CustomEvent('carousel-variant-changed',{detail:{style,failures}}));
    if(gallery?.open)renderGallery();
    updateStatus(`${style[0].toUpperCase()+style.slice(1)} · ${20-failures}/20 models${failures?' · '+failures+' Ornate fallbacks':''}`);
  }finally{busy=false;updateStatus(status?.textContent);}
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
    const b=document.createElement('button');b.type='button';b.dataset.style=style;b.textContent=style[0].toUpperCase()+style.slice(1);b.addEventListener('click',()=>changeStyle(style).catch(console.error));panel.append(b);
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
window.carouselVariantDiagnostics=()=>({selected,busy,mounts:[...entries.values()].map(e=>({identity:e.identity,slot:e.slotNumber,style:e.style,transform:e.transform,holder:{x:e.holder.getAttribute('x'),y:e.holder.getAttribute('y'),width:e.holder.getAttribute('width'),height:e.holder.getAttribute('height')},mountHeight:e.slot.dataset.mountHeight,bobAmplitude:e.slot.dataset.bobAmplitude,turn:e.turn.rotation.y,registration:e.registration.position.toArray()}))});
