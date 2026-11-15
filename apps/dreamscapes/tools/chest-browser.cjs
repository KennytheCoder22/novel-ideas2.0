const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const app=path.resolve(__dirname,'..');
(async()=>{
 const host=process.env.BASE_URL?{url:process.env.BASE_URL,close:async()=>{}}:await import('./playtest-server.mjs').then(m=>m.startPlaytestServer({root:path.join(app,'dist')}));
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE});
 const out=path.resolve(process.env.CHEST_EVIDENCE||path.join(app,'verification/chest'));
 fs.mkdirSync(out,{recursive:true});const results=[];
 try{for(const band of (process.env.TEST_BANDS||'adults,teens,pre-teens,kids').split(','))for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},hasTouch:mobile,isMobile:mobile,reducedMotion:band==='pre-teens'?'reduce':'no-preference'});
  const p=await context.newPage();p.setDefaultTimeout(180000);
  const errors=[],failed=[],result={band,mobile,passed:false};results.push(result);
  p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)failed.push(r.status()+' '+r.url());});
  await p.addInitScript(b=>{
   // Keep pixel captures on one raster backend: reading pixels otherwise makes
   // Edge switch from GPU to CPU between the locked and unlocked snapshots.
   const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,options){return get.call(this,type,type==='2d'?{...options,willReadFrequently:true}:options);};
   localStorage.setItem('dreamscapes.age-band',b);
   window.__padlockPuzzleOpenings=0;window.__lightReturns=0;window.__tourScenes=[];
   const show=HTMLDialogElement.prototype.showModal;
   HTMLDialogElement.prototype.showModal=function(){if(this.classList.contains('chest-puzzle'))window.__padlockPuzzleOpenings++;return show.call(this);};
   document.addEventListener('dreamscapes-borrowed-light-returned',()=>window.__lightReturns++);
   const observe=()=>new MutationObserver(()=>{if(document.documentElement.dataset.chestTour)window.__tourScenes.push(document.documentElement.dataset.location);}).observe(document.documentElement,{attributes:true,attributeFilter:['data-location']});
   if(document.documentElement)observe();else document.addEventListener('DOMContentLoaded',observe,{once:true});
  },band);
  const snap=()=>p.evaluate(()=>DreamscapesCycleSeven.snapshot());
  const ready=()=>p.waitForFunction(()=>window.DreamscapesCycleSeven&&document.documentElement.dataset.location==='fortune-teller'&&!document.documentElement.dataset.travelling&&document.querySelector('.chest-solid')?.dataset.lockState);
  const shot=name=>p.screenshot({path:path.join(out,`${band}-${mobile?'mobile':'desktop'}-${name}.png`)});
  const activate=async locator=>{await locator.focus();if(mobile)await locator.tap();else await locator.press('Enter');};
  const assertLock=async unlocked=>{
   assert.equal((await snap()).unlocked,unlocked);
   assert.equal(await p.locator('.chest-lock').getAttribute('data-lock-state'),unlocked?'unlocked':'locked');
   assert.equal(await p.locator('.chest-solid').getAttribute('data-lock-state'),unlocked?'unlocked':'locked');
   assert.equal(await p.locator('.chest-lock').evaluate(e=>e.classList.contains('unlocked')),unlocked);
   assert.match(await p.locator('.chest-lock').getAttribute('aria-label'),unlocked?/unlocked chest/:/Examine the padlock/);
  };
  const solve=async()=>{
   const solution=await p.evaluate(()=>{
    const queue=[[DreamscapesCycleSeven.snapshot().wheels,[]]],seen=new Set();
    while(queue.length){const [w,steps]=queue.shift();if(w.every(v=>v===0))return steps;if(seen.has(w.join()))continue;seen.add(w.join());for(let i=0;i<3;i++)queue.push([w.map((v,j)=>(v+(j===i||j===(i+1)%3?1:0))%4),[...steps,i]]);}
   });
   assert(solution?.length);for(const i of solution)await activate(p.locator('.chest-gears button').nth(i));
   await p.waitForFunction(()=>DreamscapesCycleSeven.snapshot().unlocked);
  };
  const idle=()=>p.waitForFunction(()=>DreamscapesCycleSeven.snapshot().phase==='idle'&&DreamscapesCycleSeven.snapshot().completed);
  const replayAndSkip=async()=>{
   const openings=await p.evaluate(()=>window.__padlockPuzzleOpenings),round=(await snap()).round;
   await activate(p.locator('.chest-lock'));
   await p.waitForFunction(()=>DreamscapesCycleSeven.snapshot().phase!=='idle');
   await p.locator('.chest-skip:not([hidden])').waitFor();await activate(p.locator('.chest-skip'));
   await idle();assert.equal((await snap()).round,round+1);
   assert.equal(await p.evaluate(()=>window.__padlockPuzzleOpenings),openings,'Replay must never reopen the lock puzzle');
   assert.equal(await p.locator('.chest-puzzle').evaluate(e=>e.open),false);await assertLock(true);
  };
  try{
   await p.goto(host.url+'/carnival/?scene=fortune-teller',{waitUntil:'commit'});await ready();await assertLock(false);
   await p.locator('.chest-lock').focus();await p.locator('.chest-lock').evaluate(e=>e.blur());await shot('initial-locked');
   const hinge=await p.locator('.chest-solid').getAttribute('data-hinge');
   assert.equal(await p.locator('.chest-solid').getAttribute('data-model'),'Zora_Trunk_Prepared');
   await activate(p.locator('.chest-lock'));await p.locator('.chest-puzzle[open]').waitFor();await assertLock(false);
   await activate(p.getByRole('button',{name:'Reset the linked wheels',exact:true}));await assertLock(false);
   await solve();await assertLock(true);
   const released=await p.evaluate(b=>JSON.parse(sessionStorage.getItem('dreamscapes.chest.v1.'+b)),band);
   assert.equal(released.unlocked,true);assert.equal(released.completed,false,'Unlock is saved before the journey completes');
   await p.locator('.chest-puzzle[open]').waitFor({state:'hidden'});
   await p.waitForFunction(()=>DreamscapesCycleSeven.snapshot().phase==='tour');
   assert.equal(await p.locator('.chest-solid').getAttribute('data-hinge'),hinge);await shot('open-journey');
   await idle();await assertLock(true);await shot('returned-unlocked');
   assert.equal(await p.locator('.chest-solid').getAttribute('data-progress'),'0');
   assert.equal(await p.locator('.chest-solid').getAttribute('data-hinge'),hinge);
   assert.equal(await p.evaluate(()=>window.__lightReturns),1);
   assert.equal(await p.evaluate(()=>DreamscapesCycleEight.snapshot().awakened),true);
   const scenes=await p.evaluate(()=>window.__tourScenes);
   for(const id of ['rides-games','skee-ball','ferris-platform','midway','tent-row','behind-carnival','forest-edge','fortune-teller'])assert(scenes.includes(id),'Tour preserved: '+id);
   // The approved GLB replaces the former 2D pixel patch. Check the actual
   // rendered asset and fixed hinge; its shackle is independently animated.
   assert(Number(await p.locator('.chest-solid').getAttribute('data-triangles'))>150000);
   assert.equal(await p.locator('.chest-cleanup').count(),1);
   console.log('PASS full journey and artwork '+band+' '+(mobile?'mobile':'desktop'));
   assert.equal(await p.evaluate(()=>[...document.querySelectorAll('.carousel-horse-3d-comparison,.carousel-animal-3d-comparison')].some(e=>e.checkVisibility({visibilityProperty:true}))),false);
   await replayAndSkip();await shot('replayed-unlocked');
   await p.reload({waitUntil:'commit'});await ready();await assertLock(true);await replayAndSkip();
   await activate(p.locator('[data-scene="fortune-teller"] .room-route[data-to="rides-games"]'));
   await p.waitForFunction(()=>document.documentElement.dataset.location==='rides-games'&&!document.documentElement.dataset.travelling);
   await activate(p.locator('[data-scene="rides-games"] .room-route[data-to="fortune-teller"]'));
   await ready();await assertLock(true);
   // A different age still has its original lock and puzzle; returning restores this unlock.
   const other=band==='kids'?'adults':'kids';
   await p.evaluate(async b=>(await import('/age-band.js')).selectAgeBand(b),other);await assertLock(false);
   await activate(p.locator('.chest-lock'));await p.locator('.chest-puzzle[open]').waitFor();
   await p.evaluate(async b=>(await import('/age-band.js')).selectAgeBand(b),band);await assertLock(true);
   assert.equal(await p.locator('.chest-puzzle').evaluate(e=>e.open),false);
   // Existing completed saves migrate without requiring another solve.
   await p.evaluate(b=>sessionStorage.setItem('dreamscapes.chest.v1.'+b,JSON.stringify({round:1,completed:true,fallen:true})),band);
   await p.reload({waitUntil:'commit'});await ready();await assertLock(true);
   if(band==='pre-teens'&&mobile){
    await activate(p.locator('.chest-lock'));await p.waitForFunction(()=>DreamscapesCycleSeven.snapshot().phase==='tour');
    await p.evaluate(async b=>(await import('/age-band.js')).selectAgeBand(b),other);
    await p.waitForFunction(b=>DreamscapesCycleSeven.snapshot().phase==='idle'&&DreamscapesCycleSeven.snapshot().age===b,other);
    await assertLock(false);await p.evaluate(async b=>(await import('/age-band.js')).selectAgeBand(b),band);await assertLock(true);
    result.ageSwitchDuringReplay=true;
   }
   // An intentional chest-save reset restores the original first-time interaction.
   await p.evaluate(b=>sessionStorage.removeItem('dreamscapes.chest.v1.'+b),band);
   await p.reload({waitUntil:'commit'});await ready();await assertLock(false);assert.equal((await snap()).completed,false);
   await activate(p.locator('.chest-lock'));await p.locator('.chest-puzzle[open]').waitFor();await shot('reset-locked-puzzle');
   await activate(p.getByRole('button',{name:'Close the padlock puzzle',exact:true}));await assertLock(false);
   if(band==='teens'&&!mobile){
    await activate(p.locator('.chest-lock'));await p.locator('.chest-puzzle[open]').waitFor();await solve();
    await p.reload({waitUntil:'commit'});await ready();await assertLock(true);assert.equal((await snap()).completed,false);
    await activate(p.locator('.chest-lock'));await p.waitForFunction(()=>DreamscapesCycleSeven.snapshot().phase==='tour');
    assert.equal(await p.evaluate(()=>window.__padlockPuzzleOpenings),0);await idle();await assertLock(true);
    result.reloadAfterReleaseBeforeCompletion=true;
   }
   assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
   result.passed=true;result.fullJourney=true;result.puzzleFreeReplay=true;result.reload=true;result.reset=true;result.ageIsolation=true;result.legacySave=true;
   console.log('PASS padlock '+band+' '+(mobile?'mobile':'desktop'));
  }catch(e){result.error=e.stack;console.error(e.stack);try{await shot('FAILURE');}catch{}process.exitCode=1;}
  finally{result.errors=errors;result.failedRequests=failed;await context.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));}
 }}finally{await browser.close();await host.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
