import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source = readFileSync('public/experiments/carnival/geese.js', 'utf8');
const attrs = {};
const flock = {style:{},setAttribute:(k,v)=>attrs[k]=k==='transform'?v:Number(v)};
const layer = {style:{},dataset:{},setAttribute(){},classList:{add(){}},querySelector:()=>flock};
const listeners = {};
const reduced = {matches:false,addEventListener:(_,fn)=>listeners.motion=fn};
let callback, time=0;
const scene = {querySelector:()=>({after(){}})};
const doc = {hidden:false,querySelector:()=>scene,
  createElementNS:()=>layer,addEventListener:(k,fn)=>listeners[k]=fn};
vm.runInNewContext(source, {document:doc,matchMedia:()=>reduced,URLSearchParams,
  location:{search:''},innerWidth:1280,Math,
  requestAnimationFrame:fn=>(callback=fn,1),cancelAnimationFrame:()=>{callback=null;}});
function step(ms) { time+=ms; assert.ok(callback); callback(time); }
step(0);step(3900);assert.equal(layer.dataset.phase,'waiting');
step(100);assert.equal(layer.dataset.phase,'flying');assert.equal(attrs.width,42);
step(20000);
assert.ok(attrs.x>700&&attrs.x<720);
assert.ok(attrs.y>148&&attrs.y<158);
// Transform the artwork's leading bird and compare its heading to travel.
const [angle,cx,cy]=attrs.transform.match(/[-\d.]+/g).map(Number);
const rad=angle*Math.PI/180;
const dx=attrs.width*.43,dy=attrs.height*.05;
const leader={x:cx+dx*Math.cos(rad)-dy*Math.sin(rad),y:cy+dx*Math.sin(rad)+dy*Math.cos(rad)};
assert.ok(angle>0&&angle<60,'V points clockwise along its diagonal route');
assert.ok(leader.x>702&&leader.x<746&&leader.y>148&&leader.y<172);
const before={...attrs};
doc.hidden=true;listeners.visibilitychange();assert.equal(callback,null);
time+=90000;doc.hidden=false;listeners.visibilitychange();step(0);
assert.deepEqual(attrs,before);
step(8000);assert.equal(layer.dataset.phase,'resting');assert.equal(flock.style.opacity,'0');
assert.ok(Math.abs(attrs.width-42/3)<.001);
step(7900);assert.equal(layer.dataset.phase,'resting');step(100);assert.equal(layer.dataset.phase,'flying');
step(28000);assert.equal(layer.dataset.phase,'resting');
step(7900);assert.equal(layer.dataset.phase,'resting');step(100);assert.equal(layer.dataset.phase,'flying');
reduced.matches=true;listeners.motion();assert.equal(callback,null);assert.equal(flock.style.opacity,'0');
assert.doesNotMatch(source,/record\(|sessionStorage|fetch\(|addEventListener\(['"](?:click|pointer)/);
console.log('PASS: first flight at 4s, star entrance, lower moon crossing, clockwise heading, one-third final size, hidden pause, 8s playtest recurrence, reduced motion, no interaction/evidence.');
