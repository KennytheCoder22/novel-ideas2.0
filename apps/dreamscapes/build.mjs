import {readFileSync,cpSync,mkdirSync,readdirSync,statSync,writeFileSync} from 'node:fs';
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
const assets=path.join(root,'public/experiments/carnival/carousel');
if(readdirSync(assets).filter(f=>f.endsWith('.glb')).length!==20)throw Error('Expected 20 GLBs');
mkdirSync(path.join(root,'dist'),{recursive:true});
cpSync(path.join(root,'public'),path.join(root,'dist'),{recursive:true});
console.log('Built Dreamscapes: verified '+Object.keys(runtime).length+' runtime files (checkpoint + reviewed UI overrides) and 20 GLBs.');
