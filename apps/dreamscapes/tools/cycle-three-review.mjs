// Loopback-only review; serves only this cycle's evidence and its game preview.
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {realpath,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {startPlaytestServer} from './playtest-server.mjs';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const proof=path.join(app,'verification/cycle-three'),artifacts=path.join(app,'playtest-artifacts/cycle-three');
const game=await startPlaytestServer({port:Number(process.env.GAME_PORT||4235)});
const types={'.html':'text/html; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.json':'application/json','.webm':'video/webm'};
const review=http.createServer(async(req,res)=>{
 try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const root=await realpath(route.startsWith('/artifacts/')?artifacts:proof);
  const name=route.startsWith('/artifacts/')?route.slice(11):route==='/'?'index.html':route.slice(1);
  const candidate=path.resolve(root,name);
  if(!candidate.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  const file=await realpath(candidate);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  const info=await stat(file);if(!info.isFile()){res.writeHead(404).end();return;}
  let start=0,end=info.size-1,status=200;
  if(req.headers.range){const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!match){res.writeHead(416).end();return;}start=Number(match[1]);end=match[2]?Math.min(end,Number(match[2])):end;status=206;}
  if(start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}
  const headers={'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;
  res.writeHead(status,headers);if(req.method==='HEAD')res.end();else createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
 }catch{if(!res.headersSent)res.writeHead(404);res.end('Evidence unavailable. Run the cycle captures first.');}
});
await new Promise(resolve=>review.listen(Number(process.env.REVIEW_PORT||4236),'127.0.0.1',resolve));
console.log(`Game: ${game.url}/ · Review: http://127.0.0.1:${review.address().port}/`);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{review.closeAllConnections();review.close();await game.close();process.exit();});
