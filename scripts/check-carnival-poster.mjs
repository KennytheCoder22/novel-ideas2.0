import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('public/experiments/carnival/midway.js','utf8');
const listeners={};let aged=false,keyboard=false;
const poster={classList:{toggle:(name,value)=>aged=value},addEventListener:(name,fn)=>listeners[name]=fn,matches:()=>keyboard};
const segment=source.slice(source.indexOf('  let posterAltered'),source.indexOf('  let foxGone'));
vm.runInNewContext(segment,{document:{querySelector:()=>poster}});
for(let i=0;i<3;i++) {listeners.pointerenter({pointerType:'mouse'});assert.equal(aged,true);listeners.pointerleave();assert.equal(aged,false);}
listeners.pointerenter({pointerType:'touch'});assert.equal(aged,false);
listeners.pointerdown({pointerType:'touch'});assert.equal(aged,true);
listeners.pointercancel();assert.equal(aged,false);
keyboard=true;listeners.focus();assert.equal(aged,true);listeners.blur();assert.equal(aged,false);
assert.doesNotMatch(source,/posterSeen|agePoster/);
console.log('PASS: repeated hover enter/leave, touch press/cancel, keyboard focus/blur, no sticky legacy trigger.');
