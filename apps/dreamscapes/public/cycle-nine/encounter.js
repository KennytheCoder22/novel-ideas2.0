import {getAgeBand} from '/age-band.js';
import {nodes,interests,fresh,restore,choose,recommend} from './story.mjs';
const cache=new Map(),key=b=>'dreamscapes.story-nine.v1.'+b;
function load(b){if(cache.has(b))return cache.get(b);try{return restore(JSON.parse(sessionStorage.getItem(key(b))));}catch{return fresh();}}
let band=getAgeBand().id,state=load(band),view='story',origin;
const dialog=document.createElement('dialog');dialog.className='story-nine';dialog.setAttribute('aria-label','The person between reflections');document.body.append(dialog);
function save(){cache.set(band,state);try{sessionStorage.setItem(key(band),JSON.stringify(state));}catch{}paint();mount();}
function p(text){const e=document.createElement('p');e.textContent=text;dialog.append(e);return e;}
function button(text,fn){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=fn;dialog.append(b);return b;}
function close(){dialog.close();if(origin?.isConnected&&!origin.closest('[inert]'))origin.focus({preventScroll:true});}
function paint(){
 const focus=document.activeElement?.textContent,focusKey=document.activeElement?.dataset.focusKey;dialog.replaceChildren();
 if(view==='books'&&window.DreamscapesReading){window.DreamscapesReading.render(dialog,{close,back:()=>{view='story';paint();}});return;}
 const h=document.createElement('h2');h.textContent=view==='books'?'A story to take with you':view==='reaction'?'What would you want to read?':'The person between reflections';dialog.append(h);
 if(view==='story'){
  if(band==='kids')p('A make-believe mirror story. You can stop or come back whenever you like.');
  let text=nodes[state.node].text;
  if(band==='kids'&&state.node==='memory')text='You trade the memory of a little song. Kit steps free and teaches you the tune again. The keeper hums along from behind the glass. You leave together, singing something new.';
  if(band==='kids'&&state.node==='bargain')text='The keeper asks for someone else to watch the hall. Kit shakes their head. You offer a little song you know, or ask the keeper to take a turn watching.';
  p(text);
  for(const [label,next]of nodes[state.node].choices||[])button(band==='kids'&&next==='memory'?'Offer the memory of a little song':label,()=>{state=choose(state,next);save();});
  if(nodes[state.node].ending){button('Reflect on this story',()=>{view='reaction';paint();});button('See book suggestions',()=>{view='books';paint();});button('Try another path',()=>{state={...state,node:'opening',actions:[]};save();});}
 }else if(view==='reaction'){
  p('Your choice tells us what happened. This optional question tells us what you might enjoy reading. You can like a story without agreeing with its characters.');
  for(const [id,label]of Object.entries(interests)){
   const group=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=label;group.append(legend);dialog.append(group);
   for(const [value,label]of [['more','More of this'],['less','Less of this'],['unsure','Not sure']]){const b=button(label,()=>{state={...state,reactions:{...state.reactions,[id]:value}};document.dispatchEvent(new CustomEvent('dreamscapes-reading-reaction',{detail:{source:'kit',dimension:id,value,band}}));save();});b.dataset.focusKey=id+'-'+value;b.setAttribute('aria-pressed',String(state.reactions[id]===value));group.append(b);}
  }
  button('Show my book suggestions',()=>{view='books';paint();});button('Skip these questions',()=>{view='books';paint();});
 }else{
  const entries=Object.entries(state.reactions),has=entries.some(([,v])=>v!=='unsure');
  p(has?'A first shortlist based on what you said you want to read. One encounter is a starting point, not a reliable prediction.':'A few starting points for your age band. You have not given a clear reading preference yet.');
  p('Your actions in the mirror story do not affect this list.');
  if(has)p('Your current interests: '+entries.map(([k,v])=>interests[k]+' — '+({more:'more',less:'less',unsure:'uncertain'}[v])).join('; '));
  const picks=recommend(state,band);
  if(!picks.length)p('This small starter shelf has no clear match for those interests. You can revise your reactions; we will not invent a match.');
  for(const book of picks){const card=document.createElement('article'),title=document.createElement('h3');title.textContent=book.title+' — '+book.author;card.append(title);const why=document.createElement('p');why.textContent=book.matched.length?'Suggested because you asked for: '+book.matched.join('; '):'An age-band starting point, not a personalized match.';card.append(why);const note=document.createElement('p');note.textContent=book.note;card.append(note);const link=document.createElement('a');link.href=book.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Publisher details / find an edition';card.append(link);dialog.append(card);}
  p('Published titles checked November 13, 2026. Local library holdings and current stock are not checked. Age-band choices are broad; use the notes and publisher information to judge reading fit.');
  button('Change my reading interests',()=>{view='reaction';paint();});button('Clear my reading interests',()=>{state={...state,reactions:{}};save();});button('Return to my story',()=>{view='story';paint();});
 }
 button('Return to the carnival',close);
 if(dialog.open)([...dialog.querySelectorAll('button')].find(b=>focusKey?b.dataset.focusKey===focusKey:b.textContent===focus)||dialog.querySelector('button'))?.focus();
}
function mount(){
 const scene=document.querySelector('[data-scene="fun-house"]');if(!scene)return;
 let b=scene.querySelector('.story-nine-entry');if(!b){b=document.createElement('button');b.className='story-nine-entry';b.onclick=()=>{if(scene.inert||document.documentElement.dataset.chestTour)return;origin=b;view='story';paint();dialog.showModal();dialog.querySelector('button')?.focus();};scene.append(b);}
 b.textContent=nodes[state.node].ending?'Return to the reflection’s story':'Someone taps from inside the glass';
 b.hidden=!!document.documentElement.dataset.chestTour;
 scene.dataset.mirrorStory=state.node;
}
new MutationObserver(()=>{if(dialog.open&&(document.documentElement.dataset.location!=='fun-house'||document.documentElement.dataset.travelling||document.documentElement.dataset.chestTour))close();mount();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-location','data-travelling','data-chest-tour']});
document.addEventListener('dreamscapes-age-band',()=>{close();band=getAgeBand().id;state=load(band);view='story';mount();});dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
document.addEventListener('dreamscapes-reading-reset',e=>{if(e.detail?.band===band){state={...state,reactions:{}};save();}});
window.DreamscapesCycleNine=Object.freeze({snapshot:()=>({band,...structuredClone(state),profile:{status:Object.values(state.reactions).some(v=>v!=='unsure')?'tentative':'insufficient',evidence:structuredClone(state.reactions),source:'explicit-reading-reaction',encounters:nodes[state.node].ending?1:0}})});mount();
