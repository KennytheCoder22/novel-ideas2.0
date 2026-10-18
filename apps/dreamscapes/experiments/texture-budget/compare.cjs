const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.dirname(__filename),base='http://127.0.0.1:4211';
(async()=>{const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE,headless:true});const report=[];
try{for(const style of ['plain','stuffed'])for(const profile of (process.env.TRIAL_PROFILES||'original,jpeg85,jpeg75').split(',')){
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const age=style==='plain'?'teens':'kids';const dir=path.join(root,'review',style,profile);fs.mkdirSync(dir,{recursive:true});
 await page.goto(`${base}/?textureTrial=${profile}`,{waitUntil:'domcontentloaded',timeout:120000});const start=Date.now();await page.locator(`[data-age-band="${age}"]`).click();await page.waitForFunction(()=>carouselPreloadDiagnostics().assets.length===20,{},{timeout:240000});const preloadMs=Date.now()-start;
 await page.goto(`${base}/experiments/carnival/index.html?scene=rides-games&textureTrial=${profile}&age=${age}&motion=still`,{waitUntil:'domcontentloaded',timeout:120000});await page.waitForFunction(s=>window.carouselVariantDiagnostics?.().selected===s&&!carouselVariantDiagnostics().busy,style,{timeout:240000});
 const metrics=await page.evaluate(()=>({runtime:carouselVariantDiagnostics(),preload:carouselPreloadDiagnostics()}));assert.equal(metrics.runtime.mounts.length,20);assert(metrics.runtime.mounts.every(m=>m.style===style&&m.visible));
 // Native-distance scene captures over a revolution. No model zoom or altered mount transforms.
 for(let i=0;i<8;i++){await page.evaluate(p=>setTextureTrialPhase(p),i/8);await page.waitForTimeout(300);await page.screenshot({path:path.join(dir,`scene-${i}.png`)});}
 // Transparent canvas captures are supplemental: resize later to their measured on-screen size, never zoom in.
 const canvases=await page.evaluate(()=>[window.carouselHorseComparison,...carouselAnimalComparisons].map(e=>{const box=e.renderer.domElement.parentElement.getBoundingClientRect();return {name:e.name||'horse',width:box.width,height:box.height,png:e.renderer.domElement.toDataURL()};}));
 for(const c of canvases)fs.writeFileSync(path.join(dir,c.name+'.png'),Buffer.from(c.png.split(',')[1],'base64'));
 fs.writeFileSync(path.join(dir,'display-sizes.json'),JSON.stringify(canvases.map(({png,...c})=>c),null,2));assert.deepEqual(errors,[]);
 const result={style,profile,preloadMs,readyMs:Math.max(...metrics.runtime.metrics.map(m=>m.readyAtMs||0)),metrics,errors};report.push(result);fs.writeFileSync(path.join(root,`benchmark${process.env.TRIAL_PROFILES?'-'+process.env.TRIAL_PROFILES:''}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify({style,profile,preloadMs,readyMs:result.readyMs}));await context.close();
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
