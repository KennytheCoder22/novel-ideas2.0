import assert from 'node:assert/strict';
import test from 'node:test';
import {initial,turn,solved,propPose,readBand} from '../public/cycle-seven/chest-state.mjs';
test('both starting arrangements are solvable with linked neighbours',()=>{for(const round of [0,1]){const queue=[initial(round)],seen=new Set();let found=false;while(queue.length){const state=queue.shift(),key=state.join();if(seen.has(key))continue;seen.add(key);if(solved(state)){found=true;break;}for(let i=0;i<3;i++)queue.push(turn(state,i));}assert(found);}});
test('book and plant separate and descend behind the chest without fading',()=>{const a=propPose(.65,'book'),b=propPose(.65,'plant');assert.notEqual(a.angle,b.angle);assert.notEqual(a.y,b.y);for(const k of ['book','plant']){assert(propPose(1,k).hidden);assert(propPose(1,k).y>100);assert.equal(propPose(0,k).hidden,false);}});
test('age-band completion and fallen props are isolated; corrupt storage is safe',()=>{const storage={getItem:key=>key.endsWith('adults')?JSON.stringify({round:2,completed:true,fallen:true}):null};assert.equal(readBand(storage,'adults').fallen,true);assert.equal(readBand(storage,'kids').fallen,false);assert.equal(readBand({getItem:()=>'{bad'},'kids').completed,false);});
test('unlocking persists in the existing save before completion and migrates completed journeys',()=>{
 for(const band of ['kids','pre-teens','teens','adults']){
  const key='dreamscapes.chest.v1.'+band,memory=new Map(),storage={getItem:k=>memory.get(k)};
  assert.equal(readBand(storage,band).unlocked,false);
  for(const record of [{round:0,completed:false,fallen:false,unlocked:true},{round:1,completed:true,fallen:true},{round:0,completed:false,fallen:true}]){
   memory.set(key,JSON.stringify(record));assert.equal(readBand(storage,band).unlocked,true);
  }
  memory.delete(key);assert.deepEqual(readBand(storage,band),{round:0,completed:false,fallen:false,unlocked:false});
 }
});
test('unlocked saves remain age-specific and malformed values cannot release the lock',()=>{
 const storage={getItem:k=>k.endsWith('adults')?JSON.stringify({round:1,completed:true,fallen:true}):JSON.stringify({round:0,unlocked:'true',completed:false,fallen:false})};
 assert.equal(readBand(storage,'adults').unlocked,true);assert.equal(readBand(storage,'kids').unlocked,false);
 assert.equal(readBand({getItem:()=>JSON.stringify({round:-1,unlocked:true})},'adults').unlocked,false);
 assert.equal(readBand({getItem:()=>{throw Error('Storage blocked');}},'adults').unlocked,false);
});
