// Raw observations in the existing Carnival session; no independent recommender.
const key='carnival-experiment-observations',sessionKey='carnival-experiment-session';
let memory=[],sessionId;
try{sessionId=sessionStorage.getItem(sessionKey);if(!sessionId){sessionId=crypto.randomUUID();sessionStorage.setItem(sessionKey,sessionId);}}catch{sessionId=crypto.randomUUID();}
function read(){try{const data=JSON.parse(sessionStorage.getItem(key)||'[]');if(Array.isArray(data))return data;}catch{}return memory;}
export function recordObservation(type,target,extra={}){const event={...extra,type,target,at:Date.now()};memory=[...read(),event].slice(-200);try{sessionStorage.setItem(key,JSON.stringify(memory));}catch{}document.dispatchEvent(new CustomEvent('dreamscapes-observation',{detail:event}));return event;}
export function recordChoice({rideId,stage,choice,ageBand,signals}){
 const prior=read();if(prior.some(e=>e.experience==='enchanted-carousel'&&e.rideId===rideId&&e.stage===stage))return false;
 recordObservation('carousel_choice',choice,{experience:'enchanted-carousel',sessionId,rideId,stage,ageBand,polarity:'positive',signals,proposedWeight:.25});return true;
}
export function handoff(ageBand){
 // Latest explicit selection per stage replaces earlier replay evidence. Two
 // modest positives maximum, regardless of repeated rides; no inferred dislikes.
 const choices=new Map();for(const e of read())if(e.type==='carousel_choice'&&e.experience==='enchanted-carousel'&&e.ageBand===ageBand)choices.set(e.stage,e);
 return{sessionId,ageBand,status:'local-observations-awaiting-novelideas-handoff',choices:[...choices.values()],maximumTotalProposedWeight:.5};
}
window.DreamscapesSession=Object.freeze({recordObservation,handoff,observations:()=>read().slice()});
