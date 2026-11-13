// Focused post-tour journeys. Full real chest tour remains in chest-browser.cjs.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const app=path.resolve(__dirname,'..');
 const host=process.env.BASE_URL?{url:process.env.BASE_URL,close:async()=>{}}:await import('./playtest-server.mjs').then(m=>m.startPlaytestServer({root:path.join(app,'dist')}));
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE});
 const out=process.env.AFTERIMAGES_EVIDENCE||path.join(app,'verification/afterimages');fs.mkdirSync(out,{recursive:true});const results=[];
 try{
  for(const band of (process.env.TEST_BANDS||'kids,pre-teens,teens,adults').split(','))for(const mobile of [false,true]){
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},hasTouch:mobile,isMobile:mobile,reducedMotion:'reduce'});
   const p=await context.newPage();p.setDefaultTimeout(120000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.addInitScript(({band})=>{localStorage.setItem('dreamscapes.age-band',band);}, {band});
   await p.goto(host.url+'/carnival/?scene=fortune-teller');
   await p.waitForFunction(()=>window.DreamscapesCycleEight&&!document.documentElement.dataset.travelling);
   assert.equal(await p.locator('[data-afterimage="fortune-teller"]').isVisible(),false);
   // Seed only the established chest completion, as a returning player. No new-state debug mutations.
   await p.evaluate(b=>sessionStorage.setItem('dreamscapes.chest.v1.'+b,JSON.stringify({round:1,completed:true,fallen:true})),band);
   await p.reload();await p.waitForFunction(()=>window.DreamscapesCycleEight&&!document.documentElement.dataset.travelling);
   const current=()=>p.evaluate(()=>document.documentElement.dataset.location||'midway');
   async function travel(to){
    const from=await current(),view=from==='midway'?p.locator('main'):p.locator(`[data-scene="${from}"]`);
    const b=from==='midway'?view.locator('[data-destination="Tent Row"]'):view.locator(`[data-to="${to}"]`).first();
    await b.focus();await b.press('Enter');await p.waitForFunction(id=>document.documentElement.dataset.location===id&&!document.documentElement.dataset.travelling,to);
   }
   async function inspect(id){const b=p.locator(`[data-afterimage="${id}"]`);await b.focus();if(mobile)await b.tap();else await b.press('Enter');await p.locator('.afterimage-dialog[open]').waitFor();}
   async function back(){await p.getByRole('button',{name:'Step back',exact:true}).click();}
   const first=mobile?'forest-edge':'midway',second=mobile?'midway':'forest-edge';
   await travel('tent-row');
   if(first==='midway')await travel('midway');else{await travel('behind-carnival');await travel('forest-edge');}
   await inspect(first);await p.screenshot({path:path.join(out,`${band}-${mobile}-first.png`)});await back();
   await p.screenshot({path:path.join(out,`${band}-${mobile}-environment.png`)});
   await inspect(first);await back();assert.equal(await p.evaluate(()=>DreamscapesCycleEight.snapshot().order.length),1);
   if(first==='midway'){await travel('tent-row');await travel('behind-carnival');await travel('forest-edge');}else{await travel('behind-carnival');await travel('tent-row');await travel('midway');}
   await inspect(second);await back();
   // Leave and reload midway through the experience; discovery order must persist.
   await p.evaluate(id=>history.replaceState(null,'','?scene='+id),second);
   await p.reload();await p.waitForFunction(()=>window.DreamscapesCycleEight&&!document.documentElement.dataset.travelling);
   assert.deepEqual(await p.evaluate(()=>DreamscapesCycleEight.snapshot().order),[first,second]);
   if(second==='midway')await travel('tent-row');else{await travel('behind-carnival');await travel('tent-row');}
   await travel('fortune-teller');await inspect('fortune-teller');
   // Wrong pattern is recoverable; Escape abandons entry without losing discovered reflections.
   const count=band==='kids'?2:4;
   for(let i=0;i<count;i++)await p.getByRole('button',{name:'Add star',exact:true}).click();
   assert.equal(await p.evaluate(()=>DreamscapesCycleEight.snapshot().joined),false);
   await p.keyboard.press('Escape');await inspect('fortune-teller');
   const expected=[first,second].flatMap(id=>band==='kids'?[id==='midway'?'circle':'star']:id==='midway'?['circle','star']:['star','circle']);
   for(const symbol of expected)await p.getByRole('button',{name:'Add '+symbol,exact:true}).click();
   assert.equal(await p.evaluate(()=>DreamscapesCycleEight.snapshot().joined),true);
   await p.getByRole('button',{name:'Leave a place beside Zora',exact:true}).click();assert.equal(await p.evaluate(()=>DreamscapesCycleEight.snapshot().home),'shelter');
   await p.getByRole('button',{name:'Open a way between the reflections',exact:true}).click();await p.screenshot({path:path.join(out,`${band}-${mobile}-choice.png`)});await back();
   await travel('tent-row');await travel('midway');assert.equal(await p.locator('[data-afterimage="midway"]').getAttribute('data-home'),'wander');
   // Approved puddle, Mara hit area and navigation remain mounted.
   assert.equal(await p.locator('main .puddle').count(),1);assert.equal(await p.locator('main .fox').count(),1);
   await p.evaluate(async b=>(await import('/age-band.js')).selectAgeBand(b),band==='kids'?'adults':'kids');
   assert.equal(await p.evaluate(()=>DreamscapesCycleEight.snapshot().awakened),false);
   await p.evaluate(async b=>(await import('/age-band.js')).selectAgeBand(b),band);
   assert.equal(await p.evaluate(()=>DreamscapesCycleEight.snapshot().home),'wander');
   await p.reload();await p.waitForFunction(()=>window.DreamscapesCycleEight&&!document.documentElement.dataset.travelling);
   assert.equal(await p.evaluate(()=>DreamscapesCycleEight.snapshot().home),'wander');assert.deepEqual(errors,[]);
   results.push({band,mobile,order:[first,second],passed:true});console.log('PASS Afterimages '+band+' '+mobile);await context.close();
  }
 }finally{await browser.close();await host.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
