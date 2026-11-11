const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const app=path.resolve(__dirname,'..'),proof=path.join(app,'verification/complete-worlds'),artifacts=path.join(app,'playtest-artifacts/complete-worlds'),dir=path.join(artifacts,'rides');
const ffmpeg=process.env.FFMPEG_EXE||path.join(process.env.LOCALAPPDATA,'ms-playwright/ffmpeg-1011/ffmpeg-win64.exe');
const sessions=JSON.parse(fs.readFileSync(path.join(proof,'ordinary-results.json'))),clips=[];fs.mkdirSync(dir,{recursive:true});
function ff(args){const r=cp.spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-threads','1',...args],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);}
for(const session of sessions){
 assert(session.passed&&session.ordinarySpeed);const source=path.join(app,session.video);
 for(const ride of session.rides){
  const name=session.name+'-'+ride.id,first=ride.samples[0],start=Math.max(0,first.videoSeconds-first.elapsed/1000-2),stamp=typeof ride.completed.timestamp==='number'?ride.completed.timestamp:Date.parse(ride.completed.timestamp),end=(stamp-session.captureEpochMs)/1000+3;
  assert(end-start>41.6);const clip=path.join(dir,name+'.webm');ff(['-y','-ss',String(start),'-i',source,'-t',String(end-start),'-c','copy',clip]);
  const info=cp.spawnSync(ffmpeg,['-hide_banner','-i',clip],{encoding:'utf8'}).stderr,m=/Duration: (\d+):(\d+):([\d.]+)/.exec(info);assert(m);const duration=Number(m[1])*3600+Number(m[2])*60+Number(m[3]);assert(duration>=41.6);
  const images=[];for(const sample of ride.samples){if(!['landmark-dream','first-dream','late-dream','second-dream','carnival','return-two'].some(label=>sample.image.endsWith('-'+label+'.jpg')))continue;
   const png=path.join(dir,name+'-'+sample.elapsed+'.png');ff(['-y','-ss',String(sample.videoSeconds),'-i',source,'-frames:v','1','-vf','scale='+Math.min(960,session.viewport.width)+':-1',png]);
   const p=cp.spawnSync('python',['-c','from PIL import Image;import sys;Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2],quality=92)',png,path.join(proof,sample.image)],{encoding:'utf8'});if(p.status!==0)throw Error(p.stderr);images.push(sample.image);
  }
  const file='rides/'+name+'.webm';clips.push({name,device:session.name,id:ride.id,asset:ride.asset,viewport:session.viewport,source:session.video,file,images,renderFPS:ride.renderFPS,startSeconds:start,endSeconds:end,durationSeconds:duration,playbackRate:1,passed:true,method:'Complete ordinary-speed ride. Loading and between-ride selection trimmed by stream copy; boarding, both turns and return preserved.'});
  fs.writeFileSync(path.join(proof,'ride-'+name+'.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+ride.id+' full ride</title><style>body{margin:0;background:#101724;color:#eddfbf;font:16px system-ui;text-align:center}header{height:48px;display:flex;align-items:center;justify-content:center;gap:16px}a{color:#f0c18e}video{display:block;width:100%;height:calc(100vh - 48px);object-fit:contain}</style><header>'+ride.id+' · '+session.name+' <a href="/">Review</a></header><video controls playsinline preload="metadata" src="/artifacts/'+file+'"></video></html>');
  console.log('Prepared full ride '+name+' '+duration+'s');
 }
}
assert.equal(clips.length,8);fs.writeFileSync(path.join(proof,'clips.json'),JSON.stringify(clips,null,2));
