import assert from 'node:assert/strict';
import {dreamAmount,dreamConfig,dreamDefaults} from '../public/experiments/carnival/carousel-dream.js';
for(const config of [dreamDefaults,dreamConfig({start:-20,restoreAt:200,restoreDuration:200}),dreamConfig({start:99,transition:99,restoreAt:-99,restoreDuration:-99,intensity:8})]){
 for(let t=0;t<=18;t+=.01)assert.equal(dreamAmount(t,config),0);
 assert.equal(dreamAmount(35,config),0);assert.equal(dreamAmount(36,config),0);
 for(const t of [config.start,config.start+config.transition,config.restoreAt,config.restoreAt+config.restoreDuration]){
  const h=1e-5,left=(dreamAmount(t,config)-dreamAmount(t-h,config))/h,right=(dreamAmount(t+h,config)-dreamAmount(t,config))/h;assert(Math.abs(left-right)<.001,'Continuous velocity at effect boundaries');
 }
}
assert(dreamAmount(24)>0.8);assert.equal(dreamAmount(24,dreamConfig({intensity:0})),0);
console.log('PASS dream envelope: first turn unchanged, continuous transitions, restoration by 35 seconds, bounded review parameters');
