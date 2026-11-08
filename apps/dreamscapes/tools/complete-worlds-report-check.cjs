const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const proof=path.resolve(__dirname,'../verification/complete-worlds'),base='http://127.0.0.1:4252/';
(async()=>{const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE}),results=[];try{
 const clips=JSON.parse(fs.readFileSync(path.join(proof,'clips.json')));assert.equal(clips.length,8);
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
  const context=await browser.newContext({viewport}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base);await p.waitForFunction(()=>document.querySelector('#status').textContent.includes('natural end'));
  const links=await p.locator('a[href],img[src],video[src]').evaluateAll(es=>es.map(e=>e.href||e.src));
  for(const url of new Set(links)){const r=await context.request.head(url);assert.equal(r.status(),200,url);}
  for(const clip of clips){const r=await context.request.get(base+'artifacts/'+clip.file,{headers:{Range:'bytes=0-255'}});assert.equal(r.status(),206);assert.equal((await r.body()).length,256);}
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  await p.screenshot({path:path.join(proof,'report-'+viewport.width+'.jpg'),type:'jpeg',quality:85});
  results.push({viewport,passed:true,uniqueLinksChecked:new Set(links).size,rangeVideos:clips.length,errors});await context.close();
 }
 fs.writeFileSync(path.join(proof,'report-check.json'),JSON.stringify(results,null,2));console.log('PASS review links, video ranges, desktop and phone layout');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
