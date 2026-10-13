/* Empty carousel mechanism. Coordinates are in the 1536 x 1024 structure art.
   Slot content belongs under its .carousel-mount-anchor, never in the master art. */
(() => {
  'use strict';
  // Cache last writes without reading layout or serializing DOM state.
  const applied = new WeakMap();
  function attr(el,key,value) {
    const text=String(value); let values=applied.get(el);
    if(!values){values=new Map();applied.set(el,values);}
    if(values.get(key)===text)return;
    el.setAttribute(key,text);values.set(key,text);
  }
  function reconcile(parent,desired) {
    let cursor=parent.firstElementChild;
    for(const node of desired) {
      if(node===cursor)cursor=cursor.nextElementSibling;
      else parent.insertBefore(node,cursor);
    }
  }
  const NS = 'http://www.w3.org/2000/svg';
  const PERIOD = 72000;
  const ROWS = 7;
  const RINGS = [
    {name:'outer',radius:593,stagger:0},
    {name:'middle',radius:450,stagger:.025},
    {name:'inner',radius:307,stagger:-.025}
  ];
  const COUNT = ROWS * RINGS.length;
  const CRANK_PERIOD = 6000;
  const LIFT = 28;
  function pose(index, phase) {
    const row=Math.floor(index/RINGS.length),ring=index%RINGS.length;
    const {radius,stagger}=RINGS[ring];
    const angle=2*Math.PI*(row/ROWS-phase)+stagger;
    const depth=radius*Math.sin(angle);
    // One geared crank drives every attachment. Middle rings and neighboring
    // rows use opposite crank arms; no independent oscillators can drift apart.
    const polarity=(row%2===0?1:-1)*(ring===1?-1:1);
    const lift=LIFT*Math.cos(phase*PERIOD/CRANK_PERIOD*2*Math.PI)*polarity;
    return {x:768+radius*Math.cos(angle),y:835+.049645*depth,
      ceilingY:511-.135*depth,depth,scale:1+depth/630*.045,lift};
  }
  window.CarnivalCarousel = Object.freeze({period:PERIOD,slotCount:COUNT,rowCount:ROWS,pose,
    mount(plane) {
      const svg = document.createElementNS(NS,'svg');
      svg.setAttribute('viewBox','0 0 1671 941');
      svg.setAttribute('class','carousel-dressing');
      svg.setAttribute('aria-hidden','true');
      const node = (name, attrs, parent=svg) => {
        const el=document.createElementNS(NS,name);
        for (const [key,value] of Object.entries(attrs)) el.setAttribute(key,value);
        parent.append(el); return el;
      };
      const defs=node('defs',{});
      const gold=node('linearGradient',{id:'carousel-gold'},defs);
      [[0,'#37200e'],[.26,'#9d621f'],[.48,'#f4c66b'],[.68,'#986121'],[1,'#3a220f']].forEach(([offset,color])=>node('stop',{offset,'stop-color':color},gold));
      const wood=node('radialGradient',{id:'carousel-wood'},defs);
      node('stop',{offset:0,'stop-color':'#5d3418'},wood);
      node('stop',{offset:.7,'stop-color':'#916132'},wood);
      node('stop',{offset:1,'stop-color':'#ba864c'},wood);
      // Reuse actual wooden floor pixels as a planar repeating surface; the
      // source PNG is unmodified. Projection below supplies foreshortening.
      const grain=node('pattern',{id:'carousel-floor-grain',width:300,height:300,patternUnits:'userSpaceOnUse'},defs);
      const grainCrop=node('svg',{width:300,height:300,viewBox:'1020 834 240 22',preserveAspectRatio:'none'},grain);
      node('image',{href:'./carousel/structure.png',width:1536,height:1024},grainCrop);
      const deckClip=node('clipPath',{id:'carousel-deck-clip'},defs);
      node('ellipse',{cx:768,cy:835,rx:705,ry:35},deckClip);
      // Follow the actual scalloped fringe rather than cutting angular wedges
      // through the photographic underside. The inner surface meets this rim.
      const ceilingShape='M90 506Q120 518 157 490Q193 477 231 451Q302 483 385 438Q459 476 571 441Q625 458 685 417Q740 431 768 415Q807 426 850 431Q912 454 960 420Q990 456 1065 464Q1110 460 1140 429Q1200 470 1240 468Q1280 465 1310 447Q1340 488 1370 482Q1390 479 1400 471Q1420 511 1440 506L1450 516L1410 545Q1300 585 1120 593L954 590H580Q420 603 250 574L130 545Z';
      const ceilingClip=node('clipPath',{id:'carousel-inner-ceiling-clip'},defs);
      node('path',{d:ceilingShape},ceilingClip);
      const shellMask=node('mask',{id:'carousel-stationary-shell-mask',maskUnits:'userSpaceOnUse',x:0,y:0,width:1536,height:1024},defs);
      node('rect',{width:1536,height:1024,fill:'white'},shellMask);
      node('path',{d:ceilingShape,fill:'black'},shellMask);
      node('path',{d:'M580 511H954V830H580Z',fill:'black'},shellMask);
      node('ellipse',{cx:768,cy:835,rx:705,ry:35,fill:'black'},shellMask);
      // Lamp columns are separate fixed shell members, never carousel slots.
      const stationaryPosts=[[46,310,25,7,23],[216.5,190,31,12,30],[1321.5,190,31,12,30],[1489,310,25,7,23]];
      const postOutline=([center,tip,head,stem,foot])=>`M${center} ${tip}L${center+10} ${tip+25}H${center+head}V${tip+120}L${center+stem} ${tip+152}V748L${center+foot} 770V858H${center-foot}V770L${center-stem} 748V${tip+152}L${center-head} ${tip+120}V${tip+25}H${center-10}Z`;
      for(const post of stationaryPosts)node('path',{d:postOutline(post),fill:'black'},shellMask);
      // Extraction is tighter than the removal/repair footprint: no neighboring
      // fascia pixels may ride along with a relocated lantern or thin shaft.
      const lampOutline=([c,t])=>`M${c} ${t}L${c+7} ${t+24}L${c+17} ${t+34}L${c+10} ${t+46}L${c+30} ${t+54}L${c+34} ${t+63}L${c+25} ${t+73}L${c+21} ${t+108}L${c+13} ${t+115}L${c+18} ${t+122}L${c+10} ${t+138}L${c+7} ${t+154}V711L${c+15} 723V733L${c+10} 741L${c+15} 755L${c+23} 771L${c+25} 814L${c+30} 829V851H${c-30}V829L${c-25} 814L${c-23} 771L${c-15} 755L${c-10} 741L${c-15} 733V723L${c-7} 711V${t+154}L${c-10} ${t+138}L${c-18} ${t+122}L${c-13} ${t+115}L${c-21} ${t+108}L${c-25} ${t+73}L${c-34} ${t+63}L${c-30} ${t+54}L${c-10} ${t+46}L${c-17} ${t+34}L${c-7} ${t+24}Z`;

      node('ellipse',{cx:180,cy:661,rx:470,ry:24,fill:'#09090b',opacity:'.38'});
      const assembly=node('g',{transform:'translate(-625 -160) scale(.82)',class:'carousel-assembly'});
      const img=new Image();img.src='./carousel/structure.png';
      // The far outer fringe sits beyond the pole rings, behind their shafts.
      // The near fascia remains in the foreground above the pole attachments.
      const farFringeClip=node('clipPath',{id:'carousel-far-fringe-clip'},defs);
      node('rect',{x:100,y:535,width:1350,height:105},farFringeClip);
      const nearShellMask=node('mask',{id:'carousel-near-shell-mask',maskUnits:'userSpaceOnUse',x:0,y:0,width:1536,height:1024},defs);
      node('rect',{width:1536,height:1024,fill:'white'},nearShellMask);
      node('rect',{x:100,y:535,width:1350,height:105,fill:'black'},nearShellMask);
      const farFringe=node('g',{class:'carousel-far-fringe','clip-path':'url(#carousel-far-fringe-clip)'},assembly);
      node('image',{href:'./carousel/structure.png',width:1536,height:1024,mask:'url(#carousel-stationary-shell-mask)'},farFringe);
      // Only the exposed underside is a rotating horizontal plane. The original
      // shell is composited last, including every exterior painting and lamp.
      const ceiling=node('g',{'clip-path':'url(#carousel-inner-ceiling-clip)'},assembly);
      // The player sees the ceiling from below and the floor from above.
      // Mirror the ceiling's depth projection, not its angular motion, so the
      // near-side ribs travel with the same poles and floor attachment points.
      node('path',{d:ceilingShape,fill:'#24272d'},ceiling);
      const ceilingProjection=node('g',{transform:'translate(768 511) scale(1 -.135)'},ceiling);
      const innerCeiling=node('g',{class:'carousel-inner-ceiling'},ceilingProjection);
      const blue=node('radialGradient',{id:'carousel-ceiling-blue'},defs);
      node('stop',{offset:0,'stop-color':'#191d25'},blue);
      node('stop',{offset:1,'stop-color':'#24272d'},blue);
      node('circle',{r:675,fill:'url(#carousel-ceiling-blue)'},innerCeiling);
      for(let i=0;i<12;i++) {
        const rib=node('g',{transform:`rotate(${i*30})`},innerCeiling);
        node('path',{d:'M170 0H675',stroke:'#61431f','stroke-width':15},rib);
        node('path',{d:'M170 0H675',stroke:'#b48747','stroke-width':4},rib);
      }
      const ceilingStars=[];
      for(let i=0;i<36;i++) {
        const ring=Math.floor(i/12),angle=(i%12+.5)*Math.PI/6,r=300+ring*140;
        const star=node('image',{width:36,height:26,opacity:'.7'},ceiling);
        ceilingStars.push({star,angle,r});
      }
      const ceilingLights=[];
      for(let i=0;i<12;i++)for(let r=240;r<665;r+=58) {
        const bulb=node('circle',{r:4,fill:'#ffe2a0'},ceiling);
        ceilingLights.push({bulb,angle:i*Math.PI/6,r});
      }
      function prepareCeiling() {
        // Preserve the source's painted star features without stretching its
        // photographic ceiling into a rotating texture strip. These features
        // and the structural ribs share the projected ceiling's angular phase.
        const crop=document.createElement('canvas');crop.width=55;crop.height=60;
        const ctx=crop.getContext('2d');ctx.drawImage(img,746,432,55,60,0,0,55,60);
        const pixels=ctx.getImageData(0,0,55,60);
        for(let i=0;i<pixels.data.length;i+=4) {
          const [r,g,b]=pixels.data.subarray(i,i+3);
          pixels.data[i+3]=Math.round(255*Math.max(0,Math.min(1,(r-g*1.25)/30))*Math.max(0,Math.min(1,(g-b*1.3)/30)));
        }
        ctx.putImageData(pixels,0,0);
        const art=crop.toDataURL();ceilingStars.forEach(({star})=>star.setAttribute('href',art));
      }
      // The deck's foreshortened plane shares the rigid assembly's yaw.
      const deck=node('g',{'clip-path':'url(#carousel-deck-clip)'},assembly);
      node('ellipse',{cx:768,cy:835,rx:705,ry:35,fill:'url(#carousel-wood)'},deck);
      const projection=node('g',{transform:'translate(768 835) scale(1 .049645)'},deck);
      const floor=node('g',{class:'carousel-floor'},projection);
      node('circle',{r:708,fill:'url(#carousel-floor-grain)'},floor);
      for(let x=-720;x<720;x+=47) {
        node('path',{d:`M${x} -720V720`,stroke:'#342012','stroke-width':1.5,opacity:'.3'},floor);
      }
      for(let i=0;i<12;i++) {
        node('path',{d:'M205 0H695',transform:`rotate(${i*30})`,stroke:'#d9a85f','stroke-width':2,opacity:'.38'},floor);
      }
      const rear=node('g',{class:'carousel-rear-slots'},assembly);
      const core=node('g',{class:'carousel-column'},assembly);
      // Eight upright material faces form a drum. Each face uses the original
      // portrait and base panel as a flat physical face with perspective depth.
      const faces=Array.from({length:8},(_,i)=>{
        const face=node('g',{'data-core-face':i},core);
        const panel=node('svg',{width:120,height:319,viewBox:'708 511 120 319',preserveAspectRatio:'none'},face);
        node('image',{href:'./carousel/structure.png',width:1536,height:1024},panel);
        return face;
      });
      const front=node('g',{class:'carousel-front-slots'},assembly);
      const debug=new URLSearchParams(location.search).get('carousel')==='debug';
      const slots=Array.from({length:COUNT},(_,index)=>{
        if(index===0)return null; // Retired 2D comparison mount: remove its entire slot.
        const slot=node('g',{'data-carousel-slot':index+1,'data-carousel-row':Math.floor(index/3)+1,'data-carousel-ring':RINGS[index%3].name,class:'carousel-slot'},rear);
        node('rect',{class:'carousel-pole-shaft',x:-4,y:-405,width:8,height:401,rx:3,fill:'url(#carousel-gold)'},slot);
        // Fine helical highlight reads as a brass carousel pole at scene scale.
        const twist=node('pattern',{id:`carousel-twist-${index}`,width:8,height:18,patternUnits:'userSpaceOnUse'},defs);
        node('path',{d:'M-4 10L12 0M-4 28L12 18',stroke:'#ffe0a0','stroke-width':1.5,opacity:'.45'},twist);
        node('rect',{class:'carousel-pole-shaft',x:-4,y:-405,width:8,height:401,fill:`url(#carousel-twist-${index})`},slot);
        node('path',{d:'M-7 -22H7L13 -2H-13Z',fill:'#662019',stroke:'#ba8840','stroke-width':2},slot);
        node('ellipse',{cx:0,cy:-1,rx:16,ry:3,fill:'url(#carousel-gold)'},slot);
        // A brass sleeve makes the empty attachment's crank travel readable.
        // Future swappable mount artwork belongs only inside the empty anchor.
        const collar=node('g',{class:'carousel-crank-collar'},slot);
        node('rect',{x:-6,y:-5,width:12,height:10,rx:2,fill:'url(#carousel-gold)',stroke:'#513315','stroke-width':1},collar);
        const anchor=node('g',{class:'carousel-mount-anchor',transform:'translate(0 -135)'},slot);
        if(debug) {
          node('circle',{r:8,fill:'none',stroke:'#a9e8ed','stroke-width':2},anchor);
          node('text',{x:12,y:0,fill:'#d4fbff','font-size':24},anchor).textContent=String(index+1);
        }
        return slot;
      }).filter(Boolean);
      const nearShell=node('g',{class:'carousel-near-shell',mask:'url(#carousel-near-shell-mask)'},assembly);
      node('image',{href:'./carousel/structure.png',width:1536,height:1024,class:'carousel-stationary-shell',mask:'url(#carousel-stationary-shell-mask)'},nearShell);
      const fasciaMask=node('mask',{id:'carousel-fascia-only-mask',maskUnits:'userSpaceOnUse',x:0,y:0,width:1536,height:1024},defs);
      node('rect',{width:1536,height:1024,fill:'white'},fasciaMask);
      node('path',{d:ceilingShape,fill:'black'},fasciaMask);
      // Restore only the original column footprints from an aligned repair
      // asset. Keep every surrounding roof/curtain pixel in the original PNG.
      // Never slide adjacent medallions or drapery across the missing strips.
      for(const i of [0,1,2,3]) {
        const [center]=stationaryPosts[i];
        const patchClip=node('clipPath',{id:`carousel-old-post-fascia-${i}`},defs);
        const postClip=node('clipPath',{id:`carousel-old-post-outline-${i}`},defs);
        node('path',{d:postOutline(stationaryPosts[i])},postClip);
        node('rect',{x:center-32,y:i===1||i===2?270:370,width:64,height:i===1||i===2?350:250},patchClip);
        const footprint=node('g',{'clip-path':`url(#carousel-old-post-outline-${i})`},nearShell);
        const patch=node('g',{'clip-path':`url(#carousel-old-post-fascia-${i})`,mask:'url(#carousel-fascia-only-mask)'},footprint);
        node('image',{href:'./carousel/shell-column-repair.png',width:1536,height:1024},patch);
        const backFootprint=node('g',{'clip-path':`url(#carousel-old-post-outline-${i})`},farFringe);
        const backPatch=node('g',{'clip-path':`url(#carousel-old-post-fascia-${i})`,mask:'url(#carousel-fascia-only-mask)'},backFootprint);
        node('image',{href:'./carousel/shell-column-repair.png',width:1536,height:1024},backPatch);
      }
      // Reference: one full pavilion post beside the core and one at the far
      // right edge of the roof. Both remain fixed from lantern to apron foot.
      [[1,938],[2,1480]].forEach(([sourceIndex,destination],i)=>{
        const clip=node('clipPath',{id:`carousel-fixed-post-${i}`},defs);
        node('path',{d:lampOutline(stationaryPosts[sourceIndex])},clip);
        const post=node('g',{class:'carousel-fixed-post',transform:`translate(${destination-stationaryPosts[sourceIndex][0]} 0)`},assembly);
        if(i===1) {
          // The roof artwork overlaps the original far shaft. Extract only the
          // lantern, bridge that covered section with clean shaft pixels, and
          // move the complete lower collar/pedestal together. Never splice the
          // support through its ornamental waist or carry roof trim with it.
          const [center]=stationaryPosts[sourceIndex],extension=130;
          const upperClip=node('clipPath',{id:'carousel-far-lantern'},defs);
          node('rect',{x:center-36,y:0,width:72,height:310},upperClip);
          const upper=node('g',{'clip-path':'url(#carousel-far-lantern)'},post);
          node('image',{href:'./carousel/structure.png',width:1536,height:1024,'clip-path':`url(#carousel-fixed-post-${i})`},upper);
          const shaft=node('pattern',{id:'carousel-far-clean-shaft',x:center-8,y:310,width:16,height:60,patternUnits:'userSpaceOnUse'},defs);
          const crop=node('svg',{width:16,height:60,viewBox:`${center-8} 650 16 60`,preserveAspectRatio:'none'},shaft);
          node('image',{href:'./carousel/structure.png',width:1536,height:1024},crop);
          node('rect',{x:center-8,y:310,width:16,height:710+extension-310,fill:'url(#carousel-far-clean-shaft)'},post);
          const footClip=node('clipPath',{id:'carousel-far-complete-pedestal'},defs);
          node('path',{d:`M${center-8} 710H${center+8}L${center+15} 723V733L${center+10} 741L${center+15} 755L${center+23} 771L${center+25} 814L${center+36} 834V858H${center-36}V834L${center-25} 814L${center-23} 771L${center-15} 755L${center-10} 741L${center-15} 733V723Z`},footClip);
          const foot=node('g',{class:'carousel-ground-foot',transform:`translate(0 ${extension})`},post);
          node('image',{href:'./carousel/structure.png',width:1536,height:1024,'clip-path':'url(#carousel-far-complete-pedestal)'},foot);
        } else {
          // Both fixed pavilion supports stand off the deck. The far foot
          // meets the ground just inside the fence beside the apron; the near
          // support retains its longer shaft behind the foreground architecture.
          const [center]=stationaryPosts[sourceIndex],extension=i===0?180:130;
          const upperClip=node('clipPath',{id:`carousel-post-upper-${i}`},defs);
          node('rect',{x:center-32,y:0,width:64,height:748},upperClip);
          const upper=node('g',{'clip-path':`url(#carousel-post-upper-${i})`},post);
          node('image',{href:'./carousel/structure.png',width:1536,height:1024,'clip-path':`url(#carousel-fixed-post-${i})`},upper);
          const shaft=node('pattern',{id:`carousel-post-shaft-${i}`,x:center-12,y:748,width:24,height:60,patternUnits:'userSpaceOnUse'},defs);
          const crop=node('svg',{width:24,height:60,viewBox:`${center-12} 650 24 60`},shaft);
          node('image',{href:'./carousel/structure.png',width:1536,height:1024},crop);
          node('rect',{x:center-12,y:748,width:24,height:extension,fill:`url(#carousel-post-shaft-${i})`},post);
          const footClip=node('clipPath',{id:`carousel-post-foot-${i}`},defs);
          node('rect',{x:center-32,y:748,width:64,height:110},footClip);
          const foot=node('g',{class:'carousel-ground-foot',transform:`translate(0 ${extension})`},post);
          const pedestal=node('g',{'clip-path':`url(#carousel-post-foot-${i})`},foot);
          node('image',{href:'./carousel/structure.png',width:1536,height:1024,'clip-path':`url(#carousel-fixed-post-${i})`},pedestal);
        }
      });
      // Original stage foreground, not a populated reference replacement.
      const railClip=node('clipPath',{id:'carousel-stage-foreground'},defs);
      node('path',{d:'M0 640L82 628L158 652L163 800L226 819L231 941H0Z M204 668Q286 638 399 662L395 941H205Z M399 580L520 580L529 699L408 718Z M592 391H702L718 405L702 420H592Z M591 421H700L716 435L700 448H591Z M591 449H699L718 463L700 478H591Z M591 479H702L718 491L702 507H591Z M642 503H652V650H642Z'},railClip);
      // Rail runs and posts traced in the approved empty scene's coordinates.
      node('path',{d:'M0 550L657 545V555L0 561Z M0 569L657 560V568L0 578Z M0 619L650 576V584L0 630Z'},railClip);
      for(const [x,y,h,w] of [[32,553,98,7],[66,553,88,6],[108,549,88,9],[149,550,101,7],[179,547,116,9],[225,550,106,6],[267,548,108,7],[309,548,109,7],[351,546,110,8],[394,548,118,7],[435,548,128,7],[478,546,119,7],[525,546,105,8],[570,545,83,8],[615,544,90,8]]) {
        node('rect',{x,y,width:w,height:h},railClip);
      }
      // The fine iron balusters are in front of the far pavilion support too.
      // Restore their original pixels; the large-post mask alone left the
      // pedestal painting across these bars and made it read outside the fence.
      for(const [x,w] of [[550,3],[560,4],[578,4],[586,4],[594,4],[603,4],[611,4],[620,4],[628,4]]) {
        node('rect',{x,y:560,width:w,height:117},railClip);
      }
      node('image',{href:'./locations/rides-games.png',width:1671,height:941,'clip-path':'url(#carousel-stage-foreground)'},svg);
      plane.append(svg);
      const slotRefs=new Map(slots.map(slot=>[slot,{
        anchor:slot.querySelector('.carousel-mount-anchor'),
        collar:slot.querySelector('.carousel-crank-collar'),
        shafts:[...slot.querySelectorAll('.carousel-pole-shaft')]
      }]));
      let elapsed=0,last=null,frame=null;
      const reduced=matchMedia('(prefers-reduced-motion: reduce)');
      const still=new URLSearchParams(location.search).get('motion')==='still';
      function paint() {
        const phase=(elapsed%PERIOD)/PERIOD;
        svg.dataset.phase=String(phase);
        const yaw=-phase*2*Math.PI;
        assembly.dataset.yaw=String(yaw);
        attr(floor,'transform',`rotate(${-phase*360})`);
        attr(innerCeiling,'transform',`rotate(${-phase*360})`);
        for(const {star,angle,r} of ceilingStars) {
          attr(star,'x',768+r*Math.cos(angle+yaw)-18);
          attr(star,'y',511-r*.135*Math.sin(angle+yaw)-13);
        }
        for(const {bulb,angle,r} of ceilingLights) {
          attr(bulb,'cx',768+r*Math.cos(angle+yaw));
          attr(bulb,'cy',511-r*.135*Math.sin(angle+yaw));
        }
        core.dataset.yaw=String(yaw);
        const visible=[];
        faces.forEach((face,i)=>{
          const theta=Math.PI/2+(i-0.5)*Math.PI/4+yaw;
          const depth=Math.sin(theta);
          const display=depth>0?'':'none';if(face.style.display!==display)face.style.display=display;
          if(depth<=0)return;
          const left=theta+Math.PI/8,right=theta-Math.PI/8;
          const x0=768+187*Math.cos(left),x1=768+187*Math.cos(right);
          const y0=511+9*Math.sin(left),y1=511+9*Math.sin(right);
          attr(face,'transform',`matrix(${(x1-x0)/120} ${(y1-y0)/120} 0 1 ${x0} ${y0})`);
          visible.push({face,depth});
        });
        visible.sort((a,b)=>a.depth-b.depth);
        reconcile(core,[...core.children].filter(face=>!visible.some(v=>v.face===face)).concat(visible.map(v=>v.face)));
        const ordered=slots.map(slot=>({slot,...pose(Number(slot.dataset.carouselSlot)-1,phase)})).sort((a,b)=>a.depth-b.depth);
        for(const {slot,x,y,scale,depth,ceilingY,lift} of ordered) {
          const mountScale=slot.dataset.constantScale==='1'?1:scale;
          attr(slot,'transform',`translate(${x} ${y}) scale(${mountScale})`);
          const length=(y-ceilingY)/mountScale;
          const mountHeight=Number(slot.dataset.mountHeight||135);
          const mountLift=slot.dataset.bobAmplitude?lift*Number(slot.dataset.bobAmplitude)/LIFT:lift;
          const attachment=`translate(0 ${-mountHeight-mountLift})`;
          attr(slotRefs.get(slot).anchor,'transform',attachment);
          attr(slotRefs.get(slot).collar,'transform',attachment);
          slotRefs.get(slot).shafts.forEach(shaft=>{attr(shaft,'y',-length);attr(shaft,'height',length-4);});
          attr(slot,'opacity',String(.84+.16*(depth/630+1)/2));

        }
        reconcile(rear,ordered.filter(v=>v.depth<0).map(v=>v.slot));
        reconcile(front,ordered.filter(v=>v.depth>=0).map(v=>v.slot));
      }
      function active(){return svg.isConnected&&!document.hidden&&!plane.parentElement.inert&&!reduced.matches&&!still;}
      function tick(now){frame=null;if(!active()){last=null;return;}if(last!==null)elapsed+=now-last;last=now;paint();frame=requestAnimationFrame(tick);}
      function sync(){if(frame!==null)cancelAnimationFrame(frame);frame=null;last=null;if(active())frame=requestAnimationFrame(tick);}
      const observer=new MutationObserver(sync);
      observer.observe(plane.parentElement,{attributes:true,attributeFilter:['inert']});
      document.addEventListener('visibilitychange',sync); reduced.addEventListener('change',sync);
      paint();
return Promise.all([img.decode()]).then(()=>{prepareCeiling();paint();sync();}).catch(error=>{observer.disconnect();document.removeEventListener('visibilitychange',sync);reduced.removeEventListener('change',sync);svg.remove();throw error;});
    }
  });
})();
