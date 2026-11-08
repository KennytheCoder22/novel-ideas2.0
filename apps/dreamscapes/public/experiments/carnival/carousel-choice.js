/* Wordless mount portraits; selection remains a single recorded decision. */
(() => {
 'use strict';
 const catalog=window.DreamscapesCarouselCatalog,store=window.DreamscapesObservations;
 if(!catalog||!store)return;
 const mounted=new WeakSet(),NS='http://www.w3.org/2000/svg',portraits=import('./carousel-thumbnails.js');
 const icon=(path)=>'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="'+path+'"/></svg>';
 function attach(view,plane,svg){
  mounted.add(view);
  const plaque=document.createElement('section');plaque.className='carousel-choice';plaque.setAttribute('aria-label','Carousel mount selection');plaque.hidden=true;
  const row=document.createElement('div');row.className='carousel-choice-row';
  const previous=document.createElement('button');previous.setAttribute('aria-label','Previous mounts');previous.innerHTML=icon('M18 3 4 12l14 9Z');
  const options=document.createElement('div');options.className='carousel-choice-options';options.setAttribute('role','group');options.setAttribute('aria-label','Available mounts');
  const next=document.createElement('button');next.setAttribute('aria-label','Next mounts');next.innerHTML=icon('M6 3 20 12 6 21Z');const windowFrame=document.createElement('div');windowFrame.className='carousel-wheel-window';windowFrame.append(options);row.append(previous,windowFrame,next);
  const status=document.createElement('span');status.className='carousel-choice-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');plaque.append(row,status);for(const corner of ['tl','tr','bl','br']){const rivet=document.createElement('i');rivet.className='carousel-wheel-rivet '+corner;rivet.setAttribute('aria-hidden','true');plaque.append(rivet);}view.append(plaque);
  let index=0,ride=null,available=[],style=null,ready=false,rendering=false,key='',shown=[],marker=null,markerIdentity=null,visible=false,boardingBusy=false,error='',pendingFocus=null,warm=false,turning=false,animation=null,turnStyle=null,centeredRide=null,waitingOffers=[];
  function mark(identity){
   if(markerIdentity===identity&&marker?.isConnected)return;
   marker?.remove();marker=null;markerIdentity=null;if(!identity)return;
   const entry=window.carouselVariantDiagnostics?.().mounts.find(m=>m.identity===identity&&m.style===style&&m.visible);
   const slot=entry&&svg.querySelector(`[data-carousel-slot="${entry.slot}"]`),anchor=slot?.querySelector('.carousel-mount-anchor');if(!anchor)return;
   marker=document.createElementNS(NS,'g');marker.classList.add('carousel-choice-marker');marker.dataset.selectedMount=identity;marker.setAttribute('aria-hidden','true');
   // Anchor origin is the registered saddle socket; keep feedback above the deck artwork.
   const y=-12;
   const halo=document.createElementNS(NS,'ellipse');for(const [k,v]of Object.entries({cx:0,cy:y,rx:28,ry:7,fill:'none',stroke:'#f2d28b','stroke-width':2.5}))halo.setAttribute(k,v);marker.append(halo);
   const dot=document.createElementNS(NS,'circle');for(const [k,v]of Object.entries({cx:0,cy:y-14,r:4,fill:'#f2d28b'}))dot.setAttribute(k,v);marker.append(dot);anchor.append(marker);markerIdentity=identity;
  }
  function layout(){
   const rect=plane.getBoundingClientRect(),right=rect.left+rect.width*640/1671;
   visible=Math.min(innerWidth,right)-Math.max(0,rect.left)>=Math.min(150,innerWidth*.35);
   refresh();
  }

  function refresh(){
   if(rendering||!view.isConnected)return;rendering=true;
   try{
    const snapshot=store.snapshot(),diagnostics=window.carouselVariantDiagnostics?.();style=diagnostics?.selected;
    ready=style===catalog.styleFor(snapshot.ageBand);
    available=ready?catalog.mounts.filter(m=>diagnostics.mounts.some(e=>e.identity===m.id&&e.style===style&&e.visible)):[];ready=ready&&available.length>=3;
    ride=snapshot.carousel;const matching=ride&&ride.style===style&&ride.ageBand===snapshot.ageBand;
    if(!matching)ride=null;
    const waiting=ride?.status==='riding';
    plaque.hidden=!ready||view.inert||!!window.DreamscapesCarouselRide?.active;
    if(plaque.hidden){cancelTurn();centeredRide=null;waitingOffers=[];mark(null);return;}
    if(turning&&style!==turnStyle)cancelTurn();
    if(!warm){warm=true;window.DreamscapesCarouselRide?.preload().catch(()=>{warm=false;});}
    plaque.dataset.mode='wheel';row.hidden=false;plaque.setAttribute('aria-busy',String(boardingBusy||turning));
    if(waiting&&centeredRide!==ride.rideId){index=available.findIndex(m=>m.id===ride.selected)-1;centeredRide=ride.rideId;waitingOffers=[];}
    if(!waiting){centeredRide=null;waitingOffers=[];}
    if(turning){syncControls();return;}
    index=(index%available.length+available.length)%available.length;
    shown=Array.from({length:3},(_,i)=>available[(index+i)%available.length]);
    const nextKey=style+':'+shown.map(m=>m.id).join('|');
    if(key!==nextKey){
     const existing=new Map([...options.children].filter(b=>b.dataset.portraitStyle===style).map(b=>[b.dataset.artMountId,b])),keep=new Set();
     const radius=available.length>=5?2:1;
     for(let offset=-radius;offset<=radius;offset++){
      const m=available[(index+offset+1+available.length)%available.length];let button=existing.get(m.id);
      if(!button){
       button=document.createElement('button');button.dataset.artMountId=m.id;button.dataset.portraitStyle=style;button.setAttribute('aria-label','Ride '+m.label);button.disabled=true;
       const image=document.createElement('img');image.alt='';image.draggable=false;button.append(image);
       image.onload=()=>{button.dataset.imageReady='true';if(button.isConnected)refresh();syncControls();if(pendingFocus===button&&button.isConnected&&!button.disabled){button.focus({preventScroll:true});pendingFocus=null;}};
       const portraitStyle=style;portraits.then(p=>p.mountThumbnail(m.id,portraitStyle)).then(src=>{if(button.isConnected&&button.dataset.portraitStyle===portraitStyle)image.src=src;}).catch(()=>{status.textContent='Mount artwork is still arriving. Browse to try again.';});
       button.onclick=()=>chooseMount(m.id);
      }
      const front=Math.abs(offset)<=1;button.style.setProperty('--slot',String(offset));button.dataset.faceOffset=String(offset);button.inert=!front;button.setAttribute('aria-hidden',String(!front));button.tabIndex=front?0:-1;
      if(front)button.dataset.mountId=m.id;else delete button.dataset.mountId;
      options.append(button);keep.add(button);
     }
     for(const button of [...options.children])if(!keep.has(button))button.remove();key=nextKey;
    }
    for(const b of options.children){const resumable=waiting&&b.dataset.artMountId===ride.selected;const label=catalog.byId[b.dataset.artMountId].label;b.setAttribute('aria-label',resumable?'Resume '+label+' ride':'Ride '+label);}
    if(waiting){const ids=shown.map(m=>m.id);if(!waitingOffers.some(group=>group.join('|')===ids.join('|')))waitingOffers.push(ids);}
    syncControls();
    plaque.hidden=[...options.querySelectorAll('[data-mount-id]')].some(b=>b.dataset.imageReady!=='true');
    if(!ride||ride.status==='choosing'){const offered=store.carouselOffer(style,shown.map(m=>m.id),'mount-image-thumbnails');if(offered.rideId)ride=offered;}
    status.textContent=error||(boardingBusy?'Taking your seat.':waiting?'Select '+catalog.byId[ride.selected].label+' to resume your saved ride, or another mount to start a new ride.':shown.map(m=>m.label).join(', '));mark(ride?.selected||ride?.preview||null);
   }finally{rendering=false;}
  }
  function startSelection(){
   if(ride?.status==='complete'){if(!store.carouselAgain(style).accepted)return false;refresh();}
   return ride?.status==='choosing'||ride?.status==='riding';
  }
  function syncControls(){const loaded=[...options.children].every(b=>b.dataset.imageReady==='true');previous.disabled=next.disabled=boardingBusy||turning||!loaded;for(const b of options.children)b.disabled=boardingBusy||turning||!b.hasAttribute('data-mount-id')||b.dataset.imageReady!=='true';}
  function cancelTurn(){animation?.cancel();animation=null;turning=false;delete row.dataset.turning;}
  function focusPortrait(i){const target=options.querySelectorAll('[data-mount-id]')[i];pendingFocus=target||null;if(target&&!target.disabled){target.focus({preventScroll:true});pendingFocus=null;}}
  async function shift(delta,focusIndex){
   if(!ready||boardingBusy||turning||previous.disabled||window.DreamscapesCarouselRide?.active||!startSelection())return;
   error='';pendingFocus=null;
   if(!matchMedia('(prefers-reduced-motion: reduce)').matches&&available.length>=5){
    turning=true;turnStyle=style;row.dataset.turning='true';plaque.setAttribute('aria-busy','true');syncControls();
    const spin=options.animate([{transform:'translateZ(-150px) rotateY(0deg)'},{transform:'translateZ(-150px) rotateY('+(-delta*30)+'deg)'}],{duration:380,easing:'cubic-bezier(.24,.68,.24,1)',fill:'forwards'});animation=spin;
    try{await spin.finished;}catch{return;}
    if(animation!==spin)return;cancelTurn();
   }
   index+=delta;refresh();if(focusIndex!==undefined)focusPortrait(focusIndex);
  }
  previous.onclick=()=>shift(1);next.onclick=()=>shift(-1);
  row.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();const i=[...options.querySelectorAll('[data-mount-id]')].indexOf(document.activeElement);shift(event.key==='ArrowLeft'?1:-1,i<0?undefined:i);}});
  function restoreFocus(){refresh();focusPortrait(ride?.status==='riding'?1:0);}
  function begin(saved,onboard){onboard.begin(saved,svg,elapsed=>{store.carouselComplete(saved.rideId,elapsed);restoreFocus();},restoreFocus);}
  async function chooseMount(id){
   if(!ready||boardingBusy||turning||window.DreamscapesCarouselRide?.active||!startSelection()||!shown.some(m=>m.id===id))return;
   const saved=ride,pendingStyle=style,offers=waitingOffers.map(group=>group.slice());boardingBusy=true;error='';
   if(saved.status==='choosing')store.carouselPreview(saved.rideId,id);refresh();
   try{
    const onboard=window.DreamscapesCarouselRide;if(!onboard)throw Error('Onboard view loading');await onboard.prepare(pendingStyle,id);
    if(view.inert||store.snapshot().carousel?.rideId!==saved.rideId||style!==pendingStyle)return;
    if(saved.status==='riding'&&saved.selected===id){begin(saved,onboard);return;}
    let pending=saved.rideId;
    if(saved.status==='riding'){
     // Preserve the saved ride until the replacement is prepared; keep all old evidence.
     rendering=true;
     try{
      if(!store.carouselAbandon(saved.rideId).accepted)return;
      for(const group of offers.length?offers:[shown.map(m=>m.id)]){const offered=store.carouselOffer(pendingStyle,group,'mount-image-thumbnails');if(offered.rideId)pending=offered.rideId;}
      store.carouselPreview(pending,id);
     }finally{rendering=false;}
    }
    const result=store.carouselRide(pending);if(result.accepted)begin(result.ride,onboard);
   }catch(e){error='Your seat is still arriving. Activate the mount to try again.';console.warn('Carousel boarding unavailable',e);}
   finally{boardingBusy=false;refresh();}
  }
  document.addEventListener('carousel-onboard-changed',refresh);
  const camera=new MutationObserver(layout);camera.observe(plane,{attributes:true,attributeFilter:['style']});camera.observe(view,{attributes:true,attributeFilter:['inert']});
  document.addEventListener('dreamscapes-observations-updated',refresh);document.addEventListener('carousel-variant-loading',refresh);document.addEventListener('carousel-variant-changed',layout);addEventListener('resize',layout);layout();
 }
 const discover=()=>{const view=document.querySelector('[data-scene="rides-games"]'),plane=view?.querySelector('.location-plane'),svg=plane?.querySelector('.carousel-dressing');if(svg&&!mounted.has(view))attach(view,plane,svg);};
 new MutationObserver(discover).observe(document.body,{childList:true,subtree:true});discover();
})();
