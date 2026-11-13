// Local narrative memory only. Nothing here feeds recommendation decisions.
export const BANDS = ['kids','pre-teens','teens','adults'];
export const SOURCES = ['midway','forest-edge'];
export const key = band => 'dreamscapes.afterimages.v1.' + band;
export const fresh = () => ({awakened:false,order:[],joined:false,home:null,observations:[]});
export function normalize(value) {
 const s=fresh();
 if(!value || typeof value!=='object') return s;
 s.awakened=value.awakened===true;
 if(s.awakened) s.order=[...new Set((Array.isArray(value.order)?value.order:[]).filter(x=>SOURCES.includes(x)))];
 s.joined=s.order.length===2 && value.joined===true;
 s.home=s.joined && ['shelter','wander'].includes(value.home)?value.home:null;
 s.observations=(Array.isArray(value.observations)?value.observations:[]).filter(o=>o && ['awaken','discover','join','home'].includes(o.action) && typeof o.value==='string').slice(-32).map(o=>({action:o.action,value:o.value}));
 return s;
}
export function read(storage,band) {
 try {return normalize(JSON.parse(storage.getItem(key(band))));} catch {return fresh();}
}
export function pattern(source,band) {
 const p=source==='midway'?['circle','star']:['star','circle'];
 return band==='kids'?p.slice(0,1):p;
}
export const answer = (s,band) => s.order.flatMap(source=>pattern(source,band));
export function change(current,action,value,band) {
 const s=normalize(current);
 if(!BANDS.includes(band)) return s;
 let accepted=false;
 if(action==='awaken' && !s.awakened) {s.awakened=true;accepted=true;}
 if(action==='discover' && s.awakened && SOURCES.includes(value) && !s.order.includes(value)) {s.order.push(value);accepted=true;}
 if(action==='join' && s.order.length===2 && !s.joined && Array.isArray(value) && value.join()===answer(s,band).join()) {s.joined=true;accepted=true;}
 if(action==='home' && s.joined && ['shelter','wander'].includes(value) && s.home!==value) {s.home=value;accepted=true;}
 if(accepted) s.observations=[...s.observations,{action,value:action==='join'?'reflections-reunited':String(value??'borrowed-light')}].slice(-32);
 return s;
}
