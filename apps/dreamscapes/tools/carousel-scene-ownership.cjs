const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const app=path.resolve(__dirname,'..');
const out=path.resolve(process.env.EVIDENCE_DIR||path.join(app,'.tmp/scene-ownership'));
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const host=process.env.BASE_URL?null:await import('./playtest-server.mjs').then(m=>m.startPlaytestServer({root:path.join(app,'dist')}));
 const base=process.env.BASE_URL||host.url,browser=await chromium.launch({executablePath:process.env.BROWSER_EXE});
 const results=[];
 try{for(const mobile of (process.env.BASELINE? [false]:[false,true])){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});
  const p=await context.newPage();p.setDefaultTimeout(180000);const errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>localStorage.setItem('dreamscapes.age-band','adults'));
  const arrive=id=>p.waitForFunction(id=>document.documentElement.dataset.location===id&&!document.documentElement.dataset.travelling,id);
  const ready=()=>p.waitForFunction(()=>window.carouselVariantDiagnostics?.().mounts.length===20&&!carouselVariantDiagnostics().busy&&carouselVariantDiagnostics().selected);
  const click=async locator=>{await locator.evaluate(el=>el.click());};
  const route=async(from,to)=>{await click(p.locator(from==='midway'&&to==='tent-row'?'main [data-destination="Tent Row"]':(from==='midway'?'main':`[data-scene="${from}"]`)+` [data-to="${to}"]`).first());await arrive(to);};
  const inspect=async label=>{
   const state=await p.evaluate(()=>({location:document.documentElement.dataset.location,mounts:[...document.querySelectorAll('.carousel-horse-3d-comparison,.carousel-animal-3d-comparison')].map(el=>({id:el.dataset.animal||'horse',visible:el.checkVisibility({visibilityProperty:true}),visibility:getComputedStyle(el).visibility,ownerVisibility:getComputedStyle(el.closest('[data-scene]')).visibility})),diagnostics:window.carouselVariantDiagnostics?.()}));
   results.push({mobile,label,...state});
   await p.screenshot({path:path.join(out,(mobile?'mobile-':'desktop-')+label+'.png')});
   assert.equal(state.mounts.filter(m=>m.visible).length,state.location==='rides-games'?20:0,label);
   console.log('PASS '+(mobile?'mobile ':'desktop ')+label);
   return state;
  };
  try{
   await p.goto(base+'/carnival/');
   if(mobile)await p.getByRole('button',{name:'Look toward the center',exact:true}).click();
   // Actual painted entrance control, followed by the established Zora route.
   await p.locator('main [data-sign="RIDES & GAMES"]').click();await arrive('rides-games');await ready();
   await inspect('carousel-before');
   await p.getByRole('button',{name:'Walk to Madame Zora / Fortune Teller',exact:true}).click();await arrive('fortune-teller');
   await inspect('zora-after-carousel');
   if(process.env.BASELINE)continue;
   if(process.env.SMOKE){
    await route('fortune-teller','rides-games');await inspect('carousel-return');
    for(const id of ['fortune-teller','fun-house','forest-edge']){
     await p.goto(base+'/carnival/?scene='+id);await arrive(id);await inspect('direct-'+id);
     await p.reload();await arrive(id);await inspect('refresh-'+id);
    }
    assert.deepEqual(errors,[]);continue;
   }
   // Late asynchronous style completion must not expose a cached scene.
   for(const band of ['teens','kids','pre-teens','adults']){
    await p.evaluate(async band=>(await import('/age-band.js')).selectAgeBand(band),band);await ready();
    await inspect('zora-'+band);
    await route('fortune-teller','rides-games');const s=await inspect('carousel-'+band);
    assert.equal(s.diagnostics.selected,band==='adults'?'ornate':band==='teens'?'plain':'stuffed');
    assert.equal(s.diagnostics.mounts.filter(m=>m.visible).length,20);
    assert.equal(await p.evaluate(()=>carouselHorseComparison.renderer.getContext().isContextLost()),false);
    await route('rides-games','fortune-teller');
   }
   await route('fortune-teller','rides-games');await route('rides-games','fun-house');await inspect('hall-of-mirrors');
   await route('fun-house','rides-games');await route('rides-games','midway');await inspect('midway-return');
   await route('midway','tent-row');await route('tent-row','behind-carnival');await route('behind-carnival','forest-edge');await inspect('forest-edge');
   // Preloaded scenes are cached but never painted before entry.
   await p.evaluate(()=>CarnivalNavigation.prepareTour(['rides-games','fortune-teller','fun-house']));await inspect('forest-preloaded');
   for(const id of ['fortune-teller','fun-house','midway','forest-edge','rides-games']){
    await p.goto(base+'/carnival/?scene='+id);if(id!=='midway')await arrive(id);if(id==='rides-games')await ready();await inspect('direct-'+id);
    await p.reload();if(id!=='midway')await arrive(id);if(id==='rides-games')await ready();await inspect('refresh-'+id);
   }
   assert.deepEqual(errors,[]);
   console.log('PASS scene ownership '+(mobile?'mobile':'desktop'));
  }finally{await context.close();}
 }}finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({base,results},null,2));await browser.close();if(host)await host.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
