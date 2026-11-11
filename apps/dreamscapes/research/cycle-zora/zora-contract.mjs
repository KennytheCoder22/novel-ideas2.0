export const version='zora-tent-objects-v2';
export const sceneId='fortune-teller';
export const objects=[{id:'ticket',label:'Examine the ticket beneath the lamp'},{id:'door',label:'Examine the crystal ball'}];
export const directions=[{id:'hidden-message',label:'Take the second ticket that emerged from beneath the cloth'},{id:'impossible-door',label:'Follow the vision within the crystal ball'}];
export const leave={id:'leave',label:'Step back without pursuing either invitation'};
export function stateFrom(snapshot){
 const events=(snapshot?.events||[]).filter(e=>e.interactionId===version&&e.ageBand===snapshot.ageBand);
 return {picked:events.some(e=>e.action==='ticket-lifted'),lit:events.some(e=>e.action==='marks-revealed'),door:events.some(e=>e.action==='opening-examined'),chosen:events.find(e=>e.action==='direction-pursued')?.selectedAlternative||null};
}
export function available(state){
 if(state.chosen)return [leave];
 return [...objects, ...(state.picked&&!state.lit?[{id:'lamp',label:'Hold the lifted ticket in the lamplight'}]:[]),...(state.lit&&!state.chosen?[directions[0]]:[]),...(state.door&&!state.chosen?[directions[1]]:[]),leave];
}
// Raw actions stay gameplay/exploration in the existing core. Interpretation is separate,
// qualitative, and never delivered to the recommendation engine.
export function interpret(snapshot){
 const output=[],seen=new Set();
 for(const e of snapshot?.events||[]){
  if(e.interactionId!==version||e.action!=='direction-pursued'||e.origin!=='player'||e.ageBand==='unknown'||e.ageBand!==snapshot.ageBand||seen.has(e.ageBand))continue;
  if(!directions.some(d=>d.id===e.selectedAlternative)||!e.alternatives?.some(a=>a.id===e.selectedAlternative))continue;
  seen.add(e.ageBand);
  const prior=snapshot.events.filter(p=>p.timestamp<=e.timestamp&&p.ageBand===e.ageBand&&p.interactionId===version&&p.origin===e.origin);
  const compared=prior.some(p=>p.action==='marks-revealed')&&prior.some(p=>p.action==='opening-examined')&&directions.every(d=>e.alternatives.some(a=>a.id===d.id));
  output.push({eventId:e.eventId,action:e.selectedAlternative,actuallyAvailable:e.alternatives,classification:compared?'tentative-narrative-interest':'insufficient-comparison',possibleInterpretation:e.selectedAlternative==='hidden-message'?'investigative-mystery':'surreal-speculative',uncertainty:'unvalidated',alternatives:['visual-salience','animation-appeal','control-discovery','random-choice','completion-curiosity'],unchosenIsDislike:false,independentSignals:1,productionInfluence:false});
 }
 return output;
}
