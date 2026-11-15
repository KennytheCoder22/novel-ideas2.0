const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const host=process.env.BASE_URL?{url:process.env.BASE_URL,close:async()=>{}}:await import('./playtest-server.mjs').then(m=>m.startPlaytestServer({root:path.resolve('dist')}));
 console.log('Launching focused browser');const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE});const out=path.resolve('verification/glb-integration');fs.mkdirSync(out,{recursive:true});const results=[];
 try{for(const mobile of (process.env.MOBILE_ONLY?[true]:process.env.DESKTOP_ONLY?[false]:[false,true])){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?2:1});console.log('Creating page',mobile);const page=await context.newPage();console.log('Page ready');page.setDefaultTimeout(120000);
  const result={mobile,passed:false},errors=[],failed=[];results.push(result);let downloads=0;
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(`${r.status()} ${r.url()}`);if(r.url().endsWith('/zora-trunk.glb'))downloads++;});
  // Test-only handle to the actual scene's instance for exact review poses.
  await page.route('**/cycle-seven/trunk-renderer.mjs',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('return {ready,canvas,pose','return window.__reviewTrunk={ready,canvas,pose')});});
  await page.addInitScript(()=>{
   localStorage.setItem('dreamscapes.age-band','adults');window.__puzzles=0;window.__returns=0;window.__tour=[];window.__frames=[];
   const show=HTMLDialogElement.prototype.showModal;HTMLDialogElement.prototype.showModal=function(){if(this.classList.contains('chest-puzzle'))__puzzles++;return show.call(this);};
   document.addEventListener('dreamscapes-borrowed-light-returned',()=>__returns++);
   document.addEventListener('DOMContentLoaded',()=>{new MutationObserver(()=>{if(document.documentElement.dataset.chestTour)__tour.push(document.documentElement.dataset.location);}).observe(document.documentElement,{attributes:true,attributeFilter:['data-location']});});
   let previous;function frame(t){const c=document.querySelector('.chest-solid'),p=Number(c?.dataset.progress);if(p>0&&p<1&&previous)__frames.push({interval:t-previous,draw:Number(c.dataset.drawMs)});previous=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);
  });
  const ready=()=>page.waitForFunction(()=>window.DreamscapesCycleSeven&&document.documentElement.dataset.location==='fortune-teller'&&!document.documentElement.dataset.travelling&&document.querySelector('.chest-solid')?.dataset.model==='Zora_Trunk_Prepared');
  const snap=()=>page.evaluate(()=>DreamscapesCycleSeven.snapshot());const shot=name=>page.screenshot({path:path.join(out,`${mobile?'mobile':'desktop'}-${name}.png`)});
  const activate=async locator=>{await locator.focus();if(mobile)await locator.tap();else await locator.press('Enter');};
  const lock=async state=>{assert.equal((await snap()).unlocked,state);assert.equal(await page.locator('.chest-solid').getAttribute('data-lock-state'),state?'unlocked':'locked');assert.equal(await page.locator('.chest-lock').getAttribute('data-lock-state'),state?'unlocked':'locked');};
  const solve=async()=>{const steps=await page.evaluate(()=>{const q=[[DreamscapesCycleSeven.snapshot().wheels,[]]],seen=new Set();while(q.length){const [w,s]=q.shift();if(w.every(x=>x===0))return s;if(seen.has(w.join()))continue;seen.add(w.join());for(let i=0;i<3;i++)q.push([w.map((v,j)=>(v+(j===i||j===(i+1)%3?1:0))%4),[...s,i]]);}});assert(steps.length);for(const i of steps)await activate(page.locator('.chest-gears button').nth(i));};
  const idle=()=>page.waitForFunction(()=>DreamscapesCycleSeven.snapshot().completed&&DreamscapesCycleSeven.snapshot().phase==='idle');
  try{
   console.log('Entering Zora');const start=Date.now();await page.goto(host.url+'/carnival/?scene=fortune-teller',{waitUntil:'commit'});console.log('Navigation committed');await ready();console.log('Zora ready');result.sceneReadyMs=Date.now()-start;await lock(false);
   await page.locator('.chest-lock').focus();await page.locator('.chest-lock').evaluate(e=>e.blur());await shot('closed');
   assert.equal(await page.locator('.chest-solid').getAttribute('data-triangles'),'230911');const hinge=await page.locator('.chest-solid').getAttribute('data-hinge');
   await activate(page.locator('.chest-lock'));await page.locator('.chest-puzzle[open]').waitFor();await activate(page.getByRole('button',{name:'Reset the linked wheels',exact:true}));console.log('Puzzle ready');await solve();console.log('Puzzle solved');await lock(true);
   await page.waitForFunction(()=>DreamscapesCycleSeven.snapshot().phase==='emerging');await shot('open-journey');await idle();console.log('Journey completed');await lock(true);
   assert.equal(await page.evaluate(()=>__returns),1);assert.equal(await page.locator('.chest-solid').getAttribute('data-progress'),'0');assert.equal(await page.locator('.chest-solid').getAttribute('data-hinge'),hinge);
   const scenes=await page.evaluate(()=>__tour);for(const id of ['rides-games','skee-ball','ferris-platform','midway','tent-row','behind-carnival','forest-edge','fortune-teller'])assert(scenes.includes(id),id);
   assert.equal(await page.evaluate(()=>DreamscapesCycleEight.snapshot().awakened),true);
   result.performance=await page.evaluate(()=>{const percentile=(a,n)=>a.sort((x,y)=>x-y)[Math.floor((a.length-1)*n)];return {samples:__frames.length,frameMedianMs:percentile(__frames.map(x=>x.interval),.5),frameP95Ms:percentile(__frames.map(x=>x.interval),.95),drawP95Ms:percentile(__frames.map(x=>x.draw),.95)};});
   for(const [label,value]of [['returned-unlocked',0],['half-open',.5],['fully-open',1]]){await page.evaluate(p=>__reviewTrunk.pose(p),value);await shot(label);}await page.evaluate(()=>__reviewTrunk.pose(0));
   const puzzles=await page.evaluate(()=>__puzzles);await activate(page.locator('.chest-lock'));await page.locator('.chest-skip:not([hidden])').waitFor();await activate(page.locator('.chest-skip'));await idle();await lock(true);assert.equal(await page.evaluate(()=>__puzzles),puzzles);
   await activate(page.locator('[data-scene="fortune-teller"] .room-route[data-to="rides-games"]'));await page.waitForFunction(()=>document.documentElement.dataset.location==='rides-games'&&!document.documentElement.dataset.travelling);
   assert.equal(await page.locator('.chest-solid').isVisible(),false);await activate(page.locator('[data-scene="rides-games"] .room-route[data-to="fortune-teller"]'));await ready();await lock(true);assert.equal(downloads,1,'Repeated navigation reuses the GLB');result.downloadsBeforeRefresh=downloads;
   await page.reload({waitUntil:'commit'});await ready();await lock(true);
   // A save interrupted after release must resume unlocked, without a new puzzle.
   await page.evaluate(()=>sessionStorage.setItem('dreamscapes.chest.v1.adults',JSON.stringify({round:0,unlocked:true,completed:false,fallen:false})));await page.reload({waitUntil:'commit'});await ready();await lock(true);assert.equal((await snap()).completed,false);
   // Intentional reset restores the original puzzle and closed shackle.
   await page.evaluate(()=>sessionStorage.removeItem('dreamscapes.chest.v1.adults'));await page.reload({waitUntil:'commit'});await ready();await lock(false);await activate(page.locator('.chest-lock'));await page.locator('.chest-puzzle[open]').waitFor();await shot('reset-puzzle');await activate(page.getByRole('button',{name:'Close the padlock puzzle',exact:true}));
   assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);result.passed=true;result.fullJourney=true;result.replay=true;result.reset=true;result.savedStates=true;console.log('PASS',JSON.stringify(result));
  }catch(e){result.error=e.stack;console.error(e.stack);await shot('FAILURE').catch(()=>{});process.exitCode=1;}
  finally{result.errors=errors;result.failed=failed;await context.close();fs.writeFileSync(path.join(out,process.env.MOBILE_ONLY?'mobile-results.json':process.env.DESKTOP_ONLY?'desktop-results.json':'results.json'),JSON.stringify(results,null,2));}
 }}finally{await browser.close();await host.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
