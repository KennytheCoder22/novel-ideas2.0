// Extract actual frames from ordinary-speed recordings. Never changes playback speed.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const cycle=process.env.DREAMSCAPES_REVIEW_CYCLE||'first-person',sourceSet=process.env.DREAMSCAPES_VIDEO_SOURCE_SET||'verified';
const app=path.resolve(__dirname,'..'),artifacts=path.join(app,'playtest-artifacts/'+cycle),proof=path.join(app,'verification/'+cycle);
const ffmpeg=process.env.FFMPEG_EXE||path.join(process.env.LOCALAPPDATA,'ms-playwright/ffmpeg-1011/ffmpeg-win64.exe');
const transitions=process.argv.includes('--transitions'),landmarks=process.argv.includes('--landmarks');
const reviewFile=transitions?'transition-review.json':landmarks?'landmark-video-review.json':'video-review.json';
const filter=process.argv.find(a=>a.startsWith('--case='))?.slice(7);
const results=JSON.parse(fs.readFileSync(path.join(artifacts,sourceSet+'/results.json'))).filter(r=>!r.accelerated&&r.passed&&(!filter||r.name.includes(filter)));
const prior=fs.existsSync(path.join(proof,reviewFile))?JSON.parse(fs.readFileSync(path.join(proof,reviewFile))):[];
function ff(args){const r=cp.spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-threads','1',...args],{encoding:'utf8',maxBuffer:1024*1024});if(r.status!==0)throw Error(r.stderr||r.error||'Video processing failed');}
(async()=>{
 const sharp=require('sharp');
 for(const result of results){
  const source=path.join(artifacts,sourceSet,result.name,result.videos[0]),ride=result.rides[0],began=(ride.endedAtVideoMs-ride.wallTimeMs)/1000;
  const dir=path.join(artifacts,transitions?'transition-review':landmarks?'landmark-video-review':'video-review',result.name);fs.mkdirSync(dir,{recursive:true});
  const previous=prior.find(r=>r.name===result.name),cached=previous?.source===path.relative(app,source).replaceAll('\\','/');
  const start=Math.max(0,ride.requestedAtVideoMs/1000-15),duration=ride.endedAtVideoMs/1000-start+2,clip=path.join(dir,'complete-ride.webm');
  if(!transitions&&!landmarks&&(!cached||previous.trimStartSeconds!==start||!fs.existsSync(clip)))ff(['-y','-ss',String(start),'-i',source,'-t',String(duration),'-c','copy',clip]);
  const points=landmarks?Array.from({length:24},(_,i)=>(i+1)*6):transitions?[-4,-3.5,-3,-2.5,-2,-1.5,-1,-.5,142,143,144,145,146,147,148,149]:[-2,0,.8,1.6,2.8,5,18,36,54,73,90,108,126,144,147,150],frames=[];
  for(let i=0;i<points.length;i++){
   const at=Math.max(0,began+points[i]),file=path.join(dir,'frame-'+String(i).padStart(2,'0')+'.png');
   if(!cached||!fs.existsSync(file))ff(['-y','-ss',String(at),'-i',source,'-frames:v','1','-vf','scale=480:-1',file]);
   if(fs.existsSync(file))frames.push({sourceVideoSeconds:at,rideSeconds:points[i],file});
  }
  const cols=4,w=320,h=result.viewport.width<600?692:200,layers=[];
  for(let i=0;i<frames.length;i++){
   const f=frames[i];layers.push({input:await sharp(f.file).resize(w,h,{fit:'contain',background:'#101b2b'}).toBuffer(),left:i%cols*w,top:Math.floor(i/cols)*(h+28)});
   layers.push({input:Buffer.from('<svg width="320" height="28"><rect width="100%" height="100%" fill="#101b2b"/><text x="10" y="20" fill="#eed4a3" font-family="sans-serif" font-size="13">Video '+f.sourceVideoSeconds.toFixed(1)+'s · ordinary speed</text></svg>'),left:i%cols*w,top:Math.floor(i/cols)*(h+28)+h});
  }
  const sheet=result.name+(transitions?'-transitions':landmarks?'-landmarks':'')+'.jpg';await sharp({create:{width:cols*w,height:Math.ceil(frames.length/cols)*(h+28),channels:3,background:'#101b2b'}}).composite(layers).jpeg({quality:88}).toFile(path.join(proof,sheet));
  const review={name:result.name,source:path.relative(app,source).replaceAll('\\','/'),trimmedClip:transitions||landmarks?undefined:path.relative(artifacts,clip).replaceAll('\\','/'),playbackSpeed:1,trimStartSeconds:transitions||landmarks?undefined:start,trimDurationSeconds:transitions||landmarks?undefined:duration,method:landmarks?'Six-second checkpoints decoded from the complete ordinary-speed source video across both turns. No speed changes or synthetic camera samples.':transitions?'Boarding/dismounting frames decoded from the original ordinary-speed recording. No generated camera samples.':'Loading-only trim by stream copy; original recording retained. Contact sheet frames decoded from the ordinary-speed source video, not synthetic RAF sampling.',sheet,frames:frames.map(f=>({...f,file:path.relative(artifacts,f.file).replaceAll('\\','/')})),visualAssessment:cached?previous.visualAssessment:'Pending visual review'};
  const old=prior.findIndex(r=>r.name===review.name);if(old<0)prior.push(review);else prior[old]=review;
  fs.writeFileSync(path.join(proof,reviewFile),JSON.stringify(prior,null,2));console.log('Decoded complete ride video: '+result.name);
 }
})().catch(e=>{console.error(e);process.exitCode=1});
