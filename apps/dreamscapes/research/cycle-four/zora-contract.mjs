// Research-only catalog. A chosen premise is observed; broader literary taste is a hypothesis.
export const interactionId='zora-invitations-v1';
export const sceneId='fortune-teller';
export const invitations=Object.freeze([
 {id:'impossible-door',title:'The impossible door',premise:'Follow a paper moth through a painted door to a city that wakes only in dreams.',genre:'fantasy',ending:'The moth rests on the painted handle. You turn it. Beyond the door, a sleeping city opens one bright window. Someone has left a lantern there for you.'},
 {id:'hidden-message',title:'The hidden message',premise:'Trace a coded ticket through the empty carnival to discover who has been leaving messages for you.',genre:'mystery',ending:'You hold the ticket against the lantern. The punched holes spell a name. Beneath the table, a second ticket waits: the same name, in your own handwriting.'}
]);
export const labelFor=o=>o.title+'. '+o.premise;
export const catalog=Object.freeze({[interactionId]:{sceneId,alternatives:invitations.map(o=>({id:o.id,label:labelFor(o),attributes:[{dimension:'genres',value:o.genre,rationale:'Interest in this offered story premise only; transfer to book preference remains unvalidated.'}]}))}});
export const ageBands=Object.freeze({kids:'kids','pre-teens':'preteens',teens:'teens',adults:'adult'});

// No network, engine import, numerical taste weight or ranking. This is a review queue, not an adapter activation.
export function shadowEvidence(snapshot,{explicitAvoids=[]}={}){
 const accepted=[],excluded=[],seen=new Set(),premises=new Set();
 for(const e of Array.isArray(snapshot?.events)?snapshot.events:[]){
  if(!e||typeof e!=='object'){excluded.push({eventId:null,reason:'invalid_event'});continue;}
  const reject=reason=>excluded.push({eventId:e.eventId,reason});
  if(e.origin!=='player'){reject('synthetic_or_legacy_origin');continue;}
  if(!Object.hasOwn(ageBands,e.ageBand)){reject('unresolved_age_band');continue;}
  if(e.schemaVersion===2){reject('object_affinity_is_not_a_book_like');continue;}
  if(e.schemaVersion!==1||e.interactionId!==interactionId||e.sceneId!==sceneId||e.action!=='selected'||e.category!=='preference'||!e.preferenceSupported){reject('not_an_approved_narrative_decision');continue;}
  if(!Array.isArray(e.alternatives)||!Array.isArray(e.presentationOrder)){reject('invalid_or_incomplete_presentation_receipt');continue;}
  if(seen.has(e.decisionId)){reject('duplicate_decision');continue;}
  const chosen=invitations.find(o=>o.id===e.selectedAlternative),ids=e.alternatives?.map(o=>o.id),order=e.presentationOrder;
  const offered=(snapshot.events||[]).find(o=>o.occurrenceId==='offer-'+e.presentationId&&o.action==='invitations-offered'&&o.visitId===e.visitId);
  const expected=chosen&&catalog[interactionId].alternatives.find(o=>o.id===chosen.id).attributes;
  if(!chosen||!e.decisionId||e.decisionId!==e.presentationId||!offered||offered.timestamp>e.timestamp||offered.ageBand!==e.ageBand||ids?.length!==2||new Set(ids).size!==2||!invitations.every(o=>e.alternatives.some(a=>a.id===o.id&&a.label===labelFor(o)))||order?.length!==2||new Set(order).size!==2||!order.every(id=>ids.includes(id))||JSON.stringify(e.preferenceAttributes)!==JSON.stringify(expected)||JSON.stringify(offered.presentationOrder)!==JSON.stringify([...order,'not-tonight'])||offered.alternatives?.length!==3||offered.origin!==e.origin||offered.sceneId!==sceneId||offered.interactionId!==interactionId||!offered.alternatives.every((o,i)=>o.id===[...order,'not-tonight'][i]&&o.label===(o.id==='not-tonight'?'Not tonight':labelFor(invitations.find(v=>v.id===o.id))))){reject('invalid_or_incomplete_presentation_receipt');continue;}
  if(explicitAvoids.includes(chosen.genre)){reject('conflict_with_explicit_preference');continue;}if(premises.has(chosen.id)){reject('repeated_same_premise_not_independent');continue;}premises.add(chosen.id);seen.add(e.decisionId);accepted.push({eventId:e.eventId,decisionId:e.decisionId,version:interactionId,ageBand:ageBands[e.ageBand],selectedPremise:chosen.id,actuallyOffered:offered.alternatives,orderPolicy:offered.details?.kind||'unspecified',observation:'direct_interest_in_this_premise',transfer:'tentative_genre_hypothesis',candidateDimension:'genreFamily',candidateValue:chosen.genre,unchosenIsDislike:false,canInfluenceProduction:false,needsHumanValidation:true,requiresTrustedAgeContext:true});
 }
 return {mode:'shadow-only',productionWrites:0,recommendationCalls:0,evidence:accepted,excluded};
}
