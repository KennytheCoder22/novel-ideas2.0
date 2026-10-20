/* Optional room interactions. Scene navigation owns visibility and return paths. */
(() => {
 'use strict';
 const NS='http://www.w3.org/2000/svg';
 function svgNode(tag,attrs,parent){const node=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);parent?.append(node);return node;}
 window.CarnivalPlay=Object.freeze({mount(view,plane,id){
  if(!['fun-house','skee-ball'].includes(id))return ()=>{};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const ui=document.createElement('div');ui.className='play-room-ui';view.append(ui);
  const title=document.createElement('header');title.className='play-room-title';
  const heading=document.createElement('h1');heading.textContent=id==='fun-house'?'Hall of Mirrors':'Skee Ball';title.append(heading);
  const hint=document.createElement('p');hint.textContent=id==='fun-house'?'Touch the glass. See what looks back.':'Set the angle. Pull back and release to roll.';title.append(hint);ui.append(title);
  const status=document.createElement('output');status.className='play-room-status';status.setAttribute('aria-live','polite');ui.append(status);
  const cleanups=[];
  if(id==='fun-house'){
   const seen=new Set(),art=plane.querySelector('.location-background');
   const mirrors=[['tall',[16,22,14,47],'The reflection stretches toward the rafters.'],['wide',[42,22,16,47],'The hall seems wider than it was a moment ago.'],['endless',[71,22,14,47],'Another mirror. And another. The passage continues.']];
   mirrors.forEach(([kind,area,message])=>{
    const button=document.createElement('button');button.className='funhouse-mirror funhouse-mirror--'+kind;
    button.setAttribute('aria-label','Examine the '+kind+' mirror');button.setAttribute('aria-pressed','false');
    const [x,y,w,h]=area;Object.assign(button.style,{left:x+'%',top:y+'%',width:w+'%',height:h+'%'});
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=640;canvas.setAttribute('aria-hidden','true');button.append(canvas);
    const paint=()=>{if(!art.naturalWidth)return;const c=canvas.getContext('2d');c.drawImage(art,art.naturalWidth*x/100,art.naturalHeight*y/100,art.naturalWidth*w/100,art.naturalHeight*h/100,0,0,320,640);};
    art.decode().then(paint).catch(()=>{});
    button.addEventListener('click',()=>{
     seen.add(kind);button.classList.toggle('is-examined');button.setAttribute('aria-pressed',String(button.classList.contains('is-examined')));status.textContent=message;
     if(seen.size===3){const onward=view.querySelector('.room-route--onward');onward.hidden=false;status.textContent='Beyond the last reflection, a passage opens toward Tent Row.';}
    });plane.append(button);
   });
  }else{
   cleanups.push(window.CarnivalSkeeBall.mount(view,plane,ui,status));
  }
  return ()=>{cleanups.forEach(dispose=>dispose());ui.remove();};
 }});
})();
