import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source = readFileSync('public/experiments/carnival/geese.js', 'utf8');
const attrs = {};
const flock = {style:{},setAttribute:(k,v)=>attrs[k]=Number(v)};
const layer = {style:{},dataset:{},setAttribute(){},classList:{add(){}},querySelector:()=>flock};
const listeners = {};
const reduced = {matches:false,addEventListener:(_,fn)=>listeners.motion=fn};
let callback, time=0, left=1200, random=0;
const balloon = {getBoundingClientRect:()=>({left}),getAnimations:()=>[{currentTime:100000}]};
const scene = {querySelector:()=>({after(){}})};
const doc = {hidden:false,querySelector:s=>s==='.balloon'?balloon:scene,
  createElementNS:()=>layer,addEventListener:(k,fn)=>listeners[k]=fn};
vm.runInNewContext(source, {document:doc,matchMedia:()=>reduced,URLSearchParams,
  location:{search:''},innerWidth:1280,Math:Object.assign(Object.create(Math),{random:()=>random}),
  requestAnimationFrame:fn=>(callback=fn,1),cancelAnimationFrame:()=>{callback=null;}});
function step(ms) { time+=ms; assert.ok(callback); callback(time); }
step(0);step(4000);assert.equal(layer.dataset.phase,'waiting');
left=1300;step(1000);step(900);assert.equal(layer.dataset.phase,'waiting');
step(100);assert.equal(layer.dataset.phase,'flying');assert.equal(attrs.width,42);
step(5000);
assert.ok(attrs.x>690&&attrs.x<710);
assert.ok(attrs.y>140&&attrs.y<150);
// Leading bird is at ~93% width / 55% height in the supplied V artwork.
const leader={x:attrs.x+attrs.width*.93,y:attrs.y+attrs.height*.55};
assert.ok(leader.x>702&&leader.x<746&&leader.y>148&&leader.y<170);
const before={...attrs};
doc.hidden=true;listeners.visibilitychange();assert.equal(callback,null);
time+=90000;doc.hidden=false;listeners.visibilitychange();step(0);
assert.deepEqual(attrs,before);
step(9000);assert.equal(layer.dataset.phase,'resting');assert.equal(flock.style.opacity,'0');
assert.ok(Math.abs(attrs.width-42*.67)<.001);
step(44900);assert.equal(layer.dataset.phase,'resting');step(100);assert.equal(layer.dataset.phase,'flying');
random=.999;step(14000);assert.equal(layer.dataset.phase,'resting');
step(119000);assert.equal(layer.dataset.phase,'resting');step(1000);assert.equal(layer.dataset.phase,'flying');
reduced.matches=true;listeners.motion();assert.equal(callback,null);assert.equal(flock.style.opacity,'0');
assert.doesNotMatch(source,/record\(|sessionStorage|fetch\(|addEventListener\(['"](?:click|pointer)/);
console.log('PASS: viewport exit + 2s, lower moon crossing, diagonal travel, 33% recession, hidden pause, 45–120s recurrence, reduced motion, no interaction/evidence.');
