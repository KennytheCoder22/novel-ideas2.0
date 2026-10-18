import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import * as T from '../../public/experiments/carnival/vendor/three.module.js';
import {GLTFLoader} from '../../public/experiments/carnival/vendor/GLTFLoader.js';
import {mountRigs} from '../../public/experiments/carnival/mount-rigs.js';
import {mountVariants} from '../../public/experiments/carnival/mount-variants.js';
import {prepareVariant} from '../../public/experiments/carnival/variant-registration.js';
import {runInNewContext} from 'node:vm';
const root=new URL('../../public/experiments/carnival/',import.meta.url);
const specs=runInNewContext(readFileSync(new URL('animal-comparison.js',root),'utf8').match(/const specs=(\[.*?\]);/s)[1]);
async function geometry(url){
  // Parse the actual GLB geometry without a browser image/texture dependency.
  const bytes=readFileSync(new URL(url,root));
  const jsonSize=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+jsonSize).toString());
  delete gltf.images;delete gltf.textures;delete gltf.samplers;delete gltf.materials;
  for(const mesh of gltf.meshes)for(const primitive of mesh.primitives)delete primitive.material;
  const text=Buffer.from(JSON.stringify(gltf)),padded=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(padded);
  const tail=bytes.subarray(20+jsonSize),output=Buffer.alloc(20+padded.length+tail.length);
  output.writeUInt32LE(0x46546c67,0);output.writeUInt32LE(2,4);output.writeUInt32LE(output.length,8);
  output.writeUInt32LE(padded.length,12);output.writeUInt32LE(0x4e4f534a,16);padded.copy(output,20);tail.copy(output,20+padded.length);
  return (await new GLTFLoader().parseAsync(output.buffer.slice(output.byteOffset,output.byteOffset+output.byteLength),'')).scene;
}

const results=[];
for(const style of ['plain','stuffed'])for(const identity of ['polar-bear','zebra','rocket']){
 const rig=mountRigs[identity],spec=specs.find(s=>s.name===identity);
 const entry={bounds:new T.Box3(new T.Vector3(...rig.bounds.min),new T.Vector3(...rig.bounds.max)),radius:rig.radius,mountPoint:new T.Vector3(...spec.mount)};
 const original=await geometry(new URL('../../source-assets/carousel-variants/'+style+'/'+identity+'.glb',import.meta.url)),candidate=await geometry(new URL('./copies/budget/'+style+'/'+identity+'.glb',import.meta.url));
 const a=prepareVariant(entry,original,mountVariants[identity][style]),b=prepareVariant(entry,candidate,mountVariants[identity][style]);
 const delta=Math.max(Math.abs(a.transform.scale-b.transform.scale),...a.transform.offset.map((v,i)=>Math.abs(v-b.transform.offset[i])));
 results.push({style,identity,original:a.transform,candidate:b.transform,maxRegistrationDelta:delta});
 assert(delta<1e-6,'Registration changed: '+identity+'/'+style+' '+delta);
}
writeFileSync(new URL('./registration-results.json',import.meta.url),JSON.stringify(results,null,2));console.log('PASS six simplified copies preserve variant registration to < 1e-6');
