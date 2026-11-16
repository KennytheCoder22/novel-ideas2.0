import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),p=new URL('runtime-overrides.json',root);const manifest=JSON.parse(readFileSync(p));
function walk(dir,prefix){return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(new URL(entry.name+'/',dir),prefix+entry.name+'/'):[prefix+entry.name]);}
for(const name of ['cycle-ten/profile.mjs','cycle-ten/reading.js','experiments/carnival/index.html',...walk(new URL('public/cycle-twelve/',root),'cycle-twelve/')]){const b=readFileSync(new URL('public/'+name,root));manifest[name]={bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')};}
writeFileSync(p,JSON.stringify(manifest,null,2)+'\n');