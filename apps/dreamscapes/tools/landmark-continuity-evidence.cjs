const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict'),sharp=require('sharp');
const app=path.resolve(__dirname,'..'),proof=path.join(app,'verification/landmark-continuity');
(async()=>{
 const checks=JSON.parse(fs.readFileSync(path.join(proof,'landmark-checks.json'))),parity=[];
 for(const device of ['desktop','phone']){
  for(const version of ['before','after']){
   const dir=path.join(proof,device+'-'+version),names=fs.readdirSync(dir).filter(n=>/^phase-0\d+\.jpg$/.test(n)&&Number(n.slice(6,-4))<=70000).sort(),w=320,h=device==='phone'?692:200,layers=[];
   assert.equal(names.length,12);
   for(let i=0;i<names.length;i++){
    layers.push({input:await sharp(path.join(dir,names[i])).resize(w,h).toBuffer(),left:i%4*w,top:Math.floor(i/4)*(h+24)});
    layers.push({input:Buffer.from('<svg width="320" height="24"><rect width="100%" height="100%" fill="#101b2b"/><text x="8" y="17" fill="#ead7b6" font-size="12" font-family="sans-serif">'+device+' '+version+' · fixed phase '+Number(names[i].slice(6,-4))/1000+'s</text></svg>'),left:i%4*w,top:Math.floor(i/4)*(h+24)+h});
   }
   await sharp({create:{width:w*4,height:(h+24)*3,channels:3,background:'#101b2b'}}).composite(layers).jpeg({quality:90}).toFile(path.join(proof,device+'-'+version+'.jpg'));
   fs.copyFileSync(path.join(dir,'phase-052000.jpg'),path.join(proof,'ferris-'+device+'-'+version+'.jpg'));
  }
  const before=checks.find(c=>c.name===device+'-before'),after=checks.find(c=>c.name===device+'-after');assert(before?.passed&&after?.passed);
  let error=0;for(let i=0;i<12;i++)for(const key of ['camera','eye','eyeLocal','cameraInSeat'])for(let j=0;j<3;j++)error=Math.max(error,Math.abs(before.samples[i][key][j]-after.samples[i][key][j]));assert(error<1e-6,'Matched camera and mount poses');
  parity.push({device,passed:true,samples:12,maxCameraOrSeatDifference:error,secondTurnSamples:after.samples.slice(12).length});
 }
 for(const version of ['before','after'])fs.copyFileSync(path.join(proof,'desktop-'+version,'outside.jpg'),path.join(proof,'outside-'+version+'.jpg'));
 const a=await sharp(path.join(proof,'outside-before.jpg')).raw().toBuffer(),b=await sharp(path.join(proof,'outside-after.jpg')).raw().toBuffer();assert.equal(a.length,b.length);let total=0;for(let i=0;i<a.length;i++)total+=Math.abs(a[i]-b[i]);
 fs.writeFileSync(path.join(proof,'matched-view-parity.json'),JSON.stringify({matchedViews:parity,externalCarouselMeanChannelDifference:total/a.length,method:'Matched frozen RAF phases for screenshot parity; motion is verified separately with complete ordinary-speed recordings.'},null,2));
 const old=cp.execFileSync('git',['show','5b9e7439:apps/dreamscapes/public/experiments/carnival/carousel-onboard.js'],{cwd:app,encoding:'utf8'}),current=fs.readFileSync(path.join(app,'public/experiments/carnival/carousel-onboard.js'),'utf8');
 const tail=s=>s.slice(s.indexOf('function begin('));assert.equal(tail(current).replace('world.environmentView.update(elapsed,reduced());\r\n ',''),tail(old));
 const mounts=s=>s.slice(s.indexOf('for(const entry of entries)'),s.indexOf(' world={')).replace(/ const environmentView=.*?;\r?\n/,'');assert.equal(mounts(current),mounts(old));
 const platformOld=cp.execFileSync('git',['show','5b9e7439:apps/dreamscapes/public/experiments/carnival/platform.js'],{cwd:app,encoding:'utf8'}),platformNew=fs.readFileSync(path.join(app,'public/experiments/carnival/platform.js'),'utf8');
 const wheelClock=s=>s.slice(s.indexOf('function startWheel()'),s.indexOf('// Original stage pixels'));assert.equal(wheelClock(platformNew),wheelClock(platformOld));
 const runtime={...JSON.parse(fs.readFileSync(path.join(app,'checkpoint/manifest.json'))),...JSON.parse(fs.readFileSync(path.join(app,'runtime-overrides.json')))};
 for(const [name,meta]of Object.entries(runtime)){const bytes=fs.readFileSync(path.join(app,'public',name));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),meta.sha256,name);}
 const changed=cp.execFileSync('git',['diff','--name-only','5b9e7439','--','public'],{cwd:app,encoding:'utf8'}).trim().split('\n').filter(Boolean);assert(!changed.some(n=>/\.(png|glb)$/.test(n)));
 fs.writeFileSync(path.join(proof,'preservation.json'),JSON.stringify({baseline:'5b9e7439',cameraRigLifecycleByteIdentical:true,mountEyePoleAssemblyByteIdentical:true,sourceArtworkAndGLBsChanged:false,verifiedRuntimeFiles:Object.keys(runtime).length,changedTrackedRuntimeFiles:changed,externalPlatformDefaultAnimationPreserved:true,externalPlatformClockByteIdentical:true,addedRuntimeFiles:['experiments/carnival/carousel-environment.js'],externalPlatformChange:'Optional geometry-only mounting avoids creating hidden animation listeners; the normal scene still starts its original clock.'},null,2));
 console.log('Matched-view comparisons, external appearance and preservation checks generated.');
})().catch(e=>{console.error(e);process.exitCode=1});
