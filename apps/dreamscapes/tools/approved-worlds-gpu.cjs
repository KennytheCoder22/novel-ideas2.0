const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const app=path.resolve(__dirname,'..'),proof=path.join(app,'verification',process.env.DREAMSCAPES_WORLD_PROOF||'approved-worlds');
(async()=>{fs.mkdirSync(proof,{recursive:true});const host=await import('./playtest-server.mjs').then(m=>m.startPlaytestServer()),browser=await chromium.launch({executablePath:process.env.BROWSER_EXE});try{
 const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'||/WebGL.*INVALID|INVALID_.*tex/i.test(m.text()))errors.push(m.text());});await p.goto(host.url+'/carnival/locations/rides-games.png');
 const results=await p.evaluate(async()=>{
  const T=await import('/carnival/vendor/three.module.js'),{mountDream,mountDreams}=await import('/carnival/carousel-dream.js');
  const scene=new T.Scene();scene.background=new T.Color('#10141c');const camera=new T.PerspectiveCamera(58,1.6,.025,70);camera.position.y=1.4;
  const renderer=new T.WebGLRenderer({preserveDrawingBuffer:true,antialias:true});renderer.setSize(640,400);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;document.body.append(renderer.domElement);
  const resources={textures:[],ownedGeometry:[],ownedMaterials:[]},view=mountDream(scene,resources),results=[];
  for(const id of Object.keys(mountDreams)){
   await view.prepare(id);view.begin(id);const d=view.update(11200,new T.Quaternion(),camera,false);renderer.render(scene,camera);
   const png=renderer.domElement.toDataURL(),residentTextures=renderer.info.memory.textures;
   const reference=new T.Scene();reference.background=new T.Color('#10141c');const rr={textures:[],ownedGeometry:[],ownedMaterials:[]},fresh=mountDream(reference,rr);await fresh.prepare(id);fresh.begin(id);fresh.update(11200,new T.Quaternion(),camera,false);renderer.render(reference,camera);const expected=renderer.domElement.toDataURL();
   for(const t of rr.textures)t.dispose();for(const g of rr.ownedGeometry)g.dispose();for(const m of rr.ownedMaterials)m.dispose();
   results.push({id,...d,residentTextures,png,matchesFreshUpload:png===expected});
  }
  for(const t of resources.textures)t.dispose();for(const g of resources.ownedGeometry)g.dispose();for(const m of resources.ownedMaterials)m.dispose();renderer.dispose();return results;
 });
 for(const r of results){const png=Buffer.from(r.png.split(',')[1],'base64');delete r.png;r.sha256=crypto.createHash('sha256').update(png).digest('hex');fs.writeFileSync(path.join(proof,'projection-'+r.id+'.png'),png);assert.equal(r.residentTextures,1);assert(r.matchesFreshUpload,'Reused texture must match a fresh GPU upload');assert(r.enabled&&r.opacity===1);}
 const manifest=JSON.parse(fs.readFileSync(path.join(app,'public/experiments/carnival/dream-worlds/manifest.json'))),shared=new Map();
 for(const r of results){const asset=manifest.assets.find(a=>a.id===r.asset);assert(asset);assert(Math.abs(r.height-2*Math.PI*13.9*(r.spanDegrees/360)/(asset.width/asset.height))<1e-9,'Native source aspect ratio preserved');if(shared.has(r.asset))assert.equal(r.sha256,shared.get(r.asset),'Shared environment must render identically');else shared.set(r.asset,r.sha256);}
 assert.equal(results.length,20);assert.equal(shared.size,17);assert.equal(new Set(shared.values()).size,17,'All 17 worlds have distinct rendered pixels');assert.equal(new Set(results.map(r=>r.textureId)).size,1);assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(proof,'gpu-checks.json'),JSON.stringify({passed:true,results,errors},null,2));console.log('PASS all 20 mount assignments, 17 distinct GPU panoramas, native aspects, shared environments and one resident texture');await p.close();
}finally{await browser.close();await host.close();}})().catch(e=>{console.error(e);process.exitCode=1});
