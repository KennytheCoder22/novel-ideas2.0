const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const app=path.resolve(__dirname,'..'),out=path.resolve(process.env.DREAMSCAPES_CAROUSEL_EVIDENCE_DIR||path.join(app,'playtest-artifacts/cycle-three/selection-fixed'));
const selected=process.argv.find(a=>a.startsWith('--case='))?.slice(7),results=[];
const snapshot=p=>p.evaluate(()=>DreamscapesObservations.snapshot());
const arrived=(p,id)=>p.waitForFunction(id=>document.documentElement.dataset.location===id&&!document.documentElement.dataset.travelling,id,{timeout:180000});
async function activate(locator,input){if(input==='touch')await locator.tap({timeout:180000});else if(input==='keyboard'){await locator.focus();await locator.press('Enter');}else await locator.click({timeout:180000});}
async function openRide(p,host,band,input,{review=false}={}){
 await p.goto(host.url+'/');await activate(p.locator(`[data-age-band="${band}"]`),input);
 await activate(p.getByRole('link',{name:'Enter Creepy Carnival — Midway',exact:true}),input);
 await p.waitForFunction(()=>window.MaraMidway?.state().loaded,null,{timeout:120000});
 if(p.viewportSize().width<600)await activate(p.getByRole('button',{name:'Look left',exact:true}),input);
 await activate(p.getByRole('button',{name:'Walk toward Rides and Games',exact:true}),input);await arrived(p,'rides-games');
 const style={kids:'stuffed','pre-teens':'stuffed',teens:'plain',adults:'ornate'}[band];
 await p.waitForFunction(style=>window.carouselVariantDiagnostics?.().selected===style&&!carouselVariantDiagnostics().busy,style,{timeout:180000});
 if(p.viewportSize().width<600)for(let i=0;i<4;i++)await activate(p.getByRole('button',{name:'Look left',exact:true}),input);
 await p.getByRole('button',{name:'Select Dragon mount',exact:true}).waitFor({state:'visible',timeout:180000});return style;
}
async function preview(p,id,input){
 const seen=[];const collect=async()=>{for(const value of await p.locator('.carousel-choice-options [data-mount-id]').evaluateAll(es=>es.map(e=>e.dataset.mountId)))if(!seen.includes(value))seen.push(value);};
 for(let i=0;i<8;i++){
  await collect();const button=p.locator(`.carousel-choice-options [data-mount-id="${id}"]`);
  if(await button.count()){await activate(button,input);return seen;}
  await activate(p.getByRole('button',{name:'Next mounts',exact:true}),input);
 }
 throw Error('Mount not offered through tickets: '+id);
}
async function attachment(p,id){
 await p.waitForFunction(()=>{const yaw=Number(document.querySelector('.carousel-assembly').dataset.yaw);return [window.carouselHorseComparison,...window.carouselAnimalComparisons].every(m=>Math.abs(Math.atan2(Math.sin(m.carouselFrame.rotation.y+yaw),Math.cos(m.carouselFrame.rotation.y+yaw)))<.03)},null,{timeout:20000});
 return p.evaluate(id=>{
  const svg=document.querySelector('.carousel-dressing'),phase=Number(svg.dataset.phase),yaw=Number(svg.querySelector('.carousel-assembly').dataset.yaw),d=carouselVariantDiagnostics();
  return {elapsed:Number(svg.dataset.elapsed),phase,yaw,mounts:d.mounts.map(m=>{const slot=svg.querySelector(`[data-carousel-slot="${m.slot}"]`),anchor=slot.querySelector('.carousel-mount-anchor'),model=m.identity==='horse'?carouselHorseComparison:carouselAnimalComparisons.find(e=>e.name===m.identity);return {identity:m.identity,slot:m.slot,registration:m.registration,holder:m.holder,turn:m.turn,style:m.style,visible:m.visible,attached:anchor.querySelector('foreignObject,image')?.closest('[data-carousel-slot]')===slot,slotTransform:slot.getAttribute('transform'),expected:CarnivalCarousel.pose(m.slot-1,phase),anchor:anchor.getAttribute('transform'),collar:slot.querySelector('.carousel-crank-collar').getAttribute('transform'),shaftEnds:[...slot.querySelectorAll('.carousel-pole-shaft')].map(s=>Number(s.getAttribute('y'))+Number(s.getAttribute('height'))),renderYaw:model.carouselFrame.rotation.y,contextLost:model.renderer.getContext().isContextLost()};}),marker:(()=>{const marker=svg.querySelector('[data-selected-mount]'),m=d.mounts.find(m=>m.identity===id);return {identity:marker?.dataset.selectedMount,finite:!!marker&&[...marker.children].every(e=>Number.isFinite(Number(e.getAttribute('cy')))),attached:!!marker&&marker.parentElement===svg.querySelector(`[data-carousel-slot="${m?.slot}"] .carousel-mount-anchor`)}})()};
 },id);
}
function assertAssembly(frame,id,canonical){
 assert.equal(frame.mounts.length,20);assert.equal(frame.marker.identity,id);assert(frame.marker.attached&&frame.marker.finite);
 for(const m of frame.mounts){assert(m.attached&&m.visible&&!m.contextLost,m.identity+' model/pole assembly');assert.equal(m.anchor,m.collar);assert(m.shaftEnds.every(end=>Math.abs(end+4)<1e-5));assert(Math.abs(Math.atan2(Math.sin(m.renderYaw+frame.yaw),Math.cos(m.renderYaw+frame.yaw)))<.05);const values=m.slotTransform.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);assert(Math.abs(values[0]-m.expected.x)<1e-5);assert(Math.abs(values[1]-m.expected.y)<1e-5);}
 const stable=frame.mounts.map(({identity,slot,registration,holder,turn,style})=>({identity,slot,registration,holder,turn,style}));if(canonical)assert.deepEqual(stable,canonical);return stable;
}
(async()=>{
 const host=await import('./playtest-server.mjs').then(m=>m.startPlaytestServer()),browser=await chromium.launch({...(process.env.BROWSER_EXE?{executablePath:process.env.BROWSER_EXE}:{})});
 async function run(name,viewport,input,accelerated,fn,{reduce=false}={}){
  if(selected&&!name.includes(selected))return;const dir=path.join(out,name);fs.mkdirSync(dir,{recursive:true});
  const context=await browser.newContext({viewport,isMobile:viewport.width<600,hasTouch:viewport.width<600,reducedMotion:reduce?'reduce':'no-preference',recordVideo:{dir,size:viewport.width<600?viewport:{width:960,height:600}}});
  if(accelerated)await context.addInitScript(()=>{window.__carouselTestTime=0;const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raf(t=>cb(t+window.__carouselTestTime));});
  const p=await context.newPage(),errors=[],http=[],warnings=[];p.setDefaultTimeout(60000);p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());else if(m.type()==='warning')warnings.push(m.text())});p.on('response',r=>{if(r.status()>=400)http.push({status:r.status(),url:r.url()})});
  const result={name,viewport,input,accelerated,passed:false};results.push(result);
  const snap=label=>p.screenshot({path:path.join(dir,label+'.jpg'),type:'jpeg',quality:86,timeout:60000});
  const advance=async ms=>{await p.evaluate(ms=>window.__carouselTestTime+=ms,ms);await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
  try{result.details=await fn({p,context,dir,snap,advance,host});assert.deepEqual(errors,[]);assert.deepEqual(http,[]);result.passed=true;console.log('PASS '+name);}
  catch(e){result.error=e.stack;console.error('FAIL '+name+': '+e.message);try{await snap('FAILURE')}catch{}}
  finally{fs.writeFileSync(path.join(dir,'diagnostics.json'),JSON.stringify({errors,http,warnings},null,2));if(!p.isClosed())try{fs.writeFileSync(path.join(dir,'session.json'),JSON.stringify(await snapshot(p),null,2));}catch{}await context.close();result.videos=fs.readdirSync(dir).filter(n=>n.endsWith('.webm'));fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));}
 }
 try{
  for(const [band,viewport,input]of [['adults',{width:1440,height:900},'mouse'],['teens',{width:1440,height:900},'keyboard'],['kids',{width:390,height:844},'touch'],['pre-teens',{width:390,height:844},'keyboard']])await run('all-mounts-'+band,viewport,input,true,async({p,dir,snap,advance})=>{
   const style=await openRide(p,host,band,input);assert.equal(await p.locator('.evidence-open').count(),0);const ids=await p.evaluate(()=>DreamscapesCarouselCatalog.mounts.map(m=>m.id)),choices=[],frames=[];let canonical;
   for(let index=0;index<ids.length;index++){
    const id=ids[index];if(index)await activate(p.getByRole('button',{name:'Choose another mount',exact:true}),input);
    const seen=await preview(p,id,input),before=await snapshot(p);assert.equal(before.carousel.preview,id);assert.equal(before.events.filter(e=>e.schemaVersion===2).length,index);
    const name=await p.evaluate(id=>DreamscapesCarouselCatalog.byId[id].label,id);if(index<3)await snap('preview-'+id);
    await activate(p.getByRole('button',{name:'Ride '+name,exact:true}),input);const s=await snapshot(p),e=s.events.filter(e=>e.schemaVersion===2).at(-1);assert.equal(e.selectedAlternative,id);assert.equal(e.carousel.style,style);assert.equal(e.ageBand,band);assert.deepEqual(e.presentationOrder,seen);assert.equal(e.action,'mount-selected');choices.push(e);
    let frame=await attachment(p,id);canonical=assertAssembly(frame,id,canonical);
    if(index===0){
     for(let sample=0;sample<=16;sample++){if(sample)await advance(9050);frame=await attachment(p,id);assertAssembly(frame,id,canonical);assert.match(await p.locator('.carousel-choice-title').textContent(),new RegExp(name));assert.equal((await snapshot(p)).events.filter(e=>e.schemaVersion===2).length,1);frames.push({sample,...frame});if([0,4,8,12,16].includes(sample))await snap('two-turns-'+sample);}
    }else{await advance(18100);frame=await attachment(p,id);assertAssembly(frame,id,canonical);assert.equal((await snapshot(p)).carousel.status,'riding');await advance(54100);}
    await p.waitForFunction(()=>DreamscapesObservations.snapshot().carousel.status==='complete');if((index+1)%5===0)console.log(band+' '+(index+1)+'/20 mounts checked');assert.match(await p.locator('.carousel-choice-title').textContent(),new RegExp(name));
   }
   const s=await snapshot(p);assert.equal(s.events.filter(e=>e.schemaVersion===2).length,20);assert.equal(s.counts.tentativePreference,2);assert.equal(s.counts.explicitPreference,0);assert.equal(s.events.filter(e=>e.action==='ride-completed').length,20);assert(choices.filter(e=>!['dragon','rocket'].includes(e.selectedAlternative)).every(e=>e.category==='gameplay'));assert.equal(new Set(choices.map(e=>e.decisionId)).size,20);fs.writeFileSync(path.join(dir,'two-revolutions.json'),JSON.stringify(frames,null,2));await snap('all-twenty-complete');return {band,style,selected:ids,tentative:2,explicit:0,allAssembliesStable:true,method:'Two revolutions at sampled RAF advances plus quarter/full-turn checks for every mount; accelerated, not real-time playback.'};
  });
  await run('session-lifecycle',{width:1440,height:900},'keyboard',true,async({p,snap,advance})=>{
   await openRide(p,host,'adults','keyboard');await preview(p,'horse','keyboard');
   await activate(p.getByRole('button',{name:'Walk to Fun House',exact:true}),'keyboard');await arrived(p,'fun-house');await activate(p.getByRole('button',{name:'Walk to Rides & Games',exact:true}),'keyboard');await arrived(p,'rides-games');assert.equal((await snapshot(p)).counts.preference,0);assert.equal((await snapshot(p)).events.filter(e=>e.schemaVersion===2).length,0);
   await preview(p,'dragon','keyboard');await activate(p.getByRole('button',{name:'Ride Dragon',exact:true}),'keyboard');const first=(await snapshot(p)).carousel;
   const duplicate=await p.evaluate(()=>DreamscapesObservations.carouselRide(DreamscapesObservations.snapshot().carousel.rideId));assert.equal(duplicate.accepted,false);
   await p.reload();await p.waitForFunction(()=>window.MaraMidway?.state().loaded,null,{timeout:120000});await activate(p.getByRole('button',{name:'Walk toward Rides and Games',exact:true}),'keyboard');await arrived(p,'rides-games');await p.getByRole('button',{name:'Riding Dragon',exact:true}).waitFor({state:'visible',timeout:180000});assert.equal((await snapshot(p)).carousel.rideId,first.rideId);assert.equal((await snapshot(p)).events.filter(e=>e.schemaVersion===2).length,1);await snap('restored-choice');await advance(72200);await p.waitForFunction(()=>DreamscapesObservations.snapshot().carousel.status==='complete');
   await activate(p.getByRole('button',{name:'Choose another mount',exact:true}),'keyboard');await preview(p,'dragon','keyboard');await activate(p.getByRole('button',{name:'Ride Dragon',exact:true}),'keyboard');let s=await snapshot(p);assert.equal(s.counts.tentativePreference,1);assert.equal(s.events.filter(e=>e.schemaVersion===2).at(-1).interpretation.status,'repeat-suppressed');await advance(72200);await p.waitForFunction(()=>DreamscapesObservations.snapshot().carousel.status==='complete');
   await p.goto(host.url+'/');await p.locator('[data-age-band="kids"]').click();await p.goto(host.url+'/carnival/?scene=rides-games&observations=1');await arrived(p,'rides-games');await p.waitForFunction(()=>carouselVariantDiagnostics?.().selected==='stuffed'&&!carouselVariantDiagnostics().busy,null,{timeout:180000});await preview(p,'rocket','keyboard');await activate(p.getByRole('button',{name:'Ride Rocket',exact:true}),'keyboard');s=await snapshot(p);assert.equal(s.events.filter(e=>e.schemaVersion===2).at(-1).carousel.style,'stuffed');assert.equal(s.events.filter(e=>e.schemaVersion===2).at(-1).ageBand,'kids');assert.equal(s.counts.tentativePreference,2);
   await p.getByRole('button',{name:'Evidence inspector',exact:true}).click();assert.match(await p.locator('[data-carousel-evidence]').textContent(),/tentative/);await snap('inspector-tentative');await p.getByRole('button',{name:'Close inspector',exact:true}).click();
   await p.evaluate(()=>sessionStorage.setItem('dreamscapes.observations.v1','bad-json'));await p.reload();await arrived(p,'rides-games');await p.getByRole('button',{name:'Select Dragon mount',exact:true}).waitFor({state:'visible',timeout:180000});assert.equal((await snapshot(p)).counts.preference,0);assert((await snapshot(p)).diagnostics.discarded>0);
   await p.evaluate(()=>sessionStorage.removeItem('dreamscapes.observations.v1'));await p.reload();await arrived(p,'rides-games');await p.getByRole('button',{name:'Select Dragon mount',exact:true}).waitFor({state:'visible',timeout:180000});assert.equal((await snapshot(p)).counts.preference,0);return {reloadPreserved:true,duplicateRejected:true,repeatedFamilySuppressed:true,skipIsNeutral:true,ageTransitionAccurate:true,corruptAndMissingRecovered:true};
  });
  await run('reduced-motion',{width:390,height:844},'touch',false,async({p,snap})=>{
   await openRide(p,host,'pre-teens','touch');await preview(p,'rocket','touch');await activate(p.getByRole('button',{name:'Ride Rocket',exact:true}),'touch');await p.getByRole('button',{name:'Finish still ride',exact:true}).waitFor();await snap('still-choice');await activate(p.getByRole('button',{name:'Finish still ride',exact:true}),'touch');const s=await snapshot(p);assert(s.events.some(e=>e.action==='still-ride-finished'));assert(!s.events.some(e=>e.action==='ride-completed'));return {stillPreserved:true,falseRevolutions:0};
  },{reduce:true});
  for(const [name,viewport,band,input]of [['desktop',{width:1440,height:900},'adults','mouse'],['phone',{width:390,height:844},'kids','touch']])await run('live-one-turn-'+name,viewport,input,false,async({p,snap})=>{
   await openRide(p,host,band,input);await preview(p,'dragon',input);await snap('before-ride');await activate(p.getByRole('button',{name:'Ride Dragon',exact:true}),input);const started=Date.now(),elapsed=await p.locator('.carousel-dressing').getAttribute('data-elapsed');await snap('ride-start');
   await p.waitForFunction(start=>Number(document.querySelector('.carousel-dressing').dataset.elapsed)-start>=36000,Number(elapsed),{timeout:90000});assertAssembly(await attachment(p,'dragon'),'dragon');await snap('half-turn');
   await p.waitForFunction(()=>DreamscapesObservations.snapshot().carousel.status==='complete',null,{timeout:120000});await snap('full-turn');await p.waitForFunction(start=>Number(document.querySelector('.carousel-dressing').dataset.elapsed)-start>=80000,Number(elapsed),{timeout:30000});await snap('second-turn');const s=await snapshot(p);assert.equal(s.events.filter(e=>e.schemaVersion===2).length,1);return {unaccelerated:true,wallTimeMs:Date.now()-started,selected:'dragon',completion:s.events.find(e=>e.action==='ride-completed')?.details};
  });
 }finally{await browser.close();await host.close();if(!results.length||results.some(r=>!r.passed))process.exitCode=1;console.log('Evidence: '+out);}
})().catch(e=>{console.error(e);process.exitCode=1});
