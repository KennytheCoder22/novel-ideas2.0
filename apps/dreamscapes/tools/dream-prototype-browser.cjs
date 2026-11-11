const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const app=path.resolve(__dirname,'..'),sample=process.argv.includes('--sample'),cycle=process.env.DREAMSCAPES_DREAM_CYCLE||'moon-dream',proof=path.join(app,'verification/'+cycle),out=path.join(app,'playtest-artifacts/'+cycle,sample?'sampled':'ordinary');
async function choose(p,id){for(let i=0;i<20;i++){const b=p.locator(`[data-mount-id="${id}"]`);if(await b.count()){return;}await p.getByRole('button',{name:'Next mounts',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('.carousel-choice-row')?.dataset.turning);}throw Error('Missing mount '+id);}
(async()=>{
 fs.mkdirSync(proof,{recursive:true});const host=await import('./playtest-server.mjs').then(m=>m.startPlaytestServer()),browser=await chromium.launch({executablePath:process.env.BROWSER_EXE}),only=process.argv.find(a=>a.startsWith('--case='))?.slice(7),resultFile=path.join(proof,sample?'sampled-results.json':'ordinary-results.json'),results=only&&fs.existsSync(resultFile)?JSON.parse(fs.readFileSync(resultFile)).filter(r=>!r.name.includes(only)):[];
 try{
  const cases=sample?[
   ['desktop',{width:1440,height:900},true,'moon-loveseat'],['phone',{width:390,height:844},true,'moon-loveseat'],['landscape',{width:844,height:390},true,'moon-loveseat'],
   ['normal-moon',{width:1440,height:900},false,'moon-loveseat'],['unapproved-mount',{width:390,height:844},true,'dragon'],['missing-asset',{width:1440,height:900},true,'moon-loveseat'],['reduced-motion',{width:390,height:844},true,'moon-loveseat'],['teens',{width:1440,height:900},true,'moon-loveseat'],['kids',{width:390,height:844},true,'moon-loveseat']
  ]:[['desktop',{width:1440,height:900},true,'moon-loveseat'],['phone',{width:390,height:844},true,'moon-loveseat']];
  for(const [name,viewport,preview,id]of cases){
   if(only&&!name.includes(only))continue;
   const dir=path.join(out,name);fs.mkdirSync(dir,{recursive:true});const context=await browser.newContext({viewport,isMobile:viewport.width<900,hasTouch:viewport.width<900,reducedMotion:name==='reduced-motion'?'reduce':'no-preference',...(sample?{}:{recordVideo:{dir,size:viewport}})});
   if(sample)await context.addInitScript(()=>{window.__carouselTestTime=0;const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>raf(()=>fn(100000+window.__carouselTestTime));});
   if(name==='missing-asset')await context.route('**/dream-worlds/*.png',r=>r.abort());
   const captureEpochMs=Date.now(),p=await context.newPage(),video=p.video(),errors=[],http=[],requests=[];p.setDefaultTimeout(180000);p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)http.push(r.url());});p.on('request',r=>{if(r.url().includes('/dream-worlds/'))requests.push(r.url());});
   const r={name,viewport,preview,id,ordinarySpeed:!sample,captureEpochMs,passed:false,samples:[],errors,http,requests};results.push(r);
   const snap=async label=>{const file=`${sample?'sample':'live'}-${name}-${label}.jpg`;if(!sample&&!['outside','outside-after','FAILURE'].includes(label))return file;await p.screenshot({path:path.join(proof,file),type:'jpeg',quality:90,timeout:60000});return file;};
   try{
    await p.goto(host.url+'/');await p.locator(`[data-age-band="${['teens','kids'].includes(name)?name:'adults'}"]`).click();await p.goto(host.url+'/carnival/?scene=rides-games'+(preview?'&dream-preview=moon-loveseat':''));
    await p.waitForFunction(()=>window.carouselVariantDiagnostics?.().mounts.length===20&&!carouselVariantDiagnostics().busy);
    for(let i=0;i<4;i++){const b=p.getByRole('button',{name:'Look left',exact:true});if(await b.isVisible())await b.click();}
    r.outside=await snap('outside');await choose(p,id);await p.getByRole('button',{name:'Ride '+await p.evaluate(id=>DreamscapesCarouselCatalog.byId[id].label,id),exact:true}).click();
    await p.waitForFunction(()=>DreamscapesCarouselRide.diagnostics().frames>=3);const started=Date.now(),period=await p.evaluate(()=>DreamscapesCarouselCatalog.period),atTime=t=>2800+(t-2800)*period/72000;
    for(const [oldAt,label]of [[4000,'carnival'],[36000,'first-turn'],[74000,'second-start'],[90000,'before-fade'],[95000,'transition'],[102000,'dream'],[112000,'dream-forward'],[126000,'fade-back'],[132000,'carnival-return'],[144000,'end-turn']]){
     const at=atTime(oldAt);if(name==='reduced-motion'&&oldAt!==4000)break;
     if(sample)await p.evaluate(t=>window.__carouselTestTime=t,at);
     if(name!=='reduced-motion')await p.waitForFunction(t=>DreamscapesCarouselRide.diagnostics().elapsed>=t,at);
     const d=await p.evaluate(()=>DreamscapesCarouselRide.diagnostics());if(!sample&&!d.active)break;assert(d.active);assert.equal(d.seat,id);assert(d.cameraInSeat.every((v,j)=>Math.abs(v-d.eyeLocal[j])<1e-6));
     const expected=['moon-loveseat','snail','horse','rocket','griffin','ostrich','zebra'].includes(id)&&!['missing-asset','reduced-motion'].includes(name);
     if(sample&&expected&&['first-turn','dream','dream-forward'].includes(label)){assert(d.dream.opacity>.999);assert.equal(d.dream.seamSafety,1);}
     if(!expected||sample&&['carnival','second-start','before-fade','carnival-return','end-turn'].includes(label))assert.equal(d.dream.opacity,0);
     if(sample&&expected&&['transition','fade-back'].includes(label))assert(d.dream.opacity>.05&&d.dream.opacity<.95);
     r.samples.push({...d,videoSeconds:(Date.now()-captureEpochMs)/1000,image:await snap(label)});
    }
    if(!sample){const alpha=r.samples.map(s=>s.dream.opacity);assert(alpha.some(a=>a===0));assert(alpha.some(a=>a>.05&&a<.95));assert(alpha.some(a=>a>.999));}
    if(name==='reduced-motion')await p.getByRole('button',{name:'Finish still ride',exact:true}).click();else if(sample)await p.evaluate(()=>window.__carouselTestTime=2800+DreamscapesCarouselCatalog.period*2+3800);
    await p.waitForFunction(()=>!DreamscapesCarouselRide.active,null,{timeout:210000});r.wallTimeMs=Date.now()-started;r.after=await snap('outside-after');
    const store=await p.evaluate(()=>DreamscapesObservations.snapshot());assert.equal(store.carousel.status,'complete');assert.equal(store.carousel.selected,id);assert.equal(store.events.filter(e=>e.action==='ride-completed').length,name==='reduced-motion'?0:1);if(name==='reduced-motion')assert(store.events.some(e=>e.action==='still-ride-finished'));assert.equal(store.events.filter(e=>e.schemaVersion===2).length,1);r.observations=store;
    await choose(p,'snail');assert(await p.getByRole('button',{name:'Ride Snail',exact:true}).isEnabled());r.canChooseAgain=true;
    const a=r.samples[0],b=r.samples.at(-1);r.renderFPS=sample?null:1000*(b.frames-a.frames)/(b.elapsed-a.elapsed);if(!sample){assert(r.wallTimeMs>=period*2);assert(r.renderFPS>=12);}
    assert.deepEqual(errors,[]);assert.deepEqual(http,[]);assert(requests.every(u=>u.includes('/dream-worlds/')));
    r.passed=true;
   }catch(e){r.error=e.stack;try{r.failure=await snap('FAILURE');}catch{}console.error(e.stack);}
   finally{try{await p.evaluate(()=>{window.requestAnimationFrame=()=>0;});await p.waitForTimeout(500);}catch{}await p.close();await context.close();if(video)r.video=path.relative(app,await video.path()).replaceAll('\\','/');fs.writeFileSync(path.join(proof,sample?'sampled-results.json':'ordinary-results.json'),JSON.stringify(results,null,2));console.log((r.passed?'PASS ':'FAIL ')+name);}
  }
 }finally{await browser.close();await host.close();if(results.some(r=>!r.passed))process.exitCode=1;}
})().catch(e=>{console.error(e);process.exitCode=1});
