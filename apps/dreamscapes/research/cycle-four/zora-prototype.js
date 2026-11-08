import {interactionId,sceneId,invitations,labelFor,catalog,shadowEvidence} from './zora-contract.mjs';
const flags=new URLSearchParams(location.search);
if(['127.0.0.1','localhost','[::1]'].includes(location.hostname)&&flags.get('cycle-four')==='zora')start();
function start(){
 const core=window.DreamscapesObservationCore;if(!core||!window.DreamscapesObservations)return;
 const key='dreamscapes.cycle-four.zora.v1';let storage;
 try{sessionStorage.getItem(key);storage={getItem:()=>sessionStorage.getItem(key),setItem:(_,v)=>sessionStorage.setItem(key,v)};}catch{}
 const ageBand=()=>window.DreamscapesObservations.snapshot().ageBand;
 const store=core.createStore({storage,ageBand,catalog,origin:window.__cycleFourSynthetic?'test_fixture':'player',onChange:()=>document.dispatchEvent(new Event('cycle-four-evidence-updated'))});
 window.DreamscapesCycleFour=Object.freeze({store,shadow:()=>shadowEvidence(store.snapshot()),version:interactionId});
 const entry=document.createElement('button');entry.className='zora-invitation-entry';entry.textContent='Listen at the curtain';entry.hidden=true;document.body.append(entry);
 const dialog=document.createElement('dialog');dialog.className='zora-invitation';dialog.setAttribute('aria-label','Zora: two invitations');document.body.append(dialog);
 let presentation=null,locked=false;
 const active=()=>document.documentElement.dataset.location===sceneId&&!document.documentElement.dataset.travelling;
 function update(){const id=document.documentElement.dataset.location;if(id)store.enterScene(id);entry.hidden=!active();if(!active()&&dialog.open)dialog.close();}
 new MutationObserver(update).observe(document.documentElement,{attributes:true,attributeFilter:['data-location','data-travelling']});update();
 const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
 function record(action,selection=null){return store.record({sceneId,interactionId,category:'exploration',action,selectedAlternative:selection,alternatives:[...presentation.presentationOrder.map(id=>({id,label:labelFor(invitations.find(o=>o.id===id))})),{id:'not-tonight',label:'Not tonight'}],presentationOrder:[...presentation.presentationOrder,'not-tonight'],details:{kind:interactionId}});}
 function close(declined=false){if(declined)record('declined','not-tonight');dialog.close();entry.focus();}
 function outcome(id){
  locked=true;const selected=invitations.find(o=>o.id===id);dialog.replaceChildren(node('p','Madame Zora'),node('h2',selected.title),node('p',selected.ending));
  const other=node('button','Hear the other invitation');other.onclick=()=>{const next=invitations.find(o=>o.id!==id);record('other-ending-previewed',next.id);outcome(next.id);};
  const leave=node('button','Keep the ticket');leave.onclick=()=>close();dialog.append(other,leave);leave.focus();
 }
 entry.onclick=()=>{
  if(!active())return;
  const random=globalThis.crypto?.getRandomValues?crypto.getRandomValues(new Uint8Array(1))[0]%2:Math.random()<.5?0:1;
  const order=(flags.get('cycle-four-order')==='reverse'||flags.get('cycle-four-order')!=='forward'&&random)?[invitations[1].id,invitations[0].id]:invitations.map(o=>o.id);
  presentation=store.presentDecision(interactionId,order);if(!presentation.presentationId)return;
  // The raw offer includes the opt-out as well as both narrative alternatives.
  const offeredId='offer-'+presentation.presentationId;
  if(!store.snapshot().events.some(e=>e.occurrenceId===offeredId))store.record({sceneId,interactionId,category:'exploration',action:'invitations-offered',occurrenceId:offeredId,alternatives:[...presentation.presentationOrder.map(id=>({id,label:labelFor(invitations.find(o=>o.id===id))})),{id:'not-tonight',label:'Not tonight'}],presentationOrder:[...presentation.presentationOrder,'not-tonight'],details:{kind:flags.has('cycle-four-order')?'developer-fixed-order':'randomized-persisted'}});
  const previous=store.snapshot().events.find(e=>e.decisionId===presentation.presentationId);dialog.showModal();if(previous){outcome(previous.selectedAlternative);return;}
  locked=false;dialog.replaceChildren(node('p','Madame Zora'),node('h2','One ticket. Two invitations.'),node('p','A voice stirs behind the curtain. "Your ticket has no destination yet. Shall I pull the thread of something impossible, or something hidden?"'));
  const options=node('div');options.className='zora-invitation-options';
  for(const id of presentation.presentationOrder){const option=invitations.find(o=>o.id===id),b=node('button');b.dataset.invitationId=id;b.append(node('strong',option.title),node('span',option.premise));b.onclick=()=>{if(locked||!active())return;locked=true;const result=store.commitDecision(presentation.presentationId,id);if(result.accepted)outcome(id);else{locked=false;const status=node('p','The thread slipped. You can try again.');status.setAttribute('role','status');dialog.append(status);}};options.append(b);}
  const decline=node('button','Not tonight');decline.onclick=()=>close(true);dialog.append(options,decline);options.querySelector('button').focus();
 };
 dialog.addEventListener('cancel',()=>{if(presentation)record('invitation-closed');});
 if(flags.get('observations')==='1'){
  const inspect=node('button','Prototype evidence');inspect.className='zora-prototype-inspect';const d=node('dialog');d.className='zora-prototype-evidence';d.setAttribute('aria-label','Cycle Four prototype evidence');const title=node('h2','Isolated prototype evidence'),intro=node('p','Local research only. A chosen story premise is observed; a preference for books remains unvalidated. The normal game session is separate. No recommendation call or numerical taste score.'),pre=node('pre'),closeButton=node('button','Close prototype evidence');closeButton.onclick=()=>d.close();d.append(title,intro,closeButton,pre);document.body.append(inspect,d);const refresh=()=>pre.textContent=JSON.stringify({snapshot:store.snapshot(),shadow:shadowEvidence(store.snapshot())},null,2);inspect.onclick=()=>{refresh();d.showModal();};document.addEventListener('cycle-four-evidence-updated',()=>{if(d.open)refresh();});
 }
}
