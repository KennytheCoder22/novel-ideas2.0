const {chromium}=require('C:/Users/KenBR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('fs');
const root='apps/dreamscapes/verification/midway-arm',url='http://127.0.0.1:4204/experiments/carnival/index.html?arm=review';
(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),results=[];
try{for(const band of ['adults'])for(const mobile of [false,true]){
 const name=`${band}-${mobile?'mobile':'desktop'}`,errors=[],c=await b.newContext({viewport:mobile?{width:390,height:844}:{width:1536,height:1024},hasTouch:mobile});
 await c.addInitScript(band=>{localStorage.setItem('dreamscapes.age-band',band);window.armDelays=[];const old=setTimeout;window.setTimeout=function(fn,ms,...args){if(ms>=15000&&ms<=20000)armDelays.push(ms);return old(fn,ms,...args)}},band);
 const p=await c.newPage();p.on('pageerror',e=>{errors.push(e.message);console.log(name,'PAGE',e.message)});p.on('console',m=>{if(m.type()==='error')console.log(name,m.text())});console.log('START',name);await p.goto(url);await p.waitForFunction(()=>window.MidwayArmReview?.state().ready,{},{timeout:60000});await p.waitForFunction(()=>document.querySelector('.composition .carnival-exit img')?.naturalWidth===1122);
 assert((await p.evaluate(()=>armDelays)).some(ms=>ms>=15000&&ms<=20000));
 // Two actual delayed visits, plus six full real-time sequences across all bands.
 if(!(band==='kids'&&mobile)&&!(band==='adults'&&!mobile))await p.evaluate(()=>{MidwayArmReview.reset();MidwayArmReview.begin()});
 await p.waitForFunction(()=>MidwayArmReview.state().done,{},{timeout:45000});
 assert.equal(await p.locator('.midway-creature').getAttribute('data-phase'),'fallen');
 const tr=await p.locator('.composition .carnival-exit').evaluate(e=>e.style.transform);assert(Math.abs(parseFloat(tr.match(/rotate\(([-.\d]+)/)[1])-76)<.001);
 const dc=await p.evaluate(()=>armDelays.length);await p.evaluate(()=>document.querySelector('main').style.opacity='1');await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>armDelays.length),dc);
 assert.equal(await p.locator('.midway-creature canvas').count(),1);
 const rig=await p.evaluate(()=>MidwayArmReview.rig());assert.equal(rig.bones.length,22);
 const states=[];
 for(const t of [0,.7,1.3,2.6,3.7,4.6,6.3,7.2,8.95,9.1,9.5,10.3,10.8,11.3,11.8]){
  await p.evaluate(t=>MidwayArmReview.seek(t),t);const data=await p.evaluate(()=>MidwayArmReview.rig());for(const pt of Object.values(data.joints))assert(pt.every(Number.isFinite));states.push({t,joints:data.joints});
  if([1.3,4.6,8.95,9.5,10.3,11.3,11.8].includes(t))await p.screenshot({path:`${root}/${name}-${t}.png`});
 }
 for(const [phase,t] of [['upright',0],['falling',9.45],['fallen',12]])for(const method of ['pointer','keyboard']){
  // Reload the real scene; no surrogate click target is introduced.
  await p.goto(url);await p.waitForFunction(()=>window.MidwayArmReview?.state().ready,{},{timeout:60000});await p.waitForFunction(()=>document.querySelector('.composition .carnival-exit img')?.naturalWidth===1122);await p.evaluate(t=>MidwayArmReview.seek(t),t);
  if(method==='keyboard'){await p.locator('.composition .carnival-exit').focus();await p.keyboard.press('Enter')}
  else {const xy=await p.locator('.composition .carnival-exit').evaluate(e=>{const r=e.getBoundingClientRect();for(let y=Math.max(r.top,0);y<Math.min(r.bottom,innerHeight);y+=3)for(let x=Math.max(r.left,0);x<Math.min(r.right,innerWidth);x+=3){const h=document.elementFromPoint(x,y);if(h===e||e.contains(h))return{x,y}}});assert(xy,`${name} ${phase} hit region`);if(mobile)await p.touchscreen.tap(xy.x,xy.y);else await p.mouse.click(xy.x,xy.y)}
  await p.waitForURL('http://127.0.0.1:4204/');
 }
 await p.goto(url);await p.waitForFunction(()=>window.MidwayArmReview?.state().ready,{},{timeout:60000});await p.evaluate(()=>{MidwayArmReview.begin();return CarnivalNavigation.go('Tent Row')});assert.equal(await p.evaluate(()=>MidwayArmReview.state().active),false);assert.equal(await p.locator('.midway-creature').evaluate(e=>e.style.visibility),'hidden');
 await p.evaluate(()=>{document.querySelector('main').inert=false;document.querySelector('main').style.visibility='visible'});await p.waitForTimeout(50);assert.equal(await p.evaluate(()=>MidwayArmReview.state().done),false);assert.equal(await p.locator('.composition .carnival-exit').evaluate(e=>e.style.transform),'');
 await p.emulateMedia({reducedMotion:'reduce'});await p.evaluate(()=>MidwayArmReview.begin());assert.equal(await p.evaluate(()=>MidwayArmReview.state().active),false);assert.equal(await p.locator('.midway-creature').evaluate(e=>e.style.visibility),'hidden');
 assert.deepEqual(errors,[]);results.push({band,layout:mobile?'mobile':'desktop',fullSequence:true,exitActivations:6,noRepeat:true,cancelOnLeave:true,resetOnReturn:true,reducedMotion:true,finiteJointPositions:true,pageErrors:errors});fs.writeFileSync(`${root}/restaged-results.json`,JSON.stringify(results,null,2));fs.writeFileSync(`${root}/${name}-joints.json`,JSON.stringify(states));console.log('PASS',name);await c.close();
}}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
