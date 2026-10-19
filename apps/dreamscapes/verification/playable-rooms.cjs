const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.DREAMSCAPES_URL||'http://127.0.0.1:4204',entry=process.env.CARNIVAL_PATH||'/experiments/carnival/index.html';
const out=process.env.DREAMSCAPES_EVIDENCE_DIR||__dirname;fs.mkdirSync(out,{recursive:true});
const report={layouts:[],pageErrors:[]};
async function arrived(p,id){await p.waitForFunction(id=>document.documentElement.dataset.location===id&&!document.documentElement.dataset.travelling,id,{timeout:90000});}
async function visibleClick(p,selector){
 const button=p.locator(selector);
 for(let i=0;i<5;i++){
  const box=await button.boundingBox(),width=await p.evaluate(()=>innerWidth);
  if(box.x>=0&&box.x+box.width<=width)break;
  const way=box.x<0?'Look left':'Look right';
  await p.locator('.location-view:not([inert]) .location-look').getByRole('button',{name:way,exact:true}).click();
 }
 await button.click();
}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
 for(const [name,viewport,band] of [['desktop',{width:1536,height:1024},'adults'],['mobile',{width:390,height:844},'kids']]){
  const context=await browser.newContext({viewport,hasTouch:name==='mobile'});await context.addInitScript(band=>localStorage.setItem('dreamscapes.age-band',band),band);
  const p=await context.newPage();p.on('pageerror',e=>report.pageErrors.push(e.message));
  await p.goto(base+entry+'?scene=rides-games&motion=still');await arrived(p,'rides-games');
  await visibleClick(p,'[data-scene="rides-games"] .location-sign[data-sign="FUN HOUSE"]');await arrived(p,'fun-house');
  assert.equal(await p.locator('.room-route--onward').isVisible(),false);
  for(const kind of ['tall','wide','endless']){
   const mirror=p.locator('.funhouse-mirror--'+kind);
   for(let tab=0;tab<12&&!(await mirror.evaluate(e=>e===document.activeElement));tab++)await p.keyboard.press('Tab');
   assert(await mirror.evaluate(e=>e===document.activeElement),'Keyboard did not reach '+kind+' mirror');
   await p.waitForFunction(kind=>{const r=document.querySelector('.funhouse-mirror--'+kind).getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&document.querySelector('[data-scene="fun-house"]').scrollLeft===0},kind);
   await p.keyboard.press('Enter');assert.equal(await mirror.getAttribute('aria-pressed'),'true');
  }
  assert.equal(await p.locator('.room-route--onward').isVisible(),true);await p.screenshot({path:path.join(out,'mirrors-'+name+'.png')});
  await p.locator('.room-route--onward').click();await arrived(p,'tent-row');
  await p.locator('[data-scene="tent-row"] .location-path[data-to="midway"]').dispatchEvent('click');await arrived(p,'midway');
  await p.locator('.entrance').click();await arrived(p,'rides-games');
  await visibleClick(p,'[data-scene="rides-games"] .location-sign[data-sign="RIDES"]');await arrived(p,'ferris-platform');
  await p.locator('[data-scene="ferris-platform"] .location-path[data-to="midway"]').dispatchEvent('click');await arrived(p,'midway');
  await p.locator('.entrance').click();await arrived(p,'rides-games');
  await visibleClick(p,'[data-scene="rides-games"] .location-sign[data-sign="SKEE BALL"]');await arrived(p,'skee-ball');
  const cup=await p.locator('.skee-board').evaluate(svg=>{const p=new DOMPoint(151,64).matrixTransform(svg.getScreenCTM());return{x:p.x,y:p.y}});
  if(name==='mobile')await p.touchscreen.tap(cup.x,cup.y);else await p.mouse.click(cup.x,cup.y);
  const roll=p.getByRole('button',{name:'Roll ball',exact:true});await roll.focus();await p.keyboard.press('Enter');assert.equal(await roll.isDisabled(),true);await p.keyboard.press('Enter');
  await p.waitForFunction(()=>document.querySelector('[aria-label="Score"]').textContent==='Score 100');
  assert.equal(await p.getByLabel('Balls remaining',{exact:true}).textContent(),'8 balls left');
  await p.getByRole('slider',{name:'Aim',exact:true}).fill('100');await p.getByRole('slider',{name:'Power',exact:true}).fill('100');
  await roll.click();await p.waitForFunction(()=>document.querySelector('[aria-label="Balls remaining"]').textContent==='7 balls left');assert.equal(await p.getByLabel('Score',{exact:true}).textContent(),'Score 100');
  await p.getByRole('slider',{name:'Aim',exact:true}).fill('0');await p.getByRole('slider',{name:'Power',exact:true}).fill('88');await roll.click();
  await p.locator('[data-scene="skee-ball"] .room-route--return').click();await arrived(p,'rides-games');
  await visibleClick(p,'[data-scene="rides-games"] .location-path[data-to="skee-ball"]');await arrived(p,'skee-ball');
  assert.equal(await p.getByLabel('Score',{exact:true}).textContent(),'Score 150');assert.equal(await p.getByLabel('Balls remaining',{exact:true}).textContent(),'6 balls left');
  await p.emulateMedia({reducedMotion:'reduce'});await p.getByRole('slider',{name:'Aim',exact:true}).fill('-50');await p.getByRole('slider',{name:'Power',exact:true}).fill('100');
  for(let i=0;i<6;i++)await roll.click();assert.equal(await p.getByLabel('Score',{exact:true}).textContent(),'Score 750');assert.equal(await roll.isDisabled(),true);
  await p.screenshot({path:path.join(out,'skee-ball-'+name+'.png')});
  await p.getByRole('button',{name:'Play again',exact:true}).focus();await p.keyboard.press('Enter');assert.equal(await p.getByLabel('Score',{exact:true}).textContent(),'Score 0');assert.equal(await p.getByLabel('Balls remaining',{exact:true}).textContent(),'9 balls left');
  const exit=p.locator('[data-scene="skee-ball"] .carnival-exit');await exit.focus();await p.keyboard.press('Enter');await p.waitForURL(base+'/');
  report.layouts.push({name,band,funHouseEntrance:true,keyboardPanning:true,threeMirrors:true,onwardToTentRow:true,ridesSignToFerris:true,skeeBallSign:true,touchOrMouseAim:true,keyboardRoll:true,doubleActivationGuard:true,missScoresZero:true,leavingDuringRoll:true,roundPersists:true,nineBallRound:true,replay:true,reducedMotion:true,exit:true});
  await context.close();console.log('PASS '+name);
 }
 const p=await browser.newPage();await p.route('**/locations/fun-house.png',r=>r.abort());
 await p.goto(base+entry+'?scene=fun-house&motion=still');await p.waitForFunction(()=>!document.querySelector('main').inert&&[...document.querySelectorAll('[role="status"]')].some(e=>e.textContent.includes('could not load')));
 assert.equal(await p.locator('[data-scene="fun-house"]').count(),0);assert.equal(await p.locator('.play-room-ui').count(),0);report.failedRoomLoadCleanup=true;
 assert.deepEqual(report.pageErrors,[]);fs.writeFileSync(path.join(out,'playable-rooms-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
