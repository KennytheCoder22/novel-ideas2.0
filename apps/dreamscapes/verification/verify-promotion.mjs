import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {mountVariants} from '../public/experiments/carnival/mount-variants.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const records=JSON.parse(readFileSync(path.join(root,'verification/optimized-promotion-assets.json')));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
assert.equal(records.length,40);
for(const r of records){
 assert.equal(hash(path.join(root,r.backup)),r.sourceSha256,'Original source changed');
 assert.equal(hash(path.join(root,'public',r.active)),r.sha256,'Approved candidate changed');
 assert.equal(hash(path.join(root,'dist',r.active)),r.sha256,'Build differs from candidate');
 assert.equal(mountVariants[r.identity][r.style].url,'./'+r.active.replace('experiments/carnival/',''));
 assert(!r.active.includes('/source-assets/'));
}
const files=d=>readdirSync(d).flatMap(n=>{const p=path.join(d,n);return statSync(p).isDirectory()?files(p):[p];});
const built=files(path.join(root,'dist'));const glbs=built.filter(p=>p.endsWith('.glb'));
assert.equal(glbs.length,60);assert(!built.some(p=>p.includes('source-assets')));
const result={passed:true,originalBackupsVerified:40,approvedCopiesVerified:40,ornateCount:20,plainBytes:records.filter(r=>r.style==='plain').reduce((s,r)=>s+r.bytes,0),stuffedBytes:records.filter(r=>r.style==='stuffed').reduce((s,r)=>s+r.bytes,0),allGLBBytes:glbs.reduce((s,p)=>s+statSync(p).size,0),productionBuildBytes:built.reduce((s,p)=>s+statSync(p).size,0),buildFiles:built.length,sourceBackupBytes:records.reduce((s,r)=>s+statSync(path.join(root,r.backup)).size,0)};
writeFileSync(path.join(root,'verification/promoted-build-results.json'),JSON.stringify(result,null,2)+'\n');console.log(result);
