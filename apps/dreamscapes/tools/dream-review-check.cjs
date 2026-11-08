const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const cycle=process.env.DREAMSCAPES_DREAM_CYCLE||'moon-dream',proof=path.resolve(__dirname,'../verification/'+cycle),base=process.env.DREAMSCAPES_REVIEW_URL||'http://127.0.0.1:4242/';
(async()=>{
 const summary=JSON.parse(fs.readFileSync(path.join(proof,'summary.json')));assert(summary.passed,'Complete ride and regression evidence must pass before review QA');
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE});try{
  const context=await browser.newContext(),p=await context.newPage(),errors=[],urls=new Set();p.on('pageerror',e=>errors.push(e.message));
  for(const file of ['','approach.html','playback-desktop.html','playback-phone.html','artifacts/regression/report.html']){
   await p.goto(base+file);for(const url of await p.locator('a[href],img[src],video[src]').evaluateAll(es=>es.map(e=>e.href||e.src)))urls.add(url);
  }
  const checked=[];for(const url of urls){const response=await context.request.head(url);assert.equal(response.status(),200,url);checked.push({url,status:response.status()});}
  const video=[...urls].find(u=>u.endsWith('.webm'));assert(video);const range=await context.request.get(video,{headers:{Range:'bytes=0-1023'}});assert.equal(range.status(),206);assert.equal((await range.body()).length,1024);
  for(const [name,width,height]of [['desktop',1440,900],['phone',390,844]]){await p.setViewportSize({width,height});await p.goto(base);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Review fits the viewport');await p.screenshot({path:path.join(proof,`review-${name}.jpg`),type:'jpeg',quality:88});}
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(proof,'review-check.json'),JSON.stringify({passed:true,checked,videoRangeStatus:206,pageErrors:errors},null,2));await context.close();console.log('PASS creative review, media and '+checked.length+' links');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
