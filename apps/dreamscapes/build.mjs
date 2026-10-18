import {readFileSync,rmSync,cpSync,mkdirSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(readFileSync(path.join(root,'checkpoint/manifest.json')));
// Preserve the original checkpoint; separately verify reviewed scene UI changes.
const overrides=JSON.parse(readFileSync(path.join(root,'runtime-overrides.json')));
const runtime={...manifest,...overrides};
for(const [name,meta] of Object.entries(runtime)){
 const bytes=readFileSync(path.join(root,'public',name));
 if(createHash('sha256').update(bytes).digest('hex')!==meta.sha256)throw Error('Verified runtime changed: '+name);
}
const variantCount=Object.keys(runtime).filter(name=>name.includes('/carousel/variants/')&&name.endsWith('.glb')).length;
const assets=path.join(root,'public/experiments/carnival/carousel');
if(readdirSync(assets).filter(f=>f.endsWith('.glb')).length!==20)throw Error('Expected 20 GLBs');
// Rebuild generated output so archived source GLBs cannot remain in a stale dist.
rmSync(path.join(root,'dist'),{recursive:true,force:true});
mkdirSync(path.join(root,'dist'),{recursive:true});
cpSync(path.join(root,'public'),path.join(root,'dist'),{recursive:true});
console.log('Built Dreamscapes: verified '+Object.keys(runtime).length+' runtime files (checkpoint + reviewed UI overrides), 20 Ornate GLBs and '+variantCount+' variant GLBs.');
