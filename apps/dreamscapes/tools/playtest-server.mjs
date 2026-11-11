import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat, realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = {'.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.glb':'model/gltf-binary', '.bin':'application/octet-stream', '.json':'application/json'};

// Match the app's hosting aliases, including relative module/asset requests.
export async function startPlaytestServer({port=0, root=path.join(appRoot,'public')}={}) {
  root = await realpath(root);
  const server = http.createServer(async (req,res) => {
    try {
      if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
      const url = new URL(req.url, 'http://localhost');
      let pathname = decodeURIComponent(url.pathname);
      if(pathname==='/favicon.ico')pathname='/opening/novelideas-icon.png';
      if (['/carnival','/carnival/index.html','/experiments/carnival','/experiments/carnival/','/experiments/carnival/index.html'].includes(pathname)) {
        res.writeHead(307,{Location:'/carnival/'+url.search}).end(); return;
      }
      if (pathname.startsWith('/carnival/')) pathname='/experiments/carnival/'+pathname.slice('/carnival/'.length);
      if (pathname.endsWith('/')) pathname+='index.html';
      const file=path.resolve(root,'.'+pathname);
      if (!file.startsWith(root+path.sep)) {res.writeHead(403).end();return;}
      const resolved=await realpath(file);
      if (!resolved.startsWith(root+path.sep)) {res.writeHead(403).end();return;}
      const info=await stat(resolved);
      if (!info.isFile()) {res.writeHead(404).end();return;}
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      if(req.method==='HEAD')res.end();else createReadStream(resolved).on('error',()=>res.destroy()).pipe(res);
    } catch(error) {res.writeHead(error.code==='ENOENT'?404:400).end('Resource unavailable');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {server,url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const host=await startPlaytestServer({port:Number(process.env.PORT||4217)});
  console.log('Dreamscapes local preview: '+host.url);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await host.close();process.exit();});
}
