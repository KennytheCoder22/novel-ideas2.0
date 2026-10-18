import {createRequire} from 'node:module';import {pathToFileURL,fileURLToPath} from 'node:url';import path from 'node:path';import fs from 'node:fs';
const here=path.dirname(fileURLToPath(import.meta.url));const req=createRequire(path.resolve(process.env.GLB_TOOLS||path.join(here,'tools'),'package.json'));
const {NodeIO}=await import(pathToFileURL(req.resolve('@gltf-transform/core')));
const {weld,simplify}=await import(pathToFileURL(req.resolve('@gltf-transform/functions')));
const {MeshoptSimplifier}=await import(pathToFileURL(req.resolve('meshoptimizer')));await MeshoptSimplifier.ready;
const io=new NodeIO(),stats=[];
for(const style of ['plain','stuffed'])for(const [name,target] of [['polar-bear',75000],['zebra',75000],['rocket',68000]]){
 const input=path.join(here,'../../source-assets/carousel-variants',style,name+'.glb'),doc=await io.read(input);
 const triangles=()=>doc.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).reduce((n,p)=>n+p.getIndices().getCount()/3,0);const before=triangles();
 await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:target/before,error:0.001,lockBorder:true}));
 const output=path.join(here,'mesh-copies',style,name+'.glb');fs.mkdirSync(path.dirname(output),{recursive:true});await io.write(output,doc);stats.push({style,name,before,target,after:triangles()});console.log(stats.at(-1));
}
fs.writeFileSync(path.join(here,'mesh-results.json'),JSON.stringify(stats,null,2));
