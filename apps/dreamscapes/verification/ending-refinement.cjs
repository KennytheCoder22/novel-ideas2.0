// Local browser regression and optional fixed-cadence review renders.
// Set PLAYWRIGHT_MODULE / BROWSER_EXE only when using an external installation.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const app=path.resolve(__dirname,'..'),capture=process.argv.includes('--capture');
const out=path.resolve(process.env.DREAMSCAPES_EVIDENCE_DIR||path.join(app,'playtest-artifacts/ending-refinement'));
const baseline='7c9a27a9bb45fe6fc5c908cc3df7a8a06376c307',results=[];
const layouts=[['desktop',{width:1440,height:900}],['phone',{width:390,height:844}],['landscape',{width:844,height:390}]];
let browser,host;
fs.mkdirSync(out,{recursive:true});
async function ready(page,url,check){await page.goto(host.url+url,{waitUntil:'domcontentloaded',timeout:120000});await page.waitForFunction(check,null,{timeout:120000});}
async function snap(page,dir,name){await page.screenshot({path:path.join(dir,name+'.jpg'),type:'jpeg',quality:90});}
(async()=>{
 host=await(await import(pathToFileURL(path.join(app,'tools/playtest-server.mjs')).href)).startPlaytestServer();
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXE?{executablePath:process.env.BROWSER_EXE}:{})});
 for(const [name,viewport]of layouts.filter(([name])=>!process.env.DREAMSCAPES_LAYOUT||process.env.DREAMSCAPES_LAYOUT.split(',').includes(name))){
  const dir=path.join(out,name);fs.mkdirSync(dir,{recursive:true});const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/mara-sand.js*',async route=>{const response=await route.fetch();let body=await response.text();body=body.replace(' const source=rig.mesh',' window.__maraBuilds=(window.__maraBuilds||0)+1; const source=rig.mesh');await route.fulfill({body,contentType:'text/javascript'});});
  await ready(page,'/carnival/?mara-review=1',()=>!!window.MaraMidway?.state().loaded);
  await page.getByRole('button',{name:'3D Mara',exact:true}).click();
  if(name==='phone')await page.getByRole('button',{name:'Look right',exact:true}).click();
  await page.addStyleTag({content:'.mara-review-panel{display:none}'});
  let builds=await page.evaluate(()=>window.__maraBuilds);assert(builds>0,'Prepared during load');
  await snap(page,dir,'mara-before-pickup');
  await page.evaluate(()=>{window.__frameGaps=[];let previous;function measure(now){const s=MaraMidway.state();if(previous&&s.pickup)window.__frameGaps.push({milliseconds:now-previous,elapsed:s.pickup.elapsed,phase:s.phase});previous=now;if(!s.pickup||s.phase!=='remains')requestAnimationFrame(measure);}requestAnimationFrame(measure);});
  // Click the visible part, as a player would. Locator auto-scrolling can move
  // the artwork inside an overflow-clipped landscape view before clicking.
  const fox=await page.getByRole('button',{name:'Examine Mara, the abandoned stuffed fox',exact:true}).boundingBox();
  const left=Math.max(0,fox.x),right=Math.min(viewport.width,fox.x+fox.width),top=Math.max(0,fox.y),bottom=Math.min(viewport.height,fox.y+fox.height);
  assert(right>left&&bottom>top,'Mara is available in the player viewport');await page.mouse.click((left+right)/2,(top+bottom)/2);
  builds=await page.evaluate(()=>window.__maraBuilds);
  await page.waitForFunction(()=>MaraMidway.state().phase==='remains',null,{timeout:45000});
  const live=await page.evaluate(()=>({builds:window.__maraBuilds,gaps:window.__frameGaps,state:MaraMidway.state()}));
  assert.equal(live.builds,builds,'No geometry build during playback');assert.equal(live.state.sand.tagGrounded,true);assert.equal(live.state.sand.bodyVisible,false);
  assert.equal(live.state.sand.tagTriangles,3);assert.equal(live.state.sand.bodyTriangles,9702);
  const handoff=live.gaps.filter(f=>f.elapsed>1.6&&f.elapsed<1.9),maxHandoff=Math.max(...handoff.map(f=>f.milliseconds));
  assert(maxHandoff<500,'No half-second handoff freeze: '+maxHandoff);
  // A second pickup must reuse all warmed geometry and restore grains/tag state.
  for(const [label,t]of[['lift',.55],['center',1.65],['crumble-start',1.9],['midpoint',2.5],['disappearance',7.3]]){
   await page.evaluate(t=>MaraMidway.pickupFrame(t),t);await snap(page,dir,'mara-'+label);
  }
  assert(await page.evaluate(()=>Number(getComputedStyle(document.querySelector('.mara-canvas')).zIndex)>Number(getComputedStyle(document.querySelector('.crow')).zIndex)),'Pickup stays in front of distant scene dressing');
  assert.equal(await page.evaluate(()=>window.__maraBuilds),builds,'Repeat preview reuses preparation');
  if(capture&&name==='desktop'){
   const frames=path.join(dir,'mara-frames');fs.mkdirSync(frames,{recursive:true});
   await page.evaluate(()=>MaraMidway.show('model'));
   for(let i=0;i<255;i++){const t=i/30-.5;if(t>=0)await page.evaluate(t=>MaraMidway.pickupFrame(t),t);await page.screenshot({path:path.join(frames,String(i).padStart(4,'0')+'.jpg'),type:'jpeg',quality:92});}
  }
  const mara={builds,maxHandoffMilliseconds:maxHandoff,maxFrameMilliseconds:Math.max(...live.gaps.map(f=>f.milliseconds)),gaps:live.gaps,checkpoints:['before-pickup','lift','center','crumble-start','midpoint','disappearance']};
  if(process.argv.includes('--mara-only')){assert.deepEqual(errors,[]);results.push({name,viewport,mara,layering:true,errors,passed:true});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results},null,2));console.log('PASS Mara '+name+': warmed handoff, layering and checkpoints');await context.close();continue;}
  await page.unroute('**/mara-sand.js*');
  // Capture the exact pre-refinement image in the same viewport and engine.
  for(const file of ['skee-ball-clown.js','skee-ball-art.css'])await page.route('**/'+file+'*',route=>route.fulfill({contentType:file.endsWith('.css')?'text/css':'text/javascript',body:execFileSync('git',['show',`${baseline}:apps/dreamscapes/public/experiments/carnival/${file}`],{cwd:app})}));
  await ready(page,'/carnival/?scene=skee-ball&clown-review=1',()=>!!window.SkeeBallArtReview?.clown()&&!document.documentElement.dataset.travelling);
  await page.evaluate(()=>SkeeBallArtReview.seekClown(SkeeBallArtReview.clown().timings.scareStart+.5));await snap(page,dir,'clown-before');
  for(const file of ['skee-ball-clown.js','skee-ball-art.css'])await page.unroute('**/'+file+'*');
  await ready(page,'/carnival/?scene=skee-ball&clown-review=1',()=>!!window.SkeeBallArtReview?.clown()&&!document.documentElement.dataset.travelling);
  await page.addStyleTag({content:'.skee-clown-review{display:none}'});
  const timings=await page.evaluate(()=>SkeeBallArtReview.clown().timings);
  assert(Math.abs(timings.end-timings.scareStart-1)<1e-9);assert(Math.abs(timings.scareStart-timings.pomFadeStart-1)<1e-9);
  for(const [t,visible]of[[timings.scareStart-.001,false],[timings.scareStart,true],[timings.end-.001,true],[timings.end,false]]){await page.evaluate(t=>SkeeBallArtReview.seekClown(t),t);assert.equal(await page.locator('.skee-clown-ending').isVisible(),visible);}
  await page.evaluate(t=>SkeeBallArtReview.seekClown(t),timings.scareStart+.5);await snap(page,dir,'clown-after');
  const frame=await page.locator('.skee-clown-ending').boundingBox();assert.deepEqual(frame,{x:0,y:0,...viewport});
  const face=await page.locator('.skee-clown-scare').evaluate(e=>{const r=e.getBoundingClientRect(),scale=r.width/e.naturalWidth;return{x:r.left+680*scale,y:r.top+775*scale,filter:getComputedStyle(e).filter,source:e.getAttribute('src').split('/').pop()};});
  assert(Math.abs(face.x-viewport.width/2)<.1&&Math.abs(face.y-viewport.height/2)<.1,'Facial anchor centered');assert.equal(face.source,'clown-closeup.png');assert.match(face.filter,/brightness\(0.64\)/);
  if(capture&&name==='desktop'){
   const frames=path.join(dir,'clown-frames');fs.mkdirSync(frames,{recursive:true});
   for(let i=0;i<Math.ceil((timings.end+.6)*30);i++){await page.evaluate(t=>SkeeBallArtReview.seekClown(t),Math.min(i/30,timings.end));await page.screenshot({path:path.join(frames,String(i).padStart(4,'0')+'.jpg'),type:'jpeg',quality:92});}
  }
  await page.addStyleTag({content:'.skee-clown-review{display:block}'});await page.getByRole('button',{name:'Reset shelf',exact:true}).click();
  for(let ball=1;ball<=3;ball++){const pull=page.getByRole('slider',{name:'Pull and release',exact:true});for(let step=0;step<12;step++)await pull.press('ArrowUp');await pull.press('Enter');await page.waitForFunction(()=>!SkeeBallArtReview.state().pending);assert.equal(await page.evaluate(()=>SkeeBallArtReview.state().shotsLaunched),ball);}
  await page.waitForFunction(()=>SkeeBallArtReview.state().roundPhase==='complete',null,{timeout:45000});
  const complete=await page.evaluate(()=>SkeeBallArtReview.state());assert.equal(complete.clownStarts,1);assert.equal(complete.balls,0);assert.equal(complete.ballPresent,false);
  await page.getByRole('button',{name:'Play again',exact:true}).click();assert.equal(await page.evaluate(()=>SkeeBallArtReview.state().balls),3);assert.equal(await page.locator('.skee-clown-ending').isVisible(),false);
  await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Replay ending',exact:true}).click({force:true});assert.equal(await page.locator('.skee-clown-ending').isVisible(),false);
  assert.deepEqual(errors,[]);results.push({name,viewport,mara,clown:{face,timings,exactlyThree:true,replay:true,reducedMotion:true},errors,passed:true});
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({baseline,recordingMethod:capture?'Frame-stepped engine render at 30 fps; real-time playback measured separately.':'Live playback and checkpoint screenshots.',results},null,2));
  console.log('PASS '+name+': Mara handoff '+maxHandoff.toFixed(1)+' ms; centered muted clown; three-ball ending/replay');await context.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await host?.close();});
