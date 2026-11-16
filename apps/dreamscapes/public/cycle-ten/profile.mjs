import {recommend,interests} from '../cycle-nine/story.mjs';
import {normalizeEvidence,preferenceLabels} from '../cycle-twelve/story.mjs';
export const bands={'kids':'k2','pre-teens':'36','teens':'ms_hs','adults':'adult'};
export const sources=['kit','afterimages'];
// Keep the Cycle Ten storage key and v1 reactions; the ledger is additive.
export const fresh=()=>({version:1,sources:{},narrativeEvidence:[]});
export function normalize(raw,band){
 const out=fresh();if(raw?.version!==1)return out;
 for(const source of sources){const values=raw.sources?.[source];if(!values||typeof values!=='object')continue;const clean={};for(const id of Object.keys(interests))if(['more','less','unsure'].includes(values[id]))clean[id]=values[id];if(Object.keys(clean).length)out.sources[source]=clean;}
 const seen=new Set();
 for(const value of Array.isArray(raw.narrativeEvidence)?raw.narrativeEvidence:[]){const evidence=normalizeEvidence(value);if(!evidence||(band&&evidence.ageBand!==band)||seen.has(evidence.ageBand+':'+evidence.id))continue;seen.add(evidence.ageBand+':'+evidence.id);out.narrativeEvidence.push(evidence);}
 return out;
}
export function react(raw,source,dimension,value){const s=normalize(raw);if(!sources.includes(source)||!Object.hasOwn(interests,dimension)||!['more','less','unsure'].includes(value))return s;s.sources[source]={...s.sources[source],[dimension]:value};return s;}
export function recordNarrative(raw,value,band){
 const s=normalize(raw,band),evidence=normalizeEvidence(value);
 if(!Object.hasOwn(bands,band)||!evidence||evidence.ageBand!==band)return s;
 // First evidence for an authored option is retained. Replays cannot inflate strength.
 if(!s.narrativeEvidence.some(e=>e.id===evidence.id))s.narrativeEvidence.push(evidence);
 return s;
}
export function aggregate(raw){
 const s=normalize(raw),dimensions={};
 for(const id of Object.keys(interests)){
  const evidence=Object.entries(s.sources).filter(([,r])=>r[id]).map(([source,r])=>({source,value:r[id],origin:'explicit-reading-reaction',confidence:1}));
  // All choices in one encounter count as one tentative positive signal per
  // dimension. Keep the full ledger below without treating repeated scenes as votes.
  const narrative=s.narrativeEvidence.filter(e=>e.preferences.includes(id));
  for(const encounter of new Set(narrative.map(e=>e.encounter))){const entries=narrative.filter(e=>e.encounter===encounter);evidence.push({source:'kit',encounter,value:'more',origin:'explicit-narrative-experience',confidence:0.6,strength:0.65,evidenceIds:entries.map(e=>e.id)});}
  const positive=evidence.some(e=>e.value==='more'),negative=evidence.some(e=>e.value==='less');
  dimensions[id]={evidence,status:positive&&negative?'conflicted':positive?'more':negative?'less':'unsure'};
 }
 const signalIds=[...new Set(s.narrativeEvidence.flatMap(e=>e.preferences))];
 const narrativeSignals=signalIds.map(id=>({id,label:preferenceLabels[id],supportedByStarterShelf:Object.hasOwn(interests,id),confidence:0.6,evidenceIds:s.narrativeEvidence.filter(e=>e.preferences.includes(id)).map(e=>e.id)}));
 return {status:Object.values(dimensions).some(d=>['more','less'].includes(d.status))?'tentative':'insufficient',encounters:new Set([...Object.keys(s.sources),...s.narrativeEvidence.map(e=>e.source)]).size,dimensions,narrativeSignals};
}
export function requestEnvelope(raw,band){
 if(!Object.hasOwn(bands,band))throw Error('Unsupported age band');
 const s=normalize(raw,band),narrative=s.narrativeEvidence.length>0,reactions=Object.keys(s.sources).length>0;
 return {schema:'dreamscapes-expressed-interests/v1',ageBand:band,deckKey:bands[band],evidence:s.sources,narrativeEvidence:s.narrativeEvidence,uncertainty:aggregate(s),origin:narrative?(reactions?'mixed-explicit-evidence':'explicit-narrative-experience'):'explicit-reading-reaction'};
}
export function getRecommendations(raw,band){
 const envelope=requestEnvelope(raw,band),profile=envelope.uncertainty;
 const reactions=Object.fromEntries(Object.entries(profile.dimensions).map(([id,d])=>[id,['more','less'].includes(d.status)?d.status:'unsure']));
 const ready=profile.status==='tentative';
 return {mode:'starter-shelf-fallback',live:false,blocker:'No reviewed NovelIdeas recommendation endpoint is available. Provider-search proxies do not enforce the full recommendation safeguards.',profile,request:envelope,items:ready?recommend({reactions},band):[]};
}
