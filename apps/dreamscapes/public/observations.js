/* Local, anonymous observations. No recommender, network client or taste weights. */
(() => {
 'use strict';
 const KEY='dreamscapes.observations.v1',MAX=1500,VERSION=1;
 let fallbackSequence=0;
 function randomId(){
  try{if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();}catch{}
  // These anonymous local identifiers are not credentials. Old/insecure contexts
  // must still play when randomUUID is unavailable.
  return Date.now().toString(36)+'-'+(++fallbackSequence)+'-'+Math.random().toString(36).slice(2);
 }
 const categories=['preference','exploration','gameplay'],bands=['kids','pre-teens','teens','adults','unknown'];
 const token=v=>typeof v==='string'&&/^[a-z0-9][a-z0-9._:-]{0,119}$/.test(v);
 const label=v=>typeof v==='string'&&v.length>0&&v.length<=240&&!/[\u0000-\u001f]/.test(v);
 const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 const clone=v=>JSON.parse(JSON.stringify(v));
 const exact=(v,keys)=>object(v)&&Object.keys(v).every(k=>keys.includes(k));
 const alternatives=v=>Array.isArray(v)&&v.length<=24&&v.every(x=>exact(x,['id','label'])&&token(x.id)&&label(x.label))&&new Set(v.map(x=>x.id)).size===v.length;
 const attributes=v=>Array.isArray(v)&&v.length<=12&&v.every(x=>exact(x,['dimension','value','rationale'])&&['genres','tones','themes','characterDynamics'].includes(x.dimension)&&token(x.value)&&label(x.rationale));
 const ordered=(order,options)=>Array.isArray(order)&&order.length===options.length&&new Set(order).size===order.length&&order.every(id=>options.some(o=>o.id===id));
 const carouselModes=['named-mount-tickets','mount-image-thumbnails'];
 const eventKeys=['eventId','schemaVersion','sessionId','sceneId','visitId','interactionId','category','action','alternatives','selectedAlternative','presentationOrder','timestamp','ageBand','preferenceAttributes','preferenceSupported','decisionId','presentationId','origin','occurrenceId','details'];
 function validV1(e){
  return exact(e,eventKeys)&&eventKeys.every(k=>Object.hasOwn(e,k))&&e.schemaVersion===VERSION&&['eventId','sessionId','sceneId','visitId','interactionId','action','occurrenceId'].every(k=>token(e[k]))&&categories.includes(e.category)&&bands.includes(e.ageBand)&&['player','legacy','test_fixture'].includes(e.origin)&&Number.isSafeInteger(e.timestamp)&&e.timestamp>=0&&e.timestamp<=8640000000000000&&alternatives(e.alternatives)&&ordered(e.presentationOrder,e.alternatives)&&(e.selectedAlternative===null||e.alternatives.some(o=>o.id===e.selectedAlternative))&&attributes(e.preferenceAttributes)&&exact(e.details,['points','total','shot','round','visibleInspectionMs','examined','from','to','kind','style','mount','rideId','elapsedMs'])&&Object.values(e.details).every(v=>typeof v==='boolean'||Number.isFinite(v)&&Math.abs(v)<=1e9||token(v))&&(e.category==='preference'?e.action==='selected'&&e.preferenceSupported===true&&token(e.decisionId)&&token(e.presentationId)&&e.alternatives.length>=2&&e.selectedAlternative!==null&&e.preferenceAttributes.length>0:e.preferenceSupported===false&&e.decisionId===null&&e.presentationId===null&&e.preferenceAttributes.length===0);
 }
 function validEvent(e){
  if(e?.schemaVersion!==2)return validV1(e);
  const c=globalThis.DreamscapesCarouselCatalog;
  if(!c||!exact(e,[...eventKeys,'carousel','interpretation']))return false;
  const proxy={...e,schemaVersion:1,category:'gameplay',preferenceSupported:false,preferenceAttributes:[],decisionId:null,presentationId:null};delete proxy.carousel;delete proxy.interpretation;
  if(!validV1(proxy)||e.sceneId!=='rides-games'||e.interactionId!=='carousel-ride'||e.action!=='mount-selected')return false;
  const raw=e.carousel,interpretation=e.interpretation;
  if(!exact(raw,['style','rideId','catalogVersion','presentationMode','presentedAt','selectedAt','selectionTiming'])||!token(raw.rideId)||raw.style!==c.styleFor(e.ageBand)||raw.catalogVersion!==c.version||!carouselModes.includes(raw.presentationMode)||raw.selectionTiming!=='before-ride'||!Number.isSafeInteger(raw.presentedAt)||raw.presentedAt<0||raw.selectedAt!==e.timestamp||raw.selectedAt<raw.presentedAt)return false;
  if(e.alternatives.length<3||!e.selectedAlternative||!e.alternatives.every(o=>c.byId[o.id]?.label===o.label)||e.decisionId!==raw.rideId||e.presentationId!==raw.rideId||e.occurrenceId!==raw.rideId)return false;
  if(!exact(interpretation,['status','proposedAttributes','limitation'])||!['tentative','unsupported','insufficient-comparison','repeat-suppressed'].includes(interpretation.status)||interpretation.limitation!==c.limitation||JSON.stringify(interpretation.proposedAttributes)!==JSON.stringify(c.association(raw.style,e.selectedAlternative)))return false;
  const contributes=interpretation.status==='tentative';
  return e.category===(contributes?'preference':'gameplay')&&e.preferenceSupported===contributes&&JSON.stringify(e.preferenceAttributes)===JSON.stringify(contributes?interpretation.proposedAttributes:[]);
 }
 function createStore({storage=null,now=Date.now,uuid=randomId,ageBand=()=> 'unknown',catalog={},origin='player',onChange=()=>{},motionless=()=>false}={}){
  const id=prefix=>prefix+'-'+uuid();
  const fresh=()=>({schemaVersion:VERSION,sessionId:id('session'),events:[],carousel:null,visits:{},currentScene:null,presentations:[],completed:[],seen:[],legacyImported:false,diagnostics:{duplicates:0,discarded:0,storageFailures:0,reasons:{}}});
  let state=fresh(),readonly=false;
  function note(reason,duplicate=false){const d=state.diagnostics;d[duplicate?'duplicates':'discarded']++;d.reasons[reason]=(d.reasons[reason]||0)+1;}
  function save(){if(storage&&!readonly)try{storage.setItem(KEY,JSON.stringify(state));}catch{state.diagnostics.storageFailures++;}try{onChange();}catch{}}
  function reject(reason,duplicate=false){note(reason,duplicate);save();return {accepted:false,reason};}
  const fits=updates=>JSON.stringify({...state,...updates}).length<=1_800_000;
  const definition=interaction=>Object.hasOwn(catalog,interaction)?catalog[interaction]:null;
  function validPresentation(p){
   const d=object(p)&&definition(p.interactionId);
   return !!d&&exact(p,['presentationId','sceneId','visitId','interactionId','alternatives','presentationOrder','timestamp','ageBand'])&&token(p.presentationId)&&p.sceneId===d.sceneId&&token(p.visitId)&&alternatives(p.alternatives)&&JSON.stringify(p.alternatives)===JSON.stringify(d.alternatives.map(o=>({id:o.id,label:o.label})))&&ordered(p.presentationOrder,p.alternatives)&&Number.isSafeInteger(p.timestamp)&&bands.includes(p.ageBand);
  }
  const associations=()=>[...new Set(state.events.filter(e=>e.schemaVersion===2&&e.category==='preference'&&e.origin===origin).flatMap(e=>e.preferenceAttributes.map(a=>a.value)))];
  function supported(e){
   if(e.schemaVersion===2){const c=globalThis.DreamscapesCarouselCatalog;return !!c&&JSON.stringify(e.interpretation)===JSON.stringify(c.interpret(e.carousel.style,e.selectedAlternative,e.presentationOrder,associations()));}
   if(e.category!=='preference')return true;
   const p=state.presentations.find(p=>p.presentationId===e.presentationId),d=definition(e.interactionId),option=d?.alternatives.find(o=>o.id===e.selectedAlternative);
   return !!p&&!!option&&e.origin===origin&&e.sceneId===p.sceneId&&e.visitId===p.visitId&&e.ageBand===p.ageBand&&e.decisionId===p.presentationId&&JSON.stringify(e.alternatives)===JSON.stringify(p.alternatives)&&JSON.stringify(e.presentationOrder)===JSON.stringify(p.presentationOrder)&&JSON.stringify(e.preferenceAttributes)===JSON.stringify(option.attributes);
  }
  try{
   const raw=storage?.getItem(KEY);
   if(raw){
    const parsed=raw.length<=2_000_000?JSON.parse(raw):null;
    if(object(parsed)&&parsed.schemaVersion>VERSION){readonly=true;note('future_schema_readonly');}
    else if(object(parsed)&&parsed.schemaVersion===VERSION&&token(parsed.sessionId)&&Array.isArray(parsed.events)){
     state.sessionId=parsed.sessionId;
     if(object(parsed.visits))for(const [scene,visit]of Object.entries(parsed.visits).slice(0,100))if(token(scene)&&token(visit))state.visits[scene]=visit;
     state.currentScene=token(parsed.currentScene)&&Object.hasOwn(state.visits,parsed.currentScene)?parsed.currentScene:null;
     if(Array.isArray(parsed.presentations))state.presentations=parsed.presentations.slice(0,MAX).filter(validPresentation);
     if(Array.isArray(parsed.completed))state.completed=parsed.completed.slice(0,MAX).filter(p=>token(p)&&state.presentations.some(x=>x.presentationId===p));
     if(Array.isArray(parsed.seen))state.seen=parsed.seen.slice(0,MAX).filter(token);
     state.legacyImported=parsed.legacyImported===true;
     if(object(parsed.diagnostics))for(const k of ['duplicates','discarded','storageFailures'])if(Number.isSafeInteger(parsed.diagnostics[k])&&parsed.diagnostics[k]>=0)state.diagnostics[k]=parsed.diagnostics[k];
     if(object(parsed.diagnostics?.reasons))for(const [k,v]of Object.entries(parsed.diagnostics.reasons).slice(0,40))if(token(k)&&Number.isSafeInteger(v)&&v>=0)state.diagnostics.reasons[k]=v;
     const eventIds=new Set(),occurrences=new Set(),decisions=new Set();
     if(parsed.events.length>MAX)note('saved_capacity_exceeded');
     for(const e of parsed.events.slice(0,MAX)){
      if(!validEvent(e)||e.sessionId!==state.sessionId||!supported(e)){note('invalid_saved_event');continue;}
      if(eventIds.has(e.eventId)||occurrences.has(e.occurrenceId)||e.decisionId&&decisions.has(e.decisionId)){note('duplicate_saved_event',true);continue;}
      eventIds.add(e.eventId);occurrences.add(e.occurrenceId);if(e.decisionId){decisions.add(e.decisionId);if(!state.completed.includes(e.decisionId))state.completed.push(e.decisionId);}
      if(!state.seen.includes(e.occurrenceId))state.seen.push(e.occurrenceId);state.events.push(clone(e));
     }
     if(validCarouselState(parsed.carousel)&&(parsed.carousel.status==='choosing'||state.events.some(e=>e.schemaVersion===2&&e.carousel.rideId===parsed.carousel.rideId&&e.selectedAlternative===parsed.carousel.selected&&e.selectedAlternative===parsed.carousel.preview&&e.carousel.style===parsed.carousel.style&&e.ageBand===parsed.carousel.ageBand&&e.timestamp===parsed.carousel.selectedAt&&e.carousel.presentedAt===parsed.carousel.presentedAt&&e.carousel.presentationMode===(parsed.carousel.presentationMode||'named-mount-tickets')&&JSON.stringify(e.presentationOrder)===JSON.stringify(parsed.carousel.offered))))state.carousel=clone(parsed.carousel);
    }else note('invalid_saved_state');
   }
  }catch{note('storage_read_or_parse_failed');}
  function visit(scene){if(!token(scene))return null;if(!Object.hasOwn(state.visits,scene))state.visits[scene]=id('visit');return state.visits[scene];}
  function append(e){
   if(!validEvent(e)||!supported(e))return reject('invalid_event');
   if(state.seen.includes(e.occurrenceId)||e.decisionId&&state.completed.includes(e.decisionId))return reject('duplicate_occurrence',true);
   // Fail closed at capacity instead of evicting a dedupe ledger and recounting choices.
   if(state.events.length>=MAX||state.seen.length>=MAX)return reject('session_capacity');
   if(!fits({events:[...state.events,e],seen:[...state.seen,e.occurrenceId]}))return reject('session_byte_capacity');
   state.events.push(clone(e));state.seen.push(e.occurrenceId);if(e.decisionId)state.completed.push(e.decisionId);save();return {accepted:true,event:clone(e)};
  }
  function make(input,overrides={}){
   const options=input.alternatives||[];
   return {eventId:id('event'),schemaVersion:VERSION,sessionId:state.sessionId,sceneId:input.sceneId,visitId:visit(input.sceneId),interactionId:input.interactionId,category:input.category,action:input.action,alternatives:clone(options),selectedAlternative:input.selectedAlternative??null,presentationOrder:input.presentationOrder||options.map(o=>o.id),timestamp:now(),ageBand:bands.includes(ageBand())?ageBand():'unknown',preferenceAttributes:[],preferenceSupported:false,decisionId:null,presentationId:null,origin,occurrenceId:input.occurrenceId||id('occurrence'),details:input.details||{},...overrides};
  }
  function record(input){
   if(!exact(input,['sceneId','interactionId','category','action','alternatives','selectedAlternative','presentationOrder','occurrenceId','details'])||!['exploration','gameplay'].includes(input.category))return reject('unsupported_record');
   try{return append(make(input));}catch{return reject('invalid_input');}
  }
  function enterScene(scene){
   if(!token(scene))return reject('invalid_scene');
   if(state.currentScene===scene)return {accepted:false,reason:'same_scene_reload',visitId:visit(scene)};
   const from=state.currentScene;state.currentScene=scene;state.visits[scene]=id('visit');
   return record({sceneId:scene,interactionId:'scene-entry',category:'exploration',action:'entered',occurrenceId:state.visits[scene],details:from?{from,to:scene}:{to:scene}});
  }
  function presentDecision(interactionId,order){
   const d=definition(interactionId);
   if(!d||!token(d.sceneId)||!Array.isArray(d.alternatives)||d.alternatives.length<2||!d.alternatives.every(o=>attributes(o.attributes)&&o.attributes.length>0))return reject('unsupported_preference_interaction');
   const options=d.alternatives.map(o=>({id:o.id,label:o.label}));
   if(!alternatives(options)||!ordered(order||options.map(o=>o.id),options))return reject('invalid_presentation');
   const visitId=visit(d.sceneId),existing=state.presentations.find(p=>p.visitId===visitId&&p.interactionId===interactionId);
   if(existing)return clone(existing);
   if(state.presentations.length>=MAX)return reject('presentation_capacity');
   const p={presentationId:id('decision'),sceneId:d.sceneId,visitId,interactionId,alternatives:options,presentationOrder:order||options.map(o=>o.id),timestamp:now(),ageBand:bands.includes(ageBand())?ageBand():'unknown'};
   if(!fits({presentations:[...state.presentations,p]}))return reject('session_byte_capacity');
   state.presentations.push(p);save();return clone(p);
  }
  function commitDecision(presentationId,selection){
   const p=state.presentations.find(p=>p.presentationId===presentationId);
   if(!p)return reject('missing_presentation');
   const option=definition(p.interactionId)?.alternatives.find(o=>o.id===selection);
   if(!option)return reject('invalid_selection');
   if(state.currentScene!==p.sceneId||state.visits[p.sceneId]!==p.visitId||ageBand()!==p.ageBand)return reject('stale_presentation');
   return append(make({sceneId:p.sceneId,interactionId:p.interactionId,category:'preference',action:'selected',occurrenceId:p.presentationId},{visitId:p.visitId,alternatives:p.alternatives,selectedAlternative:selection,presentationOrder:p.presentationOrder,ageBand:p.ageBand,preferenceAttributes:clone(option.attributes),preferenceSupported:true,decisionId:p.presentationId,presentationId:p.presentationId}));
  }
  function importLegacy(raw){
   if(state.legacyImported)return;state.legacyImported=true;
   const targets={poster:'poster',puddle:'puddle',fox:'mara','Rides & Games':'rides-games','Tent Row':'tent-row','Ferris-Wheel Platform':'ferris-platform'};
   try{
    const entries=typeof raw==='string'&&raw.length<200_000?JSON.parse(raw):[];
    if(!Array.isArray(entries)){note('invalid_legacy');save();return;}
    entries.slice(-200).forEach((old,index)=>{
     if(!object(old)||!Object.hasOwn(targets,old.target)||!['object_inspected','destination_chosen','return_to_midway'].includes(old.type)||!Number.isSafeInteger(old.at)||old.at<0||old.at>8640000000000000){note('invalid_legacy_entry');return;}
     const target=targets[old.target],action={object_inspected:'inspected',destination_chosen:'navigation-requested',return_to_midway:'inspection-closed'}[old.type];
     append(make({sceneId:'midway',interactionId:target,category:'exploration',action,occurrenceId:'legacy-'+index+'-'+old.at},{origin:'legacy',ageBand:'unknown',timestamp:old.at}));
    });
   }catch{note('invalid_legacy');}save();
  }
  function validProgress(p){return exact(p,['elapsedMs','phase'])&&Number.isFinite(p.elapsedMs)&&p.elapsedMs>=0&&p.elapsedMs<=41600&&Number.isFinite(p.phase)&&p.phase>=0&&p.phase<1;}
  function validCarouselState(r){
   const c=globalThis.DreamscapesCarouselCatalog;
   return !!c&&exact(r,['rideId','visitId','style','ageBand','offered','preview','selected','status','presentedAt','selectedAt','progress','presentationMode'])&&(!Object.hasOwn(r,'presentationMode')||carouselModes.includes(r.presentationMode))&&(!Object.hasOwn(r,'progress')||validProgress(r.progress))&&token(r.rideId)&&token(r.visitId)&&r.style===c.styleFor(r.ageBand)&&Array.isArray(r.offered)&&r.offered.length<=20&&new Set(r.offered).size===r.offered.length&&r.offered.every(id=>Object.hasOwn(c.byId,id))&&['choosing','riding','complete'].includes(r.status)&&(r.preview===null||r.offered.includes(r.preview))&&(r.selected===null||r.offered.includes(r.selected))&&Number.isSafeInteger(r.presentedAt)&&r.presentedAt>=0&&(r.status==='choosing'?r.selected===null&&r.selectedAt===null:token(r.selected)&&Number.isSafeInteger(r.selectedAt)&&r.selectedAt>=r.presentedAt);
  }
  function carouselOffer(style,ids,presentationMode='named-mount-tickets'){
   const c=globalThis.DreamscapesCarouselCatalog;
   if(!c||!carouselModes.includes(presentationMode)||state.currentScene!=='rides-games'||style!==c.styleFor(ageBand())||!Array.isArray(ids)||ids.length!==3||new Set(ids).size!==3||!ids.every(id=>Object.hasOwn(c.byId,id)))return reject('invalid_carousel_offer');
   let r=state.carousel,changed=false;
   if(!r||r.style!==style||r.ageBand!==ageBand()||r.status==='choosing'&&(r.visitId!==visit('rides-games')||(r.presentationMode||'named-mount-tickets')!==presentationMode)){r=state.carousel={rideId:id('ride'),visitId:visit('rides-games'),style,ageBand:ageBand(),presentationMode,offered:[],preview:null,selected:null,status:'choosing',presentedAt:now(),selectedAt:null};changed=true;}
   if(r.status==='choosing')for(const option of ids)if(!r.offered.includes(option)){r.offered.push(option);changed=true;}
   if(changed)save();return clone(r);
  }
  function carouselPreview(rideId,mount){
   const r=state.carousel;if(!r||r.rideId!==rideId||r.status!=='choosing'||!r.offered.includes(mount))return reject('invalid_carousel_preview');
   if(r.preview!==mount){r.preview=mount;save();}return clone(r);
  }
  function carouselRide(rideId){
   const c=globalThis.DreamscapesCarouselCatalog,r=state.carousel;
   if(r?.rideId===rideId&&r.status!=='choosing')return reject('duplicate_carousel_choice',true);
   if(!c||!r||r.rideId!==rideId||r.status!=='choosing'||state.currentScene!=='rides-games'||r.visitId!==visit('rides-games')||r.style!==c.styleFor(ageBand())||r.ageBand!==ageBand()||!r.preview||r.offered.length<3)return reject('invalid_carousel_choice');
   const interpretation=c.interpret(r.style,r.preview,r.offered,associations()),contributes=interpretation.status==='tentative',selectedAt=now();
   const event=make({sceneId:'rides-games',interactionId:'carousel-ride',category:contributes?'preference':'gameplay',action:'mount-selected',occurrenceId:r.rideId,alternatives:r.offered.map(id=>({...c.byId[id]})),selectedAlternative:r.preview},{schemaVersion:2,visitId:r.visitId,timestamp:selectedAt,ageBand:r.ageBand,preferenceSupported:contributes,preferenceAttributes:contributes?interpretation.proposedAttributes:[],decisionId:r.rideId,presentationId:r.rideId,carousel:{style:r.style,rideId:r.rideId,catalogVersion:c.version,presentationMode:r.presentationMode||'named-mount-tickets',presentedAt:r.presentedAt,selectedAt,selectionTiming:'before-ride'},interpretation});
   r.selected=r.preview;r.status='riding';r.selectedAt=selectedAt;const recorded=append(event);save();return {accepted:true,recorded:recorded.accepted,ride:clone(r)};
  }
  function carouselComplete(rideId,elapsedMs){
   const c=globalThis.DreamscapesCarouselCatalog,r=state.carousel;
   if(r?.rideId===rideId&&r.status==='complete')return reject('duplicate_carousel_completion',true);
   if(!c||!r||r.rideId!==rideId||r.status!=='riding'||state.currentScene!=='rides-games'||r.ageBand!==ageBand()||r.style!==c.styleFor(ageBand())||!Number.isFinite(elapsedMs)||elapsedMs<0||elapsedMs>1e9||!motionless()&&elapsedMs<c.period*(c.rideTurns||1))return reject('incomplete_carousel_turn');
   r.status='complete';record({sceneId:'rides-games',interactionId:'carousel-ride',category:'gameplay',action:motionless()?'still-ride-finished':'ride-completed',occurrenceId:'completed-'+rideId,details:{style:r.style,mount:r.selected,rideId,elapsedMs:Math.round(elapsedMs)}});save();return {accepted:true,ride:clone(r)};
  }
  function carouselPause(rideId,progress){
   const r=state.carousel;if(!r||r.rideId!==rideId||r.status!=='riding'||!validProgress(progress))return reject('invalid_carousel_progress');
   r.progress=clone(progress);save();return {accepted:true};
  }
  function carouselAbandon(rideId){
   const c=globalThis.DreamscapesCarouselCatalog,r=state.carousel;
   if(!c||!r||r.rideId!==rideId||r.status!=='riding'||state.currentScene!=='rides-games'||r.ageBand!==ageBand()||r.style!==c.styleFor(ageBand()))return reject('invalid_carousel_abandon');
   // Keep the original selection evidence. No preference or completion is inferred.
   state.carousel=null;save();return {accepted:true};
  }
  function carouselAgain(style){
   const c=globalThis.DreamscapesCarouselCatalog,r=state.carousel;if(!c||state.currentScene!=='rides-games'||style!==c.styleFor(ageBand()))return reject('invalid_carousel_context');if(r&&r.status!=='complete')return reject('carousel_still_active');state.carousel=null;save();return {accepted:true};
  }
  return Object.freeze({record,enterScene,presentDecision,commitDecision,importLegacy,carouselOffer,carouselPreview,carouselRide,carouselComplete,carouselPause,carouselAbandon,carouselAgain,visitId:scene=>visit(scene),snapshot:()=>{
   const events=clone(state.events);return {schemaVersion:VERSION,sessionId:state.sessionId,ageBand:bands.includes(ageBand())?ageBand():'unknown',currentScene:state.currentScene,carousel:clone(state.carousel),events,counts:{total:events.length,preference:events.filter(e=>e.category==='preference'&&e.origin==='player').length,explicitPreference:events.filter(e=>e.schemaVersion===1&&e.category==='preference'&&e.origin==='player').length,tentativePreference:events.filter(e=>e.schemaVersion===2&&e.category==='preference'&&e.origin==='player').length,exploration:events.filter(e=>e.category==='exploration').length,gameplay:events.filter(e=>e.category==='gameplay').length,testFixtures:events.filter(e=>e.origin==='test_fixture').length},diagnostics:clone(state.diagnostics),persistence:readonly?'future-schema-readonly':!storage||state.diagnostics.storageFailures?'memory-only':'session-storage'};
  }});
 }
 globalThis.DreamscapesObservationCore=Object.freeze({createStore,validEvent,key:KEY,version:VERSION,newId:randomId});
 if(typeof document==='undefined')return;
 let storage;try{storage=sessionStorage;}catch{storage=null;}
 // Match the existing age-band module's default and accepted selection event.
 // In-memory choices still have accurate context when persistent storage is denied.
 let activeBand='adults';try{const value=localStorage.getItem('dreamscapes.age-band');if(bands.slice(0,4).includes(value))activeBand=value;}catch{}
 document.addEventListener('dreamscapes-age-band',event=>{if(bands.slice(0,4).includes(event.detail?.id))activeBand=event.detail.id;});
 const age=()=>activeBand;
 // Explicit narrative choices remain catalog-gated; Carousel V2 associations are separately tentative.
  const store=createStore({storage,ageBand:age,catalog:{},motionless:()=>matchMedia('(prefers-reduced-motion: reduce)').matches||new URLSearchParams(location.search).get('motion')==='still',onChange:()=>document.dispatchEvent(new Event('dreamscapes-observations-updated'))});
 try{store.importLegacy(storage?.getItem('carnival-experiment-observations'));}catch{store.importLegacy(null);}
 globalThis.DreamscapesObservations=store;
 if(!location.pathname.includes('/carnival'))store.enterScene('opening');
 const seenClicks=new WeakMap();
 document.addEventListener('click',event=>{
  const el=event.target.closest?.('[data-age-band],.carnival-entry,.carnival-exit,[data-pan],.location-look button');
  if(!el||el.closest('[inert]'))return;
  const scene=el.closest('[data-scene]')?.dataset.scene||(location.pathname.includes('/carnival')?'midway':'opening');
  let interaction,action,options=[],selection=null;
  if(el.matches('[data-age-band]')){interaction='age-band';action='configured';options=['kids','pre-teens','teens','adults'].map(id=>({id,label:{kids:'Kids','pre-teens':'Pre-Teens',teens:'Teens',adults:'Adults'}[id]}));selection=el.dataset.ageBand;}
  else if(el.matches('.carnival-entry')){interaction='opening-portal';action='portal-requested';options=[{id:'carnival',label:'Creepy Carnival'}];selection='carnival';}
  else if(el.matches('.carnival-exit')){interaction='carnival-exit';action='exit-requested';}
  else {interaction='camera';action='pan-requested';}
  // Suppress accidental double activation while retaining later deliberate visits/actions.
  const previous=seenClicks.get(el);if(previous&&performance.now()-previous.time<450){store.record({...previous.input});return;}
  const input={sceneId:scene,interactionId:interaction,category:'exploration',action,alternatives:options,selectedAlternative:selection,occurrenceId:'activation-'+randomId()};seenClicks.set(el,{time:performance.now(),input});
  store.record(input);
 });
 if(['127.0.0.1','localhost','[::1]'].includes(location.hostname)&&new URLSearchParams(location.search).get('observations')==='1'){
  const script=document.createElement('script');script.src='/observation-inspector.js?v=20261104-carousel-choice-1';document.head.append(script);
 }
})();
