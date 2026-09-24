import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/experiments/carnival/fox-cinema.js',import.meta.url),'utf8');
assert.doesNotMatch(source,/clip-path|setTimeout|fetch\(|Math\.random/);
async function run(reduced=false,early=false) {
  let callback,closed=false,gone=false,removed=false;
  const events=[],listeners={};
  const context=new Proxy({}, {get:(o,k)=>o[k]??(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
  const canvas={dataset:{},setAttribute(){},getContext:()=>context,remove(){removed=true;}};
  const fox={style:{visibility:''},getBoundingClientRect:()=>({x:985,y:530,width:230,height:170})};
  const scene={style:{transform:'',transformOrigin:'',filter:''},offsetLeft:640,offsetTop:360,
    querySelector:()=>fox,getBoundingClientRect:()=>({left:0,top:-67,right:1280,bottom:787})};
  const dialog={classList:{add(){},remove(){}},close(){closed=true;}};
  const sandbox={Image:class{decode(){return Promise.resolve();}},window:{},document:{hidden:false,createElement:()=>canvas,
    addEventListener:(k,v)=>listeners[k]=v,removeEventListener:k=>delete listeners[k]},
    innerWidth:1280,innerHeight:720,devicePixelRatio:1,getComputedStyle:()=>({transform:'matrix(1,0,0,1,-640,-427)'}),
    requestAnimationFrame:fn=>(callback=fn,1),cancelAnimationFrame:()=>{callback=null;},addEventListener(){},removeEventListener(){}};
  vm.runInNewContext(source,sandbox);
  const stop=sandbox.window.startFoxCinema({scene,dialog,art:{append(){}},motion:{matches:reduced},still:false,
    record:type=>events.push(type),vanish(){gone=true;}});
  await new Promise(resolve=>setImmediate(resolve));
  const step=ms=>{assert.ok(callback);callback(ms);};
  step(0);assert.equal(canvas.dataset.phase,'approach');
  step(1600);assert.equal(canvas.dataset.phase,'pickup');
  if(early){stop();assert.equal(gone,false);assert.equal(callback,null);assert.equal(scene.style.transform,'');return;}
  step(2950);assert.equal(canvas.dataset.phase,'MARA');
  step(5400);assert.equal(gone,false);
  sandbox.document.hidden=true;listeners.visibilitychange();assert.equal(callback,null);
  sandbox.document.hidden=false;listeners.visibilitychange();step(20000);assert.equal(gone,false);
  step(20100);assert.equal(gone,true);
  step(23100);assert.equal(canvas.dataset.phase,'tag-fall');
  step(24000);assert.equal(canvas.dataset.phase,'return');
  step(25600);assert.equal(closed,true);
  stop();assert.equal(removed,true);assert.equal(scene.style.transform,'');assert.equal(scene.style.filter,'');
  assert.deepEqual(events,['fox_opened','fox_tag_presented','fox_disintegration_seen','fox_returned_after_disintegration']);
}
await run();await run(true);await run(false,true);
console.log('PASS: automatic phases, reading hold, hidden-tab pause, persistent disappearance, reduced-motion completion, early exit and camera cleanup.');
