import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/observations.js';
const {createStore,validEvent,key}=globalThis.DreamscapesObservationCore;
const memory=()=>{const data=new Map();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};
let sequence=0;
const options={uuid:()=>String(++sequence),now:()=>1800000000000,ageBand:()=> 'teens'};
const catalog={'fixture-story-choice':{sceneId:'fixture',alternatives:[{id:'fantasy',label:'Fantasy story (test fixture)',attributes:[{dimension:'genres',value:'fantasy',rationale:'The synthetic label explicitly describes fantasy.'}]},{id:'science-fiction',label:'Science-fiction story (test fixture)',attributes:[{dimension:'genres',value:'science-fiction',rationale:'The synthetic label explicitly describes science fiction.'}]}]}};
const fixture=storage=>createStore({...options,storage,catalog,origin:'test_fixture'});
const event={sceneId:'midway',interactionId:'poster',category:'exploration',action:'inspected',occurrenceId:'poster-first'};

test('behavior and gameplay never carry literary preference attributes',()=>{
 const s=createStore(options);s.enterScene('midway');assert(s.record(event).accepted);
 assert(s.record({...event,category:'gameplay',interactionId:'skee-ball',occurrenceId:'shot-one',action:'scored',details:{points:50}}).accepted);
 assert(!s.record({...event,category:'preference'}).accepted);
 assert(!s.record({...event,occurrenceId:'fake',preferenceAttributes:[{dimension:'genres',value:'horror'}]}).accepted);
 const snapshot=s.snapshot();assert.equal(snapshot.counts.preference,0);assert(snapshot.events.every(e=>validEvent(e)&&!e.preferenceSupported&&e.preferenceAttributes.length===0));
 snapshot.events[0].category='preference';assert.equal(s.snapshot().events[0].category,'exploration');
});
test('authored alternatives/order and one decision survive callbacks and reload',()=>{
 const storage=memory(),s=fixture(storage);s.enterScene('fixture');
 const p=s.presentDecision('fixture-story-choice',['science-fiction','fantasy']);
 assert.deepEqual(p.presentationOrder,['science-fiction','fantasy']);assert.equal(p.alternatives.length,2);
 assert(s.commitDecision(p.presentationId,'fantasy').accepted);
 assert(!validEvent({...s.snapshot().events.find(e=>e.category==='preference'),action:'dislike'}),'Stored skips/exits/dislikes cannot masquerade as a completed positive choice');
 assert(!s.commitDecision(p.presentationId,'fantasy').accepted);assert(!s.commitDecision(p.presentationId,'science-fiction').accepted);
 const reload=fixture(storage);reload.enterScene('fixture');const restored=reload.presentDecision('fixture-story-choice');
 assert.equal(restored.presentationId,p.presentationId);assert(!reload.commitDecision(restored.presentationId,'fantasy').accepted);
 assert.equal(reload.snapshot().events.filter(e=>e.category==='preference').length,1);
 assert.equal(reload.snapshot().counts.preference,0,'Fixtures are not counted as real player preferences');
 assert.equal(reload.snapshot().diagnostics.duplicates,3);
});
test('later real visits create a distinct decision; skipping does not dislike anything',()=>{
 const s=fixture();s.enterScene('fixture');const skipped=s.presentDecision('fixture-story-choice');
 s.enterScene('midway');assert(!s.commitDecision(skipped.presentationId,'fantasy').accepted);
 s.enterScene('fixture');const first=s.presentDecision('fixture-story-choice');assert.notEqual(first.presentationId,skipped.presentationId);
 assert(s.commitDecision(first.presentationId,'fantasy').accepted);s.enterScene('midway');s.enterScene('fixture');
 const second=s.presentDecision('fixture-story-choice');assert(s.commitDecision(second.presentationId,'science-fiction').accepted);
 const decisions=s.snapshot().events.filter(e=>e.category==='preference');assert.equal(decisions.length,2);assert(decisions.every(e=>e.action==='selected'));assert.equal(new Set(decisions.map(e=>e.decisionId)).size,2);
});
test('unknown/sole-choice catalogs, invalid selections and stale age context fail closed',()=>{
 let band='kids';const s=createStore({...options,ageBand:()=>band,catalog,origin:'test_fixture'});s.enterScene('fixture');
 assert.equal(s.presentDecision('not-a-choice').reason,'unsupported_preference_interaction');const p=s.presentDecision('fixture-story-choice');
 assert(!s.commitDecision(p.presentationId,'not-presented').accepted);band='adults';assert.equal(s.commitDecision(p.presentationId,'fantasy').reason,'stale_presentation');
 const only=createStore({...options,catalog:{single:{sceneId:'fixture',alternatives:catalog['fixture-story-choice'].alternatives.slice(0,1)}}});assert(!only.presentDecision('single').presentationId);
});
test('missing, malformed and partially corrupt sessions do not crash or promote evidence',()=>{
 const storage=memory();storage.setItem(key,'{bad');let s=createStore({...options,storage});assert.equal(s.snapshot().events.length,0);assert(s.record(event).accepted);
 const valid=s.snapshot().events[0],raw=JSON.parse(storage.getItem(key));raw.events.push({...valid,eventId:'forged',occurrenceId:'forged',category:'preference',preferenceSupported:true,decisionId:'forged',presentationId:'forged',preferenceAttributes:[{dimension:'genres',value:'fantasy',rationale:'unsupported'}]}, {...valid,eventId:'unknown-field',occurrenceId:'unknown-field',email:'must-not-survive'});
 raw.events.push(valid);storage.setItem(key,JSON.stringify(raw));s=createStore({...options,storage});assert.equal(s.snapshot().events.length,1);assert.equal(s.snapshot().counts.preference,0);assert.equal(s.snapshot().diagnostics.discarded,3,'Includes the earlier malformed-session recovery');assert.equal(s.snapshot().diagnostics.duplicates,1);assert(!JSON.stringify(s.snapshot()).includes('must-not-survive'));
});
test('legacy import is allowlisted, once-only, unknown-age behavioral evidence',()=>{
 const storage=memory(),legacy=JSON.stringify([{type:'object_inspected',target:'poster',at:1234,private:'not copied'},{type:'destination_chosen',target:'Rides & Games',at:1235},{type:'object_inspected',target:'email@example.com',at:1236}]);
 const s=createStore({...options,storage});s.importLegacy(legacy);s.importLegacy(legacy);const reload=createStore({...options,storage});reload.importLegacy(legacy);
 const events=reload.snapshot().events;assert.equal(events.length,2);assert(events.every(e=>e.origin==='legacy'&&e.ageBand==='unknown'&&e.category==='exploration'));assert(!JSON.stringify(events).includes('private'));assert(!JSON.stringify(events).includes('@'));
});
test('storage denial/quota failures retain useful in-memory observations',()=>{
 const s=createStore({...options,storage:{getItem(){throw Error('denied')},setItem(){throw Error('quota')}}});assert(s.record(event).accepted);assert.equal(s.snapshot().events.length,1);assert(s.snapshot().diagnostics.storageFailures>0);
});
test('unknown future schema is not overwritten',()=>{
 const storage=memory(),raw=JSON.stringify({schemaVersion:99,sessionId:'future-session'});storage.setItem(key,raw);const s=createStore({...options,storage});assert(s.record(event).accepted);assert.equal(storage.getItem(key),raw);assert.equal(s.snapshot().persistence,'future-schema-readonly');
});
test('capacity is bounded without forgetting the duplicate ledger',()=>{
 const s=createStore(options);for(let i=0;i<1500;i++)assert(s.record({...event,occurrenceId:'action-'+i}).accepted);
 assert.equal(s.record({...event,occurrenceId:'overflow'}).reason,'session_capacity');assert.equal(s.record({...event,occurrenceId:'action-0'}).reason,'duplicate_occurrence');assert.equal(s.snapshot().events.length,1500);
});
test('event schema rejects missing fields and arbitrary preferences',()=>{
 const s=createStore(options),e=s.record(event).event;assert(validEvent(e));assert(!validEvent({...e,schemaVersion:2}));assert(!validEvent({...e,timestamp:NaN}));assert(!validEvent({...e,selectedAlternative:'unoffered'}));assert(!validEvent({...e,preferenceAttributes:[{dimension:'tones',value:'dark',rationale:'invented'}]}));
});
test('anonymous identifiers do not require WebCrypto or a secure context',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
 try{Object.defineProperty(globalThis,'crypto',{value:undefined,configurable:true});const s=createStore();assert(s.record(event).accepted);assert(validEvent(s.snapshot().events[0]));assert.notEqual(createStore().snapshot().sessionId,s.snapshot().sessionId);}
 finally{if(descriptor)Object.defineProperty(globalThis,'crypto',descriptor);else delete globalThis.crypto;}
});
