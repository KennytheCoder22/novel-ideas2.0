const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE,headless:true});const results=[];
try{for(const style of ['plain','stuffed'])for(const profile of ['original','budget']){
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const age=style==='plain'?'teens':'kids';
 await page.goto(`http://127.0.0.1:4211/?textureTrial=${profile}`);let t=Date.now();await page.locator(`[data-age-band="${age}"]`).click();await page.waitForFunction(()=>carouselPreloadDiagnostics().assets.length===20,{},{timeout:240000});const preloadMs=Date.now()-t;
 await page.goto(`http://127.0.0.1:4211/experiments/carnival/index.html?scene=rides-games&textureTrial=${profile}&age=${age}`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(s=>window.carouselVariantDiagnostics?.().selected===s&&!carouselVariantDiagnostics().busy,style,{timeout:240000});
 const data=await page.evaluate(async()=>{const runtime=carouselVariantDiagnostics();const times=[];await new Promise(resolve=>{let last=performance.now(),start=last;function tick(now){times.push(now-last);last=now;if(now-start>=8000)resolve();else requestAnimationFrame(tick);}requestAnimationFrame(tick);});return {runtime,meanFrameMs:times.reduce((a,b)=>a+b,0)/times.length,frames:times.length};});
 assert.equal(data.runtime.mounts.length,20);assert(data.runtime.mounts.every(m=>m.style===style&&m.visible));assert.deepEqual(errors,[]);
 const r={style,profile,preloadMs,readyMs:Math.max(...data.runtime.metrics.map(m=>m.readyAtMs||0)),...data,errors};results.push(r);fs.writeFileSync(path.join(__dirname,'motion-benchmark.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({style,profile,preloadMs,readyMs:r.readyMs,fps:1000/r.meanFrameMs}));await context.close();
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
