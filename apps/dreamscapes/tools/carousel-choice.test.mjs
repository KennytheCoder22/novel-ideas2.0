import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/carousel-choice-catalog.js';
import '../public/observations.js';
const {createStore,validEvent,key}=globalThis.DreamscapesObservationCore,catalog=globalThis.DreamscapesCarouselCatalog;
const minimum=catalog.period*catalog.rideTurns;
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};
let sequence=0;
function setup(storage=memory(),initial='adults',still=false){let band=initial;const options={storage,uuid:()=>String(++sequence),now:()=>1800000000000,ageBand:()=>band,motionless:()=>still};return {store:createStore(options),storage,options,setBand:value=>{band=value}};}
function select(s,id){const ride=s.carouselOffer(catalog.styleFor(s.snapshot().ageBand),['dragon','rocket','horse']);s.carouselPreview(ride.rideId,id);return s.carouselRide(ride.rideId);}

test('all four age bands have genuine alternatives and separately tentative interpretations',()=>{
 for(const band of ['kids','pre-teens','teens','adults']){const {store:s}=setup(undefined,band);s.enterScene('rides-games');assert(select(s,'dragon').accepted);const e=s.snapshot().events.find(e=>e.schemaVersion===2);assert(validEvent(e));assert.equal(e.category,'preference');assert.equal(e.interpretation.status,'tentative');assert.equal(e.carousel.style,catalog.styleFor(band));assert.deepEqual(e.presentationOrder,['dragon','rocket','horse']);assert.equal(e.selectedAlternative,'dragon');assert.equal(e.preferenceAttributes[0].value,'fantasy');assert.equal(s.snapshot().counts.explicitPreference,0);assert.equal(s.snapshot().counts.tentativePreference,1);assert.equal(e.action,'mount-selected');assert(e.preferenceAttributes.every(a=>a.value==='fantasy'));assert.equal(e.selectedAlternative,'dragon');}
});
test('only actually offered named tickets are included; preliminary changes are not decisions',()=>{
 const {store:s}=setup();s.enterScene('rides-games');let r=s.carouselOffer('ornate',['dragon','rocket','horse']);s.carouselPreview(r.rideId,'dragon');s.carouselPreview(r.rideId,'rocket');assert.equal(s.snapshot().events.filter(e=>e.schemaVersion===2).length,0);r=s.carouselOffer('ornate',['unicorn','cat','zebra']);s.carouselPreview(r.rideId,'unicorn');s.carouselRide(r.rideId);const e=s.snapshot().events.at(-1);assert.deepEqual(e.presentationOrder,['dragon','rocket','horse','unicorn','cat','zebra']);assert(!e.alternatives.some(a=>a.id==='griffin'));assert.equal(e.carousel.selectionTiming,'before-ride');assert.equal(e.timestamp,e.carousel.selectedAt);
});
test('callbacks, reload and rotation cannot create duplicate choices',()=>{
 const {store:s,storage,options}=setup();s.enterScene('rides-games');const first=select(s,'dragon');assert(!s.carouselRide(first.ride.rideId).accepted);const reload=createStore(options);reload.enterScene('rides-games');assert.equal(reload.snapshot().carousel.selected,'dragon');assert(!reload.carouselRide(first.ride.rideId).accepted);assert.equal(reload.snapshot().events.filter(e=>e.schemaVersion===2).length,1);assert(!reload.carouselComplete(first.ride.rideId,minimum-1).accepted);assert(reload.carouselComplete(first.ride.rideId,minimum).accepted);assert(!reload.carouselComplete(first.ride.rideId,minimum).accepted);assert.equal(reload.snapshot().counts.tentativePreference,1);
});
test('later rides have new raw decisions; repeated mount/family does not multiply evidence',()=>{
 const {store:s}=setup();s.enterScene('rides-games');const first=select(s,'dragon');s.carouselComplete(first.ride.rideId,minimum);s.carouselAgain('ornate');const second=select(s,'dragon');assert.notEqual(second.ride.rideId,first.ride.rideId);assert.equal(s.snapshot().events.at(-1).interpretation.status,'repeat-suppressed');s.carouselComplete(second.ride.rideId,minimum);s.carouselAgain('ornate');const rocket=select(s,'rocket');assert.equal(s.snapshot().counts.tentativePreference,2);s.carouselComplete(rocket.ride.rideId,minimum);s.carouselAgain('ornate');let r=s.carouselOffer('ornate',['unicorn','rocket','horse']);s.carouselPreview(r.rideId,'unicorn');s.carouselRide(r.rideId);assert.equal(s.snapshot().events.at(-1).category,'gameplay');assert.equal(s.snapshot().events.at(-1).interpretation.status,'repeat-suppressed');
});
test('ordinary animals and insufficient comparisons remain gameplay',()=>{
 const {store:s}=setup();s.enterScene('rides-games');select(s,'horse');assert.equal(s.snapshot().events.at(-1).category,'gameplay');assert.equal(s.snapshot().events.at(-1).interpretation.status,'unsupported');assert.equal(s.snapshot().counts.preference,0);
 const {store:t}=setup();t.enterScene('rides-games');let r=t.carouselOffer('ornate',['unicorn','cat','horse']);t.carouselPreview(r.rideId,'unicorn');t.carouselRide(r.rideId);assert.equal(t.snapshot().events.at(-1).interpretation.status,'insufficient-comparison');assert.equal(t.snapshot().events.at(-1).preferenceAttributes.length,0);
});
test('skip, changed age, malformed inputs and corrupt stored choices fail safely',()=>{
 const x=setup(),s=x.store;s.enterScene('rides-games');const pending=s.carouselOffer('ornate',['dragon','rocket','horse']);s.carouselPreview(pending.rideId,'dragon');s.enterScene('midway');assert(!s.carouselRide(pending.rideId).accepted);assert.equal(s.snapshot().counts.preference,0);s.enterScene('rides-games');const later=s.carouselOffer('ornate',['dragon','rocket','horse']);assert.notEqual(later.rideId,pending.rideId);x.setBand('kids');assert(!s.carouselRide(later.rideId).accepted);assert(!s.carouselOffer('ornate',['dragon','rocket','horse']).rideId);assert(!s.carouselOffer('stuffed',['dragon','dragon','horse']).rideId);assert(!s.carouselPreview(later.rideId,'invented').accepted);
 const good=setup();good.store.enterScene('rides-games');select(good.store,'dragon');const raw=JSON.parse(good.storage.getItem(key));raw.events.find(e=>e.schemaVersion===2).carousel.style='plain';raw.carousel.selected='invented';good.storage.setItem(key,JSON.stringify(raw));const restored=createStore(good.options);assert.equal(restored.snapshot().counts.preference,0);assert.equal(restored.snapshot().carousel,null);assert(restored.snapshot().diagnostics.discarded>0);
});
test('reduced motion is explicitly a still ride, never a false revolution',()=>{
 const {store:s}=setup(undefined,'kids',true);s.enterScene('rides-games');const r=select(s,'rocket');assert(s.carouselComplete(r.ride.rideId,0).accepted);assert.equal(s.snapshot().events.at(-1).action,'still-ride-finished');assert.equal(s.snapshot().events.at(-1).details.elapsedMs,0);
});
test('storage byte budget preserves session and dedupe instead of overflowing its restore limit',()=>{
 const storage=memory(),{store:s,options}=setup(storage),alternatives=Array.from({length:24},(_,i)=>({id:'choice-'+i,label:'x'.repeat(240)}));let rejected;
 for(let i=0;i<400;i++){const result=s.record({sceneId:'midway',interactionId:'budget-test',category:'exploration',action:'inspected',occurrenceId:'budget-'+i,alternatives});if(!result.accepted){rejected=result;break;}}
 assert.equal(rejected.reason,'session_byte_capacity');assert(storage.getItem(key).length<2_000_000);const restored=createStore(options);assert.equal(restored.snapshot().sessionId,s.snapshot().sessionId);assert.equal(restored.snapshot().events.length,s.snapshot().events.length);
});

test('restored ride metadata cannot substitute another mount for the validated choice',()=>{
 const x=setup();x.store.enterScene('rides-games');select(x.store,'dragon');const raw=JSON.parse(x.storage.getItem(key));raw.carousel.selected='rocket';raw.carousel.preview='rocket';x.storage.setItem(key,JSON.stringify(raw));const restored=createStore(x.options);assert.equal(restored.snapshot().carousel,null);assert.equal(restored.snapshot().counts.tentativePreference,1);assert.equal(restored.snapshot().events.at(-1).selectedAlternative,'dragon');
});

test('onboard completion requires both full turns without another preference choice',()=>{const {store:s}=setup();s.enterScene('rides-games');const r=select(s,'dragon');assert(!s.carouselComplete(r.ride.rideId,catalog.period).accepted);assert(!s.carouselComplete(r.ride.rideId,minimum-1).accepted);assert(s.carouselComplete(r.ride.rideId,minimum).accepted);assert.equal(s.snapshot().events.filter(e=>e.schemaVersion===2).length,1);assert.equal(s.snapshot().counts.tentativePreference,1);});


test('paused positions survive reload; abandoning preserves all evidence and rejects stale callbacks',()=>{
 const x=setup(),s=x.store;s.enterScene('rides-games');const first=select(s,'dragon').ride;
 const evidence=s.snapshot().events,counts=s.snapshot().counts;
 assert(s.carouselPause(first.rideId,{elapsedMs:29200,phase:.73}).accepted);
 const restored=createStore(x.options);assert.deepEqual(restored.snapshot().carousel.progress,{elapsedMs:29200,phase:.73});
 assert(restored.carouselAbandon(first.rideId).accepted);assert.equal(restored.snapshot().carousel,null);
 assert.deepEqual(restored.snapshot().events,evidence);assert.deepEqual(restored.snapshot().counts,counts);
 assert(!restored.carouselPause(first.rideId,{elapsedMs:31000,phase:.8}).accepted);
 assert(!restored.carouselComplete(first.rideId,minimum).accepted);
 assert(!restored.carouselAbandon(first.rideId).accepted);
 const next=select(restored,'rocket').ride;assert.notEqual(next.rideId,first.rideId);assert.equal(next.progress,undefined);
 assert(!restored.carouselComplete(first.rideId,minimum).accepted);
 assert(restored.carouselComplete(next.rideId,minimum).accepted);
 assert.equal(restored.snapshot().events.filter(e=>e.action==='ride-completed').length,1);
 assert.equal(restored.snapshot().events.filter(e=>e.schemaVersion===2).length,2);
 assert(restored.carouselAgain('ornate').accepted);const repeated=select(restored,'dragon').ride;
 assert.equal(restored.snapshot().events.at(-1).interpretation.status,'repeat-suppressed');
 assert(restored.carouselAbandon(repeated.rideId).accepted);
 assert.deepEqual(createStore(x.options).snapshot().events,restored.snapshot().events);
});
test('progress validation rejects corrupt saves and legacy active rides remain resumable',()=>{
 const x=setup(),s=x.store;s.enterScene('rides-games');const first=select(s,'horse').ride;
 assert.equal(createStore(x.options).snapshot().carousel.progress,undefined);
 for(const progress of [{elapsedMs:-1,phase:.5},{elapsedMs:Infinity,phase:.5},{elapsedMs:50000,phase:.5},{elapsedMs:100,phase:1},{elapsedMs:100,phase:NaN},{elapsedMs:100,phase:.5,extra:true}])assert(!s.carouselPause(first.rideId,progress).accepted);
 assert(s.carouselPause(first.rideId,{elapsedMs:25000,phase:.5}).accepted);
 const raw=JSON.parse(x.storage.getItem(key));raw.carousel.progress.phase=2;x.storage.setItem(key,JSON.stringify(raw));
 const restored=createStore(x.options);assert.equal(restored.snapshot().carousel,null);assert.equal(restored.snapshot().events.filter(e=>e.schemaVersion===2).length,1);
});


test('image choices identify their presentation while legacy observations and saved rides remain valid',()=>{
 const x=setup(),s=x.store;s.enterScene('rides-games');const old=select(s,'dragon').ride;const legacy=s.snapshot().events;
 const raw=JSON.parse(x.storage.getItem(key));delete raw.carousel.presentationMode;x.storage.setItem(key,JSON.stringify(raw));
 const restored=createStore(x.options);assert.equal(restored.snapshot().carousel.rideId,old.rideId);assert.deepEqual(restored.snapshot().events,legacy);assert(restored.carouselAbandon(old.rideId).accepted);
 const text=restored.carouselOffer('ornate',['dragon','rocket','horse']);
 const images=restored.carouselOffer('ornate',['unicorn','cat','zebra'],'mount-image-thumbnails');assert.notEqual(images.rideId,text.rideId);assert.deepEqual(images.offered,['unicorn','cat','zebra']);
 restored.carouselPreview(images.rideId,'cat');assert(restored.carouselRide(images.rideId).accepted);const event=restored.snapshot().events.at(-1);assert(validEvent(event));assert.equal(event.carousel.presentationMode,'mount-image-thumbnails');assert.deepEqual(restored.snapshot().events.slice(0,-1),legacy);
 const again=createStore(x.options);assert.equal(again.snapshot().carousel.rideId,images.rideId);assert.deepEqual(again.snapshot().events,restored.snapshot().events);
 const corrupt=JSON.parse(x.storage.getItem(key));corrupt.carousel.presentationMode='named-mount-tickets';x.storage.setItem(key,JSON.stringify(corrupt));const safe=createStore(x.options);assert.equal(safe.snapshot().carousel,null);assert.equal(safe.snapshot().events.length,restored.snapshot().events.length);
});
