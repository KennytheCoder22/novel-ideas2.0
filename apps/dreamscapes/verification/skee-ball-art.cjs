const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../public/experiments/carnival');
const base=process.env.DREAMSCAPES_URL||'http://127.0.0.1:4204';
const entry=process.env.CARNIVAL_PATH||'/experiments/carnival/index.html';
const out=process.env.DREAMSCAPES_EVIDENCE_DIR||path.join(__dirname,'brass-review-evidence');fs.mkdirSync(out,{recursive:true});
const report={layouts:[],assets:{},pageErrors:[]};
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const sources=process.env.SKEE_APPROVED_SOURCE_DIR;
for(const [runtime,original] of [['approved-alley.png','Vintage Carnival Skee-Ball Glow.png'],['brass-reference.png','Antique Brass Lever Technical Views.png']]){
 const value=hash(path.join(root,'skee-ball',runtime));if(sources)assert.equal(value,hash(path.join(sources,original)));report.assets[runtime]=value;
}
async function state(p){return p.evaluate(()=>SkeeBallArtReview.state());}
async function point(p,x,y){return p.locator('.location-plane').last().evaluate((e,{x,y})=>{const r=e.getBoundingClientRect();return{x:r.left+x*r.width/1672,y:r.top+y*r.height/941}}, {x,y});}
async function settled(p){await p.waitForFunction(()=>!SkeeBallArtReview.state().pending&&!SkeeBallArtReview.state().spring);}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
 for(const [name,viewport,touch] of [['desktop',{width:1536,height:1024},false],['phone',{width:390,height:844},true],['landscape',{width:844,height:390},true]].filter(([name])=>!process.env.SKEE_LAYOUT||name===process.env.SKEE_LAYOUT)){
  const context=await browser.newContext({viewport,hasTouch:touch});const p=await context.newPage();p.on('pageerror',e=>report.pageErrors.push(e.message));
  p.on('response',r=>{if(r.status()>=400&&!new URL(r.url()).pathname.endsWith('/favicon.ico'))report.pageErrors.push(r.status()+' '+r.url());});
  await p.goto(base+entry+'?scene=skee-ball&skee-review=1');await p.waitForFunction(()=>document.documentElement.dataset.location==='skee-ball'&&!document.documentElement.dataset.travelling,{},{timeout:90000});
  await p.waitForFunction(()=>document.querySelector('.skee-art-game')?.dataset.brassReady==='true');
  await p.waitForFunction(()=>document.querySelector('.skee-art-game')?.dataset.clownReady==='true',null,{timeout:90000});
  assert.equal(await p.locator('.skee-board,.skee-controls,.skee-aim').count(),0,'No duplicate drawn machine or aim aids');
  const before=await p.evaluate(()=>SkeeBallArtReview.geometry());assert(before.sharedGeometry&&before.sharedMaterial);
  const bounds=before.armBounds;assert(Math.abs((bounds.max[1]-bounds.min[1])/25-.25)<.002);assert(Math.abs((bounds.max[2]-bounds.min[2])/25-.75)<.05);assert(Math.abs((bounds.max[0]+12.5)/25-6)<.05);
  const aim=p.getByRole('slider',{name:'Angle',exact:true}),launcher=p.getByRole('slider',{name:'Pull and release',exact:true});
  for(const control of [aim,launcher]){const r=await control.boundingBox();assert(r.width>=43.9&&r.height>=43.9);}
  await aim.focus();await p.keyboard.press('End');assert.equal((await state(p)).angle,35);await p.keyboard.press('ArrowRight');assert.equal((await state(p)).angle,35);await p.keyboard.press('Home');assert.equal((await state(p)).angle,-35);await p.keyboard.press('Escape');
  const a=await point(p,557,855),b=await point(p,590,850);
  if(touch){const cdp=await context.newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x,y:a.y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x,y:b.y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await p.mouse.move(a.x,a.y);await p.mouse.down();await p.mouse.move(b.x,b.y,{steps:6});await p.mouse.up();}
  assert((await state(p)).angle>10&& (await state(p)).angle<=35);
  const after=await p.evaluate(()=>SkeeBallArtReview.geometry());assert.deepEqual(after.leftBase,before.leftBase);assert.deepEqual(after.rightBase,before.rightBase);assert.notEqual(after.leftRotation,before.leftRotation);
  const l=await point(p,1030,827),r=await point(p,1030,899);
  if(touch){const cdp=await context.newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:l.x,y:l.y,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x,y:r.y,id:2}]});assert((await state(p)).pull>.95);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await p.mouse.move(l.x,l.y);await p.mouse.down();await p.mouse.move(r.x,r.y,{steps:10});assert((await state(p)).pull>.95);await p.screenshot({path:path.join(out,name+'-pulled.png')});await p.mouse.up();}
  assert((await state(p)).pending);assert.equal((await state(p)).angle,0);assert.equal((await state(p)).pull,0);
  await p.waitForFunction(()=>document.querySelector('.skee-art-game').dataset.ballPhase==='ramp');
  if(name==='desktop')await p.screenshot({path:path.join(out,'desktop-ramp.png')});
  await p.waitForFunction(()=>document.querySelector('.skee-art-game').dataset.ballPhase==='airborne');
  if(name==='desktop')await p.screenshot({path:path.join(out,'desktop-airborne.png')});
  await settled(p);assert.equal((await state(p)).balls,8);
  await launcher.focus();await p.keyboard.press('ArrowUp');await p.keyboard.press('ArrowUp');assert((await state(p)).pull>.09);await p.keyboard.press('Escape');assert.equal((await state(p)).pull,0);assert.equal((await state(p)).balls,8);
  await p.emulateMedia({reducedMotion:'reduce'});
  const scores=[];
  for(const [x,y,expected] of [[709,269,100],[964,269,100],[836,280,50],[835,317,40],[835,357,30],[835,397,20],[750,410,10],[1080,258,0]]){
   const result=await p.evaluate(({x,y})=>{const power=(464-y)/206,pull=Math.sqrt(power),angle=Math.atan((x-835)/(80+270*power))*180/Math.PI;const before=SkeeBallArtReview.state();SkeeBallArtReview.setAngle(angle);SkeeBallArtReview.setPull(pull);SkeeBallArtReview.shoot();return SkeeBallArtReview.state().total-before.total;},{x,y});
   assert.equal(result,expected,`${name} target ${expected}`);scores.push(result);
  }
  assert.equal((await state(p)).balls,0);assert.equal(await launcher.getAttribute('aria-disabled'),'true');
  const final=(await state(p)).total;await p.keyboard.press('Enter');assert.equal((await state(p)).total,final);
  await p.getByRole('button',{name:'Play again',exact:true}).click();assert.equal((await state(p)).balls,9);assert.equal((await state(p)).total,0);
  await launcher.focus();await p.keyboard.press('ArrowUp');await p.keyboard.press('ArrowUp');await p.keyboard.press('ArrowUp');await p.keyboard.press('ArrowUp');await p.keyboard.press('Enter');assert.equal((await state(p)).balls,8);assert.equal((await state(p)).total,0,'Weak roll stops before the ramp');
  await p.emulateMedia({reducedMotion:'no-preference'});await launcher.focus();await p.keyboard.down(' ');await p.waitForTimeout(820);await p.keyboard.up(' ');assert((await state(p)).pending,'Holding/releasing Space launches');
  await settled(p);assert.equal((await state(p)).balls,7);
  const alignment=await p.evaluate(()=>{const a=document.querySelector('[data-scene="skee-ball"] .location-background').getBoundingClientRect(),b=document.querySelector('.skee-art-overlay').getBoundingClientRect();return {image:{x:a.x,y:a.y,w:a.width,h:a.height},overlay:{x:b.x,y:b.y,w:b.width,h:b.height}};});
  assert.deepEqual(alignment.image,alignment.overlay);assert(Math.abs(alignment.image.w/alignment.image.h-1672/941)<.0001);
  await p.screenshot({path:path.join(out,name+'-ready.png')});
  if(name==='desktop'){
   await p.evaluate(()=>{SkeeBallArtReview.setPull(.85);SkeeBallArtReview.shoot();});await p.setViewportSize({width:1280,height:800});await settled(p);assert.equal((await state(p)).balls,6);
   await p.evaluate(()=>{SkeeBallArtReview.setPull(.7);SkeeBallArtReview.shoot();});await p.locator('[data-scene="skee-ball"] .room-route--return').click();await p.waitForFunction(()=>document.documentElement.dataset.location==='rides-games'&&!document.documentElement.dataset.travelling,{},{timeout:90000});
   const held=await state(p);assert.equal(held.balls,5);await p.locator('[data-scene="rides-games"] .location-path[data-to="skee-ball"]').dispatchEvent('click');await p.waitForFunction(()=>document.documentElement.dataset.location==='skee-ball'&&!document.documentElement.dataset.travelling);assert.equal((await state(p)).total,held.total);assert.equal((await state(p)).balls,5);
  }
  report.layouts.push({name,sharedDimensionalGeometry:true,fixedSpindles:true,pointerAngle:true,pullRelease:true,springReturn:true,rampAndFlight:true,allTargetScores:scores,keyboard:true,cancelWithoutShot:true,reducedMotion:true,completeRoundReplay:true,alignedImage:true,resizeAndDeparture:name==='desktop'});await context.close();console.log('PASS '+name);
 }
 assert.deepEqual(report.pageErrors,[]);fs.writeFileSync(path.join(out,'brass-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
