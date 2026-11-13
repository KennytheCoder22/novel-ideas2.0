const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {createHash}=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const app=path.resolve(__dirname,'..');
const args=new Set(process.argv.slice(2));
const baseline=args.has('--baseline');
const changesOnly=args.has('--changes-only');
const out=path.resolve(process.env.DREAMSCAPES_EVIDENCE_DIR||path.join(app,'playtest-artifacts',new Date().toISOString().replace(/[:.]/g,'-')));
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:app,encoding:'utf8'}).trim();
const BASELINE='03f1b914715afa0fb5d3955e822d51f71f865675';
const previousFile=path.join(out,'results.json'),previous=process.env.DREAMSCAPES_REUSE_UNCHANGED_SCENES==='1'&&fs.existsSync(previousFile)?JSON.parse(fs.readFileSync(previousFile)):null;
const results=previous?(previous.results||[]).filter(r=>r.passed&&Date.now()-Date.parse(r.startedAt)<4*60*60*1000).map(r=>({...r,reusedUnchangedScene:true})):[];
const sourceHashes=Object.fromEntries(['index.html','mara-midway.js','mara-sand.js','skee-ball-art.js'].map(name=>[name,createHash('sha256').update(baseline&&name!=='index.html'?execFileSync('git',['show',`${BASELINE}:apps/dreamscapes/public/experiments/carnival/${name}`],{cwd:app}):fs.readFileSync(path.join(app,'public/experiments/carnival',name))).digest('hex')]));
if(previous)assert.deepEqual(previous.sourceHashes,sourceHashes,'Reused non-ride scene controllers and entry markup are unchanged');
let host,browser;
fs.mkdirSync(out,{recursive:true});
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function report(){
  const summary={revision,sourceHashes,reusedUnchangedScenes:results.filter(r=>r.reusedUnchangedScene).map(r=>r.name),baseline,startedWith:process.argv.slice(2),results,visualReview:'UNREVIEWED: screenshots and recordings are evidence, not automatic artistic approval.'};
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(summary,null,2));
  fs.writeFileSync(path.join(out,'report.html'),`<!doctype html><meta charset="utf-8"><title>Dreamscapes playtest</title><style>body{background:#111827;color:#eee;font:16px system-ui;max-width:1100px;margin:40px auto;padding:20px}a{color:#9bd}img{max-width:300px;max-height:240px}video{max-width:700px}pre{white-space:pre-wrap}figure{display:inline-block;margin:8px;vertical-align:top}figcaption{font-size:12px;color:#bcd}section{border-top:1px solid #64748b;padding:20px 0}</style><h1>Dreamscapes playtest ${baseline?'baseline':'candidate'}</h1><p>Revision ${escape(revision)}. Automated assertions and visual review are separate. Review all relevant frames before approving motion.</p>${results.map(r=>`<section><h2>${escape(r.name)} — ${r.passed?'PASS':'FAIL'}</h2><details${r.error?" open":""}><summary>${r.error?"Failure details":"Assertions and recorded state"}</summary><pre>${escape(r.error||JSON.stringify(r.details,null,2))}</pre></details><p>Browser diagnostics: <a href="${r.name}/diagnostics.json">JSON</a> · ${r.traceRecorded?`<a href="${r.name}/trace.zip">Playwright trace</a>`:"Trace not requested"}</p>${(r.images||[]).map(n=>`<figure><a href="${r.name}/${n}"><img loading="lazy" src="${r.name}/${n}" alt="${escape(n)}"></a><figcaption>${escape(n)}</figcaption></figure>`).join('')}${(r.videos||[]).map(n=>`<p><video controls preload="none" src="${r.name}/${n}"></video></p>`).join('')}</section>`).join('')}`);
}
async function test(name,viewport,fn,{mobile=false,overrideBaseline=baseline}={}){
  const selected=[...args].find(a=>a.startsWith('--case='))?.slice(7);
  if(selected&&!name.includes(selected))return;
  if(results.some(r=>r.name===name&&r.reusedUnchangedScene)){console.log('REUSE passed unchanged scene '+name);return;}
  const dir=path.join(out,name);fs.mkdirSync(dir,{recursive:true});
  const diagnostics={pageErrors:[],console:[],httpErrors:[],requestFailures:[]};
  const context=await browser.newContext({viewport,hasTouch:mobile,isMobile:mobile,...(args.has('--no-video')?{}:{recordVideo:{dir,size:mobile?viewport:{width:960,height:600}}})});
  if(args.has('--trace'))await context.tracing.start({screenshots:true,snapshots:true,sources:true});
  if(overrideBaseline) for(const file of ['mara-midway.js','mara-sand.js','skee-ball-art.js']){
    const body=execFileSync('git',['show',`${BASELINE}:apps/dreamscapes/public/experiments/carnival/${file}`],{cwd:app});
    await context.route(`**/${file}*`,route=>route.fulfill({contentType:'text/javascript',body}));
  }
  const page=await context.newPage();page.setDefaultTimeout(30000);
  page.on('pageerror',e=>diagnostics.pageErrors.push(e.stack||e.message));
  page.on('console',m=>{if(['error','warning'].includes(m.type()))diagnostics.console.push({level:m.type(),text:m.text()});});
  page.on('response',r=>{if(r.status()>=400)diagnostics.httpErrors.push({url:r.url(),status:r.status()});});
  page.on('requestfailed',r=>diagnostics.requestFailures.push({url:r.url(),error:r.failure()?.errorText}));
  const result={name,startedAt:new Date().toISOString(),viewport,mobile,passed:false,images:[],details:{}};results.push(result);
  const snap=async label=>{const file=label+'.jpg';await page.screenshot({path:path.join(dir,file),type:'jpeg',quality:82,timeout:20000});result.images.push(file);};
  try{
    await fn({page,context,snap,result,dir});
    if(args.has('--observations')){
      const observed=await page.evaluate(()=>DreamscapesObservations.snapshot());
      assert.equal(observed.counts.preference,0,'Ordinary navigation/gameplay is not taste');
      assert(observed.events.length>0&&observed.events.every(e=>e.schemaVersion===1&&e.category!=='preference'&&!e.preferenceSupported&&e.preferenceAttributes.length===0));
      assert.equal(new Set(observed.events.map(e=>e.eventId)).size,observed.events.length,'Event IDs are unique');
      if(name.startsWith('mara-'))assert.equal(observed.events.filter(e=>e.interactionId==='mara-pickup').length,1);
      if(name.startsWith('skee-'))for(const [action,count]of [['ball-launched',6],['shot-scored',6],['clown-started',2],['round-completed',2],['replayed',1]])assert.equal(observed.events.filter(e=>e.action===action).length,count,action+' count');
      if(name.startsWith('explore-')){
        for(const scene of ['midway','rides-games','skee-ball','fun-house','tent-row','fortune-teller','behind-carnival','forest-edge','ferris-platform'])assert(observed.events.some(e=>e.sceneId===scene&&e.action==='entered'),'Recorded scene '+scene);
        assert.equal(observed.events.filter(e=>e.interactionId==='mirror').length,3);
      }
      if(name.startsWith('carousel-'))assert.equal(await page.locator('.carousel-choice-options [data-mount-id]').count(),3,'Three actual mount tickets are offered outside the moving SVG');
      fs.writeFileSync(path.join(dir,'observations.json'),JSON.stringify(observed,null,2));
      result.observationCounts=observed.counts;
    }

    assert.deepEqual(diagnostics.pageErrors,[],'Uncaught browser errors');
    assert.deepEqual(diagnostics.httpErrors,[],'HTTP resource failures');
    assert.deepEqual(diagnostics.console.filter(m=>m.level==='error'),[],'Console errors');
    // Navigation/reload intentionally cancels old scene requests. Keep these in
    // the log; required assets are independently gated by readiness assertions.
    assert.deepEqual(diagnostics.requestFailures.filter(r=>r.error!=='net::ERR_ABORTED'),[],'Unexpected failed resource requests');
    result.passed=true;
  }catch(e){result.error=e.stack||String(e);try{await snap('FAILURE');}catch{}console.error('FAIL '+name+': '+e.message);}
  finally{
    fs.writeFileSync(path.join(dir,'diagnostics.json'),JSON.stringify(diagnostics,null,2));
    if(args.has('--trace'))try{await context.tracing.stop({path:path.join(dir,'trace.zip')});result.traceRecorded=true;}catch(e){result.traceError=e.message;}
    await context.close();result.videos=args.has('--no-video')?[]:fs.readdirSync(dir).filter(n=>n.endsWith('.webm'));report();
  }
  console.log((result.passed?'PASS ':'FAIL ')+name);
}
async function arrived(page,id){await page.waitForFunction(id=>(document.documentElement.dataset.location||'midway')===id&&!document.documentElement.dataset.travelling,id,{timeout:180000});}
async function travel(page,id){
  const paths=page.locator(`:not([inert]) > .location-plane [data-to="${id}"], :not([inert]) > .room-route[data-to="${id}"]`).filter({visible:true});
  for(let attempt=0;attempt<7;attempt++){
    const candidates=await paths.all();let offscreen;
    for(const target of candidates){const rect=await target.boundingBox();if(!rect)continue;const x=rect.x+rect.width/2,y=rect.y+rect.height/2,viewport=page.viewportSize();if(x>0&&x<viewport.width&&y>0&&y<viewport.height){await target.click();await arrived(page,id);return;}offscreen=rect;}
    assert(offscreen,'No available geographic path to '+id);
    const direction=offscreen.x+offscreen.width/2<0?'Look left':'Look right';
    await page.locator('.location-view:not([inert]) .location-look').getByRole('button',{name:direction,exact:true}).click();
  }
  throw new Error('Path remains outside viewport after player panning: '+id);
}
async function enter(page,band='adults',{checkPersistence=false}={}){
  await page.goto(host.url+'/',{waitUntil:'load'});
  const bandButton=page.locator(`[data-age-band="${band}"]`);
  if(checkPersistence||band!=='adults'){if(page.viewportSize().width<600)await bandButton.tap();else await bandButton.click();}
  if(checkPersistence)await page.reload();assert.equal(await page.locator(`[data-age-band="${band}"]`).getAttribute('aria-pressed'),'true');
  const portal=page.getByRole('link',{name:'Enter Creepy Carnival — Midway',exact:true});
  if(page.viewportSize().width<600)await portal.tap();else await portal.click();
  await page.waitForFunction(()=>!!window.MaraMidway?.state().loaded,null,{timeout:120000});
  assert.equal(new URL(page.url()).pathname,'/carnival/');
}
async function resting(page){await page.waitForFunction(()=>window.MaraMidway?.state().phase==='resting',null,{timeout:30000});}
async function maraCase({page,snap,result},timing){
  if(timing){await page.goto(host.url+`/carnival/?mara-review=1&mara-timing=${timing}`);await page.waitForFunction(()=>window.MaraMidway?.state().loaded,null,{timeout:120000});await page.addStyleTag({content:'.mara-review-panel{display:none}'});}else await enter(page);
  await resting(page);
  if(page.viewportSize().width<600)await page.getByRole('button',{name:'Look toward the center',exact:true}).click();
  await snap('before-pickup');
  await page.getByRole('button',{name:'Examine Mara, the abandoned stuffed fox',exact:true}).click();
  const origin=Date.now();result.pickupStartedAt=new Date(origin).toISOString();const states=[];
  const checkpoints=timing==='early'?[['initial-lift',.16],['crumbling-begins',.85],['mid-crumble',1.2],['at-center',1.7]]:[['initial-lift',.16],['at-center',1.66],['crumbling-begins',1.95],['mid-crumble',2.5]];
  for(const [label,at]of checkpoints){
    await page.waitForFunction(t=>MaraMidway.state().pickup?.elapsed>=t,at,{timeout:30000});await snap(label);
    states.push({label,elapsedMs:Date.now()-origin,state:await page.evaluate(()=>MaraMidway.state())});
  }
  await page.waitForFunction(()=>MaraMidway.state().phase==='remains',null,{timeout:15000});
  const state=await page.evaluate(()=>MaraMidway.state());
  if(!baseline){assert.equal(await page.getByRole('button',{name:'Put Mara down',exact:true}).count(),0);assert.equal(state.sand.bodyVisible,false);assert.equal(state.sand.tagGrounded,true);}
  assert.equal(state.sand.tagTriangles,3);assert.equal(state.sand.tagTriangles+state.sand.bodyTriangles,9705);
  const draws=state.draws;await page.waitForTimeout(250);assert.equal((await page.evaluate(()=>MaraMidway.state())).draws,draws,'Settled animation must stop rendering');
    await snap('complete-disappearance');
    result.details={timing:timing||'default',states,tag:'Original printed tag settles on ground; body vanishes.'};
}
async function skeeCase({page,context,snap,result},mobile){
  await enter(page);
  await page.goto(host.url+'/carnival/?scene=skee-ball&skee-review=1');await arrived(page,'skee-ball');
  await page.waitForFunction(()=>!!window.SkeeBallArtReview?.clown()&&!!SkeeBallArtReview.machine(),null,{timeout:120000});
  const count=baseline?9:3,states=[];await snap('before-game');
  assert.equal((await page.evaluate(()=>SkeeBallArtReview.state())).balls,count);
  await page.getByRole('slider',{name:'Angle',exact:true}).press('ArrowRight');assert.equal((await page.evaluate(()=>SkeeBallArtReview.state())).angle,1);
  await page.getByRole('slider',{name:'Angle',exact:true}).press('Escape');
  await page.getByRole('slider',{name:'Pull and release',exact:true}).press('ArrowUp');
  await page.getByRole('slider',{name:'Pull and release',exact:true}).press('Escape');assert.equal((await page.evaluate(()=>SkeeBallArtReview.state())).shotsLaunched,0);
  for(let i=0;i<count;i++){
    if(mobile){const rect=await page.getByRole('slider',{name:'Pull and release',exact:true}).boundingBox();const scale=await page.locator('[data-scene="skee-ball"] .location-plane').evaluate(e=>e.getBoundingClientRect().width/1672);const x=rect.x+rect.width*.3,y=rect.y+rect.height*.25,client=await context.newCDPSession(page);await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let step=1;step<=10;step++)await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+72*.52*scale*step/10}]});await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await client.detach();}
    else{const launch=page.getByRole('slider',{name:'Pull and release',exact:true});for(let step=0;step<12;step++)await launch.press('ArrowUp');await launch.press('Enter');}
    await page.waitForFunction(n=>SkeeBallArtReview.state().shotsLaunched===n,i+1);
    await snap(`launch-${i+1}`);
    await page.waitForFunction(()=>!SkeeBallArtReview.state().pending);
    const state=await page.evaluate(()=>SkeeBallArtReview.state());states.push(state);
    assert.equal(state.balls,count-i-1);assert.equal(state.ballsPrepared,Math.min(count,i+2));assert.equal(state.clownStarts,i===count-1?1:0);
    assert.match(await page.getByLabel('Balls remaining',{exact:true}).textContent(),new RegExp(`^${count-i-1} ball`));
    await snap(`scored-${i+1}`);
  }
  assert(states.at(-1).total>0,'At least one shot must score');
  // Attempt a fourth launch while locked; this cannot bypass player controls.
  await page.getByRole('slider',{name:'Pull and release',exact:true}).press('End');
  await page.getByRole('slider',{name:'Pull and release',exact:true}).press('Enter');
  for(const phase of ['approach','evaporating','face','gone']){await page.waitForFunction(phase=>document.querySelector('.skee-art-game').dataset.clownPhase===phase,phase,{timeout:45000});await snap('clown-'+phase);}
  await page.waitForFunction(()=>SkeeBallArtReview.state().roundPhase==='complete',null,{timeout:45000});
  const complete=await page.evaluate(()=>SkeeBallArtReview.state());assert.equal(complete.shotsLaunched,count);assert.equal(complete.ballsPrepared,count);assert.equal(complete.clownStarts,1);assert.equal(complete.ballPresent,false);assert.equal(complete.ballAvailable,false);
  await snap('completed');await page.getByRole('button',{name:'Play again',exact:true}).click();
  const replay=await page.evaluate(()=>SkeeBallArtReview.state());assert.equal(replay.balls,count);assert.equal(replay.total,0);assert.equal(replay.clownStarts,0);assert.equal(replay.ballsPrepared,1);assert.equal(replay.roundId,2);await snap('replay');
  // A second whole game also triggers exactly once. Reduced motion is a separate assertion.
  await page.emulateMedia({reducedMotion:'reduce'});
  for(let i=0;i<count;i++){for(let s=0;s<12;s++)await page.getByRole('slider',{name:'Pull and release',exact:true}).press('ArrowUp');await page.getByRole('slider',{name:'Pull and release',exact:true}).press('Enter');}
  await page.waitForFunction(()=>SkeeBallArtReview.state().roundPhase==='complete');
  const second=await page.evaluate(()=>SkeeBallArtReview.state());assert.equal(second.shotsLaunched,count);assert.equal(second.clownStarts,1);assert.equal(second.ballPresent,false);
  result.details={states,complete,replay,second,pointerInput:mobile?'Emulated touchscreen drag':'Keyboard',expectedLaunches:count};
}

(async()=>{
  host=await(await import(pathToFileURL(path.join(__dirname,'playtest-server.mjs')).href)).startPlaytestServer({root:path.join(app,'dist')});
  browser=await chromium.launch({headless:!args.has('--headed'),...(process.env.BROWSER_EXE?{executablePath:process.env.BROWSER_EXE}:{})});
  const desktop={width:1440,height:900},phone={width:390,height:844};
  if(!args.has('--carousel-only')&&!args.has('--skip-changes'))for(const [name,viewport,mobile]of[['desktop',desktop,false],['mobile',phone,true]]){
    await test('mara-'+name,viewport,c=>maraCase(c),{mobile});
    if(!baseline&&!args.has('--no-comparison'))for(const timing of ['center','early'])await test(`mara-${timing}-${name}`,viewport,c=>maraCase(c,timing),{mobile});
    await test('skee-'+name,viewport,c=>skeeCase(c,mobile),{mobile});
  }
  if(!changesOnly&&!args.has('--carousel-only')){
    for(const [band,style]of[['adults','ornate'],['teens','plain'],['kids','stuffed'],['pre-teens','stuffed']])for(const [device,viewport,mobile]of[['desktop',desktop,false],['mobile',phone,true]])await test(`explore-${band}-${device}`,viewport,async({page,snap,result})=>{
      await enter(page,band,{checkPersistence:true});await snap('opening-midway');
      const poster=page.getByRole('button',{name:'Examine the old carnival poster',exact:true});if(mobile){await poster.focus();await poster.press('Enter');}else await poster.click();await snap('poster');await page.getByRole('button',{name:'← Return to the midway',exact:true}).click();
      // Panning makes the geographic entrance available without calling navigation APIs.
      if(mobile)await page.getByRole('button',{name:'Look left',exact:true}).click();
      await page.getByRole('button',{name:'Walk toward Rides and Games',exact:true}).click({timeout:180000});await arrived(page,'rides-games');
      await page.waitForFunction(style=>window.carouselVariantDiagnostics?.().selected===style&&!carouselVariantDiagnostics().busy,style,{timeout:180000});
      if(mobile)for(let i=0;i<4;i++)await page.getByRole('button',{name:'Look left',exact:true}).click();
      await snap('carousel');
      const mounts=await page.evaluate(()=>carouselVariantDiagnostics());assert.equal(mounts.mounts.length,20);assert(mounts.mounts.every(m=>m.style===style&&m.visible));
      await travel(page,'skee-ball');assert.match(await page.getByLabel('Balls remaining',{exact:true}).textContent(),/^3 balls/);await snap('skee-geographic-entry');
      await travel(page,'rides-games');await snap('carousel-after-skee');
      assert(await page.evaluate(()=>[window.carouselHorseComparison,...window.carouselAnimalComparisons].every(m=>!m.renderer.getContext().isContextLost())),'Carousel survives the Skee Ball return');
      await travel(page,'fun-house');
      for(const kind of ['tall','wide','endless']){const mirror=page.getByRole('button',{name:`Examine the ${kind} mirror`,exact:true});await mirror.focus();await page.waitForTimeout(100);await mirror.press('Enter');}
      await page.getByRole('button',{name:'Walk to Tent Row',exact:true}).waitFor({state:'visible'});await snap('mirrors');await travel(page,'tent-row');await snap('tent-row');
      await travel(page,'fortune-teller');await snap('zora');await travel(page,'tent-row');await travel(page,'behind-carnival');await snap('backstage');await travel(page,'forest-edge');await snap('forest');
      await page.getByRole('link',{name:'Exit Creepy Carnival and return to Dreamscapes. Get out while you still can.',exact:true}).click();assert.equal(new URL(page.url()).pathname,'/');
      await enter(page,band);await page.getByRole('button',{name:'Explore the distant Ferris wheel',exact:true}).focus();await page.getByRole('button',{name:'Explore the distant Ferris wheel',exact:true}).press('Enter');await arrived(page,'ferris-platform');await snap('ferris');
      result.details={band,style,mounts:mounts.mounts.length,scenes:['midway','rides-games','fun-house','tent-row','fortune-teller','behind-carnival','forest-edge','ferris-platform'],note:'Zora and Ferris are scenery/navigation, without additional decision controls.'};
    },{mobile});
  }
  if(!changesOnly)for(const [band,style]of[['adults','ornate'],['teens','plain'],['kids','stuffed']])for(const [device,viewport,mobile]of[['desktop',desktop,false],['mobile',phone,true]])await test(`carousel-${style}-${device}`,viewport,async({page,context,snap,result})=>{
    // Hold each sampled RAF timestamp fixed until its picture is captured. Production motion
    // code still computes every pose. Evidence is labeled sampled/accelerated.
    await context.addInitScript(()=>{window.__carouselTestTime=0;window.__carouselFreeze=false;const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raf(t=>cb(window.__carouselFreeze?window.__carouselFrozenBase+window.__carouselTestTime:t));});
    await enter(page,band);
    if(mobile)await page.getByRole('button',{name:'Look left',exact:true}).click();
    await page.getByRole('button',{name:'Walk toward Rides and Games',exact:true}).click({timeout:180000});await arrived(page,'rides-games');
    await page.waitForFunction(style=>window.carouselVariantDiagnostics?.().selected===style&&!carouselVariantDiagnostics().busy,style,{timeout:180000});
    if(mobile)for(let i=0;i<4;i++)await page.getByRole('button',{name:'Look left',exact:true}).click();
    const beforeFreeze=await page.evaluate(()=>{const before=Number(document.querySelector('.carousel-dressing').dataset.elapsed);window.__carouselFrozenBase=performance.now()+1000;window.__carouselFreeze=true;return before;});
    await page.waitForFunction(before=>Number(document.querySelector('.carousel-dressing').dataset.elapsed)>before+500,beforeFreeze);
    result.samplingMethod='Fixed-angle snapshots after arrival; ordinary-speed ride videos are separate.';
    const frames=[],period=await page.evaluate(()=>CarnivalCarousel.period);let canonical;
    for(let sample=0;sample<=16;sample++){
      if(sample){const target=await page.evaluate(()=>{const target=Number(document.querySelector('.carousel-dressing').dataset.elapsed)+CarnivalCarousel.period/8;window.__carouselTestTime+=CarnivalCarousel.period/8;return target;});await page.waitForFunction(target=>Number(document.querySelector('.carousel-dressing').dataset.elapsed)>=target-.01,target);}
      // The shared mount renderer consumes the carousel pose on the next RAF.
      // Wait for that frame rather than mistaking a sampled clock jump for drift.
      await page.waitForFunction(()=>{
        const yaw=Number(document.querySelector('.carousel-assembly').dataset.yaw);
        const mounts=[window.carouselHorseComparison,...window.carouselAnimalComparisons];
        return mounts.length===20&&mounts.every(m=>Math.abs(Math.atan2(Math.sin(m.carouselFrame.rotation.y+yaw),Math.cos(m.carouselFrame.rotation.y+yaw)))<.03);
      },null,{timeout:15000});
      const frame=await page.evaluate(()=>{
        const svg=document.querySelector('.carousel-dressing'),phase=Number(svg.dataset.phase),yaw=Number(svg.querySelector('.carousel-assembly').dataset.yaw);
        return {phase,yaw,mounts:carouselVariantDiagnostics().mounts.map(m=>{
          const slot=svg.querySelector(`[data-carousel-slot="${m.slot}"]`),anchor=slot.querySelector('.carousel-mount-anchor'),holder=anchor.querySelector('foreignObject,image'),collar=slot.querySelector('.carousel-crank-collar');
          const entry=m.identity==='horse'?carouselHorseComparison:carouselAnimalComparisons.find(e=>e.name===m.identity);
          return {...m,slotTransform:slot.getAttribute('transform'),expected:CarnivalCarousel.pose(m.slot-1,phase),anchor:anchor.getAttribute('transform'),collar:collar.getAttribute('transform'),attached:holder?.closest('[data-carousel-slot]')===slot,renderYaw:entry.carouselFrame.rotation.y,contextLost:entry.renderer.getContext().isContextLost(),shaftEnds:[...slot.querySelectorAll('.carousel-pole-shaft')].map(s=>Number(s.getAttribute('y'))+Number(s.getAttribute('height')))};
        })};
      });
      assert.equal(frame.mounts.length,20);
      result.details={style,sample,frame};
      for(const m of frame.mounts){assert(m.attached&&m.visible&&!m.contextLost,m.identity+' attachment/render');assert.equal(m.anchor,m.collar,m.identity+' collar follows mount');assert(m.shaftEnds.every(end=>Math.abs(end+4)<1e-5));assert(Math.abs(Math.atan2(Math.sin(m.renderYaw+frame.yaw),Math.cos(m.renderYaw+frame.yaw)))<.05,m.identity+' yaw follows carousel');const values=m.slotTransform.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);assert(Math.abs(values[0]-m.expected.x)<1e-5);assert(Math.abs(values[1]-m.expected.y)<1e-5);}
      const stable=frame.mounts.map(m=>({identity:m.identity,slot:m.slot,registration:m.registration,holder:m.holder,turn:m.turn,style:m.style}));
      if(!canonical)canonical=stable;else assert.deepEqual(stable,canonical,'Model-to-pole registration remains fixed across revolutions');
      frames.push({sample,simulatedAdvanceMs:sample*period/8,...frame});await snap(`revolution-${Math.floor(sample/8)+1}-angle-${sample%8}`);
    }
    result.details={style,frames,method:'Two revolutions sampled at 45-degree RAF timestamp increments; not a real-time 144-second recording. Pole/collar/anchor and model registrations asserted for all 20 occupied mounts. No separate rider system exists.'};
  },{mobile});
})().catch(e=>{results.push({name:'runner',passed:false,error:e.stack});process.exitCode=1;}).finally(async()=>{await browser?.close();await host?.close();if(!results.length)results.push({name:'selection',passed:false,error:'No test cases matched the requested selection.'});report();if(results.some(r=>!r.passed))process.exitCode=1;console.log('Evidence: '+out);});
