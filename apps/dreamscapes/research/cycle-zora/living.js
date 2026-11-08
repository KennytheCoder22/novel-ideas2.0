import {version,available} from './zora-contract.mjs';
const api=window.DreamscapesCycleZora;
if(api){
 const scene='fortune-teller',ticket='/experiments/carnival/platform/loose-ticket.png',world='/experiments/carnival/dream-worlds/Moonlit%20(Griffin)%20Citadel%20Among%20Misty%20Peaks.png';
 let plane,ball,follow,first,second,lamp,veil,busy=false,timers=[],age;
 const live=document.createElement('span');live.className='zt-status';live.setAttribute('role','status');document.body.append(live);
 function active(){return document.documentElement.dataset.location===scene&&!document.documentElement.dataset.travelling;}
 function record(action,selected=null,once=false){if(!active()||age!==api.store.snapshot().ageBand)return {accepted:false};return api.store.record({sceneId:scene,interactionId:version,category:action==='direction-pursued'?'gameplay':'exploration',action,selectedAlternative:selected,alternatives:available(api.state()),...(once?{occurrenceId:version+'-'+age+'-'+action}:{}),details:{examined:api.state().lit&&api.state().door,kind:matchMedia('(prefers-reduced-motion: reduce)').matches?'reduced-motion':'ordinary-motion'}});}
 function say(text){live.textContent=text;}
 function button(cls,label,parent=plane){const b=document.createElement('button');b.className=cls;b.setAttribute('aria-label',label);parent.append(b);return b;}
 function render(){if(!plane)return;const s=api.state();plane.dataset.ticket=String(s.picked);plane.dataset.marks=String(s.lit);plane.dataset.choice=s.chosen||'';second.hidden=!s.lit||!!s.chosen;lamp.hidden=!s.picked||s.lit||!!s.chosen;follow.hidden=!s.door||!!s.chosen||busy;first.disabled=!!s.chosen;ball.classList.toggle('zt-seen',s.door);}
 function end(){timers.forEach(clearTimeout);timers=[];busy=false;if(active())plane.closest('.location-view').inert=false;veil.classList.remove('zt-open');veil.hidden=true;render();if(active()){ball.focus({preventScroll:true});say(api.state().chosen?'Zora’s tent returns. Your chosen story is remembered.':'Zora’s tent returns. The image remains in the sphere. You can follow it or investigate the ticket on the table.');}}
 function vision(pursued=false){
  if(busy)return;busy=true;render();plane.closest('.location-view').inert=true;const rect=ball.getBoundingClientRect();veil.style.setProperty('--origin-x',rect.x+rect.width/2+'px');veil.style.setProperty('--origin-y',rect.y+rect.height*.37+'px');veil.hidden=false;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!busy||veil.hidden)return;veil.classList.add('zt-open');veil.querySelector('button').focus();}));
  say(pursued?'You follow the light. The tent gives way to a moonlit citadel. Your ticket appears along the path.':'Light spreads from the sphere. A moonlit landscape briefly replaces the tent, then Zora returns. This is an examination, not a story choice.');
  timers.push(setTimeout(()=>veil.classList.remove('zt-open'),matchMedia('(prefers-reduced-motion: reduce)').matches?2200:6500));timers.push(setTimeout(end,matchMedia('(prefers-reduced-motion: reduce)').matches?3000:9000));
 }
 function mount(){
  if(!active()){const id=document.documentElement.dataset.location;if(id)api.store.enterScene(id);if(veil)end();return;}age=api.store.snapshot().ageBand;api.store.enterScene(scene);
  if(plane){render();return;}
  plane=document.querySelector('[data-scene="fortune-teller"] .location-plane');if(!plane)return;
  const z=document.createElement('img');z.className='zl-character';z.src='/cycle-zora/zora.png';z.alt='Madame Zora behind her table';plane.append(z);
  const cloth=document.createElement('img');cloth.className='zl-cloth';cloth.src='/experiments/carnival/locations/fortune-teller.png';cloth.alt='';plane.append(cloth);
  ball=button('zl-ball','Examine Madame Zora’s crystal ball');ball.innerHTML='<img src="/cycle-zora/ball.png" alt=""><span class="zl-light"></span><span class="zl-vision"></span>';
  ball.onclick=()=>{if(busy)return;if(api.state().chosen){record('vision-revisited');vision();return;}record('table-examined',null,true);record('opening-examined','door',true);render();vision();};
  follow=button('zt-follow','Follow the vision within the crystal ball');follow.onclick=()=>{if(busy)return;if(record('direction-pursued','impossible-door',true).accepted){render();vision(true);}};
  first=button('zt-ticket','Examine the ticket on Zora’s table');first.innerHTML='<img src="'+ticket+'" alt=""><span>07 · 24 · 13</span>';
  first.onclick=()=>{if(busy)return;record('table-examined',null,true);record('ticket-lifted','ticket',true);render();say('The ticket tilts on the cloth. Its reverse is blank. The lantern beside Zora casts light across the table.');};
  lamp=button('zt-lamp','Turn the ticket toward the existing lantern light');lamp.onclick=()=>{if(busy)return;record('marks-revealed','lamp',true);render();say('Marks appear on the ticket. A second matching ticket emerges at the table edge. Take it to pursue the message, or examine the ball.');};
  second=button('zt-ticket zt-second','Take the revealed ticket and pursue the hidden message');second.innerHTML='<img src="'+ticket+'" alt=""><span>07 · 24 · 13</span>';
  second.onclick=()=>{if(busy)return;if(record('direction-pursued','hidden-message',true).accepted){render();say('You take the matching ticket. The marks remain on the cloth, pointing toward Zora’s curtain.');}};
  veil=document.createElement('div');veil.className='zt-veil';veil.hidden=true;veil.innerHTML='<div class="zt-landscape"></div><img class="zt-kept-ticket" src="'+ticket+'" alt=""><button class="zt-return" aria-label="Return from the vision to Madame Zora">×</button>';document.body.append(veil);veil.querySelector('button').onclick=end;
  document.addEventListener('keydown',e=>{if(e.key==='Tab'&&busy){e.preventDefault();veil.querySelector('button').focus();}if(e.key==='Escape'&&busy){e.preventDefault();end();}});render();
 }
 new MutationObserver(mount).observe(document.documentElement,{attributes:true,attributeFilter:['data-location','data-travelling']});
 document.addEventListener('dreamscapes-age-band',()=>{if(veil)end();age=api.store.snapshot().ageBand;render();});mount();
}
