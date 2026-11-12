const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const app=path.resolve(__dirname,'..');
(async()=>{
 const host=process.env.BASE_URL?null:await import('./playtest-server.mjs').then(m=>m.startPlaytestServer({root:path.join(app,'dist')}));
 const base=process.env.BASE_URL||host.url;
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE});
 const results=[];
 try {
 for(const band of (process.env.TEST_BANDS||'adults,teens,pre-teens,kids').split(','))for(const mobile of [false,true]){
  const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile,reducedMotion:band==='pre-teens'?'reduce':'no-preference'});
  const p=await ctx.newPage();p.setDefaultTimeout(60000);const errors=[],failed=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)failed.push(r.status()+' '+r.url())});
  const r={band,mobile,passed:false};results.push(r);
  try{
   await p.addInitScript(b=>{localStorage.setItem('novelideas.ageBand',b);window.__cycleSevenSynthetic=true;window.__cycleFiveSynthetic=true;},band);
   await p.goto(base+'/');await p.locator(`[data-age-band="${band}"]`).click();
   await p.goto(base+'/carnival/');await p.waitForFunction(()=>window.DreamscapesCycleZora&&window.DreamscapesCycleSeven);
   assert.equal(await p.evaluate(()=>DreamscapesObservations.snapshot().ageBand),band);
   const arrive=async id=>p.waitForFunction(id=>document.documentElement.dataset.location===id&&!document.documentElement.dataset.travelling&&!document.querySelector(`[data-scene="${id}"]`)?.inert,id);
   const activate=async locator=>{if(mobile)await locator.tap();else {await locator.focus();await locator.press('Enter')}};
   // Enter Rides & Games using the existing painted Midway sign, then the visible route.
   const entrance=p.locator('main [data-sign="RIDES & GAMES"]');
   if(mobile){await p.getByRole('button',{name:'Look toward the center',exact:true}).click();}
   await activate(entrance);await arrive('rides-games');
   await activate(p.getByRole('button',{name:'Walk to Madame Zora / Fortune Teller',exact:true}));await arrive('fortune-teller');
   await p.locator('.zl-character').waitFor();await p.locator('.echo-machine:not([hidden])').waitFor();
   assert.equal(new URL(p.url()).search,'');
   await activate(p.locator('.zt-ticket:not(.zt-second)'));await activate(p.locator('.zt-lamp'));
   assert.equal(await p.evaluate(()=>DreamscapesCycleZora.state().lit),true);
   await activate(p.locator('.zl-ball'));await p.locator('.zt-veil.zt-open').waitFor();
   await activate(p.getByRole('button',{name:'Return from the vision to Madame Zora',exact:true}));
   await activate(p.locator(mobile?'.zt-follow':'.zt-second'));
   if(mobile){await p.locator('.zt-veil.zt-open').waitFor();await activate(p.getByRole('button',{name:'Return from the vision to Madame Zora',exact:true}));}
   assert.equal(await p.evaluate(()=>DreamscapesCycleZora.state().chosen),mobile?'impossible-door':'hidden-message');
   // [1,3,2] is solved by one turn of window 1 and two of window 3.
   for(const i of [0,2,2])await activate(p.locator(`[data-gear="${i}"]`));
   assert.deepEqual(await p.evaluate(()=>DreamscapesCycleSeven.snapshot().rotors),[0,0,0]);
   await activate(p.getByRole('button',{name:mobile?'Keep the light with the carnival':'Let the light lead into the woods',exact:true}));
   await activate(p.locator('.echo-route'));await arrive('forest-edge');
   await activate(p.locator('.echo-visitor'));assert.equal(await p.evaluate(()=>DreamscapesCycleSeven.snapshot().greeted),true);
   await activate(p.getByRole('button',{name:'Return to the brass windows at Madame Zora',exact:true}));await arrive('fortune-teller');
   await activate(p.locator('[data-scene="fortune-teller"] .room-route--return'));await arrive('rides-games');
   await activate(p.getByRole('button',{name:'Walk to Madame Zora / Fortune Teller',exact:true}));await arrive('fortune-teller');
   assert.equal(await p.evaluate(()=>DreamscapesCycleSeven.snapshot().outcome),mobile?'home':'woods');
   r.zora=await p.evaluate(()=>DreamscapesCycleZora.state());r.puzzle=await p.evaluate(()=>DreamscapesCycleSeven.snapshot());
   if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await p.screenshot({path:path.join(process.env.SCREENSHOT_DIR,band+'-'+(mobile?'mobile':'desktop')+'.png')});}
   assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);r.passed=true;console.log('PASS '+band+' '+(mobile?'mobile touch':'desktop keyboard'));
  }catch(e){r.error=e.stack;console.error(e.stack);}finally{r.errors=errors;r.failed=failed;await ctx.close();}
 }
 }finally{await browser.close();if(host)await host.close();}
 const out=process.env.RESULT_FILE||path.join(app,'verification/zora-integration-results.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({base,results},null,2)+'\n');assert(results.every(r=>r.passed));
})().catch(e=>{console.error(e);process.exitCode=1});
