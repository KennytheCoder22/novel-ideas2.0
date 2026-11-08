/* Explicit loopback-only diagnostics. Never added to ordinary player UI. */
(() => {
 'use strict';
 if(!['127.0.0.1','localhost','[::1]'].includes(location.hostname)||new URLSearchParams(location.search).get('observations')!=='1')return;
 const store=window.DreamscapesObservations;if(!store)return;
 const style=document.createElement('style');style.textContent='.evidence-open{position:fixed;right:12px;top:12px;z-index:10001;padding:10px;background:#17253a;color:#ffedc4;border:1px solid #c5a36a;border-radius:5px;font:14px system-ui}.evidence-dialog{max-width:min(960px,90vw);max-height:85vh;box-sizing:border-box;overflow:auto;background:#101b2b;color:#e7d5b9;border:1px solid #c5a36a;border-radius:8px;padding:22px;font:14px/1.5 system-ui}.evidence-dialog::backdrop{background:#0009}.evidence-dialog button{padding:8px;margin:4px;color:#fff;background:#29415b;border:1px solid #9db2c9;cursor:pointer}.evidence-dialog pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#091322;padding:12px}.evidence-dialog textarea{width:100%;height:160px}.evidence-dialog dt{font-weight:bold}.evidence-dialog dd{margin-bottom:8px}';document.head.append(style);
 const open=document.createElement('button');open.className='evidence-open';open.textContent='Evidence inspector';
 const dialog=document.createElement('dialog');dialog.className='evidence-dialog';dialog.setAttribute('aria-label','Dreamscapes evidence inspector');
 const title=document.createElement('h2');title.textContent='Local evidence inspector';
 const intro=document.createElement('p');intro.textContent='Developer diagnostics. Navigation, exploration and gameplay are never automatically treated as literary preference. Carousel design associations are tentative and may be purely aesthetic; observed choices and proposed interpretations are shown separately.';
 const summary=document.createElement('p');summary.setAttribute('data-evidence-summary','');
 const close=document.createElement('button');close.textContent='Close inspector';close.onclick=()=>dialog.close();
 const copy=document.createElement('button');copy.textContent='Copy anonymous session report';
 const message=document.createElement('p');message.setAttribute('role','status');
 const carousel=document.createElement('div');carousel.setAttribute('data-carousel-evidence','');
 const report=document.createElement('pre');report.setAttribute('data-evidence-events','');
 const fallback=document.createElement('textarea');fallback.readOnly=true;fallback.hidden=true;fallback.setAttribute('aria-label','Anonymous session report');
 dialog.append(title,intro,summary,close,copy,message,fallback,carousel,report);document.body.append(open,dialog);
 function update(){if(!dialog.open)return;const s=store.snapshot();summary.textContent=`Session ${s.sessionId} · Age band: ${s.ageBand} · Total observations: ${s.counts.total} · Preference-classified observations: ${s.counts.preference} · Explicit: ${s.counts.explicitPreference||0} · Tentative: ${s.counts.tentativePreference||0} · Exploration: ${s.counts.exploration} · Gameplay: ${s.counts.gameplay} · Detected duplicates: ${s.diagnostics.duplicates} · Discarded: ${s.diagnostics.discarded} · Storage failures: ${s.diagnostics.storageFailures}`;carousel.replaceChildren();for(const e of s.events.filter(e=>e.schemaVersion===2)){const item=document.createElement('p');item.textContent='Observed: '+e.selectedAlternative+' · '+e.carousel.style+' · '+e.ageBand+' · Alternatives: '+e.alternatives.map(a=>a.label).join(', ')+' · Classification: '+e.category+' · Proposed: '+(e.interpretation.proposedAttributes.map(a=>a.value).join(', ')||'none')+' · Interpretation: '+e.interpretation.status+' · Contribution: '+(e.preferenceSupported?'tentative association only':'none')+' · '+e.interpretation.limitation;carousel.append(item);}report.textContent=JSON.stringify(s,null,2);}
 open.onclick=()=>{dialog.showModal();update();};
 copy.onclick=async()=>{const text=JSON.stringify(store.snapshot(),null,2);try{await navigator.clipboard.writeText(text);message.textContent='Anonymous report copied.';}catch{fallback.hidden=false;fallback.value=text;fallback.focus();fallback.select();message.textContent='Copy the selected anonymous report.';}};
 document.addEventListener('dreamscapes-observations-updated',update);
})();
