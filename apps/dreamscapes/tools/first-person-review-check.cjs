const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const cycle=process.env.DREAMSCAPES_REVIEW_CYCLE||'first-person';
const proof=path.resolve(__dirname,'../verification/'+cycle),base=process.env.DREAMSCAPES_REVIEW_URL||'http://127.0.0.1:4238/';
(async()=>{
 const browser=await chromium.launch(process.env.BROWSER_EXE?{executablePath:process.env.BROWSER_EXE}:{});
 try{
  const context=await browser.newContext(),p=await context.newPage(),errors=[],links=new Set();p.on('pageerror',e=>errors.push(e.message));
  for(const name of ['', 'approach.html']){
   await p.goto(base+name);for(const url of await p.locator('a[href],img[src],video[src]').evaluateAll(es=>es.map(e=>e.href||e.src)))links.add(url);
  }
  const regressionUrl=base+'artifacts/regression/report.html',regressionResponse=await context.request.get(regressionUrl);assert.equal(regressionResponse.status(),200);const regressionHtml=await regressionResponse.text();for(const match of regressionHtml.matchAll(/(?:href|src)="([^"]+)"/g))links.add(new URL(match[1],regressionUrl).href);
  const checked=[];for(const url of links){const response=await context.request.head(url);assert.equal(response.status(),200,url);checked.push({url,status:response.status()});}
  for(const key of ['live-ornate-dragon-desktop','live-ornate-horse-phone']){await p.goto(base);const v=p.locator('video[src*="video-review/'+key+'"]');await v.evaluate(async v=>{v.closest('details').open=true;v.muted=true;await v.play();v.currentTime=30;});await p.waitForFunction(key=>{const v=document.querySelector('video[src*="video-review/'+key+'"]');return v.currentTime>31&&v.videoWidth>0&&v.duration>140&&v.playbackRate===1;},key);await v.screenshot({path:path.join(proof,key+'-playback.jpg'),type:'jpeg',quality:86});await v.evaluate(v=>v.pause());}
  const video=[...links].find(url=>url.endsWith('.webm'));assert(video,'Live browser recording linked');const range=await context.request.get(video,{headers:{Range:'bytes=0-1023'}});assert.equal(range.status(),206);assert.equal((await range.body()).length,1024);
  await p.goto(base);await p.setViewportSize({width:1440,height:900});await p.screenshot({path:path.join(proof,'report-desktop.jpg'),type:'jpeg',quality:86});await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(proof,'report-phone.jpg'),type:'jpeg',quality:86});assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(proof,'review-check.json'),JSON.stringify({passed:true,checked,videoRangeStatus:206,pageErrors:errors},null,2));
  console.log('Review links, video range and desktop/phone rendering passed: '+checked.length+' links');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
