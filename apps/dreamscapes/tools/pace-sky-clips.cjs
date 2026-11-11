// Trim loading and post-test housekeeping only. Stream-copy all ride frames.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const app=path.resolve(__dirname,'..'),proof=path.join(app,'verification/carousel-pace-sky'),artifacts=path.join(app,'playtest-artifacts/carousel-pace-sky'),dir=path.join(artifacts,'ride-clips');
const ffmpeg=process.env.FFMPEG_EXE||path.join(process.env.LOCALAPPDATA,'ms-playwright/ffmpeg-1011/ffmpeg-win64.exe');fs.mkdirSync(dir,{recursive:true});
const rides=JSON.parse(fs.readFileSync(path.join(proof,'ordinary-results.json'))),clips=[];
for(const r of rides){
 assert(r.passed&&r.ordinarySpeed);const first=r.samples[0],completed=r.observations.events.find(e=>e.action==='ride-completed');
 const start=Math.max(0,first.videoSeconds-first.elapsed/1000-2),stamp=typeof completed.timestamp==='number'?completed.timestamp:Date.parse(completed.timestamp),end=(stamp-r.captureEpochMs)/1000+3;
 assert(Number.isFinite(start)&&Number.isFinite(end)&&end-start>41.6);
 const source=path.join(app,r.video),clip=path.join(dir,r.name+'.webm');
 const copy=cp.spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-ss',String(start),'-i',source,'-t',String(end-start),'-c','copy',clip],{encoding:'utf8'});if(copy.status!==0)throw Error(copy.stderr);
 const info=cp.spawnSync(ffmpeg,['-hide_banner','-i',clip],{encoding:'utf8'}).stderr,m=/Duration: (\d+):(\d+):([\d.]+)/.exec(info);assert(m);const duration=Number(m[1])*3600+Number(m[2])*60+Number(m[3]);assert(duration>=41.6);
 clips.push({name:r.name,passed:true,source:r.video,file:path.relative(artifacts,clip).replaceAll('\\','/'),startSeconds:start,endSeconds:end,durationSeconds:duration,playbackRate:1,method:'Loading-only and post-test tail trim by stream copy. Full boarding, both revolutions and exterior return retained; no retiming or re-encoding.'});console.log('PASS full ride clip '+r.name+' '+duration+'s');
}
fs.writeFileSync(path.join(proof,'ride-clips.json'),JSON.stringify(clips,null,2));
