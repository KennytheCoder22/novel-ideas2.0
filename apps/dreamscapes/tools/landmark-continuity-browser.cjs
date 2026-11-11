const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const app=path.resolve(__dirname,'..'),proof=path.join(app,'verification/landmark-continuity');
const baseline=cp.execFileSync('git',['show','5b9e7439:apps/dreamscapes/public/experiments/carnival/carousel-onboard.js'],{cwd:app,encoding:'utf8'});
const mode=process.argv.find(s=>s.startsWith('--mode='))?.slice(7)||'all',only=process.argv.find(s=>s.startsWith('--view='))?.slice(7);
(async()=>{
 fs.mkdirSync(proof,{recursive:true});const host=await import('./playtest-server.mjs').then(m=>m.startPlaytestServer()),browser=await chromium.launch({executablePath:process.env.BROWSER_EXE});
 const results=mode==='views'&&only&&fs.existsSync(path.join(proof,'landmark-checks.json'))?JSON.parse(fs.readFileSync(path.join(proof,'landmark-checks.json'))).filter(r=>r.name!==only):[];
 try{
  if(mode==='all'||mode==='composition'){
   const context=await browser.newContext({viewport:{width:1440,height:900}}),p=await context.newPage();p.setDefaultTimeout(180000);
   const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(host.url+'/carnival/?scene=ferris-platform&motion=still');await p.locator('.platform-wheel').waitFor({state:'visible'});await p.waitForTimeout(2000);
   await p.screenshot({path:path.join(proof,'external-ferris-platform.jpg'),type:'jpeg',quality:90});
   const result=await p.evaluate(async()=>{
    const {ferrisEnvironment}=await import('./carousel-environment.js'),bg=new Image();bg.src='./locations/ferris-platform.png';await bg.decode();const env=await ferrisEnvironment(bg),c=env.canvas.getContext('2d',{willReadFrequently:true});
    env.paint(0);const first=c.getImageData(0,0,1672,941).data.slice();env.paint(15000);const quarter=c.getImageData(0,0,1672,941).data.slice();env.paint(60000);const full=c.getImageData(0,0,1672,941).data.slice();
    const raw=document.createElement('canvas');raw.width=1672;raw.height=941;raw.getContext('2d').drawImage(bg,0,0);const base=raw.getContext('2d').getImageData(0,0,1672,941).data;
    const points=[[1080,350],[1120,380],[1400,600],[500,800],[990,540],[1038,560]];const protectedPixels=points.map(([x,y])=>{const i=(y*1672+x)*4;return {x,y,first:[...first.slice(i,i+4)],quarter:[...quarter.slice(i,i+4)],source:[...base.slice(i,i+4)]};});
    let changed=0,repeatDifference=0,repeatAbsoluteError=0,repeatMaxError=0,wheelPixels=0;for(let i=0;i<first.length;i+=4){if(first[i]!==quarter[i]||first[i+1]!==quarter[i+1]||first[i+2]!==quarter[i+2])changed++;if(first[i]!==full[i]||first[i+1]!==full[i+1]||first[i+2]!==full[i+2])repeatDifference++;for(let j=0;j<3;j++){const e=Math.abs(first[i+j]-full[i+j]);repeatAbsoluteError+=e;repeatMaxError=Math.max(repeatMaxError,e);}if(first[i]!==base[i]||first[i+1]!==base[i+1]||first[i+2]!==base[i+2])wheelPixels++;}
    const throttled=!env.paint(60050),stillUpdate=env.paint(70000,true),still=c.getImageData(0,0,1672,941).data;let stillDifference=0,stillAbsoluteError=0;for(let i=0;i<first.length;i++){const e=Math.abs(first[i]-still[i]);if(e)stillDifference++;stillAbsoluteError+=e;}
    const maskPixels=env.gpu.clip.getContext('2d').getImageData(0,0,1676,945).data,maskPoints=points.map(([x,y])=>({x,y,visibility:maskPixels[((y+2)*1676+x+2)*4+1]})),openVisibility=maskPixels[((80+2)*1676+800+2)*4+1];
    window.__landmarkCanvas=env.canvas;return {maskPoints,openVisibility,changed,repeatDifference,repeatMeanError:repeatAbsoluteError/(1672*941*3),repeatMaxError,wheelPixels,protectedPixels,throttled,stillUpdate,stillDifference,stillMeanError:stillAbsoluteError/first.length,png:env.canvas.toDataURL()};
   });
   fs.writeFileSync(path.join(proof,'platform-composition.png'),Buffer.from(result.png.split(',')[1],'base64'));delete result.png;
   assert(result.changed>10000,'Wheel moves independently');assert(result.wheelPixels>10000,'Wheel exists in the source environment');fs.writeFileSync(path.join(proof,'composition-checks.json'),JSON.stringify([{name:'canonical-wheel-composition',...result}],null,2));assert(result.repeatMeanError<1,'60-second wheel returns to the same geometry within rasterization tolerance');assert(result.stillMeanError<1,'Still wheel returns to its original geometry within rasterization tolerance');assert(result.throttled);for(const q of result.maskPoints)assert.equal(q.visibility,0,'GPU world mask protects the original architecture and rail intersections');assert(result.openVisibility>250,'Open sky admits the moving wheel');for(const q of result.protectedPixels){assert.deepEqual(q.first,q.source);assert.deepEqual(q.quarter,q.source);}assert.deepEqual(errors,[]);results.push({name:'canonical-wheel-composition',passed:true,...result});await context.close();
  }
  if(mode==='all'||mode==='views')for(const phone of [false,true])for(const version of ['before','after']){
   const label=(phone?'phone':'desktop')+'-'+version,dir=path.join(proof,label);if(only&&label!==only)continue;fs.mkdirSync(dir,{recursive:true});const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1440,height:900},isMobile:phone,hasTouch:phone});
   let baselineRequests=0;if(version==='before')await context.route(/\/carousel-onboard\.js(?:\?.*)?$/,r=>{baselineRequests++;return r.fulfill({body:baseline,contentType:'text/javascript'});});
   await context.addInitScript(()=>{window.__carouselTestTime=0;const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>raf(()=>fn(100000+window.__carouselTestTime));});
   const p=await context.newPage();p.setDefaultTimeout(180000);const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(host.url+'/');await p.locator('[data-age-band="adults"]').click();await p.goto(host.url+'/carnival/?scene=rides-games');await p.waitForFunction(()=>window.carouselVariantDiagnostics?.().mounts.length===20&&!carouselVariantDiagnostics().busy);
   for(let i=0;i<4;i++){const b=p.getByRole('button',{name:'Look left',exact:true});if(await b.isVisible())await b.click();}
   await p.screenshot({path:path.join(dir,'outside.jpg'),type:'jpeg',quality:90});
   for(let i=0;i<8&&!await p.locator('[data-mount-id="dragon"]').count();i++)await p.getByRole('button',{name:'Next mounts',exact:true}).click();await p.getByRole('button',{name:'Ride Dragon',exact:true}).click();await p.waitForFunction(()=>DreamscapesCarouselRide.diagnostics().frames>=3);
   if(version==='before')assert.equal(baselineRequests,1,'Approved versioned controller was served for the before captures');
   const samples=[];for(const at of [4000,10000,16000,22000,28000,34000,40000,46000,52000,58000,64000,70000,...(version==='after'?[76000,82000,88000,94000,100000,106000,112000,118000,124000,130000,136000,142000]:[])]){
    await p.evaluate(t=>window.__carouselTestTime=t,at);await p.waitForFunction(t=>DreamscapesCarouselRide.diagnostics().elapsed>=t,at);const d=await p.evaluate(()=>DreamscapesCarouselRide.diagnostics());assert.equal(d.blend,1);assert(d.cameraInSeat.every((v,i)=>Math.abs(v-d.eyeLocal[i])<1e-6));samples.push(d);await p.screenshot({path:path.join(dir,'phase-'+String(at).padStart(6,'0')+'.jpg'),type:'jpeg',quality:88});
   }
   assert.deepEqual(errors,[]);results.push({name:label,passed:true,baselineModuleRequests:baselineRequests,method:'Fixed-phase visual comparisons only; ordinary-speed videos are separate.',samples});await context.close();fs.writeFileSync(path.join(proof,'landmark-checks.json'),JSON.stringify(results,null,2));console.log('PASS '+label);
  }
  fs.writeFileSync(path.join(proof,mode==='composition'?'composition-checks.json':'landmark-checks.json'),JSON.stringify(results,null,2));
 }finally{await browser.close();await host.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
