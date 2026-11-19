const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{const app=path.resolve(__dirname,'..'),out=path.join(app,'verification/kit-arrival');fs.mkdirSync(out,{recursive:true});const host=await import('./playtest-server.mjs').then(m=>m.startPlaytestServer({root:path.join(app,'dist')}));const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE});try{
 for(const [name,viewport]of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport,hasTouch:name==='mobile',isMobile:name==='mobile',reducedMotion:'no-preference',recordVideo:{dir:out,size:viewport}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(host.url+'/carnival/?scene=fun-house');await page.waitForFunction(()=>window.DreamscapesKit?.snapshot().assetReady&&document.documentElement.dataset.location==='fun-house'&&!document.documentElement.dataset.travelling);
  const samples=[['sit',1.5],['notice',3.8],['rise',7],['left',10.8],['center',12.7],['right',15.4],['peek',17],['withdraw',18.7],['hidden-return',20.5],['return',22.8],['approach',27],['study',30.7],['palm',32.5],['choices',34]];
  const states=[];for(const [label,time]of samples){await page.waitForFunction(t=>DreamscapesKit.snapshot().introSeconds>=t,time);const s=await page.evaluate(()=>DreamscapesKit.snapshot());states.push({label,time:s.introSeconds,phase:s.phase,frames:s.renderFrames});await page.screenshot({path:path.join(out,`${name}-${label}.png`)});}
  assert.equal(await page.locator('.kit-plank').count(),3);assert.deepEqual(errors,[]);await page.close();await page.video().saveAs(path.join(out,`${name}-full.webm`));await context.close();console.log(name,JSON.stringify(states));
 }
}finally{await browser.close();await host.close()}})().catch(e=>{console.error(e);process.exitCode=1});
