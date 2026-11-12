import {version,stateFrom,available,interpret} from './zora-contract.mjs';
{
 const core=window.DreamscapesObservationCore,normal=window.DreamscapesObservations,key='dreamscapes.cycle-zora.zora.v1';let storage;
 try{sessionStorage.getItem(key);storage={getItem:()=>sessionStorage.getItem(key),setItem:(_,v)=>sessionStorage.setItem(key,v)};}catch{}
 const store=core.createStore({storage,ageBand:()=>normal.snapshot().ageBand,origin:window.__cycleFiveSynthetic?'test_fixture':'player'});
 window.DreamscapesCycleZora={store,state:()=>stateFrom(store.snapshot()),interpret:()=>interpret(store.snapshot()),version};
 if(new URLSearchParams(location.search).get('observations')==='1'){
  const b=document.createElement('button'),d=document.createElement('dialog'),pre=document.createElement('pre'),close=document.createElement('button');b.textContent='Prototype evidence';b.className='z5-inspect';close.textContent='Close';close.onclick=()=>d.close();d.style.maxWidth='85vw';pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';d.append(close,pre);document.body.append(b,d);b.onclick=()=>{pre.textContent=JSON.stringify({raw:store.snapshot(),hypotheses:interpret(store.snapshot())},null,2);d.showModal();};
 }
}
