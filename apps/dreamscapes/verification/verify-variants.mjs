import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import * as T from '../public/experiments/carnival/vendor/three.module.js';
import {GLTFLoader} from '../public/experiments/carnival/vendor/GLTFLoader.js';
import {mountVariants,resolveMountVariant} from '../public/experiments/carnival/mount-variants.js';
import {mountRigs} from '../public/experiments/carnival/mount-rigs.js';
import {envelope,prepareVariant} from '../public/experiments/carnival/variant-registration.js';

const root=new URL('../public/experiments/carnival/',import.meta.url);
const source=readFileSync(new URL('animal-comparison.js',root),'utf8');
const specs=runInNewContext(source.match(/const specs=(\[.*?\]);/s)[1]);
specs.push({name:'horse',mount:[-.12,.055,-.03]});
const checkpoint=JSON.parse(readFileSync(new URL('../checkpoint/manifest.json',import.meta.url)));
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
let count=0;
for(const spec of specs){
  const mapping=mountVariants[spec.name];assert(mapping);
  const original=readFileSync(new URL(mapping.ornate.url,root));
  const key='experiments/carnival/'+mapping.ornate.url.slice(2);
  assert.equal(createHash('sha256').update(original).digest('hex'),checkpoint[key].sha256,'Ornate source changed: '+spec.name);
  const reference=await geometry(mapping.ornate.url),mountPoint=new T.Vector3(...spec.mount);
  const entry={bounds:new T.Box3().setFromObject(reference),radius:envelope(reference,mountPoint),mountPoint};
  assert.deepEqual(entry.bounds.min.toArray(),mountRigs[spec.name].bounds.min,'Frozen bounds min '+spec.name);
  assert.deepEqual(entry.bounds.max.toArray(),mountRigs[spec.name].bounds.max,'Frozen bounds max '+spec.name);
  assert(Math.abs(entry.radius-mountRigs[spec.name].radius)<1e-10,'Frozen radius '+spec.name);
  for(const style of ['plain','stuffed']){
    const model=await geometry(mapping[style].url),config=mapping[style];
    const prepared=prepareVariant(entry,model,config),bounds=new T.Box3().setFromObject(prepared.wrapper);
    assert(Number.isFinite(prepared.transform.scale)&&prepared.transform.scale>0);
    assert(bounds.min.y>=entry.bounds.min.y-1e-6,spec.name+'/'+style+' below original envelope');
    assert(bounds.max.y<=entry.bounds.max.y+1e-6,spec.name+'/'+style+' above original envelope');
    assert(envelope(prepared.wrapper,mountPoint)<=entry.radius+1e-6,spec.name+'/'+style+' exceeds all-yaw crop envelope');
    // A nonzero correction changes only the variant wrapper, never its anchor.
    const point=mountPoint.clone(),adjusted=prepareVariant(entry,model,{...config,offset:[.01,-.02,.03]});
    assert.deepEqual(mountPoint.toArray(),point.toArray());
    assert(Math.abs(adjusted.wrapper.position.x-prepared.wrapper.position.x-(.01-config.offset[0]))<1e-8);
    model.traverse(o=>o.geometry?.dispose());count++;
  }
  const saved=mapping.plain;delete mapping.plain;
  assert.equal(resolveMountVariant(spec.name,'plain'),mapping.ornate,'Missing style must fall back to Ornate');mapping.plain=saved;
  reference.traverse(o=>o.geometry?.dispose());
}
console.log(`PASS: ${count} actual GLB registrations fit the fixed crop/deck envelopes; all 20 Ornate hashes preserved; 20 missing-style fallbacks; XYZ corrections leave canonical anchors intact.`);
