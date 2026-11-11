import {version,sceneId,objects,leave,stateFrom,available,interpret} from './zora-contract.mjs';
if(['127.0.0.1','localhost','[::1]'].includes(location.hostname)&&new URLSearchParams(location.search).get('cycle-five')==='zora'){
 const core=window.DreamscapesObservationCore,normal=window.DreamscapesObservations;
 if(core&&normal)start(core,normal);
}
function start(core,normal){
 const key='dreamscapes.cycle-five.zora.v1';let storage;
 try{sessionStorage.getItem(key);storage={getItem:()=>sessionStorage.getItem(key),setItem:(_,v)=>sessionStorage.setItem(key,v)};}catch{}
 const store=core.createStore({storage,ageBand:()=>normal.snapshot().ageBand,origin:window.__cycleFiveSynthetic?'test_fixture':'player'});
 const state=()=>stateFrom(store.snapshot());
 window.DreamscapesCycleFive=Object.freeze({store,state,interpret:()=>interpret(store.snapshot()),version});
 const ticketURL='/experiments/carnival/platform/loose-ticket.png';
 const entry=document.createElement('button');entry.className='z5-entry';entry.setAttribute('aria-label','Examine the loose ticket on Zora’s table');entry.innerHTML=`<img alt="" src="${ticketURL}">`;
 const dialog=document.createElement('dialog');dialog.className='z5-room';dialog.setAttribute('aria-label','Zora’s table: two strange tickets');
 dialog.innerHTML=`<div class="z5-room-art" aria-hidden="true"></div><div class="z5-surface" aria-hidden="true"></div>
 <button class="z5-close" aria-label="Step back to the carnival">×</button>
 <button class="z5-lamp" aria-label="Hold the lifted ticket in the lamplight" hidden><i></i><span></span></button>
 <button class="z5-ticket" aria-label="Pick up and examine the ticket"><img alt="" src="${ticketURL}"><span class="z5-marks" aria-hidden="true">07 · 24 · 13</span></button>
 <button class="z5-door" aria-label="Examine the ticket standing on its edge"><span class="z5-view" aria-hidden="true"></span><img alt="" src="${ticketURL}"></button>
 <button class="z5-second" aria-label="Take the second ticket and pursue the hidden message" hidden><img alt="" src="${ticketURL}"><span aria-hidden="true">07 · 24 · 13</span></button>
 <button class="z5-threshold" aria-label="Step through the ticket opening and pursue the impossible door" hidden><span aria-hidden="true"></span></button>
 <div class="z5-echo" aria-hidden="true"><img src="${ticketURL}" alt=""><img src="${ticketURL}" alt=""><img src="${ticketURL}" alt=""></div>
 <div class="z5-status" role="status" aria-live="polite"></div>`;
 document.body.append(dialog);
 dialog.addEventListener('keydown',e=>{if(e.repeat&&(e.key==='Enter'||e.key===' '))e.preventDefault();});
 const $=s=>dialog.querySelector(s),active=()=>document.documentElement.dataset.location===sceneId&&!document.documentElement.dataset.travelling;
 let age=null;
 function record(action,selection=null,once=false){
  if(!active())return {accepted:false};
  const before=state();return store.record({sceneId,interactionId:version,category:action==='direction-pursued'?'gameplay':'exploration',action,alternatives:available(before),selectedAlternative:selection,...(once?{occurrenceId:version+'-'+normal.snapshot().ageBand+'-'+action}:{}),details:{kind:matchMedia('(prefers-reduced-motion: reduce)').matches?'reduced-motion':'ordinary-motion',examined:before.lit&&before.door}});
 }
 function announce(s){$('.z5-status').textContent=s;}
 function render(){const s=state();dialog.dataset.picked=String(s.picked);dialog.dataset.lit=String(s.lit);dialog.dataset.door=String(s.door);dialog.dataset.chosen=s.chosen||'';
  $('.z5-lamp').hidden=!s.picked||!!s.chosen;$('.z5-lamp').disabled=s.lit;$('.z5-second').hidden=!s.lit||!!s.chosen;$('.z5-threshold').hidden=!s.door||!!s.chosen;
  $('.z5-ticket').disabled=!!s.chosen;$('.z5-ticket').setAttribute('aria-label',s.picked?'Examine the lifted ticket':'Pick up and examine the ticket');$('.z5-door').disabled=!!s.chosen;
 }
 function close(){if(active())record('stepped-back','leave');dialog.close();entry.focus();}
 $('.z5-close').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 $('.z5-ticket').onclick=()=>{if(state().chosen)return;if(state().picked){announce(state().lit?'The same marks appear on both tickets. You can take the second ticket, inspect the opening, or leave.':'The reverse looks blank. Hold it in the lamp above.');$(state().lit?'.z5-second':'.z5-lamp').focus();return;}if(record('ticket-lifted','ticket',true).accepted){render();announce('A worn ticket lifts from the cloth. Its reverse looks blank. A lamp waits above it.');$('.z5-lamp').focus();}};
 $('.z5-lamp').onclick=()=>{if(!state().picked||state().lit||state().chosen)return;if(record('marks-revealed','lamp',true).accepted){render();announce('In the lamplight: 07, 24, 13. Beneath the cloth, a second ticket slips out bearing the same marks. You can take it, examine the standing ticket, or leave.');$('.z5-second').focus();}};
 $('.z5-door').onclick=()=>{if(state().chosen)return;if(state().door){announce('The paper opening waits. You can enter, examine the other ticket, or leave.');$('.z5-threshold').focus();return;}if(record('opening-examined','door',true).accepted){render();announce('The standing ticket turns on its edge. A deep moonlit landscape opens inside the paper. You can enter, examine the other ticket, or leave.');$('.z5-threshold').focus();}};
 function pursue(id){if(state().chosen)return;const s=state();if(id==='hidden-message'&&!s.lit||id==='impossible-door'&&!s.door)return;
  const result=record('direction-pursued',id,true);if(!result.accepted){announce('The ticket will not settle. Step back and try again.');return;}render();
  announce(id==='hidden-message'?'You take the second ticket. Three more appear in a trail toward the curtain, each carrying the same serial. Someone has been here before you. The trail stays when you return.':'You cross the paper threshold. The moonlit citadel fills the opening; the room falls away. Your first ticket now floats on the other side. The opening remains when you return.');$('.z5-close').focus();
 }
 $('.z5-second').onclick=()=>pursue('hidden-message');$('.z5-threshold').onclick=()=>pursue('impossible-door');
 entry.onclick=()=>{if(!active())return;age=normal.snapshot().ageBand;record('table-examined',null,true);render();dialog.showModal();announce(state().chosen?'Your earlier discovery remains on the table.':'Two tickets rest on the cloth. One lies beneath a lamp. The other balances on its edge. Examine either; you can step back at any time.');$('.z5-close').focus();};
 function update(){const id=document.documentElement.dataset.location;if(id)store.enterScene(id);const plane=document.querySelector('[data-scene="fortune-teller"] .location-plane');if(plane&&!entry.isConnected)plane.append(entry);entry.hidden=!active();if(dialog.open&&(!active()||age!==normal.snapshot().ageBand))dialog.close();}
 new MutationObserver(update).observe(document.documentElement,{attributes:true,attributeFilter:['data-location','data-travelling']});document.addEventListener('dreamscapes-observations-updated',update);document.addEventListener('dreamscapes-age-band',update);update();
 if(new URLSearchParams(location.search).get('observations')==='1'){
  const b=document.createElement('button');b.className='z5-inspect';b.textContent='Prototype evidence';const d=document.createElement('dialog');const pre=document.createElement('pre'),exit=document.createElement('button');exit.textContent='Close';exit.onclick=()=>d.close();d.append(exit,pre);document.body.append(b,d);b.onclick=()=>{pre.textContent=JSON.stringify({raw:store.snapshot(),hypotheses:interpret(store.snapshot())},null,2);d.showModal();};
 }
}
