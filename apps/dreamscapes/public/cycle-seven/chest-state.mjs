// Pure linked-wheel rules and deterministic prop motion, shared with verification.
export const initial = round => round % 2 ? [2,1,3] : [1,3,2];
export const turn = (wheels,i) => wheels.map((v,j)=>(v+(j===i||j===(i+1)%3?1:0))%4);
export const solved = wheels => wheels.every(v=>v===0);
export const clamp = v => Math.max(0,Math.min(1,v));
export function propPose(progress,kind) {
 const onset=kind==='book'?.37:.48, slide=clamp((progress-onset)/.25), fall=clamp((progress-onset-.17)/.35);
 // The broad book slides first; the higher centre of mass makes the pot tip later.
 return {x:slide*(kind==='book'?-12:-18),y:-progress*38-slide*24+fall*fall*(kind==='book'?200:330),angle:progress*-10+slide*(kind==='book'?-17:38),hidden:fall===1};
}
export function readBand(storage,band) {
 try {const s=JSON.parse(storage.getItem('dreamscapes.chest.v1.'+band));if(s&&Number.isSafeInteger(s.round)&&s.round>=0)return {round:s.round,completed:s.completed===true,fallen:s.fallen===true};}catch{}
 return {round:0,completed:false,fallen:false};
}
