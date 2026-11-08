const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const app=path.resolve(__dirname,'..'),out=path.resolve(process.env.DREAMSCAPES_OBSERVATION_EVIDENCE_DIR||path.join(app,'playtest-artifacts/cycle-two/observations')),results=[];
const selected=process.argv.find(a=>a.startsWith('--case='))?.slice(7);
const read=page=>page.evaluate(()=>DreamscapesObservations.snapshot());
(async()=>{
 const host=await import('./playtest-server.mjs').then(m=>m.startPlaytestServer());
 const browser=await chromium.launch({...(process.env.BROWSER_EXE?{executablePath:process.env.BROWSER_EXE}:{})});
 async function run(name,viewport,fn){
  if(selected&&!name.includes(selected))return;
  const dir=path.join(out,name);fs.mkdirSync(dir,{recursive:true});
  const context=await browser.newContext({viewport,isMobile:viewport.width<600,hasTouch:viewport.width<600,recordVideo:{dir,size:viewport}}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url())});
  const result={name,viewport,passed:false};results.push(result);
  try{result.details=await fn({page,context,dir});assert.deepEqual(errors,[]);result.passed=true;console.log('PASS '+name);}
  catch(error){result.error=error.stack;console.error('FAIL '+name+': '+error.message);try{await page.screenshot({path:path.join(dir,'failure.jpg'),timeout:60000});}catch{}}
  finally{result.errors=errors;await context.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));}
 }
 try{
  for(const [name,viewport,band]of [['desktop',{width:1440,height:900},'teens'],['phone',{width:390,height:844},'kids']])await run('session-'+name,viewport,async({page,dir})=>{
   await page.goto(host.url+'/');assert.equal(await page.locator('.evidence-open').count(),0);
   await page.locator(`[data-age-band="${band}"]`).click();const opening=await read(page);assert.equal(opening.ageBand,band);assert.equal(opening.counts.preference,0);
   const configured=opening.events.find(e=>e.interactionId==='age-band');assert.equal(configured.selectedAlternative,band);assert.equal(configured.alternatives.length,4);
   await page.reload();assert.equal((await read(page)).sessionId,opening.sessionId);assert.equal((await read(page)).events.filter(e=>e.interactionId==='age-band').length,1);
   await page.getByRole('link',{name:'Enter Creepy Carnival — Midway',exact:true}).click();await page.waitForFunction(()=>window.DreamscapesObservations?.snapshot().currentScene==='midway');
   assert.equal((await read(page)).sessionId,opening.sessionId);assert.equal(await page.locator('.evidence-open').count(),0);
   await page.goto(host.url+'/carnival/?scene=fun-house&observations=1');await page.waitForFunction(()=>document.documentElement.dataset.location==='fun-house'&&!document.documentElement.dataset.travelling);
   for(const kind of ['tall','wide','endless']){const mirror=page.getByRole('button',{name:`Examine the ${kind} mirror`,exact:true});await mirror.focus();await mirror.press('Enter');}
   const first=await read(page),mirrors=first.events.filter(e=>e.interactionId==='mirror');assert.equal(mirrors.length,3);assert.deepEqual(mirrors[0].presentationOrder,['tall','wide','endless']);assert(mirrors.every(e=>e.category==='exploration'&&!e.preferenceSupported));
   await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.location==='fun-house'&&!document.documentElement.dataset.travelling);
   const reload=await read(page);assert.equal(reload.sessionId,first.sessionId);assert.equal(reload.events.filter(e=>e.interactionId==='mirror').length,3);assert.equal(reload.events.filter(e=>e.sceneId==='fun-house'&&e.action==='entered').length,1,'Reload does not invent another visit');
   for(const kind of ['tall','wide','endless']){const mirror=page.getByRole('button',{name:`Examine the ${kind} mirror`,exact:true});await mirror.focus();await mirror.press('Enter');}
   await page.getByRole('button',{name:'Walk to Tent Row',exact:true}).click();await page.waitForFunction(()=>document.documentElement.dataset.location==='tent-row'&&!document.documentElement.dataset.travelling);
   const final=await read(page);assert.equal(final.events.filter(e=>e.interactionId==='mirror').length,6,'Repeated behavior remains observable');assert.equal(final.counts.preference,0);
   // Re-delivery of a real accepted event is rejected by occurrence ID, not counted twice.
   const duplicate=await page.evaluate(()=>{const s=DreamscapesObservations.snapshot(),e=s.events.find(e=>e.interactionId==='mirror');return DreamscapesObservations.record({sceneId:e.sceneId,interactionId:e.interactionId,category:e.category,action:e.action,alternatives:e.alternatives,selectedAlternative:e.selectedAlternative,presentationOrder:e.presentationOrder,occurrenceId:e.occurrenceId,details:e.details})});assert.equal(duplicate.reason,'duplicate_occurrence');
   await page.getByRole('button',{name:'Evidence inspector',exact:true}).click();await page.getByRole('dialog',{name:'Dreamscapes evidence inspector'}).waitFor();
   assert.match(await page.locator('[data-evidence-summary]').textContent(),/Preference-classified observations: 0/);await page.screenshot({path:path.join(dir,'inspector.jpg'),type:'jpeg',quality:86,timeout:60000});
   const snapshot=await read(page);fs.writeFileSync(path.join(dir,'session.json'),JSON.stringify(snapshot,null,2));return {sessionId:snapshot.sessionId,counts:snapshot.counts,diagnostics:snapshot.diagnostics};
  });
  await run('age-bands-and-storage',{width:1440,height:900},async({page,context})=>{
   await page.goto(host.url+'/');const session=(await read(page)).sessionId;
   for(const band of ['kids','pre-teens','teens','adults']){await page.locator(`[data-age-band="${band}"]`).click();assert.equal((await read(page)).ageBand,band);}
   assert.equal((await read(page)).sessionId,session);assert.equal((await read(page)).counts.preference,0);
   await page.evaluate(()=>sessionStorage.setItem('dreamscapes.observations.v1','not-json'));await page.reload();const recovered=await read(page);assert.equal(recovered.counts.preference,0);assert(recovered.diagnostics.discarded>0);
   await page.evaluate(()=>{sessionStorage.removeItem('dreamscapes.observations.v1');sessionStorage.setItem('carnival-experiment-observations',JSON.stringify([{type:'object_inspected',target:'poster',at:1234},{type:'destination_chosen',target:'Rides & Games',at:1235},{type:'object_inspected',target:'person@example.com',at:1236}]))});
   await page.reload();let s=await read(page);assert.equal(s.events.filter(e=>e.origin==='legacy').length,2);assert.equal(s.counts.preference,0);await page.reload();s=await read(page);assert.equal(s.events.filter(e=>e.origin==='legacy').length,2);
   await page.evaluate(()=>sessionStorage.removeItem('dreamscapes.observations.v1'));await page.reload();assert.equal((await read(page)).counts.preference,0);
   // Verify the inspector cannot be enabled on a non-loopback host even with the query flag.
   await context.route('http://dreamscapes.invalid/**',route=>{const url=new URL(route.request().url());return route.fulfill({status:200,contentType:url.pathname.endsWith('.js')?'text/javascript':'text/html',body:url.pathname.endsWith('.js')?fs.readFileSync(path.join(app,'public/observation-inspector.js')):'<script src="/observation-inspector.js"></script>'})});
   await page.goto('http://dreamscapes.invalid/?observations=1');assert.equal(await page.locator('.evidence-open').count(),0);
   return {ageBands:4,corruptionRecovered:true,legacyOnce:true,nonLoopbackInspectorAbsent:true};
  });
  await run('inspector-copy-export',{width:1440,height:900},async({page,context,dir})=>{
   await context.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copiedAnonymous=text}}}));
   await page.goto(host.url+'/carnival/?motion=still&observations=1');await page.getByRole('button',{name:'Evidence inspector',exact:true}).click();const copy=page.getByRole('button',{name:'Copy anonymous session report',exact:true});await copy.click();
   await page.waitForFunction(()=>!!window.__copiedAnonymous);let exported=await page.evaluate(()=>JSON.parse(window.__copiedAnonymous));assert.equal(exported.sessionId,(await read(page)).sessionId);assert.equal(exported.counts.preference,0);assert(!JSON.stringify(exported).includes('@'));
   await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('clipboard denied')}});await copy.click();const fallback=page.getByRole('textbox',{name:'Anonymous session report',exact:true});await fallback.waitFor({state:'visible'});exported=JSON.parse(await fallback.inputValue());assert.equal(exported.sessionId,(await read(page)).sessionId);await page.screenshot({path:path.join(dir,'copy-fallback.jpg'),type:'jpeg',quality:85,timeout:60000});return {clipboardPayloadValidated:true,denialFallbackValidated:true};
  });
  await run('midway-additional-actions',{width:1440,height:900},async({page,dir})=>{
   await page.goto(host.url+'/carnival/?motion=still&observations=1');await page.waitForFunction(()=>window.DreamscapesObservations?.snapshot().currentScene==='midway');
   const poster=page.getByRole('button',{name:'Examine the old carnival poster',exact:true});await poster.focus();await poster.press('Enter');await page.getByRole('button',{name:'← Return to the midway',exact:true}).click();
   const figure=page.getByRole('button',{name:'Walk toward the distant figure',exact:true});await figure.focus();await figure.press('Enter');
   await page.waitForFunction(()=>document.querySelector('.composition').style.transform.includes('scale(3.4)'));
   const puddle=page.getByRole('button',{name:'Look into the puddle',exact:true});await puddle.focus();await puddle.press('Enter');await page.getByRole('button',{name:'← Return to the midway',exact:true}).click();await page.keyboard.press('Escape');await page.locator('.midway-retreat').waitFor({state:'hidden'});
   await page.locator('.balloon-surface').hover();await page.mouse.move(1400,800);await page.locator('.balloon-surface').hover();
   const s=await read(page);assert(s.events.some(e=>e.interactionId==='poster'&&e.action==='inspected'));assert(s.events.some(e=>e.interactionId==='puddle'&&e.action==='inspected'));assert.equal(s.events.filter(e=>e.action==='approach-started').length,1);assert.equal(s.events.filter(e=>e.action==='retreat-started').length,1);assert.equal(s.events.filter(e=>e.interactionId==='balloon').length,1);assert.equal(s.counts.preference,0);assert(s.events.every(e=>e.category==='exploration'));
   fs.writeFileSync(path.join(dir,'session.json'),JSON.stringify(s,null,2));await page.screenshot({path:path.join(dir,'midway.jpg'),type:'jpeg',quality:85,timeout:60000});return {counts:s.counts,diagnostics:s.diagnostics};
  });
  await run('storage-and-crypto-resilience',{width:390,height:844},async({page,context})=>{
   await context.addInitScript(()=>{Object.defineProperty(window,'crypto',{value:undefined,configurable:true});Storage.prototype.getItem=function(){throw Error('storage denied')};Storage.prototype.setItem=function(){throw Error('storage denied')};});
   await page.goto(host.url+'/');await page.locator('[data-age-band="kids"]').click();const s=await read(page);assert(s.events.length>=2);assert(s.diagnostics.storageFailures>0);assert.equal(s.persistence,'memory-only');assert.equal(s.ageBand,'kids','Accepted in-memory age selection remains accurate without storage');assert.equal(s.counts.preference,0);assert.equal(await page.locator('.evidence-open').count(),0);return {memoryOnly:true,cryptoOptional:true,ageContext:s.ageBand,counts:s.counts};
  });
  await run('synthetic-contract-only',{width:1440,height:900},async({page,dir})=>{
   await page.goto(host.url+'/');
   const exercise=async reload=>page.evaluate(reload=>{
    const storage={getItem:key=>sessionStorage.getItem('fixture.'+key),setItem:(key,value)=>sessionStorage.setItem('fixture.'+key,value)};
    const catalog={'fixture-story-choice':{sceneId:'fixture',alternatives:[{id:'fantasy',label:'Fantasy story (synthetic test fixture)',attributes:[{dimension:'genres',value:'fantasy',rationale:'The test label explicitly describes fantasy.'}]},{id:'science-fiction',label:'Science-fiction story (synthetic test fixture)',attributes:[{dimension:'genres',value:'science-fiction',rationale:'The test label explicitly describes science fiction.'}]}]}};
    const store=DreamscapesObservationCore.createStore({storage,ageBand:()=> 'teens',catalog,origin:'test_fixture'});store.enterScene('fixture');
    const p=store.presentDecision('fixture-story-choice',['science-fiction','fantasy']);
    if(!reload){store.record({sceneId:'fixture',interactionId:'fixture-navigation',category:'exploration',action:'visited'});store.record({sceneId:'fixture',interactionId:'fixture-game',category:'gameplay',action:'scored',details:{points:20}});store.commitDecision(p.presentationId,'fantasy');}
    const duplicate=store.commitDecision(p.presentationId,'fantasy');
    if(reload){store.enterScene('midway');store.enterScene('fixture');const later=store.presentDecision('fixture-story-choice');store.commitDecision(later.presentationId,'science-fiction');}
    return {snapshot:store.snapshot(),duplicate,live:DreamscapesObservations.snapshot().counts};
   },reload);
   const first=await exercise(false);assert.equal(first.duplicate.reason,'duplicate_occurrence');assert.equal(first.snapshot.events.filter(e=>e.category==='preference').length,1);await page.reload();const second=await exercise(true);assert.equal(second.duplicate.reason,'duplicate_occurrence');assert.equal(second.snapshot.events.filter(e=>e.category==='preference').length,2);assert.equal(second.live.preference,0);assert(second.snapshot.events.every(e=>e.origin==='test_fixture'));
   fs.writeFileSync(path.join(dir,'synthetic-session.json'),JSON.stringify({warning:'SYNTHETIC CONTRACT FIXTURE — not player evidence or a shipped narrative choice',...second},null,2));return {fixtureDecisions:2,playerPreferences:0,reloadDeduped:true,allCategories:[...new Set(second.snapshot.events.map(e=>e.category))]};
  });
 }finally{await browser.close();await host.close();if(!results.length||results.some(r=>!r.passed))process.exitCode=1;console.log('Evidence: '+out);}
})().catch(error=>{console.error(error);process.exitCode=1});
