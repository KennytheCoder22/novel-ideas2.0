const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const app=path.resolve(__dirname,'..');
const baseline=process.argv.includes('--approved-baseline')?require('node:child_process').execFileSync('git',['show','5b9e7439:apps/dreamscapes/public/experiments/carnival/carousel-onboard.js'],{cwd:app,encoding:'utf8'}):null;
// Approved-before captures retain their original mechanism and validation clocks.
const historicalClock=baseline?['experiments/carnival/carousel.js','carousel-choice-catalog.js'].map(file=>({name:path.basename(file),source:require('node:child_process').execFileSync('git',['show','5b9e7439:apps/dreamscapes/public/'+file],{cwd:app,encoding:'utf8'})})):[];
const smoke=process.argv.includes('--smoke'),only=process.argv.find(a=>a.startsWith('--case='))?.slice(7),results=[];
const out=path.resolve(process.env.DREAMSCAPES_ONBOARD_EVIDENCE_DIR||path.join(app,'playtest-artifacts/first-person',smoke?'smoke':only?'isolated-'+only:'verified'));
const outsideAlpha=p=>p.evaluate(()=>[window.carouselHorseComparison,...window.carouselAnimalComparisons].map(m=>({id:m.name||'horse',alpha:m.renderer.domElement.getContext('2d').getImageData(0,0,1,1).data[3]})));
const renderRate=s=>s.length<2?null:1000*(s.at(-1).frames-s[0].frames)/(s.at(-1).elapsed-s[0].elapsed);
const motion=p=>p.evaluate(()=>DreamscapesCarouselRide.diagnostics());
async function choose(p,id,touch){for(let i=0;i<20;i++){const target=p.locator(`[data-mount-id="${id}"]`);if(await target.count()){return;}await p.getByRole('button',{name:'Next mounts',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('.carousel-choice-row')?.dataset.turning);}throw Error('Mount unavailable '+id);}
(async()=>{
 const host=await import('./playtest-server.mjs').then(m=>m.startPlaytestServer({root:path.join(app,'dist')}));
 const browser=await chromium.launch(process.env.BROWSER_EXE?{executablePath:process.env.BROWSER_EXE}:{});
 async function run(label,band,viewport,accelerated,ids){
  if(only&&!label.includes(only))return;const dir=path.join(out,label);fs.mkdirSync(dir,{recursive:true});
  const phone=viewport.width<600,context=await browser.newContext({viewport,isMobile:phone,hasTouch:phone,...(accelerated?{}:{recordVideo:{dir,size:phone?viewport:{width:960,height:600}}})});
  let baselineRequests=0;if(baseline)await context.route(/\/carousel-onboard\.js(?:\?.*)?$/,r=>{baselineRequests++;return r.fulfill({body:baseline,contentType:'text/javascript'});});
  for(const file of historicalClock)await context.route(url=>url.pathname.endsWith('/'+file.name),r=>r.fulfill({body:file.source,contentType:'text/javascript'}));
  if(accelerated)await context.addInitScript(()=>{window.__carouselTestTime=0;const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>raf(()=>fn(100000+window.__carouselTestTime));});
  const captureEpochMs=Date.now(),p=await context.newPage(),recording=p.video();p.setDefaultTimeout(180000);const errors=[],http=[],warnings=[];p.on('pageerror',e=>errors.push(e.stack));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());else if(m.type()==='warning')warnings.push(m.text())});p.on('response',r=>{if(r.status()>=400)http.push({url:r.url(),status:r.status()})});
  const result={name:label,band,viewport,accelerated,passed:false,captureEpochMs,rides:[]};results.push(result);
  const snap=async name=>p.screenshot({path:path.join(dir,name+'.jpg'),type:'jpeg',quality:88,timeout:60000});
  const advance=async ms=>{const before=await motion(p);await p.evaluate(ms=>window.__carouselTestTime+=ms,ms);await p.waitForFunction(at=>{const d=DreamscapesCarouselRide.diagnostics();return !d.active||d.elapsed>=at;},before.elapsed+ms,{timeout:30000});};
  try{
   await p.goto(host.url+'/');await p.locator(`[data-age-band="${band}"]`).click();await p.goto(host.url+'/carnival/?scene=rides-games');
   await p.waitForFunction(()=>document.documentElement.dataset.location==='rides-games'&&!document.documentElement.dataset.travelling);
   await p.waitForFunction(()=>window.carouselVariantDiagnostics?.().mounts.length===20&&!carouselVariantDiagnostics().busy);
   for(let i=0;i<4;i++){const left=p.getByRole('button',{name:'Look left',exact:true});if(await left.isVisible())await left.click();}
   if(baseline)assert.equal(baselineRequests,1);result.baseline=baseline?'5b9e7439':null;result.alphaBefore=await outsideAlpha(p);assert(result.alphaBefore.every(a=>a.alpha===0),'Original outside mount canvases remain transparent');await snap('outside-before');
   for(let n=0;n<ids.length;n++){
    const id=ids[n];await choose(p,id,phone);
    const label=await p.evaluate(id=>DreamscapesCarouselCatalog.byId[id].label,id),requestedAtVideoMs=Date.now()-captureEpochMs;await p.getByRole('button',{name:'Ride '+label,exact:true}).click();
    await p.waitForFunction(()=>window.DreamscapesCarouselRide?.active);await p.waitForFunction(()=>DreamscapesCarouselRide.diagnostics().frames>=3);const started=Date.now(),samples=[],period=await p.evaluate(()=>DreamscapesCarouselCatalog.period),atTime=t=>2800+(t-2800)*period/72000;
    if(accelerated){const targets=[4000,19000,37000,55000,76000,91000,109000,127000,141000].map(atTime);for(let i=0;i<targets.length;i++){const before=await motion(p);await advance(Math.max(0,targets[i]-before.elapsed));const d=await motion(p);samples.push(d);assert(d.active);assert.equal(d.seat,id);assert.equal(d.blend,1);assert(d.cameraInSeat.every((v,j)=>Math.abs(v-d.eyeLocal[j])<1e-6),'Eye remains attached to the selected saddle rig');await snap(id+'-sample-'+i);}await advance(2800+period*2+3800-(await motion(p)).elapsed);}
    else{
     await p.waitForTimeout(4500);samples.push(await motion(p));await snap(id+'-onboard');
     if(smoke){await p.waitForTimeout(4000);samples.push(await motion(p));await snap(id+'-forward');await p.getByRole('button',{name:'Return to carnival',exact:true}).click();result.rides.push({id,smoke:true,samples,renderFPS:renderRate(samples)});break;}
     for(const [oldThreshold,name]of [[36000,'first-half'],[75000,'second-start'],[111000,'second-half']]){const threshold=atTime(oldThreshold);await p.waitForFunction(t=>DreamscapesCarouselRide.diagnostics().elapsed>=t,threshold);samples.push(await motion(p));await snap(id+'-'+name);}
    }
    await p.waitForFunction(()=>!DreamscapesCarouselRide.active,null,{timeout:accelerated?30000:210000});
    if(!accelerated)assert(renderRate(samples)>=12,'Ordinary ride cadence must stay above the stuttering range');
    const snapshot=await p.evaluate(()=>DreamscapesObservations.snapshot());assert.equal(snapshot.carousel.status,'complete');assert.equal(snapshot.carousel.selected,id);assert.equal(snapshot.events.filter(e=>e.schemaVersion===2).length,n+1);assert.equal(snapshot.events.filter(e=>e.action==='ride-completed').length,n+1);
    const alphaAfter=await outsideAlpha(p);assert(alphaAfter.every(a=>a.alpha===0),'Returning restores transparent outside mount canvases');await snap(id+'-outside-after');result.rides.push({id,alphaAfter,requestedAtVideoMs,endedAtVideoMs:Date.now()-captureEpochMs,wallTimeMs:Date.now()-started,samples,renderFPS:accelerated?null:renderRate(samples),completion:snapshot.events.filter(e=>e.action==='ride-completed').at(-1)});
   }
   assert.deepEqual(errors,[]);assert.deepEqual(http,[]);result.passed=true;
  }catch(e){result.error=e.stack;try{await snap('FAILURE')}catch{}console.error('FAIL '+label+': '+e.message);}
  finally{fs.writeFileSync(path.join(dir,'diagnostics.json'),JSON.stringify({errors,http,warnings},null,2));try{fs.writeFileSync(path.join(dir,'session.json'),JSON.stringify(await p.evaluate(()=>DreamscapesObservations.snapshot()),null,2));}catch{}try{await p.evaluate(()=>{window.requestAnimationFrame=()=>0;});await p.waitForTimeout(750);}catch{}await p.close();await context.close();result.videos=recording?[path.basename(await recording.path())]:[];fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log((result.passed?'PASS ':'FAIL ')+label);}
 }
 try{
  if(smoke)await run('prototype-dragon','adults',{width:1440,height:900},false,['dragon']);
  else{
   for(const [label,band,size,id]of [['live-ornate-dragon-desktop','adults',{width:1440,height:900},'dragon'],['live-ornate-horse-phone','adults',{width:390,height:844},'horse'],['live-plain-rocket-desktop','teens',{width:1440,height:900},'rocket'],['live-plain-griffin-phone','teens',{width:390,height:844},'griffin'],['live-stuffed-dragon-phone','kids',{width:390,height:844},'dragon'],['live-stuffed-horse-desktop','pre-teens',{width:1440,height:900},'horse']])await run(label,band,size,false,[id]);
   for(const [band,size]of [['adults',{width:1440,height:900}],['teens',{width:1440,height:900}],['kids',{width:390,height:844}]])await run('sampled-'+band,band,size,true,['dragon','rocket','horse','griffin']);

  }
 }finally{await browser.close();await host.close();if(!results.length||results.some(r=>!r.passed))process.exitCode=1;}
})().catch(e=>{console.error(e);process.exitCode=1});
