const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.BASE_URL||'http://127.0.0.1:4204';
const expected=JSON.parse(fs.readFileSync('apps/dreamscapes/verification/loading-baseline-rig.json')).settings.mounts;
const settings=mounts=>mounts.map(({identity,slot,holder,mountHeight,bobAmplitude,turn,registration})=>({identity,slot,holder,mountHeight,bobAmplitude,turn,registration})).sort((a,b)=>a.slot-b.slot);
(async()=>{const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE,headless:true});const results=[];
try{for(const mode of ['cold','preloaded','missing']){
 const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('.glb'))requests.push(r.url());});
 await page.addInitScript(()=>{window.wrongStyleFrames=[];function check(){for(const h of document.querySelectorAll('[data-variant]'))if(h.style.visibility!=='hidden'&&h.dataset.variant!=='stuffed'&&!(h.dataset.animal==='dragon'&&window.allowFallback))wrongStyleFrames.push(h.dataset.variant);requestAnimationFrame(check);}requestAnimationFrame(check);});
 if(mode==='missing'){await page.addInitScript(()=>window.allowFallback=true);await page.route('**/variants/stuffed/dragon.glb',r=>r.fulfill({status:404,body:'Missing GLB fixture'}));}
 const start=Date.now();await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:120000});await page.locator('[data-age-band="kids"]').click();
 if(mode==='preloaded')await page.waitForFunction(()=>carouselPreloadDiagnostics().assets.length===20,{},{timeout:240000});
 const portalMs=Date.now()-start;
 await page.goto(base+'/experiments/carnival/index.html?scene=rides-games',{waitUntil:'domcontentloaded',timeout:120000});const entered=Date.now();
 await page.waitForFunction(()=>window.carouselVariantDiagnostics?.().selected==='stuffed'&&!carouselVariantDiagnostics().busy,{},{timeout:240000});
 const result=await page.evaluate(()=>({state:carouselVariantDiagnostics(),preload:carouselPreloadDiagnostics(),wrong:wrongStyleFrames,resources:performance.getEntriesByType('resource').filter(r=>r.name.endsWith('.glb')).map(r=>({url:r.name,start:r.startTime,duration:r.duration,bytes:r.decodedBodySize}))}));
 assert.deepEqual(result.wrong,[],'Wrong style became visible');assert.equal(result.state.mounts.length,20);
 for(const m of result.state.mounts){assert(m.visible);assert.equal(m.style,mode==='missing'&&m.identity==='dragon'?'ornate':'stuffed');}
 assert.deepEqual(JSON.parse(JSON.stringify(settings(result.state.mounts))),JSON.parse(JSON.stringify(settings(expected))),'Canonical mounting/crops changed');
 assert(!requests.some(u=>u.includes('/variants/plain/')));assert(!requests.some(u=>!u.includes('/variants/')&&!(mode==='missing'&&u.endsWith('/dragon.glb'))),'Unrequested Ornate downloaded');
 const parsed=result.state.metrics.filter(m=>m.parseMs!==undefined).length;
 await page.evaluate(()=>CarnivalNavigation.go('Midway'));await page.evaluate(()=>CarnivalNavigation.go('Rides & Games'));
 assert.equal(await page.evaluate(()=>carouselVariantDiagnostics().metrics.filter(m=>m.parseMs!==undefined).length),parsed,'Revisit reparsed models');
 // Re-selecting the same band must not hide an already-ready set.
 await page.evaluate(async()=>{const {selectAgeBand}=await import('../../age-band.js');selectAgeBand('kids');});
 assert((await page.evaluate(()=>carouselVariantDiagnostics().mounts)).every(m=>m.visible));
 assert.deepEqual(errors,[]);result.mode=mode;result.portalMs=portalMs;result.carouselReadyMs=Date.now()-entered;result.requests=requests;
 results.push(result);fs.writeFileSync('apps/dreamscapes/verification/loading-results.json',JSON.stringify({passed:false,results},null,2));console.log(JSON.stringify({mode,portalMs,carouselReadyMs:result.carouselReadyMs,models:20,wrongFrames:0,networkRequests:requests.length}));
 if(mode==='preloaded')await page.screenshot({path:'apps/dreamscapes/verification/loading-stuffed.png'});
 await context.close();
}
fs.writeFileSync('apps/dreamscapes/verification/loading-results.json',JSON.stringify({passed:true,results},null,2));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
