const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.DREAMSCAPES_EVIDENCE_DIR||path.join(__dirname,'clown-perspective-evidence');fs.mkdirSync(out,{recursive:true});
const base=process.env.DREAMSCAPES_URL||'http://127.0.0.1:4204',results=[];
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  for(const [name,viewport] of [['desktop',{width:1536,height:1024}],['phone',{width:390,height:844}],['landscape',{width:844,height:390}]].filter(([name])=>!process.env.SKEE_LAYOUT||process.env.SKEE_LAYOUT===name)){
   const p=await browser.newPage({viewport}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
   await p.goto(base+'/experiments/carnival/index.html?scene=skee-ball&clown-review=1');
   await p.waitForFunction(()=>!!window.SkeeBallArtReview?.clown(),null,{timeout:90000});
   const idle=await p.evaluate(()=>SkeeBallArtReview.clown()),gameBefore=await p.evaluate(()=>SkeeBallArtReview.state());assert.equal(idle.phase,'waiting');assert.equal(idle.scale,1);assert(idle.jumpPlan.minimumClearance>=.045);assert(idle.pomVertices>0);
   const info=await p.evaluate(()=>SkeeBallArtReview.inspectClown());
   fs.writeFileSync(path.join(out,name+'-analysis.json'),JSON.stringify(info,null,2));
   const expected=[[1208,714],[462,714],[1044.5,497.46],[625.5,497.46]];
   info.calibration.corners.forEach((c,i)=>{assert(Math.abs(c.image.x-expected[i][0])<1);assert(Math.abs(c.image.y-expected[i][1])<1);});
   assert(info.proxies.length>=20);assert(info.proxies.every(p=>p.colorWrite===false&&p.depthWrite===true));
   const crossing=info.trajectory.filter(s=>s.crossesFence);assert(crossing.length>0);assert(crossing.every(s=>s.fenceClearance>.04));
   const land=info.trajectory.filter(s=>s.phase==='landing');assert(land.length>0);for(const s of land){assert.equal(s.root[0],0);assert.equal(s.root[2],4.4);assert(s.contacts.every(f=>Math.abs(f.y)<.02));}
   const run=info.trajectory.filter(s=>s.phase==='approach');assert(run.length>20);for(const s of run){assert.equal(s.root[0],0);assert(s.bounds.min[0]>-.99&&s.bounds.max[0]<.99,JSON.stringify(s));assert(Math.abs(Math.min(...s.contacts.map(f=>f.y)))<.00001);assert(s.contacts.every(f=>f.y>-.00001));assert(Math.abs(s.footProjection.x-835)<1);}
   const firstHeight=run[0].projectedBounds.bottom-run[0].projectedBounds.top,lastHeight=run.at(-1).projectedBounds.bottom-run.at(-1).projectedBounds.top;assert(lastHeight>firstHeight*1.25);
   assert(info.trajectory.filter(s=>s.phase==='hop').every(s=>s.projectedBounds.top>-12),'Jump stays in the artwork frame');
   await p.screenshot({path:path.join(out,name+'-shelf.png')});
   await p.getByRole('button',{name:'Replay clown',exact:true}).click();await p.waitForTimeout(350);assert((await p.evaluate(()=>SkeeBallArtReview.clown())).playing);assert.equal((await p.evaluate(()=>SkeeBallArtReview.state())).balls,gameBefore.balls);
   await p.getByRole('button',{name:'Pause / resume',exact:true}).click();
   for(const [stage,t] of [['jump',idle.timings.launch+idle.jumpPlan.flight*.5],['landing',idle.timings.land+.38],['run',idle.timings.evaporate-.08],['pompom',idle.timings.bodyGone+.32],['gone',idle.timings.end]]){
    await p.getByRole('slider',{name:'Clown sequence timeline'}).evaluate((e,t)=>{e.value=t;e.dispatchEvent(new Event('input',{bubbles:true}));},t);
    const state=await p.evaluate(()=>SkeeBallArtReview.clown());assert.equal(state.scale,1);if(stage==='pompom'){assert.equal(state.phase,'pompom');assert(state.pomOpacity>.8);}if(stage==='gone')assert(!state.bodyVisible);
    await p.screenshot({path:path.join(out,name+'-'+stage+'.png')});
   }
   await p.getByText('Show invisible proxy outlines',{exact:false}).click();await p.screenshot({path:path.join(out,name+'-proxies.png')});await p.getByText('Show invisible proxy outlines',{exact:false}).click();
   await p.getByRole('button',{name:'Reset shelf',exact:true}).click();assert.equal((await p.evaluate(()=>SkeeBallArtReview.clown())).phase,'waiting');assert.equal((await p.evaluate(()=>SkeeBallArtReview.state())).balls,gameBefore.balls);
   assert.deepEqual(errors,[]);results.push({name,calibration:info.calibration,minimumFenceClearance:idle.jumpPlan.minimumClearance,groundedLanding:true,centeredRun:true,perspectiveGrowth:lastHeight/firstHeight,constantModelScale:true,delayedPom:true,reviewControls:true,pageErrors:errors});
   if(name==='desktop')fs.writeFileSync(path.join(out,'trajectory.json'),JSON.stringify(info,null,2));await p.close();
  }
  const art=path.resolve(__dirname,'../public/experiments/carnival/skee-ball/approved-alley.png');assert.equal(crypto.createHash('sha256').update(fs.readFileSync(art)).digest('hex'),'2d54822360a3329f1542853c2bf0b295f5c78e6a903f35d8497c4ab82b0c555b');
  fs.writeFileSync(path.join(out,'perspective-results.json'),JSON.stringify({results,approvedArtworkUnchanged:true},null,2));console.log('PASS perspective, collision, grounding, pom-pom and review controls: '+results.map(r=>r.name).join(', '));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
