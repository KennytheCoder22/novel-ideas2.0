import assert from 'node:assert/strict';
import test from 'node:test';
import {BANDS,fresh,change,answer,read,key,normalize} from '../public/cycle-eight/memory.mjs';
for(const band of BANDS) for(const order of [['midway','forest-edge'],['forest-edge','midway']]) {
 test(`${band}: ${order.join(' then ')} survives interruption and supports both outcomes`,()=>{
  const store=new Map(),storage={getItem:k=>store.get(k)};
  let s=fresh();
  assert.deepEqual(change(s,'discover',order[0],band),s,'ignoring chest cannot unlock reflections');
  s=change(s,'awaken',null,band);s=change(s,'discover',order[0],band);
  assert.equal(s.order.length,1);
  store.set(key(band),JSON.stringify(s));s=read(storage,band);
  assert.deepEqual(change(s,'discover',order[0],band),s,'revisits do not duplicate clues');
  assert.equal(change(s,'join',[],band).joined,false);
  s=change(s,'discover',order[1],band);
  const correct=answer(s,band);assert.equal(correct.length,band==='kids'?2:4);
  assert.equal(change(s,'join',['star'],band).joined,false);
  s=change(s,'join',correct,band);assert(s.joined);
  for(const choice of ['shelter','wander','shelter']) {s=change(s,'home',choice,band);assert.equal(s.home,choice);}
  store.set(key(band),JSON.stringify(s));assert.deepEqual(read(storage,band),s);
  for(const other of BANDS.filter(b=>b!==band))assert.deepEqual(read(storage,other),fresh());
 });
}
test('corrupt, blocked and inconsistent storage cannot fabricate an ending',()=>{
 assert.deepEqual(read({getItem:()=>'{broken'},'adults'),fresh());
 assert.deepEqual(read({getItem:()=>{throw Error('blocked');}},'kids'),fresh());
 assert.equal(normalize({joined:true,home:'wander',order:['midway','forest-edge']}).home,null);
 assert.deepEqual(normalize({awakened:true,order:['midway','midway','unknown']}).order,['midway']);
 assert.equal(normalize({awakened:true,order:['midway','forest-edge'],joined:true,home:'invalid'}).home,null);
});
test('narrative observations are bounded raw actions without genre weights',()=>{
 let s=change(fresh(),'awaken',null,'adults');for(const source of ['midway','forest-edge'])s=change(s,'discover',source,'adults');s=change(s,'join',answer(s,'adults'),'adults');
 for(let i=0;i<80;i++)s=change(s,'home',i%2?'shelter':'wander','adults');
 assert.equal(s.observations.length,32);
 for(const o of s.observations)assert.deepEqual(Object.keys(o),['action','value']);
});
