// Complete native 1x playback, with visible players and no seeking.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const proof=path.resolve(__dirname,'../verification/landmark-continuity'),base=process.env.DREAMSCAPES_REVIEW_URL||'http://127.0.0.1:4240/';
const reviews=JSON.parse(fs.readFileSync(path.join(proof,'video-review.json')));
const cases=[['live-plain-rocket-desktop','playback-desktop.html',1440,900],['live-ornate-horse-phone','playback-phone.html',390,844]];
for(const [name,file]of cases){
 const review=reviews.find(r=>r.name===name);assert(review?.source.includes('/final-verified/'));
 fs.writeFileSync(path.join(proof,file),'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dreamscapes complete ride</title><style>body{margin:0;background:#101b2b;color:#ead7b6;font:16px system-ui;text-align:center}header{height:48px;display:flex;align-items:center;justify-content:center;gap:20px}a{color:#f4c482}video{display:block;width:100%;height:calc(100vh - 48px);object-fit:contain}</style><header>'+name+' <a href="/">All evidence</a></header><video controls playsinline preload="metadata" src="/artifacts/'+review.trimmedClip+'"></video></html>');
}
if(process.argv.includes('--prepare-only'))process.exit(0);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE}),results=[];
 try{for(const [name,file,width,height]of cases){
  const context=await browser.newContext({viewport:{width,height}}),p=await context.newPage();p.setDefaultTimeout(30000);await p.goto(base+file);
  const v=p.locator('video');await v.evaluate(v=>{v.muted=true;v.playbackRate=1;});await p.waitForFunction(()=>Number.isFinite(document.querySelector('video').duration));
  const duration=await v.evaluate(v=>v.duration);assert(duration>149);const started=Date.now(),samples=[];await v.evaluate(v=>v.play());
  for(let at=1;at<duration-1;at+=12){
   await p.waitForFunction(at=>document.querySelector('video').currentTime>=at,at);
   const d=await v.evaluate(v=>({time:v.currentTime,rate:v.playbackRate,width:v.videoWidth,height:v.videoHeight,visible:v.checkVisibility(),rect:v.getBoundingClientRect().toJSON(),quality:{totalVideoFrames:v.getVideoPlaybackQuality().totalVideoFrames,droppedVideoFrames:v.getVideoPlaybackQuality().droppedVideoFrames}}));
   assert.equal(d.rate,1);assert(d.visible&&d.width>0&&d.height>0);assert(d.rect.top>=0&&d.rect.bottom<=height+1);samples.push(d);
   await p.screenshot({path:path.join(proof,name+'-native-'+String(at).padStart(3,'0')+'.jpg'),type:'jpeg',quality:80});
  }
  await p.waitForFunction(()=>document.querySelector('video').ended);const wallTimeMs=Date.now()-started;assert(wallTimeMs>(duration-5)*1000);
  await p.screenshot({path:path.join(proof,name+'-native-ended.jpg'),type:'jpeg',quality:80});
  results.push({name,player:file,source:reviews.find(r=>r.name===name).source,passed:true,durationSeconds:duration,wallTimeMs,playbackRate:1,method:'Visible continuous native playback from start to natural end, without seeking or acceleration.',samples});await context.close();fs.writeFileSync(path.join(proof,'native-playback.json'),JSON.stringify(results,null,2));console.log('PASS complete visible native playback '+name);
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
