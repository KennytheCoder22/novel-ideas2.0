const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process'),assert=require('assert/strict');
const out=process.env.DREAMSCAPES_EVIDENCE_DIR || path.join(__dirname,'sign-flick-evidence');fs.mkdirSync(out,{recursive:true});
const baseline=execFileSync('git',['-c','safe.directory=*','-C',path.resolve(__dirname,'../../../..'),'show','d526b2174b8253830d9e5e02a9e71f493b2455d7:apps/dreamscapes/public/experiments/carnival/midway-arm.js'],{encoding:'utf8'});
const base=process.env.DREAMSCAPES_URL || 'http://127.0.0.1:4204';
const url=base+'/experiments/carnival/index.html?arm=review&motion=still';
async function ready(p){await p.waitForFunction(()=>window.MidwayArmReview?.state().ready,{},{timeout:90000});await p.waitForFunction(()=>document.querySelector('.composition .carnival-exit img')?.naturalWidth===1122);}
async function seek(p,t){await p.evaluate(t=>MidwayArmReview.seek(t),t);}
(async()=>{
 const b=await chromium.launch({executablePath:process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const report={delayRangeMs:[8000,12000],searchingUnchanged:false,layouts:[],contactMaxError:0,maxJointStep:0,maxLengthDelta:0};
 try {
  const times=[2.6,3.2,4.6,5.7,6.4,7.0,7.199];
  const c=await b.newContext({viewport:{width:1536,height:1024}}),p=await c.newPage();
  await p.route('**/midway-arm.js',r=>r.fulfill({contentType:'text/javascript',body:baseline}));
  await p.goto(url);await ready(p);const before=[];
  for(const t of times){await seek(p,t);before.push(await p.evaluate(()=>MidwayArmReview.rig().joints));}
  await p.unroute('**/midway-arm.js');await p.reload();await ready(p);
  for(let i=0;i<times.length;i++){await seek(p,times[i]);assert.deepEqual(await p.evaluate(()=>MidwayArmReview.rig().joints),before[i],'Approved opening changed at '+times[i]);}
  report.searchingUnchanged=true;
  let prev,baseLengths;
  for(let frame=0;frame<=600;frame++){
   const t=7.19+frame*(17.1-7.19)/600;await seek(p,t);
   const r=await p.evaluate(()=>MidwayArmReview.rig());
   assert.deepEqual(r.scale,[84,84,84]);assert.equal(r.bones.length,22);
   for(const v of Object.values(r.joints))assert(v.every(Number.isFinite));
   report.contactMaxError=Math.max(report.contactMaxError,r.contactError);
   if(prev)for(const n of r.bones)report.maxJointStep=Math.max(report.maxJointStep,Math.hypot(...r.joints[n].map((x,i)=>x-prev.joints[n][i])));
   const dist=(a,b)=>Math.hypot(...r.joints[a].map((x,i)=>x-r.joints[b][i]));
   const lengths=[dist('Bone_004','Bone_003'),dist('Bone_003','Bone_002')];
   if(!baseLengths)baseLengths=lengths;
   lengths.forEach((x,i)=>report.maxLengthDelta=Math.max(report.maxLengthDelta,Math.abs(x-baseLengths[i])));
   const matrix=await p.locator('.composition .carnival-exit').evaluate(e=>{const m=new DOMMatrix(getComputedStyle(e).transform);return [m.a,m.b,m.c,m.d]});
   assert(Math.abs(Math.hypot(matrix[0],matrix[1])-1)<.000002);
   assert(Math.abs(Math.hypot(matrix[2],matrix[3])-1)<.000002);
   assert(Math.abs(matrix[0]*matrix[3]-matrix[1]*matrix[2]-1)<.000002);
   prev=r;
  }
  assert(report.maxJointStep<5);assert(report.contactMaxError<.001);assert(report.maxLengthDelta<.0001);
  await seek(p,13.15);const a=await p.evaluate(()=>MidwayArmReview.rig());
  await seek(p,13.26);const d=await p.evaluate(()=>MidwayArmReview.rig());
  assert(d.indexTip[0]-a.indexTip[0]>4);assert.equal(d.signAngle,0);
  await seek(p,13.4);assert((await p.evaluate(()=>MidwayArmReview.rig().signAngle))>0);
  for(const t of [10.11,11.5,12.2,13.26]){
   await seek(p,t);const r=await p.evaluate(()=>MidwayArmReview.rig());
   const shoulder=r.joints.Bone_005,upper=r.joints.Bone_004;
   assert(shoulder[0]>241&&shoulder[0]<353,'Shoulder must stay inside opening width');
   assert(1024-shoulder[1]>623&&shoulder[2]<35,'Shoulder must remain concealed behind near lip');
   assert(1024-upper[1]<623,'Upper arm must rise above opening before reaching');
   assert(r.wrist[2]>35,'Reaching forearm must be in front of the wood');
  }
  report.barrelOpeningOrigin=true;
  for(const t of [0,.3,.6,.9,1.2,1.39]){
   await seek(p,t);
   const visible=await p.evaluate(()=>{
    MidwayArmReview.render();const c=document.querySelector('.midway-creature canvas'),gl=c.getContext('webgl2');
    const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,px=new Uint8Array(w*h*4);
    gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);let count=0;
    for(let y=0;y<Math.floor(h*235/410);y++)for(let x=0;x<w;x++)if(px[(y*w+x)*4+3])count++;
    return count;
   });
   assert.equal(visible,0,'Hand visible through barrel front at '+t);
  }
  report.emergencePixelsBehindLip=true;
  await c.close();
  for(const band of ['kids','pre-teens','teens','adults'])for(const mobile of [false,true]){
   const name=band+'-'+(mobile?'mobile':'desktop'),errors=[];
   const cx=await b.newContext({viewport:mobile?{width:390,height:844}:{width:1536,height:1024},hasTouch:mobile});
   await cx.addInitScript(band=>{localStorage.setItem('dreamscapes.age-band',band);window.armDelays=[];const old=setTimeout;window.setTimeout=function(fn,ms,...args){if(ms>=8000&&ms<=12000)armDelays.push(ms);return old(fn,ms,...args)}},band);
   const pg=await cx.newPage();pg.on('pageerror',e=>errors.push(e.message));
   await pg.goto(url);await ready(pg);assert((await pg.evaluate(()=>armDelays)).some(ms=>ms>=8000&&ms<=12000));
   for(const t of [7.8,10.25,11.5,13.26,13.65,14.1,15.4,16.4,17.1]){
    await seek(pg,t);assert.deepEqual(await pg.evaluate(()=>MidwayArmReview.rig().scale),[84,84,84]);
    if(band==='adults')await pg.screenshot({path:out+'/'+name+'-'+t+'.png'});
   }
   let activations=0;
   for(const [phase,t] of [['upright',0],['exploring',11.5],['falling',13.65],['fallen',17.1]])for(const method of ['pointer','keyboard']){
    await pg.goto(url);await ready(pg);await seek(pg,t);
    const link=pg.locator('.composition .carnival-exit');
    if(method==='keyboard'){await link.focus();await pg.keyboard.press('Enter');}
    else {
     const xy=await link.evaluate(e=>{const r=e.getBoundingClientRect();for(let y=Math.max(r.top,0);y<Math.min(r.bottom,innerHeight);y+=3)for(let x=Math.max(r.left,0);x<Math.min(r.right,innerWidth);x+=3){const h=document.elementFromPoint(x,y);if(h===e||e.contains(h))return{x,y}}});
     assert(xy,name+' '+phase+' has no live hit region');if(mobile)await pg.touchscreen.tap(xy.x,xy.y);else await pg.mouse.click(xy.x,xy.y);
    }
    await pg.waitForURL(base+'/');activations++;
   }
   await pg.goto(url);await ready(pg);
   if(!(band==='adults'&&!mobile))await pg.evaluate(()=>{MidwayArmReview.reset();MidwayArmReview.begin();});
   if(band==='adults'&&!mobile){
    await pg.waitForFunction(()=>MidwayArmReview.state().done,{},{timeout:30000});
    assert.equal(await pg.locator('.midway-creature').getAttribute('data-phase'),'fallen');
    const delays=await pg.evaluate(()=>armDelays.length);
    await pg.evaluate(()=>document.querySelector('main').style.opacity='1');
    await pg.waitForTimeout(80);assert.equal(await pg.evaluate(()=>armDelays.length),delays);
   }
   const knockedOver=await pg.evaluate(()=>MidwayArmReview.rig().signAngle>0);
   await pg.evaluate(()=>CarnivalNavigation.go('Tent Row'));
   assert.equal(await pg.evaluate(()=>MidwayArmReview.state().active),false);
   assert.equal(await pg.locator('.midway-creature').evaluate(e=>e.style.visibility),'hidden');
   await pg.locator('[data-scene="tent-row"] .location-path[data-to="midway"]').dispatchEvent('click');
   await pg.waitForFunction(()=>document.documentElement.dataset.location==='midway'&&!document.documentElement.dataset.travelling);
   assert.equal(await pg.evaluate(()=>MidwayArmReview.state().done),knockedOver);
   const returnedSign=await pg.locator('.composition .carnival-exit').evaluate(e=>e.style.transform);
   if(knockedOver)assert.match(returnedSign,/^rotate\(98\./);else assert.equal(returnedSign,'');
   assert.equal(await pg.locator('.midway-creature canvas').count(),1);
   await pg.emulateMedia({reducedMotion:'reduce'});await pg.evaluate(()=>MidwayArmReview.begin());
   assert.equal(await pg.evaluate(()=>MidwayArmReview.state().active),false);
   assert.equal(await pg.locator('.midway-creature').evaluate(e=>e.style.visibility),'hidden');
   assert.deepEqual(errors,[]);
   report.layouts.push({band,layout:mobile?'mobile':'desktop',exitActivations:activations,cancel:true,revisit:true,reducedMotion:true,errors});
   fs.writeFileSync(out+'/revision-results.json',JSON.stringify(report,null,2));console.log('PASS '+name);
   await cx.close();
  }
  const fail=await b.newContext(),fp=await fail.newPage();await fp.route('**/midway-arm/right-arm-rigged.glb',r=>r.abort());
  await fp.goto(url);await fp.waitForFunction(()=>MidwayArmReview?.state().loadFailed);
  await fp.locator('.composition .carnival-exit').click();await fp.waitForURL(base+'/');
  report.failedLoadExit=true;await fail.close();
  fs.writeFileSync(out+'/revision-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
