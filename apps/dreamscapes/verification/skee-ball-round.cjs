const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.DREAMSCAPES_EVIDENCE_DIR||__dirname+'/round-evidence';fs.mkdirSync(out,{recursive:true});
(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const results=[];
try{for(const[name,viewport]of[['desktop',{width:1536,height:1024}],['phone',{width:390,height:844}],['landscape',{width:844,height:390}]]){
 const p=await b.newPage({viewport,hasTouch:name!=='desktop'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:4204/experiments/carnival/index.html?scene=skee-ball&skee-review=1');
 await p.waitForFunction(()=>!!window.SkeeBallArtReview?.clown()&&!!SkeeBallArtReview.machine(),null,{timeout:90000});
 const m=await p.evaluate(()=>SkeeBallArtReview.machine());assert(Math.abs(m.rampLengthMeters-.1524)<1e-8);assert(m.wellFloor<0);assert(m.wellEnd>m.crest);assert(m.landing<m.toe);assert.equal(m.rampSamples[0].world[1],0);assert.equal(m.rampSamples.at(-1).world[1],m.rise);assert(m.rampSamples.every((s,i,a)=>i===0||s.world[1]>=a[i-1].world[1]));
 const poses=await p.evaluate(()=>{const s=SkeeBallArtReview.endpoint(0,.8);return [.49,.57,.649,.72,.85,.95].map(u=>SkeeBallArtReview.ballPose(s,u));});assert.equal(poses[0].phase,'ramp');assert.equal(poses[3].phase,'airborne');assert(poses[3].y<poses[3].groundY);
 await p.screenshot({path:path.join(out,name+'-construction.png')});
 const shot=()=>p.evaluate(()=>{SkeeBallArtReview.setPull(.6);SkeeBallArtReview.shoot();});
 // Real timed shots: no fast-forward or reduced motion during this regression.
 for(let i=0;i<9;i++){await shot();await p.waitForFunction(()=>!SkeeBallArtReview.state().pending);const s=await p.evaluate(()=>SkeeBallArtReview.state());assert.equal(s.balls,8-i);assert.equal(s.shotsLaunched,i+1);assert.equal(s.ballsPrepared,Math.min(i+2,9));if(i<8)assert.equal(s.clownStarts,0);}
 let s=await p.evaluate(()=>SkeeBallArtReview.state());const final=s.total;assert(final>0);assert.equal(s.clownStarts,1);assert.equal(s.roundPhase,'clown');assert.equal(s.ballPresent,false);assert.equal(s.ballAvailable,false);assert.equal(await p.getByRole('button',{name:'Play again',exact:true}).count(),0);assert.equal(await p.getByRole('slider',{name:'Pull and release',exact:true}).getAttribute('aria-disabled'),'true');
 // Repeat input and lifecycle notifications while the sequence is running.
 await p.evaluate(()=>{for(let i=0;i<12;i++){SkeeBallArtReview.setPull(1);SkeeBallArtReview.shoot();}document.dispatchEvent(new Event('visibilitychange'));});
 await p.waitForFunction(()=>SkeeBallArtReview.state().roundPhase==='complete',null,{timeout:45000});
 await p.waitForTimeout(2200);s=await p.evaluate(()=>SkeeBallArtReview.state());assert.equal(s.total,final);assert.equal(s.balls,0);assert.equal(s.ballsPrepared,9);assert.equal(s.shotsLaunched,9);assert.equal(s.clownStarts,1);assert.equal(s.ballPresent,false);assert.equal(s.pending,null);assert.equal(await p.locator('.skee-ball-motion circle').getAttribute('opacity'),'0');assert.equal(await p.locator('.skee-ball-motion ellipse').getAttribute('opacity'),'0');
 await p.screenshot({path:path.join(out,name+'-completed.png')});
 if(name==='desktop'){
 await p.locator('[data-scene="skee-ball"] .room-route--return').click();await p.waitForFunction(()=>document.documentElement.dataset.location==='rides-games'&&!document.documentElement.dataset.travelling);
 await p.locator('[data-scene="rides-games"] .location-path[data-to="skee-ball"]').dispatchEvent('click');await p.waitForFunction(()=>document.documentElement.dataset.location==='skee-ball'&&!document.documentElement.dataset.travelling);
 assert.equal((await p.evaluate(()=>SkeeBallArtReview.state())).ballsPrepared,9);assert.equal((await p.evaluate(()=>SkeeBallArtReview.state())).ballPresent,false);
 }
 await p.getByRole('button',{name:'Play again',exact:true}).click();s=await p.evaluate(()=>SkeeBallArtReview.state());assert.equal(s.roundId,2);assert.equal(s.total,0);assert.equal(s.balls,9);assert.equal(s.ballsPrepared,1);assert.equal(s.ballPresent,true);assert.equal(s.clownStarts,0);assert.equal(s.roundPhase,'ready');assert.equal(await p.evaluate(()=>SkeeBallArtReview.clown().phase),'waiting');
 // Next round really accepts its first shot, then reduced motion finalizes cleanly.
 await p.emulateMedia({reducedMotion:'reduce'});await shot();assert.equal((await p.evaluate(()=>SkeeBallArtReview.state())).balls,8);
 for(let i=0;i<8;i++)await shot();await p.waitForFunction(()=>SkeeBallArtReview.state().roundPhase==='complete');s=await p.evaluate(()=>SkeeBallArtReview.state());assert.equal(s.ballsPrepared,9);assert.equal(s.clownStarts,1);assert.equal(s.ballPresent,false);assert.deepEqual(errors,[]);
 results.push({name,exactlyNine:true,ninthScores:true,noTenthAfterSequence:true,singleClown:true,controlsLocked:true,explicitReplayOnly:true,reducedMotion:true,finalScore:final,construction:m});await p.close();console.log('PASS nine-ball lifecycle '+name);
}fs.writeFileSync(path.join(out,'round-results.json'),JSON.stringify(results,null,2));}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
