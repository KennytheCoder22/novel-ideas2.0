const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const out=process.env.DREAMSCAPES_EVIDENCE_DIR||path.join(__dirname,'forward-flight-evidence');fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const results=[];
try{for(const [name,viewport] of [['desktop',{width:1440,height:900}],['phone',{width:390,height:844}],['landscape',{width:844,height:390}]]){
 const p=await browser.newPage({viewport,hasTouch:name!=='desktop'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:4204/experiments/carnival/index.html?scene=skee-ball&skee-review=1');await p.waitForFunction(()=>window.SkeeBallArtReview&&document.querySelector('[data-clown-ready="true"][data-brass-ready="true"]'),null,{timeout:120000});
 const sampled=await p.evaluate(()=>{
  const r=SkeeBallArtReview,m=r.machine();return r.cups.slice(0,6).concat([{x:750,y:410,points:10},{x:1080,y:258,points:0}]).map(c=>{const power=(464-c.y)/206,angle=Math.atan((c.x-835)/(80+270*power))*180/Math.PI,shot=r.endpoint(angle,Math.sqrt(power));return{cup:c,shot,poses:Array.from({length:101},(_,i)=>r.ballPose(shot,.65+i*.249999/100)),landing:r.ballPose(shot,.9),crest:m.crest,wellEnd:m.wellEnd}});
 });
 for(const sample of sampled){const {poses,shot,landing}=sample;assert(poses.every(v=>v.world?.every(Number.isFinite)),'Flight uses the calibrated 3D world');for(let i=1;i<poses.length;i++){assert(poses[i].world[2]>poses[i-1].world[2],'Forward depth never reverses');assert(poses[i].r<poses[i-1].r,'Ball shrinks with distance');}assert(poses.at(-1).world[2]>sample.wellEnd,'Ball reaches scoring board behind collection well');assert(Math.hypot(poses.at(-1).x-shot.x,poses.at(-1).y-shot.y)<.01,'Visible flight reaches the scoring coordinate');assert(Math.abs(poses.at(-1).r-landing.r)<.01,'No size pop at target entry');}
 // Normal-speed shots through keyboard controls, including both 100 cups.
 const launcher=p.getByRole('slider',{name:'Pull and release',exact:true}),aim=p.getByRole('slider',{name:'Angle',exact:true}),scores=[];
 for(const [angle,pull,expected] of [[-21,.95,100],[22,.95,100],[0,.95,50],[0,.85,40],[0,.7,30],[0,.6,20],[0,.4,10],[35,1,0],[0,.2,0]]){
  await aim.focus();await p.keyboard.press('Escape');for(let i=0;i<Math.abs(angle);i++)await p.keyboard.press(angle<0?'ArrowLeft':'ArrowRight');await launcher.focus();await p.keyboard.press('End');for(let i=0;i<Math.round((1-pull)/.05);i++)await p.keyboard.press('ArrowDown');
  const before=await p.evaluate(()=>SkeeBallArtReview.state().total);await p.keyboard.press('Enter');
  if(pull>.3){await p.waitForFunction(()=>document.querySelector('.skee-art-game').dataset.ballPhase==='airborne');if(expected===40)await p.screenshot({path:path.join(out,name+'-forward-flight.png')});}
  await p.waitForFunction(()=>!SkeeBallArtReview.state().pending);const state=await p.evaluate(()=>SkeeBallArtReview.state());assert.equal(state.total-before,expected,`${name} score ${expected}`);scores.push(expected);
 }
 await p.waitForFunction(()=>SkeeBallArtReview.state().roundPhase==='complete',null,{timeout:45000});await p.waitForTimeout(2000);
 const final=await p.evaluate(()=>SkeeBallArtReview.state());assert.equal(final.total,350);assert.equal(final.balls,0);assert.equal(final.ballsPrepared,9);assert.equal(final.shotsLaunched,9);assert.equal(final.clownStarts,1);assert.equal(final.ballPresent,false);
 await p.getByRole('button',{name:'Play again',exact:true}).click();assert.equal(await p.evaluate(()=>SkeeBallArtReview.state().balls),9);assert.equal(await p.evaluate(()=>SkeeBallArtReview.state().total),0);assert.deepEqual(errors,[]);
 results.push({name,scores,forwardDepth:true,perspectiveSize:true,reachesEveryCup:true,normalSpeedKeyboard:true,exactlyNine:true,noTenth:true,cleanReplay:true,errors,sampled});console.log('PASS '+name+': forward flight, all targets, nine-ball round');await p.close();
}fs.writeFileSync(path.join(out,'forward-flight-results.json'),JSON.stringify(results,null,2));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
