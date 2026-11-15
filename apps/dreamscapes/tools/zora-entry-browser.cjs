const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const app=path.resolve(__dirname,'..'),out=path.resolve(process.env.ZORA_EVIDENCE||path.join(app,'.tmp/zora-entry'));
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const host=process.env.BASE_URL?null:await import('./playtest-server.mjs').then(m=>m.startPlaytestServer({root:path.join(app,'dist')}));
 const base=process.env.BASE_URL||host.url,browser=await chromium.launch({executablePath:process.env.BROWSER_EXE}),results=[];
 const baseline=new Map();
 if(process.env.BASELINE)for(const [url,file] of Object.entries({
  '/carnival/':'public/experiments/carnival/index.html',
  '/carnival/navigation.js':'public/experiments/carnival/navigation.js',
  '/carnival/navigation.css':'public/experiments/carnival/navigation.css',
  '/cycle-seven/echo.js':'public/cycle-seven/echo.js',
  '/cycle-seven/trunk-renderer.mjs':'public/cycle-seven/trunk-renderer.mjs',
  '/cycle-eight/afterimages.js':'public/cycle-eight/afterimages.js',
  '/cycle-zora/living.js':'research/cycle-zora/living.js'
 })){
  const r=spawnSync('git',['show','e3d9c739:apps/dreamscapes/'+file],{cwd:app,encoding:'utf8',maxBuffer:2000000});
  assert.equal(r.status,0,r.stderr);baseline.set(url,r.stdout);
 }
 try{for(const mobile of (process.env.TEST_LAYOUTS?process.env.TEST_LAYOUTS.split(',').map(x=>x==='mobile'):process.env.BASELINE?[false]:[false,true])){
  const label=mobile?'mobile':'desktop',dir=path.join(out,label);fs.mkdirSync(dir,{recursive:true});
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});
  const p=await context.newPage();p.setDefaultTimeout(120000);const errors=[],result={layout:label,cases:[],passed:false};results.push(result);
  p.on('pageerror',e=>errors.push(e.message));
  let hold=false,holdModules=false,release,gate,failed=false,requests=new Set();
  const arm=(modules=false)=>{hold=true;holdModules=modules;requests=new Set();gate=new Promise(resolve=>release=resolve);};
  const requested=async()=>{const deadline=Date.now()+30000;while(requests.size===0){assert(Date.now()<deadline,'Expected a held scene resource request');await p.waitForTimeout(50);}};
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url()),name=url.pathname;
   if(baseline.has(name))return route.fulfill({body:baseline.get(name),contentType:name.endsWith('.css')?'text/css':name.endsWith('/')?'text/html':'text/javascript'});
   if(failed&&name==='/cycle-seven/trunk-reference.png')return route.fulfill({status:503,body:'Simulated unavailable scene image'});
   if(hold&&(['/cycle-seven/trunk-reference.png','/cycle-seven/chest-clean-plate.png','/cycle-zora/zora.png','/cycle-zora/ball.png'].includes(name)||holdModules&&['/cycle-zora/living.js','/cycle-zora/living.css','/cycle-seven/echo.css'].includes(name))){requests.add(name);await gate;}
   await route.continue();
  });
  await p.addInitScript(()=>{
   window.__zoraEntry={stage:'entry',samples:[],violations:[],firstExposed:null};
   function sample(){
    const a=window.__zoraEntry,v=document.querySelector('[data-scene="fortune-teller"]');
    if(v){const s=getComputedStyle(v),exposed=!v.hidden&&s.display!=='none'&&s.visibility==='visible'&&Number(s.opacity)>.001;
     const c=v.querySelector('.chest-solid'),lock=v.querySelector('.chest-lock');
     if(exposed){
      const images=[...v.querySelectorAll('.zl-character,.zl-cloth,.zl-ball img,.zt-ticket img')];
      const painted=!!c?.dataset.progress&&c.getContext('2d').getImageData(1115,735,1,1).data[3]>0;
      const complete=painted&&!!lock&&images.length>=5&&images.every(i=>i.complete&&i.naturalWidth>0);
      const frame={stage:a.stage,at:performance.now(),ready:v.dataset.zoraReady==='true',painted,complete,lock:lock?.dataset.lockState,phase:window.DreamscapesCycleSeven?.snapshot().phase};
      if(!a.firstExposed)a.firstExposed=frame;
      if(a.samples.length<24)a.samples.push(frame);
      if(!complete&&a.violations.length<60)a.violations.push(frame);
     }
    }
    requestAnimationFrame(sample);
   }requestAnimationFrame(sample);
  });
  const arrive=id=>p.waitForFunction(id=>document.documentElement.dataset.location===id&&!document.documentElement.dataset.travelling,id);
  const audit=stage=>p.evaluate(stage=>window.__zoraEntry={stage,samples:[],violations:[],firstExposed:null},stage);
  const inspect=async(name,expectedUnlocked)=>{
   await arrive('fortune-teller');
   await p.waitForFunction(()=>!!window.__zoraEntry.firstExposed);
   const r=await p.evaluate(()=>({audit:window.__zoraEntry,ready:document.querySelector('[data-scene="fortune-teller"]').dataset.zoraReady,lock:document.querySelector('.chest-lock')?.dataset.lockState,canvases:document.querySelectorAll('.chest-solid').length,characters:document.querySelectorAll('.zl-character').length,afterimages:!!document.querySelector('[data-afterimage="fortune-teller"]')}));
   if(!process.env.BASELINE){assert.equal(r.ready,'true');assert.deepEqual(r.audit.violations,[]);assert(r.audit.firstExposed?.complete);assert.equal(r.audit.firstExposed.ready,true);assert.equal(r.audit.firstExposed.lock,expectedUnlocked?'unlocked':'locked');assert.equal(r.lock,expectedUnlocked?'unlocked':'locked');assert.equal(r.canvases,1);assert.equal(r.characters,1);assert(r.afterimages);}
   result.cases.push({name,...r});console.log('PASS '+label+' '+name);return r;
  };
  const pending=async(name)=>{
   await p.waitForFunction(()=>!!document.querySelector('[data-scene="fortune-teller"]'));
   // Test holds a real dependency, rather than relying on a particular network speed.
   await p.waitForTimeout(200);
   const state=await p.evaluate(()=>{const v=document.querySelector('[data-scene="fortune-teller"]');return {hidden:v.hidden||getComputedStyle(v).display==='none',audit:window.__zoraEntry,loading:document.querySelector('.location-loading')?.hidden===false,scene:document.documentElement.dataset.location};});
   await p.screenshot({path:path.join(dir,name+'-pending.png')});
   if(process.env.BASELINE){assert(state.audit.violations.length>0,'Baseline must expose an undrawn chest');result.cases.push({name,baselineExposedOriginal:true,...state});return;}
   assert(state.hidden);assert.equal(state.loading,true);assert.deepEqual(state.audit.violations,[]);
  };
  const frames=async name=>{
   await p.waitForFunction(()=>!!window.__zoraEntry.firstExposed);
   for(const ms of [0,100,250,500]){if(ms)await p.waitForTimeout(ms);await p.screenshot({path:path.join(dir,name+'-entry-'+ms+'.png')});}
  };
  const route=async(from,to)=>{
   const q=from==='midway'?'main [data-sign="RIDES & GAMES"]':`[data-scene="${from}"] [data-to="${to}"]`;
   await p.locator(q).first().evaluate(el=>el.click());await arrive(to);
  };
  try{
   if(!process.env.FAILURE_ONLY){
   arm();await p.goto(base+'/carnival/?scene=fortune-teller',{waitUntil:'domcontentloaded'});
   await p.waitForFunction(()=>document.querySelector('[data-scene="fortune-teller"]'));
   await requested();
   await pending('cold-empty-storage');
   if(process.env.BASELINE){hold=false;release();result.passed=true;continue;}
   hold=false;release();await frames('cold');await inspect('cold-empty-storage',false);
   // Refresh uncached directly into a completed, unlocked chest and Afterimages state.
   await p.evaluate(()=>{sessionStorage.setItem('dreamscapes.chest.v1.adults',JSON.stringify({round:1,completed:true,fallen:true,unlocked:true}));sessionStorage.setItem('dreamscapes.afterimages.v1.adults',JSON.stringify({awakened:true,order:['midway','forest-edge'],joined:true,home:'shelter',observations:[]}));});
   arm();await p.reload({waitUntil:'domcontentloaded'});await requested();
   await pending('completed-direct-refresh');hold=false;release();await frames('completed-refresh');await inspect('completed-direct-refresh',true);
   assert.equal(await p.locator('[data-afterimage="fortune-teller"]').evaluate(el=>el.hidden),false);
   // Slow JavaScript and CSS cannot bypass the same scene readiness boundary.
   arm(true);await p.goto(base+'/carnival/?scene=fortune-teller',{waitUntil:'commit'});
   await requested();await pending('delayed-script-and-styles');hold=false;release();await frames('delayed-modules');await inspect('delayed-script-and-styles',true);
   // Nearby prefetch can be slow without blocking the Hall of Mirrors.
   arm();await p.goto(base+'/carnival/',{waitUntil:'domcontentloaded'});await route('midway','rides-games');
   await requested();
   await route('rides-games','fun-house');await route('fun-house','rides-games');
   assert(hold);result.cases.push({name:'unrelated-scenes-during-prefetch',passed:true});
   await audit('normal-navigation');
   await p.locator('[data-scene="rides-games"] [data-to="fortune-teller"]').evaluate(el=>el.click());
   await pending('normal-navigation');
   await p.evaluate(async()=>(await import('/age-band.js')).selectAgeBand('kids'));
   hold=false;release();await frames('normal');await inspect('normal-navigation-age-changed-while-loading',false);
   for(const band of ['adults','teens','pre-teens','kids']){
    await p.evaluate(async b=>{const module=await import('/age-band.js');window.__zoraEntry={stage:'age-'+b,samples:[],violations:[],firstExposed:null};module.selectAgeBand(b);},band);await p.waitForTimeout(80);await inspect('age-'+band,band==='adults');
   }
   for(let i=0;i<3;i++){await route('fortune-teller','rides-games');await audit('return-'+i);await route('rides-games','fortune-teller');await inspect('repeat-return-'+i,false);}
   }
   if(!process.env.SMOKE){
    // A rejected dependency must never expose the baked-in trunk; retry mounts cleanly.
    failed=true;await p.goto(base+'/carnival/?scene=tent-row',{waitUntil:'commit'});await arrive('tent-row');
    await audit('failure-retry');await p.locator('[data-scene="tent-row"] [data-to="fortune-teller"]').evaluate(el=>el.click());
    await p.waitForFunction(()=>!document.querySelector('[data-scene="fortune-teller"]')&&document.querySelector('.location-loading')?.hidden===true);
    assert.equal(await p.evaluate(()=>document.documentElement.dataset.location),'tent-row');
    assert.deepEqual(await p.evaluate(()=>window.__zoraEntry.violations),[]);failed=false;
    await route('tent-row','fortune-teller');await inspect('failed-image-retry',false);
   }
   assert.deepEqual(errors,[]);result.passed=true;
  }catch(error){result.error=error.stack;console.error(error.stack);try{await p.screenshot({path:path.join(dir,'FAILURE.png')});}catch{}process.exitCode=1;}
  finally{hold=false;release?.();result.errors=errors;await context.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({base,baseline:!!process.env.BASELINE,results},null,2));}
 }}finally{await browser.close();if(host)await host.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
