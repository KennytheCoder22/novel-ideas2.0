// Decode source movies at ordinary timestamps; never retime or replace frames.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const cycle=process.env.DREAMSCAPES_DREAM_CYCLE||'moon-dream',app=path.resolve(__dirname,'..'),proof=path.join(app,'verification/'+cycle),out=path.join(app,'playtest-artifacts/'+cycle+'/decoded');
const ffmpeg=process.env.FFMPEG_EXE||path.join(process.env.LOCALAPPDATA,'ms-playwright/ffmpeg-1011/ffmpeg-win64.exe');
const results=JSON.parse(fs.readFileSync(path.join(proof,'ordinary-results.json'))),reviews=[];
for(const r of results){
 if(!r.passed||!r.ordinarySpeed)throw Error('A complete ordinary ride is required');
 const source=path.join(app,r.video),dir=path.join(out,r.name);fs.mkdirSync(dir,{recursive:true});
 const info=cp.spawnSync(ffmpeg,['-hide_banner','-i',source],{encoding:'utf8'}).stderr,match=/Duration: (\d+):(\d+):([\d.]+)/.exec(info);if(!match)throw Error(info);
 const duration=Number(match[1])*3600+Number(match[2])*60+Number(match[3]),frames=[];
 for(let time=0;time<duration-1;time+=cycle==='carousel-pace-sky'?3:8){const file=path.join(dir,`frame-${String(time).padStart(3,'0')}.png`),p=cp.spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-threads','1','-y','-ss',String(time),'-i',source,'-frames:v','1','-vf','scale=480:-1',file],{encoding:'utf8'});if(p.status!==0)throw Error(p.stderr);frames.push({time,file});}
 for(const sample of r.samples){if(!Number.isFinite(sample.videoSeconds))continue;const png=path.join(dir,sample.image.replace('.jpg','.png')),q=cp.spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-threads','1','-y','-ss',String(sample.videoSeconds),'-i',source,'-frames:v','1',png],{encoding:'utf8'});if(q.status!==0)throw Error(q.stderr);const script='from PIL import Image; import sys; Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2],quality=92)';const q2=cp.spawnSync('python',['-c',script,png,path.join(proof,sample.image)],{encoding:'utf8'});if(q2.status!==0)throw Error(q2.stderr);}
 const sheet=path.join(proof,`video-${r.name}-contact.jpg`);
 const script="from PIL import Image,ImageOps,ImageDraw\nimport json,sys,math\nx=json.loads(sys.stdin.read()); w=300; h=650 if x['phone'] else 188; out=Image.new('RGB',(w*4,math.ceil(len(x['frames'])/4)*(h+25)),'#151a25'); d=ImageDraw.Draw(out)\nfor i,f in enumerate(x['frames']):\n im=ImageOps.contain(Image.open(f['file']),(w,h)); xx=(i%4)*w; yy=(i//4)*(h+25);out.paste(im,(xx,yy));d.text((xx+8,yy+h+4),str(f['time'])+'s source video',fill='white')\nout.save(x['sheet'],quality=90)";
 const p=cp.spawnSync('python',['-c',script],{input:JSON.stringify({phone:r.viewport.width<600,frames,sheet}),encoding:'utf8'});if(p.status!==0)throw Error(p.stderr);
 reviews.push({name:r.name,source:r.video,durationSeconds:duration,playbackRate:1,method:'Untrimmed ordinary-speed browser movie, including loading, boarding, both revolutions, return and reselection. Contact frames decoded at fixed ordinary timestamps from that movie; no accelerated animation samples.',sheet:path.basename(sheet),frames:frames.map(f=>({sourceSeconds:f.time,file:path.relative(app,f.file).replaceAll('\\','/')})),visualAssessment:'Pending review'});
 console.log('Decoded '+r.name+' '+duration+' seconds');
}
fs.writeFileSync(path.join(proof,'video-review.json'),JSON.stringify(reviews,null,2));
