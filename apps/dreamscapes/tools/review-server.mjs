// Local-only review of the ending refinement evidence; never serves the workspace.
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const artifacts=path.join(app,'playtest-artifacts/ending-refinement'),proof=path.join(app,'verification/ending-refinement-2026-11-03');
const files=new Map([
 ['/mara-live.webm',[path.join(artifacts,'mara-realtime.webm'),'video/webm']],
 ['/skee-live.webm',[path.join(artifacts,'skee-realtime.webm'),'video/webm']],
 ['/mara-render.webm',[path.join(artifacts,'mara-clean.webm'),'video/webm']],
 ['/clown-render.webm',[path.join(artifacts,'clown-clean.webm'),'video/webm']],
 ...['clown-before-after','mara-checkpoints-desktop','mara-checkpoints-phone','mara-checkpoints-landscape'].map(name=>['/'+name+'.jpg',[path.join(proof,name+'.jpg'),'image/jpeg']]),
 ['/mara-poster.jpg',[path.join(artifacts,'desktop/mara-center.jpg'),'image/jpeg']],
 ['/skee-poster.jpg',[path.join(artifacts,'desktop/clown-after.jpg'),'image/jpeg']]
]);
const game='http://127.0.0.1:4221/carnival/';
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dreamscapes — revised endings</title><style>body{margin:0;background:#0c1420;color:#e6d2b1;font:17px/1.55 system-ui}main{max-width:1000px;margin:auto;padding:28px 20px}h1,h2{font-family:Georgia,serif;font-weight:normal}h1{font-size:36px}section{margin:25px 0;padding:20px;border:1px solid #665138;border-radius:10px;background:#131e2b}video{display:block;width:100%;max-height:580px;background:#080a10}img{display:block;max-width:100%;height:auto}a{color:#e9ba75}summary{cursor:pointer;padding:12px 0}p{color:#c5c7cc}figure{margin:18px 0}figcaption{margin-top:8px;font-size:14px}.links{display:flex;gap:24px;flex-wrap:wrap}</style><main><h1>Dreamscapes — revised endings</h1><p>Updated local recordings and comparison frames. Press Play to watch either sequence.</p><section><h2>Mara: stable pickup and crumbling</h2><p>The lift and crumble keep their existing timing. Preparing the effect before playback removes the pause at the handoff.</p><video controls preload="metadata" poster="/mara-poster.jpg" aria-label="Mara smooth 30 fps review recording"><source src="/mara-render.webm" type="video/webm"></video><p>Smooth 30 fps engine render. An independent live capture is available below.</p><details><summary>Six key checkpoints</summary><figure><img src="/mara-checkpoints-desktop.jpg" alt="Before pickup, lift, center-screen handoff, crumble start, midpoint and disappearance"><figcaption>Center-screen and the handoff coincide at 1.65 seconds.</figcaption></figure><details><summary>Phone checkpoints</summary><img loading="lazy" src="/mara-checkpoints-phone.jpg" alt="Mara checkpoints in portrait"></details><details><summary>Landscape checkpoints</summary><img loading="lazy" src="/mara-checkpoints-landscape.jpg" alt="Mara checkpoints in landscape"></details></details><details><summary>Live browser capture</summary><p>Recorded at normal speed to check the corrected handoff. The fixed-cadence render above makes the fine details easier to judge.</p><video controls preload="none" aria-label="Mara live browser recording"><source src="/mara-live.webm" type="video/webm"></video></details><p><a href="${game}?mara-review=1&amp;pickup-review=autoplay" target="_blank" rel="noopener">Try Mara live</a> · Use “Preview pickup” to repeat.</p></section><section><h2>Skee-Ball: darker, centered clown ending</h2><p>Muted colors, a slightly closer crop and soft edge shading retain the original clown and unsettling ending.</p><video controls preload="metadata" poster="/skee-poster.jpg" aria-label="Complete three-ball Skee-Ball live browser recording"><source src="/skee-live.webm" type="video/webm"></video><p>Complete three-ball sequence, recorded live.</p><details open><summary>Before / after: desktop, phone and landscape</summary><img loading="lazy" src="/clown-before-after.jpg" alt="Old bright clown on the left and darker centered clown on the right, in three layouts"></details><details><summary>Clown ending only — 30 fps review render</summary><p>Fixed-cadence engine frames preserve the hop, approach, evaporation, face and completion order.</p><video controls preload="none" aria-label="Revised clown ending 30 fps review render"><source src="/clown-render.webm" type="video/webm"></video></details><p><a href="${game}?scene=skee-ball" target="_blank" rel="noopener">Play three-ball Skee-Ball live</a></p></section><p>Desktop, portrait phone and landscape checks passed. The review branch remains in draft. Nothing has been merged or deployed.</p></main></html>`;
const server=http.createServer(async(req,res)=>{
 try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  const route=new URL(req.url,'http://localhost').pathname;
  if(route==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}).end(req.method==='HEAD'?'':html);return;}
  if(route==='/favicon.ico'){res.writeHead(204).end();return;}
  const file=files.get(route);if(!file){res.writeHead(404).end();return;}
  const [name,type]=file,info=await stat(name);let start=0,end=info.size-1,status=200;
  if(req.headers.range){const match=req.headers.range.match(/^bytes=(\d+)-(\d*)$/);if(!match){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}start=Number(match[1]);end=match[2]?Math.min(end,Number(match[2])):end;status=206;}
  if(start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}
  const headers={'Content-Type':type,'Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-store'};
  if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;
  res.writeHead(status,headers);if(req.method==='HEAD')res.end();else createReadStream(name,{start,end}).on('error',()=>res.destroy()).pipe(res);
 }catch{if(!res.headersSent)res.writeHead(404);res.end('Review artifact unavailable. Run the capture first.');}
});
server.listen(Number(process.env.REVIEW_PORT||4222),'127.0.0.1',()=>console.log('Revised endings review: http://127.0.0.1:'+server.address().port));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.closeAllConnections();server.close(()=>process.exit());});
