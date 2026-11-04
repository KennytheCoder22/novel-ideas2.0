import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startPlaytestServer} from './playtest-server.mjs';

test('Opening, clean Carnival route and relative assets match hosting aliases',async()=>{
 const host=await startPlaytestServer();
 try{
  for(const route of ['/','/carnival/','/carnival','/carnival/index.html','/experiments/carnival/index.html?scene=skee-ball']){
   const response=await fetch(host.url+route);assert.equal(response.status,200,route);assert.match(await response.text(),/<!doctype html>/i);
   if(route.includes('scene='))assert.equal(new URL(response.url).search,'?scene=skee-ball');
  }
  for(const asset of ['/carnival/mara-midway.js','/carnival/vendor/three.module.js','/age-band.js']){
   const response=await fetch(host.url+asset,{method:'HEAD'});assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'text/javascript');assert.equal(await response.text(),'');
  }
  assert.equal((await fetch(host.url+'/carnival/not-present.glb')).status,404);
  assert.equal((await fetch(host.url+'/',{method:'POST'})).status,405);
  assert.equal((await fetch(host.url+'/%2e%2e%2fpackage.json')).status,403);
 }finally{await host.close();}
});
