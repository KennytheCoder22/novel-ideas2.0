const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=path.resolve(process.env.DREAMSCAPES_LIFECYCLE_EVIDENCE_DIR||path.join(__dirname,'../playtest-artifacts/first-person/lifecycle')),results=[];
(async()=>{
 const host=await import('./playtest-server.mjs').then(m=>m.startPlaytestServer()),browser=await chromium.launch(process.env.BROWSER_EXE?{executablePath:process.env.BROWSER_EXE}:{});
 async function run(name,still){
  const dir=path.join(out,name);fs.mkdirSync(dir,{recursive:true});const context=await browser.newContext({viewport:still?{width:390,height:844}:{width:1440,height:900},hasTouch:still,isMobile:still,reducedMotion:still?'reduce':'no-preference'});
  await context.addInitScript(()=>{window.__carouselTestTime=0;const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>raf(()=>fn(100000+window.__carouselTestTime));});
  const p=await context.newPage();p.setDefaultTimeout(180000);const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  const snap=label=>p.screenshot({path:path.join(dir,label+'.jpg'),type:'jpeg',quality:86,timeout:60000});
  const snapshot=()=>p.evaluate(()=>DreamscapesObservations.snapshot());
  const advance=async ms=>{await p.evaluate(ms=>window.__carouselTestTime+=ms,ms);await p.waitForTimeout(500);};
  const activate=async name=>{const b=p.getByRole('button',{name,exact:true});if(still)await b.tap();else{await b.focus();await b.press('Enter');}};
  const arrived=()=>p.waitForFunction(()=>document.documentElement.dataset.location==='rides-games'&&!document.documentElement.dataset.travelling&&window.carouselVariantDiagnostics?.().mounts.length===20&&!carouselVariantDiagnostics().busy);
  const onboard=()=>p.waitForFunction(()=>window.DreamscapesCarouselRide?.active&&DreamscapesCarouselRide.diagnostics().frames>=3);
  const result={name,passed:false};results.push(result);
  try{
   await p.goto(host.url+'/');await p.locator(`[data-age-band="${still?'pre-teens':'adults'}"]`).click();await p.goto(host.url+'/carnival/?scene=rides-games');await arrived();
   for(let i=0;i<4;i++){const b=p.getByRole('button',{name:'Look left',exact:true});if(await b.isVisible())await b.click();}
   await activate('Ride Dragon');await onboard();const original=(await snapshot()).carousel;
   if(still){
    const first=await p.evaluate(()=>DreamscapesCarouselRide.diagnostics());await p.waitForTimeout(700);const next=await p.evaluate(()=>DreamscapesCarouselRide.diagnostics());assert.equal(first.phase,next.phase);await snap('still-onboard');await activate('Finish still ride');
    const s=await snapshot();assert.equal(s.carousel.status,'complete');assert(s.events.some(e=>e.action==='still-ride-finished'));assert(!s.events.some(e=>e.action==='ride-completed'));assert.equal(s.counts.tentativePreference,1);result.details={still:true,falseTurnCompletions:0,ageBand:s.ageBand};
   }else{
    await advance(4500);await activate('Return to carnival');await advance(4000);await p.waitForFunction(()=>!DreamscapesCarouselRide.active);let s=await snapshot();assert.equal(s.carousel.status,'riding');assert(!s.events.some(e=>e.action==='ride-completed'));await snap('stepped-off');
    await activate('Resume Dragon ride');await onboard();assert.equal((await snapshot()).events.filter(e=>e.schemaVersion===2).length,1);
    await p.reload();await arrived();await activate('Resume Dragon ride');await onboard();s=await snapshot();assert.equal(s.carousel.rideId,original.rideId);assert.equal(s.events.filter(e=>e.schemaVersion===2).length,1);await advance(4500);await snap('reload-onboard');await advance(160000);await p.waitForFunction(()=>!DreamscapesCarouselRide.active);s=await snapshot();assert.equal(s.carousel.status,'complete');assert.equal(s.events.filter(e=>e.action==='ride-completed').length,1);
    const duplicate=await p.evaluate(()=>DreamscapesObservations.carouselComplete(DreamscapesObservations.snapshot().carousel.rideId,200000));assert.equal(duplicate.accepted,false);
    await activate('Ride Dragon');await onboard();s=await snapshot();assert.equal(s.events.filter(e=>e.schemaVersion===2).length,2);assert.equal(s.counts.tentativePreference,1);assert.equal(s.events.filter(e=>e.schemaVersion===2).at(-1).interpretation.status,'repeat-suppressed');await advance(160000);await p.waitForFunction(()=>!DreamscapesCarouselRide.active);await snap('repeat-returned');
    const alpha=await p.evaluate(()=>carouselHorseComparison.renderer.domElement.getContext('2d').getImageData(0,0,1,1).data[3]);assert.equal(alpha,0);result.details={earlyStepOffIsNotCompletion:true,resumeKeepsChoice:true,reloadKeepsChoice:true,repeatedFamilySuppressed:true,duplicateRejected:true,transparentOutsideRestored:true};
   }
   assert.deepEqual(errors,[]);result.passed=true;
  }catch(e){result.error=e.stack;try{await snap('FAILURE')}catch{}process.exitCode=1;}
  finally{fs.writeFileSync(path.join(dir,'diagnostics.json'),JSON.stringify({errors},null,2));try{fs.writeFileSync(path.join(dir,'session.json'),JSON.stringify(await snapshot(),null,2));}catch{}await context.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log((result.passed?'PASS ':'FAIL ')+name);}
 }
 try{await run('resume-reload-repeat',false);await run('reduced-motion-pre-teens',true);}finally{await browser.close();await host.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
