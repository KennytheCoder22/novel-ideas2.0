import {getAgeBand} from '/age-band.js';
import {BANDS,SOURCES,read,key,change,pattern,answer} from './memory.mjs';
const root=document.documentElement;
// Storage may be disabled, including when merely accessing sessionStorage.
const fallback=new Map();
const storage={getItem:k=>{if(fallback.has(k))return fallback.get(k);try{return sessionStorage.getItem(k);}catch{return null;}},setItem:(k,v)=>{fallback.set(k,v);try{sessionStorage.setItem(k,v);}catch{}}};
let age=getAgeBand().id,state=read(storage,age),entry=[],origin=null,dialogScene=null;
const mounted=new Map(),names={'midway':'Midway puddle','forest-edge':'Forest’s Edge'},glyph={circle:'○',star:'✦'};
const dialog=document.createElement('dialog');dialog.className='afterimage-dialog';dialog.setAttribute('aria-label','Reflections of the borrowed light');document.body.append(dialog);
const copy={
 kids:{first:'A little light stayed behind! It makes a shape in the water.',second:'The other light answers. They look like two halves of the same hello.',zora:'Zora smiles. “Two little hellos. Can you put them together?”',home:'“A cosy place to stay, or a path to play on?”'},
 'pre-teens':{first:'The reflection makes two shapes. No lantern above it makes them.',second:'The shapes answer the reflection you found before. A thin thread leans toward Zora’s tent.',zora:'Zora glances at the empty stool. “Reflections remember the order you met them.”',home:'“Will you give it a home, or leave it a way to wander?”'},
 teens:{first:'Two shapes surface beneath the lamplight. The light above you has neither.',second:'The earlier reflection answers inside this one. For a moment, a thread points back toward Zora.',zora:'“It remembers the order you noticed,” Zora says. She leaves the stool empty.',home:'“A light can belong somewhere without being kept. What shall we leave it?”'},
 adults:{first:'Two shapes remain after the ordinary reflections settle. Nothing overhead accounts for them.',second:'The first reflection stirs inside the second. A fine line draws itself toward Zora’s tent, then fades.',zora:'Zora makes room beside her. “Sometimes a journey returns in the order it was witnessed.”',home:'“A place to rest, or permission to leave and return?”'}
};
function active(){return root.dataset.location||'midway';}
function available(){return !root.dataset.travelling&&!root.dataset.chestTour&&!document.querySelector('.zt-veil.zt-open');}
function save(action,value){state=change(state,action,value,age);storage.setItem(key(age),JSON.stringify(state));render();}
function awaken(){
 let completed=false;
 try{completed=JSON.parse(storage.getItem('dreamscapes.chest.v1.'+age))?.completed===true;}catch{}
 if(completed&&!state.awakened)save('awaken');
}
function control(text,fn,label=text){const b=document.createElement('button');b.type='button';b.textContent=text;b.setAttribute('aria-label',label);b.onclick=fn;return b;}
function paragraph(text){const p=document.createElement('p');p.textContent=text;dialog.append(p);return p;}
function show(){if(!dialog.open)dialog.showModal();dialog.querySelector('button')?.focus();}
function close(){dialog.close();entry=[];dialogScene=null;if(origin?.isConnected&&available()&&!origin.disabled)origin.focus({preventScroll:true});}
function footer(){dialog.append(control('Step back',close));}
function symbols(source){return pattern(source,age).map(x=>glyph[x]).join('  ');}
function openSource(source,button){
 if(!available()||!state.awakened)return;
 origin=button;dialogScene=source;dialog.replaceChildren();
 const had=state.order.includes(source);save('discover',source);
 const p=paragraph(state.home==='wander'?'The light crosses the water, pauses beside you, and leaves its reflection behind. It knows the way back.':state.home==='shelter'?'A warm thread reaches from Zora’s tent. The reflection answers, then settles.':copy[age][state.order.length===1?'first':'second']);
 p.id='afterimage-description';dialog.setAttribute('aria-describedby',p.id);
 const marks=paragraph(symbols(source));marks.className='afterimage-marks';marks.setAttribute('aria-label',names[source]+': '+pattern(source,age).join(', '));
 if(state.order.length===2&&!state.joined)paragraph('In the water, an empty stool beneath Zora’s tablecloth appears between the shapes.');
 if(had&&!state.home)paragraph('The shapes return when you hold still.');
 footer();show();
}
function openZora(button){
 if(!available()||state.order.length===0)return;
 origin=button;dialogScene='fortune-teller';entry=[];drawZora();show();
}
function drawZora(message=''){
 dialog.replaceChildren();const p=paragraph(state.joined?copy[age].home:copy[age].zora);p.id='afterimage-description';dialog.setAttribute('aria-describedby',p.id);
 if(state.order.length<2){paragraph('One reflection rests on the stool. Beside it, a second hollow catches no light. Inside the first, water and trees exchange places.');paragraph(symbols(state.order[0]));footer();return;}
 if(!state.joined){
  for(const source of state.order) {const clue=paragraph(names[source]+'   '+symbols(source));clue.className='afterimage-clue';clue.setAttribute('aria-label',names[source]+': '+pattern(source,age).join(', '));}
  paragraph(age==='kids'?'Touch the shapes in the order you found them.':'Lay the reflections together, in the order you found them.');
  const slots=paragraph(entry.map(x=>glyph[x]).join('  ')+'  '+Array(answer(state,age).length-entry.length).fill('·').join('  '));slots.className='afterimage-marks';slots.setAttribute('aria-label','Your pattern: '+(entry.join(', ')||'empty'));
  const row=document.createElement('div');row.className='afterimage-controls';
  for(const symbol of ['circle','star'])row.append(control(glyph[symbol],()=>{entry.push(symbol);drawZora();if(entry.length===answer(state,age).length){save('join',entry);if(state.joined){entry=[];drawZora();}else{entry=[];drawZora('The lights drift apart. Both reflections are still here.');}}},'Add '+symbol));
  row.append(control('Clear',()=>{entry=[];drawZora();}));dialog.append(row);
 }else{
  paragraph(state.home==='shelter'?'A small light rests over the stool. Two long reflections stretch toward the carnival.':state.home==='wander'?'The stool is empty. A light passes the tent opening, then returns to the reflections.':'The shapes meet. One light rises between your hands. Zora draws back the edge of the curtain.');
  for(const [choice,label] of [['shelter','Leave a place beside Zora'],['wander','Open a way between the reflections']]){
   const b=control(label,()=>{save('home',choice);drawZora();});b.setAttribute('aria-pressed',String(state.home===choice));dialog.append(b);
  }
 }
 if(state.home)window.DreamscapesReading?.offer(dialog,'afterimages');
 if(message){const notice=paragraph(message);notice.setAttribute('role','status');}
 footer();
 // Rebuilding a native dialog must leave keyboard focus inside it.
 if(dialog.open)dialog.querySelector('button')?.focus();
}
function mount(id){
 const plane=id==='midway'?document.querySelector('.composition'):document.querySelector(`[data-scene="${id}"] .location-plane`);
 if(!plane||mounted.get(id)?.plane===plane)return;
 const button=control('',()=>id==='fortune-teller'?openZora(button):openSource(id,button),id==='fortune-teller'?'Examine the light over Zora’s empty stool':'Examine the borrowed reflection at '+names[id]);
 button.className='afterimage-source';button.dataset.afterimage=id;
 const art=document.createElement('span');art.className='afterimage-sparks';art.setAttribute('aria-hidden','true');art.innerHTML='<i></i><i></i><i></i>';const marks=document.createElement('span');marks.className='afterimage-watermarks';marks.setAttribute('aria-hidden','true');button.append(marks);button.append(art);
 const positions={midway:[54,82],'forest-edge':[57,84],'fortune-teller':[42,71]};const [x,y]=positions[id];button.style.left=x+'%';button.style.top=y+'%';plane.append(button);
 // Share the existing scene camera; reveal a keyboard-focused addition on narrow screens.
 button.addEventListener('focus',()=>{if(!button.matches(':focus-visible'))return;const overflow=plane.offsetWidth-innerWidth;if(overflow>0){plane.parentElement.scrollLeft=0;if(id==='midway')plane.style.setProperty('--pan',Math.max(-overflow/2,Math.min(overflow/2,plane.offsetWidth*(.5-x/100)))+'px');else plane.style.left=-Math.max(0,Math.min(overflow,plane.offsetWidth*x/100-innerWidth/2))+'px';}});
 mounted.set(id,{plane,button});
}
function render(){
 for(const id of [...SOURCES,'fortune-teller']){
  mount(id);const item=mounted.get(id);if(!item)continue;
  item.button.hidden=!state.awakened||(id==='fortune-teller'&&state.order.length===0);
  item.button.disabled=!available()||id!==active();
  const visiblePattern=id==='fortune-teller'?answer(state,age):pattern(id,age);
  item.button.querySelector('.afterimage-watermarks').textContent=visiblePattern.map(x=>glyph[x]).join(' ');
  item.button.dataset.home=state.home||'';item.button.dataset.known=String(state.order.includes(id));item.button.dataset.joined=String(state.joined);
 }
 root.dataset.afterimageHome=state.home||'';
}
new MutationObserver(()=>{if(dialog.open&&(!available()||active()!==dialogScene)){close();}render();}).observe(root,{attributes:true,attributeFilter:['data-location','data-travelling','data-chest-tour']});
document.addEventListener('dreamscapes-borrowed-light-returned',event=>{
 const completedBand=event.detail?.age;if(!BANDS.includes(completedBand))return;
 if(completedBand===age)save('awaken');
 else storage.setItem(key(completedBand),JSON.stringify(change(read(storage,completedBand),'awaken',null,completedBand)));
});
document.addEventListener('dreamscapes-age-band',()=>{close();age=getAgeBand().id;state=read(storage,age);awaken();render();});
dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
// Read-only diagnostics. Mutations go through actual interactions, not debug controls.
window.DreamscapesCycleEight=Object.freeze({snapshot:()=>({age,...structuredClone(state)})});
awaken();render();
