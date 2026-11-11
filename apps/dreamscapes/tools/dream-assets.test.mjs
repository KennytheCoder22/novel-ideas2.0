import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dreamAssets,mountDreams,dreamOpacity,preloadDream} from '../public/experiments/carnival/carousel-dream.js';
const app=new URL('../',import.meta.url),root=new URL('public/experiments/carnival/dream-worlds/',app),manifest=JSON.parse(readFileSync(new URL('manifest.json',root)));
test('All seventeen approved originals are intact, with twenty stable mount assignments',()=>{
 assert.equal(manifest.assets.length,17);assert.equal(Object.keys(mountDreams).length,20);
 for(const a of manifest.assets){const bytes=readFileSync(new URL(encodeURIComponent(a.file),root));assert.equal(createHash('sha256').update(bytes).digest('hex'),a.sha256);assert.equal(bytes.length,a.bytes);assert.equal(bytes.readUInt32BE(16),a.width);assert.equal(bytes.readUInt32BE(20),a.height);assert(dreamAssets[a.id]);assert.equal(decodeURIComponent(new URL(dreamAssets[a.id].url).pathname.split('/').at(-1)),a.file);for(const id of a.mountIds)assert.equal(mountDreams[id],a.id);}
 assert.equal(mountDreams.ostrich,mountDreams.zebra);assert.equal(mountDreams.elephant,mountDreams.zebra);assert.equal(mountDreams.horse,'fortress');assert.equal(mountDreams['brown-horse'],'red-rock');assert.equal(mountDreams['polar-bear'],'arctic');assert.equal(mountDreams.cat,'living-room');assert.equal(mountDreams.tiger,'jungle-temple');assert.equal(mountDreams.flamingo,'lagoon');assert.equal(mountDreams.dragon,'castle-aerial');assert.equal(mountDreams.unicorn,'castle-ground');assert.notEqual(mountDreams.dragon,mountDreams.unicorn);assert.equal(mountDreams.rabbit,'warren');assert.equal(mountDreams.fox,'countryside');assert.equal(mountDreams.stag,'wildflower-valley');assert.notEqual(mountDreams.fox,mountDreams.stag);assert.equal(mountDreams.grizzly,'wilderness');assert.equal(mountDreams.wolf,mountDreams.grizzly);
});
test('Dream arrives on the first turn, repeats on the second and never covers boarding or return',()=>{
 for(const time of [0,2800,18000,20800,24800,34800,38800,41600])assert.equal(dreamOpacity(time),0);
 for(const time of [9050,12000,14550,27050,30000,32550])assert.equal(dreamOpacity(time),1);
 let previous=dreamOpacity(0);for(let t=1;t<=41600;t+=20){const current=dreamOpacity(t);assert(current>=0&&current<=1);assert(Math.abs(current-previous)<.018);assert.equal(dreamOpacity(t,true),0);previous=current;}
});
test('Approved camera rig, assemblies, mount catalogue and Ferris environment remain unchanged',()=>{
 const before=file=>readFileSync(new URL('fixtures/approved-carousel/'+file,import.meta.url),'utf8');
 const now=file=>readFileSync(new URL('public/'+file,app),'utf8');
 assert.equal(now('carousel-choice-catalog.js'),before('carousel-choice-catalog.js'));
 const file='experiments/carnival/carousel-onboard.js',old=before(file),current=now(file);
 for(const [start,end]of [[' for(const entry of entries){',' const environmentView='],[' const selected=world.seats.get(ride.selected);','world.camera.quaternion.copy(walkQuaternion).slerp(followQuaternion,blend);']])assert.equal(current.slice(current.indexOf(start),current.indexOf(end)+end.length).replace(' if(resumeElapsed>0)blend*=ease((elapsed-start)/BOARD);\n',''),old.slice(old.indexOf(start),old.indexOf(end)+end.length));
 for(const f of ['experiments/carnival/carousel-environment.js','experiments/carnival/platform.js'])assert.equal(now(f),before(f));
});

test('Faster clock agrees with validation and closes each mechanical revolution continuously',async()=>{
 const {runInNewContext}=await import('node:vm');const window={};runInNewContext(readFileSync(new URL('public/experiments/carnival/carousel.js',app),'utf8'),{window});const carousel=window.CarnivalCarousel;assert.equal(carousel.period,18000);assert.equal(carousel.period%6000,0);
 for(let index=0;index<carousel.slotCount;index++){const a=carousel.pose(index,0),b=carousel.pose(index,1);for(const field of ['x','y','depth','lift','scale'])assert(Math.abs(a[field]-b[field])<1e-9);const cycle=carousel.pose(index,6000/carousel.period);assert(Math.abs(a.lift-cycle.lift)<1e-9);}
});


test('Only selected approved worlds load; Ostrich, Zebra and Elephant share one decoded image',async()=>{
 const original=globalThis.Image,requests=[];
 globalThis.Image=class{set src(value){requests.push(value);}async decode(){}};
 try{assert.equal(await preloadDream('missing-mount'),null);assert.equal(requests.length,0);const [a,b,c]=await Promise.all([preloadDream('ostrich'),preloadDream('zebra'),preloadDream('elephant')]);assert.equal(a,b);assert.equal(a,c);assert.equal(a.id,'savannah');assert.equal(requests.length,1);}finally{if(original)globalThis.Image=original;else delete globalThis.Image;}
});
test('A failed dream decode stays optional and can recover on the next selection',async()=>{
 const original=globalThis.Image;let calls=0;
 globalThis.Image=class{async decode(){if(++calls===1)throw Error('offline');}};
 try{const failed=await preloadDream('snail');assert.equal(failed.image,null);assert.match(failed.error,/offline/);const next=await preloadDream('snail');assert(next.image);assert.equal(next.error,null);assert.equal(calls,2);}finally{if(original)globalThis.Image=original;else delete globalThis.Image;}
});


test('Grizzly and Wolf share the same lazily decoded wilderness image',async()=>{
 const original=globalThis.Image,requests=[];globalThis.Image=class{set src(value){requests.push(value);}async decode(){}};
 try{const [bear,wolf]=await Promise.all([preloadDream('grizzly'),preloadDream('wolf')]);assert.equal(bear,wolf);assert.equal(bear.id,'wilderness');assert.equal(requests.length,1);}finally{if(original)globalThis.Image=original;else delete globalThis.Image;}
});
