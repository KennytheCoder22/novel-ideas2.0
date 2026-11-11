import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {realpath,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {startPlaytestServer} from './playtest-server.mjs';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mime={'.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.webm':'video/webm'};
async function staticFile(req,res,root,name){
 const base=await realpath(root),candidate=path.resolve(base,name);if(!candidate.startsWith(base+path.sep)){res.writeHead(403).end();return;}
 const file=await realpath(candidate);if(!file.startsWith(base+path.sep)){res.writeHead(403).end();return;}
 const s=await stat(file);if(!s.isFile()){res.writeHead(404).end();return;}
 let start=0,end=s.size-1,status=200;if(req.headers.range){const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!match){res.writeHead(416).end();return;}start=Number(match[1]);end=match[2]?Math.min(end,Number(match[2])):end;status=206;}
 if(start>end||start>=s.size){res.writeHead(416).end();return;}
 const headers={'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':end-start+1,'Cache-Control':'no-store','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff'};if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${s.size}`;
 res.writeHead(status,headers);if(req.method==='HEAD')res.end();else createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
}
export async function startCycleSixServer({port=0}={}){
 const game=await startPlaytestServer({root:path.join(app,'dist')});
 const server=http.createServer(async(req,res)=>{try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  const host=new URL('http://'+req.headers.host).hostname;if(!['localhost','127.0.0.1','[::1]'].includes(host)){res.writeHead(403).end();return;}
  const url=new URL(req.url,'http://localhost'),route=decodeURIComponent(url.pathname);
  if(route.startsWith('/cycle-six/')){await staticFile(req,res,path.join(app,'research/cycle-six'),route.slice(12));return;}
  if(route.startsWith('/review/artifacts/')){await staticFile(req,res,path.join(app,'playtest-artifacts/cycle-six'),route.slice(18));return;}
  if(route.startsWith('/review/')){await staticFile(req,res,path.join(app,'verification/cycle-six'),route==='/review/'?'index.html':route.slice(8));return;}
  const inject=url.searchParams.get('cycle-six')==='zora'&&['/carnival/','/experiments/carnival/'].includes(route);
  const request=http.request(game.url+req.url,{method:req.method},incoming=>{
   if(!inject||!incoming.headers['content-type']?.includes('text/html')){res.writeHead(incoming.statusCode,incoming.headers);incoming.pipe(res);return;}
   const chunks=[];incoming.on('data',b=>chunks.push(b));incoming.on('end',()=>{const original=Buffer.concat(chunks).toString('utf8');const html=original.replace('</body>','<link rel="stylesheet" href="/cycle-six/zora-prototype.css"><script type="module" src="/cycle-six/zora-prototype.js"></script><link rel="stylesheet" href="/cycle-six/living.css"><script type="module" src="/cycle-six/living.js"></script></body>');res.writeHead(incoming.statusCode,{...incoming.headers,'content-length':Buffer.byteLength(html)});res.end(req.method==='HEAD'?undefined:html);});
  });request.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});request.end();
 }catch{if(!res.headersSent)res.writeHead(404);res.end('Local research resource unavailable.');}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return {url:'http://127.0.0.1:'+server.address().port,server,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await game.close();}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const host=await startCycleSixServer({port:Number(process.env.PORT||4263)});console.log('Zora encounter review: '+host.url+'/review/');console.log('Prototype: '+host.url+'/carnival/?scene=fortune-teller&cycle-six=zora');
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await host.close();process.exit();});
}
