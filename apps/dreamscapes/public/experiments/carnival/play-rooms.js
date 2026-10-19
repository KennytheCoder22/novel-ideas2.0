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
  const hint=document.createElement('p');hint.textContent=id==='fun-house'?'Touch the glass. See what looks back.':'Nine balls. Aim, choose your power, and roll.';title.append(hint);ui.append(title);
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
   const game=document.createElement('section');game.className='skee-game';game.setAttribute('aria-label','Skee Ball game');ui.append(game);
   const scoreboard=document.createElement('div');scoreboard.className='skee-scoreboard';
   const score=document.createElement('output'),remaining=document.createElement('output');score.setAttribute('aria-label','Score');remaining.setAttribute('aria-label','Balls remaining');scoreboard.append(score,remaining);game.append(scoreboard);
   const board=svgNode('svg',{class:'skee-board',viewBox:'0 0 420 620',role:'img','aria-label':'Skee Ball lane and scoring cups. Tap the lane to aim.'});game.append(board);
   const defs=svgNode('defs',{},board);
   const grain=svgNode('filter',{id:'skee-grain',x:'0%',y:'0%',width:'100%',height:'100%'},defs);
   svgNode('feTurbulence',{type:'fractalNoise',baseFrequency:'.06 .6',numOctaves:2,seed:7,result:'noise'},grain);
   svgNode('feColorMatrix',{in:'noise',type:'saturate',values:0,result:'mono'},grain);
   const fade=svgNode('feComponentTransfer',{in:'mono',result:'faint'},grain);svgNode('feFuncA',{type:'linear',slope:'.15'},fade);
   svgNode('feComposite',{in:'faint',in2:'SourceGraphic',operator:'in',result:'texture'},grain);
   svgNode('feBlend',{in:'SourceGraphic',in2:'texture',mode:'multiply'},grain);
   const wood=svgNode('linearGradient',{id:'skee-wood',x1:'0',y1:'0',x2:'1',y2:'0'},defs);
   for(const [offset,color] of [['0','#3c2013'],['.28','#8b5430'],['.5','#ad7744'],['.75','#784321'],['1','#352014']])svgNode('stop',{offset,'stop-color':color},wood);
   const metal=svgNode('linearGradient',{id:'skee-brass',x1:'0',y1:'0',x2:'1',y2:'1'},defs);
   for(const [offset,color] of [['0','#e9bc6f'],['.4','#91602b'],['.7','#e0b36c'],['1','#543217']])svgNode('stop',{offset,'stop-color':color},metal);
   svgNode('path',{d:'M82 608 L112 24 Q210 0 308 24 L338 608Z',fill:'url(#skee-wood)',filter:'url(#skee-grain)',stroke:'#21140d','stroke-width':10},board);
   svgNode('path',{d:'M120 30 Q210 12 300 30 L292 395 Q210 415 128 395Z',fill:'#4b2921',stroke:'url(#skee-brass)','stroke-width':5},board);
   svgNode('path',{d:'M133 417 Q210 435 287 417 L321 590 Q210 611 99 590Z',fill:'url(#skee-wood)',stroke:'#d1a25e','stroke-width':3},board);
   for(let i=0;i<6;i++)svgNode('path',{d:`M${142+i*27} 435L${112+i*39} 589`,stroke:'#432817','stroke-width':1,opacity:'.5'},board);
   svgNode('path',{d:'M103 586 Q210 560 317 586',fill:'none',stroke:'#d0a767','stroke-width':5},board);
   const cups=[{x:151,y:64,r:18,points:100},{x:269,y:64,r:18,points:100},{x:210,y:100,r:23,points:50},{x:210,y:155,r:27,points:40},{x:210,y:217,r:30,points:30},{x:210,y:283,r:33,points:20},{x:210,y:355,r:35,points:10}];
   for(const cup of cups){cup.rim=svgNode('ellipse',{cx:cup.x,cy:cup.y,rx:cup.r+5,ry:cup.r+2,fill:'#b38246',stroke:'#e8c281','stroke-width':2},board);svgNode('ellipse',{cx:cup.x,cy:cup.y,rx:cup.r,ry:cup.r-3,fill:'#17130f',stroke:'#573e28','stroke-width':3},board);const label=svgNode('text',{x:cup.x,y:cup.y+5,'text-anchor':'middle',fill:'#e5c080','font-size':cup.points===100?12:14,'font-family':'Georgia,serif'},board);label.textContent=cup.points;}
   const aimMark=svgNode('g',{class:'skee-aim',stroke:'#f6e1af','stroke-width':1.5,fill:'none','pointer-events':'none'},board);
   svgNode('circle',{r:10},aimMark);svgNode('path',{d:'M-16 0H16M0-16V16'},aimMark);
   const ball=svgNode('circle',{cx:210,cy:570,r:13,fill:'#c4945e',stroke:'#f1ca88','stroke-width':2,class:'skee-ball'},board);
   const controls=document.createElement('div');controls.className='skee-controls';game.append(controls);
   const range=(text,min,max,value)=>{const label=document.createElement('label');label.textContent=text;const input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.value=value;label.append(input);controls.append(label);return input;};
   const aim=range('Aim',-100,100,0),power=range('Power',0,100,55);
   const roll=document.createElement('button');roll.className='carnival-play-button';roll.textContent='Roll ball';controls.append(roll);
   const replay=document.createElement('button');replay.className='carnival-play-button';replay.textContent='Play again';replay.hidden=true;controls.append(replay);
   let balls=9,total=0,pending=null,frame=0,disposed=false;
   function target(){return {x:210+Number(aim.value)*1.18,y:355-Number(power.value)*2.91};}
   function aimAt(){const t=target();aimMark.setAttribute('transform',`translate(${t.x} ${t.y})`);}
   function update(){score.textContent='Score '+total;remaining.textContent=balls+' ball'+(balls===1?'':'s')+' left';roll.disabled=!!pending||!balls;aim.disabled=power.disabled=!!pending||!balls;replay.hidden=balls!==0;}
   function finish(){if(!pending)return;cancelAnimationFrame(frame);frame=0;const t=pending;pending=null;balls--;const cup=cups.find(c=>Math.hypot(t.x-c.x,t.y-c.y)<=c.r-5);const points=cup?.points||0;total+=points;cups.forEach(c=>c.rim.classList.toggle('is-hit',c===cup));
    ball.setAttribute('cx',210);ball.setAttribute('cy',570);ball.setAttribute('r',13);update();
    status.textContent=balls?points+' points. '+balls+' ball'+(balls===1?'':'s')+' remaining.':'Round complete — '+total+' points. Play again or explore the carnival.';
   }
   function tick(now){if(disposed||!pending)return;if(view.inert||document.hidden||reduced.matches){finish();return;}
    const u=Math.min(1,(now-pending.start)/1100),ease=1-(1-u)**1.4;
    ball.setAttribute('cx',210+(pending.x-210)*ease);ball.setAttribute('cy',570+(pending.y-570)*ease-Math.sin(u*Math.PI)*42);ball.setAttribute('r',13-5*u);
    if(u<1)frame=requestAnimationFrame(tick);else finish();
   }
   aim.addEventListener('input',aimAt);power.addEventListener('input',aimAt);
   board.addEventListener('pointerdown',event=>{if(pending||!balls)return;const inverse=board.getScreenCTM()?.inverse();if(!inverse)return;const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(inverse);
    aim.value=Math.max(-100,Math.min(100,(point.x-210)/1.18));power.value=Math.max(0,Math.min(100,(355-point.y)/2.91));aimAt();
   });
   roll.addEventListener('click',()=>{if(pending||!balls||view.inert)return;pending={...target(),start:performance.now()};update();status.textContent='The ball rolls up the lane…';if(reduced.matches)finish();else frame=requestAnimationFrame(tick);});
   replay.addEventListener('click',()=>{balls=9;total=0;update();status.textContent='A fresh tray of nine balls.';roll.focus();});
   const observer=new MutationObserver(()=>{if(view.inert)finish();});observer.observe(view,{attributes:true,attributeFilter:['inert']});
   const onHide=()=>{if(document.hidden)finish();};document.addEventListener('visibilitychange',onHide);
   const onReduced=()=>{if(reduced.matches)finish();};reduced.addEventListener('change',onReduced);
   cleanups.push(()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener('visibilitychange',onHide);reduced.removeEventListener('change',onReduced);});
   aimAt();update();
  }
  return ()=>{cleanups.forEach(dispose=>dispose());ui.remove();};
 }});
})();
