const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const app=path.resolve(__dirname,'..'),proof=path.join(app,'verification/approved-worlds');
(async()=>{const host=await import('./playtest-server.mjs').then(m=>m.startPlaytestServer()),browser=await chromium.launch({executablePath:process.env.BROWSER_EXE}),results=[];
 try{for(const name of ['resume-reload','missing-image','reduced-motion']){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:name==='reduced-motion'?'reduce':'no-preference'});
  await context.addInitScript(()=>{window.__carouselTestTime=0;const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>raf(()=>fn(100000+window.__carouselTestTime));});
  if(name==='missing-image')await context.route('**/*Path(Snail).png',r=>r.abort());const p=await context.newPage();p.setDefaultTimeout(180000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const ready=()=>p.waitForFunction(()=>window.carouselVariantDiagnostics?.().mounts.length===20&&!carouselVariantDiagnostics().busy),active=()=>p.waitForFunction(()=>DreamscapesCarouselRide.active&&DreamscapesCarouselRide.diagnostics().frames>=3);
  const select=async id=>{for(let i=0;i<20;i++){const b=p.locator(`[data-mount-id="${id}"]`);if(await b.count()){return;}await p.getByRole('button',{name:'Next mounts',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('.carousel-choice-row')?.dataset.turning);}throw Error('Missing '+id);};
  const advance=async delta=>{await p.evaluate(delta=>window.__carouselTestTime+=delta,delta);await p.waitForTimeout(500);};
  const result={name,passed:false};results.push(result);
  try{
   await p.goto(host.url+'/carnival/?scene=rides-games');await ready();for(let i=0;i<4;i++){const b=p.getByRole('button',{name:'Look left',exact:true});if(await b.isVisible())await b.click();}await select('snail');await p.getByRole('button',{name:'Ride Snail',exact:true}).click();await active();
   if(name==='reduced-motion'){const a=await p.evaluate(()=>DreamscapesCarouselRide.diagnostics());assert.equal(a.dream.opacity,0);await p.getByRole('button',{name:'Finish still ride',exact:true}).click();const s=await p.evaluate(()=>DreamscapesObservations.snapshot());assert(s.events.some(e=>e.action==='still-ride-finished'));assert(!s.events.some(e=>e.action==='ride-completed'));}
   else{
    await advance(11200);let d=await p.evaluate(()=>DreamscapesCarouselRide.diagnostics());assert.equal(d.dream.asset,'garden');if(name==='missing-image'){assert(!d.dream.enabled&&d.dream.error);assert.equal(d.dream.opacity,0);}else{
     assert.equal(d.dream.opacity,1);await p.getByRole('button',{name:'Return to carnival',exact:true}).click();await advance(3500);await p.waitForFunction(()=>!DreamscapesCarouselRide.active);let s=await p.evaluate(()=>DreamscapesObservations.snapshot());assert.equal(s.carousel.status,'riding');assert.equal(s.events.filter(e=>e.action==='ride-completed').length,0);
     await p.getByRole('button',{name:'Resume Snail ride',exact:true}).click();await active();assert.equal((await p.evaluate(()=>DreamscapesCarouselRide.diagnostics())).elapsed,s.carousel.progress.elapsedMs);await advance(3000);assert.equal((await p.evaluate(()=>DreamscapesCarouselRide.diagnostics())).dream.opacity,1);
     await p.reload();await ready();await p.getByRole('button',{name:'Resume Snail ride',exact:true}).click();await active();await advance(15000);d=await p.evaluate(()=>DreamscapesCarouselRide.diagnostics());assert.equal(d.dream.asset,'garden');assert.equal(d.dream.opacity,1);s=await p.evaluate(()=>DreamscapesObservations.snapshot());assert.equal(s.events.filter(e=>e.schemaVersion===2).length,1);
    }
    await advance(44000);await p.waitForFunction(()=>!DreamscapesCarouselRide.active);const s=await p.evaluate(()=>DreamscapesObservations.snapshot());assert.equal(s.carousel.status,'complete');assert.equal(s.events.filter(e=>e.schemaVersion===2).length,1);assert.equal(s.events.filter(e=>e.action==='ride-completed').length,1);
   }
   assert.deepEqual(errors,[]);result.passed=true;console.log('PASS '+name);
  }catch(e){result.error=e.stack;console.error(e.stack);}finally{try{await p.evaluate(()=>{window.requestAnimationFrame=()=>0;});}catch{}await context.close();fs.writeFileSync(path.join(proof,'lifecycle.json'),JSON.stringify(results,null,2));}
 }}finally{await browser.close();await host.close();if(results.some(r=>!r.passed))process.exitCode=1;}
})().catch(e=>{console.error(e);process.exitCode=1});
