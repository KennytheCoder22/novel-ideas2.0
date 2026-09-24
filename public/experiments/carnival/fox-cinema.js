/* Fox-only choreography. The accepted scene is moved as one camera plane;
   no wheel, mask, ambient-object or original placement styles are edited. */
(() => {
  const files = ['fox.png','fox-picked-up.png','fox-breaking.png', ...Array.from({length:6},(_,i)=>`fox-fragment-${i}.png`)];
  const images = files.map(file => { const image = new Image(); image.src = `./${file}`; return image; });
  const ready = Promise.all(images.map(image => image.decode()));
  ready.catch(() => {});
  const clamp = n => Math.max(0,Math.min(1,n));
  const smooth = n => { n=clamp(n); return n*n*(3-2*n); };
  const mix = (a,b,t) => a+(b-a)*t;
  function random(seed) { return () => { seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; }; }
  const tagPolygon = [[875,550],[943,570],[1052,712],[966,773],[850,601]];
  function path(ctx, points) { ctx.beginPath(); points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath(); }
  window.startFoxCinema = ({scene,dialog,art,motion,still,record,vanish}) => {
    const fox = scene.querySelector('.fox');
    const original = {transform:scene.style.transform, origin:scene.style.transformOrigin, filter:scene.style.filter, visibility:fox.style.visibility};
    const baseTransform = getComputedStyle(scene).transform;
    const sceneRect = scene.getBoundingClientRect();
    const foxRect = fox.getBoundingClientRect();
    const ground = {x:foxRect.x,y:foxRect.y,w:foxRect.width,h:foxRect.height};
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role','img'); canvas.setAttribute('aria-label','An old stuffed fox, its worn tag reading MARA.');
    art.append(canvas); dialog.classList.add('fox-cinema');
    const ctx = canvas.getContext('2d');
    let width=innerWidth,height=innerHeight;
    const resize = () => { width=innerWidth;height=innerHeight; const d=Math.min(devicePixelRatio||1,2); canvas.width=Math.round(width*d);canvas.height=Math.round(height*d);ctx.setTransform(d,0,0,d,0,0); };
    resize();
    const rng = random(72913);
    // A jittered triangular mesh: assembled patches reproduce the source, then
    // detach in seeded irregular clusters, never in screen-column order.
    const points = Array.from({length:17},(_,y)=>Array.from({length:25},(_,x)=>[
      x===0?0:x===24?1536:x*64+(rng()-.5)*35,
      y===0?0:y===16?1024:y*64+(rng()-.5)*35]));
    const edges=new Map();
    function frayedEdge(a,b) {
      const forward=a[0]<b[0]||(a[0]===b[0]&&a[1]<b[1]);
      const p=forward?a:b,q=forward?b:a,key=`${p}:${q}`;
      if(!edges.has(key)) {
        const dx=q[0]-p[0],dy=q[1]-p[1];
        const edge=[p];
        for(let j=1;j<7;j++){const n=(rng()-.5)*.32;edge.push([p[0]+dx*j/7-dy*n,p[1]+dy*j/7+dx*n]);}
        edge.push(q);edges.set(key,edge);
      }
      const edge=edges.get(key);return forward?edge:[...edge].reverse();
    }
    const patches=[];
    for(let y=0;y<16;y++)for(let x=0;x<24;x++) {
      const p=points[y][x],q=points[y][x+1],r=points[y+1][x],s=points[y+1][x+1];
      for(const vertices of [[p,q,r],[q,s,r]]) {
        const cx=vertices.reduce((v,p)=>v+p[0],0)/3, cy=vertices.reduce((v,p)=>v+p[1],0)/3;
        const local=Math.min(Math.hypot(cx-470,cy-350),Math.hypot(cx-1100,cy-730),Math.hypot(cx-600,cy-860))/1100;
        const outline=vertices.flatMap((v,i)=>frayedEdge(v,vertices[(i+1)%3]).slice(0,-1));
        patches.push({vertices:outline,cx,cy,delay:local*.6+rng()*1.05,vx:(rng()-.5)*180,vy:5+rng()*45,spin:(rng()-.5)*3});
      }
    }
    const fibers=Array.from({length:68},(_,i)=>({x:320+rng()*850,y:140+rng()*750,delay:rng()*1.45,size:i<40?5+rng()*14:20+rng()*35,vx:(rng()-.5)*210,vy:rng()*35,spin:(rng()-.5)*6,image:3+i%6,broken:i%9===0}));
    let frame=0,previous=null,elapsed=0,cancelled=false,loaded=false,gone=false,tagSeen=false,complete=false;
    const reduced=()=>motion.matches||still;
    // Seconds: crouch 1.6; lift/turn 1.35; read 2.5; break 2.7;
    // tag lingers .3 and drops .85; gaze/stand/pullback 1.6.
    const BREAK=5.45,TAG=8.45,RETURN=9.3,END=10.9;
    function camera(amount,gaze=0) {
      const scale=1+.68*amount;
      const targetX=width*.51,targetY=height*.65;
      const fx=ground.x+ground.w*.5,fy=ground.y+ground.h*.55;
      // Never expose a source-art edge while crouching toward the far-right toy.
      const dx=Math.max(width-sceneRect.right*scale,Math.min(-sceneRect.left*scale,(targetX-fx*1.68)*amount));
      const dy=Math.max(height-sceneRect.bottom*scale,Math.min(-sceneRect.top*scale,(targetY-fy*1.68)*amount+gaze));
      // Prefix a screen-space camera to the existing accepted crop/pan matrix.
      scene.style.transformOrigin='0 0';
      scene.style.transform=`translate(${dx+(scale-1)*scene.offsetLeft}px,${dy+(scale-1)*scene.offsetTop}px) scale(${scale}) ${baseTransform}`;
      return {scale,dx,dy};
    }
    function drawImage(image,box,turn=1) {
      ctx.save();ctx.translate(box.x+box.w/2,box.y+box.h/2);ctx.scale(turn,1);
      ctx.drawImage(image,-box.w/2,-box.h/2,box.w,box.h);ctx.restore();
    }
    function render(t) {
      ctx.clearRect(0,0,width,height);
      const rm=reduced();
      const approach=rm?0:smooth(t/1.6);
      const retreat=t>=RETURN?smooth((t-RETURN)/1.6):0;
      const gaze=t>=RETURN&&!rm?Math.sin(clamp((t-RETURN)/1.6)*Math.PI)*-height*.07:0;
      const cam=camera(approach*(1-retreat),gaze);
      const lift=smooth((t-1.6)/1.35);
      scene.style.filter=`blur(${(rm?0:3)*lift*(1-retreat)}px) brightness(${1-.22*lift*(1-retreat)})`;
      if(t<1.6) {fox.style.visibility=original.visibility; canvas.dataset.phase='approach';return;}
      fox.style.visibility='hidden';
      const start={x:ground.x*cam.scale+cam.dx,y:ground.y*cam.scale+cam.dy,w:ground.w*cam.scale,h:ground.h*cam.scale};
      const w=Math.min(width*1.03,(height*.79)*1.5,1050),h=w/1.5;
      const settled={x:(width-w)/2,y:(height-h)/2+height*.015,w,h};
      const box={x:mix(start.x,settled.x,lift),y:mix(start.y,settled.y,lift)-Math.sin(lift*Math.PI)*height*.045,w:mix(start.w,w,lift),h:mix(start.h,h,lift)};
      if(t<2.95) {
        canvas.dataset.phase='pickup';
        // A continuous lift and physical turn: change texture only edge-on,
        // never an abrupt visible pose replacement or opacity crossfade.
        const turn=Math.cos(lift*Math.PI);
        ctx.save();ctx.filter=`brightness(${mix(.72,1,lift)}) saturate(${mix(.85,1,lift)})`;
        drawImage(lift<.5?images[0]:images[1],box,rm?1:Math.max(.005,Math.abs(turn)));ctx.restore();
        return;
      }
      if(!tagSeen){tagSeen=true;record('fox_tag_presented','fox');}
      if(t<BREAK){canvas.dataset.phase='MARA';drawImage(images[1],settled);return;}
      if(!gone){gone=true;vanish();record('fox_disintegration_seen','fox');}
      canvas.dataset.phase=t<TAG?'disintegration':t<RETURN?'tag-fall':'return';
      const age=t-BREAK;
      if(age>.65&&t<TAG)canvas.dataset.phase='fragments';
      ctx.save();ctx.translate(settled.x,settled.y);ctx.scale(w/1536,h/1024);
      // Keep the actual painted tag pixels out of every body patch.
      for(const p of patches) {
        const a=Math.max(0,age-p.delay);
        if(age>2.7) continue;
        ctx.save();
        if(rm) ctx.globalAlpha=1-clamp(a/1.1);
        else {ctx.translate(p.cx+p.vx*a,p.cy+p.vy*a+760*a*a);ctx.rotate(p.spin*a);ctx.translate(-p.cx,-p.cy);ctx.globalAlpha=1-clamp((a-1.0)/.7);}
        path(ctx,p.vertices);ctx.clip();
        ctx.beginPath();ctx.rect(0,0,1536,1024);tagPolygon.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.clip('evenodd');
        ctx.drawImage(images[1],0,0);ctx.restore();
      }
      if(!rm) for(const p of fibers) {
        const a=age-p.delay;if(a<0||a>1.8)continue;
        ctx.save();ctx.translate(p.x+p.vx*Math.sin(a*.9),p.y+p.vy*a+620*a*a);ctx.rotate(p.spin*a);
        ctx.globalAlpha=Math.min(1,a*9)*(1-clamp((a-1.2)/.6));
        if(p.broken) {
          // Loose tufts sampled from the supplied deterioration artwork, not
          // a replacement full-body transition. Irregular local outlines only.
          path(ctx,[[-p.size*.4,-p.size*.25],[p.size*.1,-p.size*.5],[p.size*.5,0],[p.size*.15,p.size*.45],[-p.size*.45,p.size*.2]]);ctx.clip();
          ctx.drawImage(images[2],500,180,100,100,-p.size/2,-p.size/2,p.size,p.size);
        } else ctx.drawImage(images[p.image],-p.size/2,-p.size/2,p.size,p.size);
        ctx.restore();
      }
      // The surviving tag is the same pixels at the same point on the toy.
      const drop=Math.max(0,t-TAG);
      if(t<RETURN){
        ctx.save();
        if(rm)ctx.globalAlpha=1-clamp(drop/.85);
        else {ctx.translate(952+drop*38,660+drop*drop*(height/h)*2300);ctx.rotate(drop*2.9);ctx.translate(-952,-660);}
        path(ctx,tagPolygon);ctx.clip();ctx.drawImage(images[1],0,0);ctx.restore();
      }
      ctx.restore();
    }
    function tick(now) {
      if(cancelled||document.hidden)return;
      if(previous!==null)elapsed+=(now-previous)/1000;previous=now;
      render(elapsed);
      if(elapsed>=END){complete=true;dialog.close();return;}
      frame=requestAnimationFrame(tick);
    }
    function visibility(){previous=null;cancelAnimationFrame(frame);if(!document.hidden&&loaded&&!cancelled)frame=requestAnimationFrame(tick);}
    document.addEventListener('visibilitychange',visibility);addEventListener('resize',resize);
    record('fox_opened','fox');
    ready.then(()=>{if(cancelled)return;loaded=true;frame=requestAnimationFrame(tick);}).catch(error=>{
      if(!cancelled){console.error('Fox artwork could not be decoded.',error);dialog.close();}
    });
    return () => {
      cancelled=true;cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange',visibility);removeEventListener('resize',resize);
      scene.style.transform=original.transform;scene.style.transformOrigin=original.origin;scene.style.filter=original.filter;
      fox.style.visibility=original.visibility;dialog.classList.remove('fox-cinema');canvas.remove();
      if(gone)record('fox_returned_after_disintegration','fox',{completed:complete});
    };
  };
})();
