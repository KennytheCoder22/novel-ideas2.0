const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.DREAMSCAPES_URL || 'http://127.0.0.1:4204';
const entry=process.env.CARNIVAL_PATH || '/experiments/carnival/index.html';
const errors=[],report={layouts:[],cases:[]};
async function ready(p){await p.waitForFunction(()=>window.MidwayArmReview?.state().ready,{},{timeout:90000});}
async function signState(p){return p.evaluate(()=>({transform:document.querySelector('.composition .carnival-exit').style.transform,...MidwayArmReview.state()}));}
async function fallen(p){const s=await signState(p);assert.match(s.transform,/rotate\(98\./);assert.equal(s.active,false);assert.equal(s.done,true);assert.equal(s.phase,'fallen');}
async function clickEdge(p,edge){
 await p.evaluate(edge=>{
  window.signSamples=[];
  const sign=document.querySelector('.composition .carnival-exit');
  let watch=true;
  window.stopSignWatch=()=>{watch=false;};
  const sample=()=>{if(!watch)return;window.signSamples.push(sign.style.transform);requestAnimationFrame(sample);};sample();
  const source=edge.from==='midway'?document.querySelector('main'):document.querySelector(`[data-scene="${edge.from}"]`);
  const button=source.querySelector(edge.selector);if(!button)throw Error('Missing button '+JSON.stringify(edge));
  if(button.hidden)source.querySelectorAll('.funhouse-mirror').forEach(mirror=>mirror.click());
  button.click();
 },edge);
 await p.waitForFunction(to=>(document.documentElement.dataset.location||'midway')===to&&!document.documentElement.dataset.travelling,edge.to,{timeout:90000});
 const samples=await p.evaluate(()=>{stopSignWatch();return signSamples;});
 assert(samples.length>1);assert(samples.every(s=>/^rotate\(98\./.test(s)),'Sign stood up during '+JSON.stringify(edge));
 await fallen(p);
}
function route(graph,from,to){
 const queue=[[from,[]]],seen=new Set([from]);
 while(queue.length){const [id,steps]=queue.shift();if(id===to)return steps;
 for(const e of graph.filter(e=>e.from===id))if(!seen.has(e.to)){seen.add(e.to);queue.push([e.to,[...steps,e]]);}}
 throw Error('No route '+from+' -> '+to);
}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
 for(const [layout,viewport,band] of [['desktop',{width:1536,height:1024},'adults'],['mobile',{width:390,height:844},'kids']]){
  const context=await browser.newContext({viewport});
  await context.addInitScript(band=>localStorage.setItem('dreamscapes.age-band',band),band);
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+entry+'?arm=review&motion=still');await ready(p);
  const graph=await p.evaluate(()=>{
   const graph=[{from:'midway',to:'ferris-platform',selector:'.wheel'},{from:'midway',to:'tent-row',selector:'.tent'},{from:'midway',to:'rides-games',selector:'.entrance'}];
   for(const [from,scene] of Object.entries(CarnivalScenes)){
    for(const e of scene.paths||[])graph.push({from,to:e.to,selector:e.ui?`.room-route[data-to="${e.to}"]`:`.location-path[data-to="${e.to}"]`});
    for(const s of scene.signs||[]){const to=s.to||CarnivalSignDestinations[s.label];if(to&&to!==from&&CarnivalScenes[to])graph.push({from,to,selector:`.location-sign[data-sign="${s.label}"]`});}
   }return graph;
  });
  await p.evaluate(()=>MidwayArmReview.seek(17.1));let current='midway',transitions=0;
  for(const edge of graph){
   for(const step of [...route(graph,current,edge.from),edge]){await clickEdge(p,step);current=step.to;transitions++;}
  }
  for(const step of route(graph,current,'midway')){await clickEdge(p,step);transitions++;}
  await p.waitForTimeout(12500);await fallen(p); // No new 8–12 second timer on return.
  await p.emulateMedia({reducedMotion:'reduce'});await fallen(p);
  await p.emulateMedia({reducedMotion:'no-preference'});await fallen(p);
  const sign=p.locator('.composition .carnival-exit');await sign.focus();await p.keyboard.press('Enter');await p.waitForURL(base+'/');
  report.layouts.push({layout,band,scenes:[...new Set(graph.flatMap(e=>[e.from,e.to]))].length,edges:graph,transitions,fallenThroughout:true,noReplayOnReturn:true,reducedMotionPreserved:true,fallenExitKeyboard:true});
  await context.close();
 }
 // Cancel before contact: return starts a fresh visit with an upright sign.
 const p=await browser.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+entry+'?arm=review&motion=still');await ready(p);await p.evaluate(()=>MidwayArmReview.seek(10));
 await p.locator('.wheel').click();await p.waitForFunction(()=>document.documentElement.dataset.location==='ferris-platform');
 assert.equal((await signState(p)).transform,'');
 await p.locator('[data-scene="ferris-platform"] .location-path[data-to="midway"]').dispatchEvent('click');
 await p.waitForFunction(()=>document.documentElement.dataset.location==='midway'&&!document.documentElement.dataset.travelling);
 assert.equal((await signState(p)).done,false);assert.equal((await signState(p)).transform,'');report.cases.push('pre-contact cancellation remains upright and can replay');
 // Leaving during the fall settles the sign; a failed destination keeps it down.
 await p.evaluate(()=>MidwayArmReview.seek(13.6));
 await p.locator('.wheel').click();await p.waitForFunction(()=>document.documentElement.dataset.location==='ferris-platform');await fallen(p);
 await p.locator('[data-scene="ferris-platform"] .location-path[data-to="midway"]').dispatchEvent('click');
 await p.waitForFunction(()=>document.documentElement.dataset.location==='midway'&&!document.documentElement.dataset.travelling);await fallen(p);report.cases.push('departure during fall settles and preserves sign');
 await p.route('**/locations/tent-row.png',r=>r.abort());
 await p.locator('.tent').dispatchEvent('click');
 await p.waitForFunction(()=>!document.querySelector('main').inert&&!document.documentElement.dataset.travelling&&[...document.querySelectorAll('[role="status"]')].some(e=>e.textContent.includes('could not load')));await fallen(p);report.cases.push('failed destination keeps fallen sign');
 report.pageErrors=errors;assert.deepEqual(errors,[]);
 const out=process.env.DREAMSCAPES_EVIDENCE_DIR || __dirname;fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'navigation-state-results.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({layouts:report.layouts.map(({edges,...r})=>({...r,edges:edges.length})),cases:report.cases,pageErrors:errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
