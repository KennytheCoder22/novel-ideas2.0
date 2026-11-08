// Fixed animation-phase review, separate from ordinary live browser recordings.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const app=path.resolve(__dirname,'..'),out=path.join(app,'playtest-artifacts/cycle-two/mara-parity'),proof=path.join(app,'verification/cycle-two');
const baseline='d540f14c',times=[0,.16,1.65,1.95,2.5,6],results=[];
(async()=>{
 const host=await import('./playtest-server.mjs').then(m=>m.startPlaytestServer()),browser=await chromium.launch({...(process.env.BROWSER_EXE?{executablePath:process.env.BROWSER_EXE}:{})});
 try{for(const [name,viewport]of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
  const versions=[];
  for(const before of [true,false]){
   const dir=path.join(out,name,before?'before':'after');fs.mkdirSync(dir,{recursive:true});
   const context=await browser.newContext({viewport,recordVideo:{dir,size:viewport}});
   if(before){const body=execFileSync('git',['show',baseline+':apps/dreamscapes/public/experiments/carnival/mara-midway.js']);await context.route('**/mara-midway.js*',route=>route.fulfill({contentType:'text/javascript',body}));}
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(host.url+'/carnival/?mara-review=1');await page.waitForFunction(()=>window.MaraMidway?.state().loaded,null,{timeout:120000});
   await page.addStyleTag({content:'.mara-review-panel{display:none}'});
   if(viewport.width<600)await page.getByRole('button',{name:'Look toward the center',exact:true}).click();
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.evaluate(()=>MaraMidway.seek(MaraMidway.state().end));
   await page.getByRole('button',{name:'Examine Mara, the abandoned stuffed fox',exact:true}).click();
   const frames=[];
   for(let i=0;i<times.length;i++){
    const frame=await page.evaluate(t=>{MaraMidway.pickupFrame(t);const s=MaraMidway.state(),d=MaraMidway.diagnostics();return {t,pickup:s.pickup,position:d.position,yaw:d.yaw,scale:s.scale,camera:s.camera,bones:d.bones,sand:s.sand};},times[i]);
    frames.push(frame);await page.screenshot({path:path.join(dir,'phase-'+i+'.jpg'),type:'jpeg',quality:88,timeout:60000});
   }
   assert.deepEqual(errors,[]);versions.push(frames);await context.close();
  }
  assert.deepEqual(versions[1],versions[0],name+' fixed-phase transforms and crumble state match approved controller');
  results.push({viewport:name,matched:true,times,states:versions[1]});console.log('PASS Mara phase parity '+name);
 }}finally{await browser.close();await host.close();fs.mkdirSync(proof,{recursive:true});fs.writeFileSync(path.join(proof,'mara-phase-parity.json'),JSON.stringify({baseline,method:'Fixed-phase developer review frames, not real-time motion or frame-rate certification',results},null,2));}
})().catch(e=>{console.error(e);process.exitCode=1});
