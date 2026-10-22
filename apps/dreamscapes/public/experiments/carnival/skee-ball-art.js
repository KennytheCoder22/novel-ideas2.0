/* Approved artwork with a dimensional launch/return insert and nine-ball lifecycle. */
(() => {
 'use strict';
 const W=1672,H=941,NS='http://www.w3.org/2000/svg';
 let machineGeometry=null;
 const PIVOTS={angle:{x:557,y:774},launch:{x:904,y:827}};
 const cups=[
  {x:709,y:269,rx:27,ry:13,points:100}, {x:964,y:269,rx:27,ry:13,points:100},
  {x:836,y:280,rx:29,ry:14,points:50}, {x:835,y:317,rx:35,ry:15,points:40},
  {x:835,y:357,rx:38,ry:13,points:30}, {x:835,y:397,rx:43,ry:9,points:20},
  {x:835,y:378,rx:135,ry:66,points:10}
 ];
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const mix=(a,b,t)=>a+(b-a)*t;
 function node(tag,attrs,parent){const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);parent?.append(e);return e;}
 function scoreAt(t){return cups.find(c=>((t.x-c.x)/c.rx)**2+((t.y-c.y)/c.ry)**2<=1)?.points||0;}
 function endpoint(angle,pull){
  const power=pull*pull,side=Math.tan(angle*Math.PI/180);
  if(power<.1)return {x:835+side*65,y:mix(665,rampPoint(0).y+15,power/.1),short:true,power};
  return {x:835+side*(80+power*270),y:464-power*206,short:false,power};
 }
 function rampPoint(t){const samples=machineGeometry?.rampSamples;if(!samples)return{x:835,y:542-23*t};const q=clamp(t,0,1)*(samples.length-1),a=samples[Math.floor(q)].image,b=samples[Math.min(samples.length-1,Math.floor(q)+1)].image;return{x:835,y:mix(a.y,b.y,q%1)};}
 function ballPose(shot,u){
  const lateral=shot.x-835;
  if(shot.short){const t=1-(1-u)**1.7;return{x:mix(835,shot.x,t),y:mix(684,shot.y,t),groundY:mix(684,shot.y,t),r:mix(14,11,t),phase:'runway'};}
  if(u<.49){const t=u/.49;const y=mix(690,rampPoint(0).y,1-(1-t)**1.2);return{x:835+lateral*.14*t,y:y-mix(6,8,t),groundY:y,r:mix(14,11,t),phase:'runway'};}
  if(u<.65){
   const t=(u-.49)/.16,p=rampPoint(t);return{x:835+lateral*mix(.14,.22,t),y:p.y-8,groundY:p.y,r:mix(11,10,t),phase:'ramp'};
  }
  const t=clamp((u-.65)/.25,0,1),crest=rampPoint(1).y,groundY=mix(crest,shot.y,t),lift=Math.sin(Math.PI*t)*(60+shot.power*42)+8*(1-t);
  if(u>=.9){const p=clamp((u-.9)/.1,0,1),points=scoreAt(shot);if(points>0)return{x:shot.x,y:shot.y+p*12,groundY:shot.y,r:8*(1-p),opacity:1-p,phase:'landing'};
   const wellY=machineGeometry?.projected.wellFloor.y||558,y=mix(shot.y,wellY,p);return{x:mix(shot.x,835,p),y,groundY:wellY,r:8,opacity:y>crest-7?0:1,phase:'collection'};}
  return{x:835+lateral*mix(.22,1,t),y:groundY-lift,groundY,r:mix(10,8,t)+Math.sin(Math.PI*t)*1.8,phase:'airborne'};
 }
 window.CarnivalSkeeBall=Object.freeze({mount(view,plane,ui,status){
  view.classList.add('skee-art-scene');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const game=document.createElement('section');game.className='skee-art-game';game.setAttribute('aria-label','Skee Ball game');plane.append(game);
  const accessible=document.createElement('div');accessible.className='sr-only';game.append(accessible);
  const score=document.createElement('output'),remaining=document.createElement('output');score.setAttribute('aria-label','Score');remaining.setAttribute('aria-label','Balls remaining');accessible.append(score,remaining);
  const instructions=document.createElement('p');instructions.id='skee-brass-help';instructions.textContent='Angle paddle: drag sideways or use arrow keys. Launch paddle: pull toward you and release. Keyboard: hold Space or Enter to draw back, then release to roll. Arrow keys adjust the pull; Enter releases it. Escape cancels.';accessible.append(instructions);
  const svg=node('svg',{class:'skee-art-overlay',viewBox:`0 0 ${W} ${H}`,'aria-hidden':'true'},game);
  const defs=node('defs',{},svg);
  const shelfClip=node('clipPath',{id:'skee-clown-shelf-clip'},defs);node('rect',{x:325,y:264,width:110,height:151},shelfClip);
  const shelfPatch=node('image',{href:'./skee-ball/empty-clown-shelf.png',x:0,y:0,width:W,height:H,'clip-path':'url(#skee-clown-shelf-clip)',visibility:'hidden'},svg);
  // Restrict the user-requested cup correction to this small source-image area.
  const cupClip=node('clipPath',{id:'skee-cup-correction'},defs);
  node('rect',{x:780,y:331,width:115,height:108},cupClip);
  node('image',{href:'./skee-ball/separated-cups.png',x:0,y:0,width:W,height:H,'clip-path':'url(#skee-cup-correction)'},svg);
  const backing=node('pattern',{id:'skee-score-texture',patternUnits:'userSpaceOnUse',width:8,height:8},defs);
  node('image',{href:'./skee-ball/approved-alley.png',x:-780,y:-133,width:W,height:H},backing);
  const ballLight=node('radialGradient',{id:'skee-ball-light',cx:'.28',cy:'.23',r:'.75'},defs);
  for(const [offset,color] of [['0','#f4d0a0'],['.45','#bb8950'],['1','#60401f']])node('stop',{offset,'stop-color':color},ballLight);
  const scoreCover=node('rect',{x:670,y:125,width:24,height:29,fill:'url(#skee-score-texture)'},svg);
  node('rect',{x:936,y:125,width:19,height:29,fill:'url(#skee-score-texture)'},svg);
  const scoreText=node('text',{x:674,y:149,fill:'#fff2a0','font-size':26,'font-family':'Georgia,serif'},svg);
  const ballsText=node('text',{x:947,y:149,'text-anchor':'middle',fill:'#fff2a0','font-size':26,'font-family':'Georgia,serif'},svg);
  const regions=node('g',{'data-target-regions':'approved-artwork'},svg);
  cups.forEach(c=>node('ellipse',{cx:c.x,cy:c.y,rx:c.rx,ry:c.ry,fill:'transparent','data-points':c.points},regions));
  const ballSvg=node('svg',{class:'skee-ball-motion',viewBox:`0 0 ${W} ${H}`,'aria-hidden':'true'},game);
  const ballDefs=node('defs',{},ballSvg);ballDefs.append(ballLight);
  const shadow=node('ellipse',{cx:835,cy:690,rx:16,ry:4,fill:'#160e06',opacity:'.38'},ballSvg);
  const ball=node('circle',{cx:835,cy:684,r:14,fill:'url(#skee-ball-light)',stroke:'#a97b45','stroke-width':'.8'},ballSvg);
  const canvas=document.createElement('canvas');canvas.className='skee-brass-canvas';canvas.setAttribute('aria-hidden','true');game.append(canvas);
  function control(name,className,min,max){const e=document.createElement('div');e.className=className;e.tabIndex=0;e.setAttribute('role','slider');e.setAttribute('aria-label',name);e.setAttribute('aria-valuemin',min);e.setAttribute('aria-valuemax',max);e.setAttribute('aria-describedby',instructions.id);e.title=name+' — drag, or use the keyboard';game.append(e);return e;}
  const aim=control('Angle','skee-brass-angle',-35,35),launcher=control('Pull and release','skee-brass-launch',0,100);
  const replay=document.createElement('button');replay.className='carnival-play-button skee-art-replay';replay.textContent='Play again';replay.hidden=true;ui.append(replay);
  let roundId=1,roundPhase='ready',ballAvailable=true,ballPresent=true,ballsPrepared=1,shotsLaunched=0,clownStarts=0;
  let balls=9,total=0,pending=null,frame=0,disposed=false,angle=0,pull=0,drag=null,chargeFrame=0,keyStart=null,spring=null;
  let renderBrass=()=>{},disposeBrass=()=>{},clown=null;
  import('./skee-ball-clown.js').then(({mountClown})=>{if(disposed)return;return mountClown({game,plane,ui,onMachineReady:g=>{machineGeometry=g;game.dataset.machineReady='true';},onComplete:completeRound,isActive:()=>!view.inert&&!document.hidden,reduced,onReady:()=>{if(!disposed){shelfPatch.setAttribute('visibility','visible');game.dataset.clownReady='true';}}});}).then(controller=>{if(!controller)return;if(disposed){controller.dispose();return;}clown=controller;if(roundPhase==='clown')startClown();}).catch(error=>{if(!disposed){game.dataset.clownReady='failed';if(roundPhase==='clown')completeRound();console.error('Skee Ball shelf clown unavailable',error);}});
  const canPlay=()=>!disposed&&roundPhase==='ready'&&ballAvailable&&!pending&&balls>0&&!view.inert&&!document.hidden;
  function update(){
   score.textContent='Score '+total;remaining.textContent=balls+' ball'+(balls===1?'':'s')+' left';scoreText.textContent=String(total);ballsText.textContent=String(balls);scoreCover.setAttribute('width',Math.max(24,String(total).length*17+10));
   const disabled=!canPlay();for(const e of [aim,launcher]){e.setAttribute('aria-disabled',String(disabled));e.tabIndex=disabled?-1:0;}
   aim.setAttribute('aria-valuenow',String(Math.round(angle)));aim.setAttribute('aria-valuetext',angle===0?'Straight ahead':Math.abs(Math.round(angle))+' degrees '+(angle<0?'left':'right'));
   launcher.setAttribute('aria-valuenow',String(Math.round(pull*100)));launcher.setAttribute('aria-valuetext',Math.round(pull*100)+' percent pull');replay.hidden=roundPhase!=='complete';
   game.dataset.balls=balls;game.dataset.score=total;game.dataset.phase=pending?'rolling':roundPhase;game.dataset.roundPhase=roundPhase;game.dataset.ballPresent=String(ballPresent);
  }
  function paintBall(p){ball.setAttribute('opacity',p.opacity??1);ball.setAttribute('cx',p.x);ball.setAttribute('cy',p.y);ball.setAttribute('r',p.r);shadow.setAttribute('cx',p.x+3);shadow.setAttribute('cy',p.groundY+7);shadow.setAttribute('rx',p.r*1.2);shadow.setAttribute('ry',Math.max(2,p.r*.25));shadow.setAttribute('opacity',(p.opacity??1)*(p.phase==='airborne'?.17:.38));game.dataset.ballPhase=p.phase;}
  function setAngle(value){if(balls===0||roundPhase!=='ready')return;angle=clamp(value,-35,35);update();renderBrass(angle,pull);}
  function setPull(value){if(balls===0||roundPhase!=='ready')return;spring=null;pull=clamp(value,0,1);update();renderBrass(angle,pull);}
  function releaseCapture(){const old=drag;drag=null;if(old?.element.hasPointerCapture(old.id))old.element.releasePointerCapture(old.id);}
  function cancelPull(animate=false){const from=pull;cancelAnimationFrame(chargeFrame);chargeFrame=0;keyStart=null;releaseCapture();pull=0;spring=animate&&!reduced.matches?{from,start:performance.now()}:null;update();renderBrass(angle,spring?from:0);if(spring&&!frame)frame=requestAnimationFrame(tick);}
  function ballVisibility(value){ballPresent=value;ball.setAttribute('opacity',value?1:0);shadow.setAttribute('opacity',value ? .38 : 0);game.dataset.ballPresent=String(value);}
  function prepareBall(){if(disposed||balls<=0||roundPhase!=='ready')return false;ballAvailable=true;ballsPrepared++;paintBall({x:835,y:684,groundY:690,r:14,phase:'rest'});ballVisibility(true);return true;}
  function completeRound(){if(disposed||roundPhase!=='clown'||balls!==0)return;roundPhase='complete';update();status.textContent='Final score — '+total+' points. Play again or return to the carnival.';}
  function startClown(){if(clownStarts||disposed||roundPhase!=='clown')return;if(clown){clownStarts++;clown.complete();}else if(game.dataset.clownReady==='failed')completeRound();}
  function finish(){if(!pending)return;const shot=pending;pending=null;if(shot.roundId!==roundId||roundPhase!=='rolling')return;
   balls=Math.max(0,balls-1);const points=shot.short?0:scoreAt(shot);total+=points;ballAvailable=false;
   if(balls>0){roundPhase='ready';prepareBall();status.textContent=points+' points. '+balls+' balls remaining.';}
   else{roundPhase='clown';ballVisibility(false);game.dataset.ballPhase='none';cancelPull();status.textContent='Round complete — '+total+' points.';startClown();}update();}
  function tick(now){
   frame=0;if(disposed)return;
   if(view.inert||document.hidden){spring=null;cancelPull();finish();renderBrass(angle,0);return;}
   if(spring){const t=(now-spring.start)/1000;const p=clamp(spring.from*Math.exp(-t*13)*(Math.cos(t*26)+.25*Math.sin(t*26)),-.055,1);renderBrass(angle,p);if(t>.42){spring=null;renderBrass(angle,0);}}
   if(pending){const u=clamp((now-pending.start)/1700,0,1);paintBall(ballPose(pending,u));if(u>=1||reduced.matches)finish();}
   if(pending||spring)frame=requestAnimationFrame(tick);
  }
  function shoot(){
   if(!canPlay()||pull<.025){cancelPull(true);return;}
   const shot=endpoint(angle,pull);ballAvailable=false;roundPhase='rolling';shotsLaunched++;const from=pull,shotAngle=angle;cancelPull(false);angle=0;pending={...shot,roundId,angle:shotAngle,start:performance.now()};spring=reduced.matches?null:{from,start:performance.now()};update();renderBrass(angle,spring?from:0);status.textContent='The ball rolls up the alley…';
   if(reduced.matches){finish();renderBrass(angle,0);}else if(!frame)frame=requestAnimationFrame(tick);
  }
  function point(event){const r=plane.getBoundingClientRect();return{x:(event.clientX-r.left)*W/r.width,y:(event.clientY-r.top)*H/r.height};}
  function startDrag(event,kind,element){
   if(event.button!==0||!canPlay()||drag||keyStart!==null)return;event.preventDefault();element.focus({preventScroll:true});const p=point(event);
   drag={id:event.pointerId,element,kind,start:p,angle,pull};element.setPointerCapture(event.pointerId);spring=null;
  }
  aim.addEventListener('pointerdown',e=>startDrag(e,'angle',aim));launcher.addEventListener('pointerdown',e=>startDrag(e,'launch',launcher));
  function move(event){if(drag?.id!==event.pointerId)return;const p=point(event);
   if(drag.kind==='angle'){
    const origin=PIVOTS.angle,a=drag.start;const d0=Math.atan2(a.x-origin.x,(a.y-origin.y)/.72),d1=Math.atan2(p.x-origin.x,(p.y-origin.y)/.72);
    let delta=d1-d0;while(delta>Math.PI)delta-=2*Math.PI;while(delta< -Math.PI)delta+=2*Math.PI;
    setAngle(drag.angle+(Math.hypot(a.x-origin.x,a.y-origin.y)>22?delta*180/Math.PI:(p.x-a.x)/2.2));
   }else{
    // Increasing spring stiffness: early travel is light; the final travel resists.
    const initial=(drag.pull*drag.pull+2*drag.pull)/3;
    const travel=clamp(initial+(p.y-drag.start.y)/72,0,1);
    setPull(Math.sqrt(1+3*travel)-1);
   }
  }
  for(const e of [aim,launcher]){
   e.addEventListener('pointermove',move);e.addEventListener('pointerup',event=>{if(drag?.id!==event.pointerId)return;move(event);const launching=drag.kind==='launch';releaseCapture();if(launching)shoot();});
   e.addEventListener('pointercancel',()=>cancelPull(true));e.addEventListener('lostpointercapture',()=>{if(drag)cancelPull(true);});
  }
  aim.addEventListener('keydown',event=>{if(!canPlay())return;const steps={ArrowLeft:-1,ArrowRight:1,ArrowDown:-1,ArrowUp:1};if(event.key in steps){event.preventDefault();setAngle(angle+steps[event.key]*(event.shiftKey?5:1));}else if(event.key==='Home'||event.key==='End'){event.preventDefault();setAngle(event.key==='Home'?-35:35);}else if(event.key==='Escape')setAngle(0);});
  function charge(now){if(keyStart===null||!canPlay())return;setPull((now-keyStart)/1200);chargeFrame=requestAnimationFrame(charge);}
  launcher.addEventListener('keydown',event=>{
   if(!canPlay())return;
   if(event.key==='Escape'){event.preventDefault();cancelPull(true);return;}
   if(['ArrowUp','ArrowRight','ArrowDown','ArrowLeft','Home','End'].includes(event.key)){event.preventDefault();setPull(event.key==='Home'?0:event.key==='End'?1:pull+(['ArrowUp','ArrowRight'].includes(event.key)? .05:-.05));return;}
   if(![' ','Enter'].includes(event.key))return;event.preventDefault();if(event.repeat||keyStart!==null||drag)return;
   if(event.key==='Enter'&&pull>0){shoot();return;}keyStart=performance.now();chargeFrame=requestAnimationFrame(charge);
  });
  launcher.addEventListener('keyup',event=>{if(![' ','Enter'].includes(event.key))return;event.preventDefault();if(keyStart!==null){setPull((performance.now()-keyStart)/1200);shoot();}});
  launcher.addEventListener('blur',()=>{if(keyStart!==null||drag?.element===launcher)cancelPull(true);});
  replay.addEventListener('click',()=>{if(roundPhase!=='complete')return;roundId++;clown?.reset();balls=9;total=0;angle=0;roundPhase='ready';ballAvailable=false;ballsPrepared=0;shotsLaunched=0;clownStarts=0;cancelPull();prepareBall();update();status.textContent='A fresh tray of nine balls.';launcher.focus();});
  const observer=new MutationObserver(()=>{if(view.inert){cancelPull();angle=0;finish();renderBrass(angle,0);}clown?.sync();update();});observer.observe(view,{attributes:true,attributeFilter:['inert']});
  const onHide=()=>{if(document.hidden){cancelPull();finish();}clown?.sync();update();};document.addEventListener('visibilitychange',onHide);
  const onReduced=()=>{clown?.sync();if(reduced.matches){spring=null;finish();renderBrass(angle,pull);}};reduced.addEventListener('change',onReduced);
  const resize=new ResizeObserver(()=>renderBrass(angle,pull));resize.observe(plane);
  update();
  // One shared dimensional paddle design, instantiated twice on the panel plane.
  import('./vendor/three.module.js').then(async THREE=>{
   const texture=await new THREE.TextureLoader().loadAsync('./skee-ball/brass-reference.png');
   if(disposed){texture.dispose();return;}
   texture.colorSpace=THREE.SRGBColorSpace;texture.offset.set(1280/1671,1-414/941);texture.repeat.set(180/1671,34/941);
   const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
   const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(0,W,H,0,.1,3000);camera.position.set(0,0,1200);
   scene.add(new THREE.HemisphereLight(0xffedcf,0x46301b,2.5));
   const key=new THREE.DirectionalLight(0xffd89c,3.4);key.position.set(300,1000,700);key.target.position.set(800,120,0);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-1100,right:1100,top:900,bottom:-900,near:.1,far:2500});key.shadow.bias=-.0004;scene.add(key,key.target);
   const rim=new THREE.DirectionalLight(0xbfcad5,.8);rim.position.set(1600,800,400);scene.add(rim);
   const receiver=new THREE.Mesh(new THREE.PlaneGeometry(W,H),new THREE.ShadowMaterial({opacity:.32}));receiver.position.set(W/2,H/2,-.5);receiver.receiveShadow=true;scene.add(receiver);
   const envData=new Float32Array(128*64*4);
   for(let y=0;y<64;y++)for(let x=0;x<128;x++){const i=(y*128+x)*4;const strip=y>10&&y<23&&x>15&&x<90?2.8:.38;envData[i]=strip;envData[i+1]=strip*.82;envData[i+2]=strip*.57;envData[i+3]=1;}
   const envTexture=new THREE.DataTexture(envData,128,64,THREE.RGBAFormat,THREE.FloatType);envTexture.mapping=THREE.EquirectangularReflectionMapping;envTexture.needsUpdate=true;
   const pmrem=new THREE.PMREMGenerator(renderer),envTarget=pmrem.fromEquirectangular(envTexture);scene.environment=envTarget.texture;pmrem.dispose();envTexture.dispose();
   const brass=new THREE.MeshStandardMaterial({map:texture,color:0xe8c48b,metalness:.63,roughness:.43});
   const dark=new THREE.MeshStandardMaterial({color:0x21160d,roughness:.75,metalness:.4});
   const shape=new THREE.Shape();shape.moveTo(9,5);shape.lineTo(124,5);shape.quadraticCurveTo(137.5,5,137.5,13);shape.quadraticCurveTo(137.5,23.75,128,23.75);shape.bezierCurveTo(117,23.75,108,11.25,85,11.25);shape.lineTo(9,11.25);shape.closePath();
   const armGeometry=new THREE.ExtrudeGeometry(shape,{depth:5.35,bevelEnabled:true,bevelThickness:.45,bevelSize:.45,bevelSegments:3,curveSegments:24});armGeometry.rotateX(Math.PI/2);armGeometry.translate(0,2.675,0);
   const pos=armGeometry.attributes.position,norm=armGeometry.attributes.normal,uv=armGeometry.attributes.uv;
   for(let i=0;i<pos.count;i++)uv.setXY(i,clamp(pos.getX(i)/140,0,1),Math.abs(norm.getZ(i))>.5?clamp((pos.getY(i)+4)/8,0,1):clamp(pos.getZ(i)/28,0,1));uv.needsUpdate=true;
   function paddle(pivot){
    const panel=new THREE.Group();panel.position.set(pivot.x,H-pivot.y,0);panel.rotation.x=-Math.acos(.72);scene.add(panel);
    const moving=new THREE.Group();panel.add(moving);
    const base=new THREE.Mesh(new THREE.CylinderGeometry(12.5,12.5,25,48),brass);base.rotation.x=Math.PI/2;base.position.z=12.5;panel.add(base);
    const hole=new THREE.Mesh(new THREE.CylinderGeometry(3.4,3.4,1,32),dark);hole.rotation.x=Math.PI/2;hole.position.z=25.15;panel.add(hole);
    const edge=new THREE.Mesh(new THREE.TorusGeometry(3.8,.65,8,32),brass);edge.position.z=25.5;panel.add(edge);
    const arm=new THREE.Mesh(armGeometry,brass);moving.add(arm);
    panel.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return {panel,moving};
   }
   const left=paddle(PIVOTS.angle),right=paddle(PIVOTS.launch);
   renderBrass=(a,p)=>{if(disposed)return;const r=plane.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);if(renderer.getPixelRatio()!==dpr)renderer.setPixelRatio(dpr);const width=Math.max(1,Math.round(r.width)),height=Math.max(1,Math.round(r.height));if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr))renderer.setSize(width,height,false);left.moving.rotation.z=(-90+a)*Math.PI/180;right.moving.rotation.z=-48*p*Math.PI/180;renderer.render(scene,camera);};
   disposeBrass=()=>{scene.traverse(o=>{o.geometry?.dispose();});brass.dispose();dark.dispose();receiver.material.dispose();texture.dispose();envTarget.dispose();renderer.dispose();renderer.forceContextLoss();};
   game.dataset.brassReady='true';renderBrass(angle,pull);
   if(review)review.geometry=()=>({leftBase:left.panel.position.toArray(),rightBase:right.panel.position.toArray(),leftRotation:left.moving.rotation.z,rightRotation:right.moving.rotation.z,sharedGeometry:left.moving.children[0].geometry===right.moving.children[0].geometry,sharedMaterial:left.moving.children[0].material===right.moving.children[0].material,armBounds:(armGeometry.computeBoundingBox(),{min:armGeometry.boundingBox.min.toArray(),max:armGeometry.boundingBox.max.toArray()}),scale:plane.getBoundingClientRect().width/W});
  }).catch(error=>{if(!disposed){game.dataset.brassReady='failed';status.textContent='The brass artwork could not load. Keyboard controls remain available.';console.error('Skee Ball brass controls unavailable',error);}});
  const review=['127.0.0.1','localhost'].includes(location.hostname)&&(new URLSearchParams(location.search).has('skee-review')||new URLSearchParams(location.search).has('clown-review'))?{state:()=>({roundId,roundPhase,ballAvailable,ballPresent,ballsPrepared,shotsLaunched,clownStarts,balls,total,angle,pull,pending:pending&&{...pending},spring:!!spring,phase:game.dataset.ballPhase}),setAngle,setPull,shoot,endpoint,ballPose,cups,pivots:PIVOTS,scoreAt,machine:()=>machineGeometry,clown:()=>clown?.state(),inspectClown:()=>clown?.inspect(),seekClown:t=>clown?.seek(t)}:null;
  if(review)window.SkeeBallArtReview=review;
  return ()=>{disposed=true;cancelPull();cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();document.removeEventListener('visibilitychange',onHide);reduced.removeEventListener('change',onReduced);disposeBrass();clown?.dispose();game.remove();replay.remove();view.classList.remove('skee-art-scene');if(review)delete window.SkeeBallArtReview;};
 }});
})();
