// Final marker and layout review. Short accelerated samples, not live-turn evidence.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const app=path.resolve(__dirname,'..'),out=path.resolve(process.env.DREAMSCAPES_CAROUSEL_MARKER_EVIDENCE_DIR||path.join(app,'playtest-artifacts/cycle-three/marker-review-final'));
(async()=>{
 const host=await import('./playtest-server.mjs').then(m=>m.startPlaytestServer());
 const browser=await chromium.launch(process.env.BROWSER_EXE?{executablePath:process.env.BROWSER_EXE}:{}),results=[];
 try{
  for(const [band,viewport]of [['adults',{width:844,height:390}],['teens',{width:1440,height:900}],['kids',{width:390,height:844}]]){
   const dir=path.join(out,band);fs.mkdirSync(dir,{recursive:true});const context=await browser.newContext({viewport,hasTouch:viewport.width<900,isMobile:viewport.width<900});
   await context.addInitScript(()=>{window.__carouselTestTime=0;const original=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>original(t=>fn(t+window.__carouselTestTime));});
   const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});p.setDefaultTimeout(180000);
   try{
    await p.goto(host.url+'/');await p.locator(`[data-age-band="${band}"]`).click();await p.goto(host.url+'/carnival/?scene=rides-games');
    await p.waitForFunction(()=>document.documentElement.dataset.location==='rides-games'&&!document.documentElement.dataset.travelling);
    await p.waitForFunction(()=>window.carouselVariantDiagnostics?.().mounts.length===20&&!carouselVariantDiagnostics().busy);
    for(let i=0;i<4;i++){const left=p.getByRole('button',{name:'Look left',exact:true});if(await left.isVisible())await left.click();}
    await p.getByRole('button',{name:'Select Dragon mount',exact:true}).click();await p.screenshot({path:path.join(dir,'preview.jpg'),type:'jpeg',quality:88,timeout:60000});
    await p.getByRole('button',{name:'Ride Dragon',exact:true}).click();
    for(let i=0;i<5;i++){
     if(i)await p.evaluate(()=>window.__carouselTestTime+=18050);
     await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
     const marker=await p.locator('[data-selected-mount="dragon"]').evaluate(e=>({attached:e.parentElement.classList.contains('carousel-mount-anchor'),finite:[...e.children].every(c=>Number.isFinite(Number(c.getAttribute('cy'))))}));assert(marker.attached&&marker.finite);
     await p.screenshot({path:path.join(dir,'quarter-'+i+'.jpg'),type:'jpeg',quality:88,timeout:60000});
    }
    const layout=await p.evaluate(()=>{const plaque=document.querySelector('.carousel-choice').getBoundingClientRect();return {plaque:{x:plaque.x,y:plaque.y,width:plaque.width,height:plaque.height},viewport:{width:innerWidth,height:innerHeight},inspectorVisible:!!document.querySelector('.evidence-open')};});
    assert(layout.plaque.x>=0&&layout.plaque.y>=0&&layout.plaque.x+layout.plaque.width<=viewport.width);assert(!layout.inspectorVisible);assert.deepEqual(errors,[]);
    results.push({name:band,passed:true,layout,method:'Final saddle-socket marker at five accelerated quarter-turn samples; actual screenshots reviewed separately.'});
   }catch(e){results.push({name:band,passed:false,error:e.stack,errors});try{await p.screenshot({path:path.join(dir,'FAILURE.jpg'),type:'jpeg',timeout:60000});}catch{}process.exitCode=1;}
   finally{await context.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));}
  }
 }finally{await browser.close();await host.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
