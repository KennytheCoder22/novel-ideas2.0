const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const app=path.resolve(__dirname,'..'),proof=path.join(app,'verification',process.env.DREAMSCAPES_WORLD_PROOF||'approved-worlds'),artifacts=path.join(app,'playtest-artifacts',process.env.DREAMSCAPES_WORLD_PROOF||'approved-worlds');
const live=process.argv.includes('--live'),only=process.argv.find(a=>a.startsWith('--case='))?.slice(7),results=[];
const mapping={'moon-loveseat':'lunar',snail:'garden',horse:'fortress',rocket:'alien',griffin:'citadel',ostrich:'savannah',zebra:'savannah',elephant:'savannah','brown-horse':'red-rock','polar-bear':'arctic',cat:'living-room',tiger:'jungle-temple',flamingo:'lagoon',dragon:'castle-aerial',unicorn:'castle-ground',rabbit:'warren',fox:'countryside',grizzly:'wilderness',wolf:'wilderness',stag:'wildflower-valley'};
async function choose(p,id){for(let i=0;i<20;i++){const b=p.locator(`[data-mount-id="${id}"]`);if(await b.count()){return;}await p.getByRole('button',{name:'Previous mounts',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('.carousel-choice-row')?.dataset.turning);}throw Error('Mount unavailable '+id);}
(async()=>{
 fs.mkdirSync(proof,{recursive:true});const host=await import('./playtest-server.mjs').then(m=>m.startPlaytestServer()),browser=await chromium.launch({executablePath:process.env.BROWSER_EXE});
 try{
  const cases=live?[['desktop','adults',{width:1440,height:900}],['phone','adults',{width:390,height:844}]]:[['desktop','adults',{width:1440,height:900}],['phone','adults',{width:390,height:844}],['landscape','adults',{width:844,height:390}],['teens','teens',{width:1280,height:800}],['kids','kids',{width:390,height:844}],['pre-teens','pre-teens',{width:390,height:844}]];
  for(const [name,band,viewport]of cases){
   if(only&&name!==only)continue;const dir=path.join(artifacts,live?'ordinary':'sampled',name);fs.mkdirSync(dir,{recursive:true});
   const context=await browser.newContext({viewport,isMobile:viewport.width<900,hasTouch:viewport.width<900,...(live?{recordVideo:{dir,size:viewport}}:{})});
   if(!live)await context.addInitScript(()=>{window.__carouselTestTime=0;const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>raf(()=>fn(100000+window.__carouselTestTime));});
   const captureEpochMs=Date.now(),p=await context.newPage(),video=p.video(),errors=[],http=[],requests=[];p.setDefaultTimeout(180000);p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'||/WebGL.*INVALID|INVALID_.*tex/i.test(m.text()))errors.push(m.text());});p.on('response',r=>{if(r.status()>=400)http.push(r.url());});p.on('request',r=>{if(r.url().includes('/dream-worlds/')&&r.url().endsWith('.png'))requests.push(r.url());});
   const result={name,band,viewport,captureEpochMs,ordinarySpeed:live,passed:false,rides:[],errors,http,requests};results.push(result);
   try{
    await p.goto(host.url+'/');await p.locator(`[data-age-band="${band}"]`).click();await p.goto(host.url+'/carnival/?scene=rides-games');await p.waitForFunction(()=>window.carouselVariantDiagnostics?.().mounts.length===20&&!carouselVariantDiagnostics().busy);
    for(let i=0;i<4;i++){const b=p.getByRole('button',{name:'Look left',exact:true});if(await b.isVisible())await b.click();}
    const selected=process.argv.find(a=>a.startsWith('--mounts='))?.slice(9);const ids=selected?selected.split(','):live?(name==='desktop'?['snail','rocket','ostrich']:['horse','griffin','zebra']):['moon-loveseat','snail','horse','rocket','griffin','ostrich','zebra','dragon'];
    let textureId,savannahVersion;for(let n=0;n<ids.length;n++){
     const id=ids[n];await choose(p,id);
     const label=await p.evaluate(id=>DreamscapesCarouselCatalog.byId[id].label,id),r={id,asset:mapping[id]||null,samples:[]};result.rides.push(r);
     await p.getByRole('button',{name:'Ride '+label,exact:true}).click();await p.waitForFunction(id=>DreamscapesCarouselRide.active&&DreamscapesCarouselRide.diagnostics().seat===id&&DreamscapesCarouselRide.diagnostics().frames>=3,id);
     const began=Date.now();for(const [at,label]of [[3200,'carnival'],[8000,'fade'],[9050,'landmark-dream'],[11200,'first-dream'],[14300,'late-dream'],[16000,'return-one'],[22000,'carnival-two'],[29200,'second-dream'],[36000,'return-two']]){
      if(!live){const current=await p.evaluate(()=>DreamscapesCarouselRide.diagnostics().elapsed);await p.evaluate(delta=>window.__carouselTestTime+=delta,Math.max(0,at-current));}
      await p.waitForFunction(t=>!DreamscapesCarouselRide.active||DreamscapesCarouselRide.diagnostics().elapsed>=t,at);const d=await p.evaluate(()=>DreamscapesCarouselRide.diagnostics());if(!d.active&&live)break;assert(d.active);assert.equal(d.seat,id);assert(d.cameraInSeat.every((v,j)=>Math.abs(v-d.eyeLocal[j])<1e-6));assert.equal(d.dream.asset,mapping[id]||null);assert.equal(d.dream.enabled,!!mapping[id]);
      if(!live){if(mapping[id]&&label.includes('dream')){assert(d.dream.opacity>.999,'Full dream visibility');assert.equal(d.dream.seamSafety,1);}if(!mapping[id]||label.startsWith('carnival')||label==='return-two')assert.equal(d.dream.opacity,0);}
      if(d.dream.opacity>0)assert(d.dream.seamViewGap>d.dream.halfHFov);const image=`${live?'live':'sample'}-${name}-${id}-${label}.jpg`;
      r.samples.push({...d,videoSeconds:(Date.now()-captureEpochMs)/1000,image});if(!live&&(label.includes('dream')||label==='carnival'))await p.screenshot({path:path.join(proof,image),type:'jpeg',quality:88});
     }
     if(!live)await p.evaluate(()=>window.__carouselTestTime+=44000-DreamscapesCarouselRide.diagnostics().elapsed);
     await p.waitForFunction(()=>!DreamscapesCarouselRide.active);r.wallTimeMs=Date.now()-began;const store=await p.evaluate(()=>DreamscapesObservations.snapshot());assert.equal(store.carousel.status,'complete');assert.equal(store.carousel.selected,id);assert.equal(store.events.filter(e=>e.schemaVersion===2).length,n+1);assert.equal(store.events.filter(e=>e.action==='ride-completed').length,n+1);r.completed=store.events.filter(e=>e.action==='ride-completed').at(-1);r.choice=store.events.filter(e=>e.schemaVersion===2).at(-1);
     const d=r.samples.find(s=>s.dream.opacity>.999)||r.samples[0];if(!textureId)textureId=d.dream.textureId;assert.equal(d.dream.textureId,textureId,'One GPU dream texture per carousel style');if(id==='ostrich')savannahVersion=d.dream.textureVersion;if(id==='zebra'&&ids[n-1]==='ostrich'&&savannahVersion!==undefined)assert.equal(d.dream.textureVersion,savannahVersion,'Zebra reuses the uploaded Ostrich texture');
     if(live){assert(r.wallTimeMs>=36000);assert(r.samples.some(s=>s.dream.opacity>.999));const a=r.samples[0],b=r.samples.at(-1);r.renderFPS=1000*(b.frames-a.frames)/(b.elapsed-a.elapsed);assert(r.renderFPS>=12);}
     console.log('PASS '+name+' '+id);
    }
    assert.deepEqual(errors,[]);assert.deepEqual(http,[]);for(const asset of new Set(ids.map(id=>mapping[id]).filter(Boolean))){const file=JSON.parse(fs.readFileSync(path.join(app,'public/experiments/carnival/dream-worlds/manifest.json'))).assets.find(a=>a.id===asset).file;assert.equal(requests.filter(u=>u.endsWith(encodeURIComponent(file))).length,1,'Assigned image fetched once: '+asset);}result.passed=true;
   }catch(e){result.error=e.stack;console.error(e.stack);try{await p.screenshot({path:path.join(proof,`${name}-FAILURE.jpg`),type:'jpeg'});}catch{}}
   finally{try{if(!live){await p.evaluate(()=>{window.requestAnimationFrame=()=>0;});await p.waitForTimeout(500);await p.screenshot({path:path.join(proof,`outside-${live?'live':'sample'}-${name}.jpg`),type:'jpeg',quality:88,timeout:10000});}}catch{}console.log('Finalizing '+name+' capture');await p.close();await context.close();if(video)result.video=path.relative(app,await video.path()).replaceAll('\\','/');const f=path.join(proof,live?'ordinary-results.json':'sampled-results.json'),prior=only&&fs.existsSync(f)?JSON.parse(fs.readFileSync(f)).filter(r=>r.name!==name):[];fs.writeFileSync(f,JSON.stringify(only?[...prior,result]:results,null,2));}
  }
 }finally{await browser.close();await host.close();if(results.some(r=>!r.passed))process.exitCode=1;}
})().catch(e=>{console.error(e);process.exitCode=1});
