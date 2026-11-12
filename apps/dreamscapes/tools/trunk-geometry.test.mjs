import test from 'node:test';
import assert from 'node:assert/strict';
import {lidGeometry,lidLowerGeometry} from '../public/cycle-seven/trunk-geometry.mjs';
test('rear hinge remains fixed throughout opening and the reverse closing path',()=>{const hinge=lidGeometry(0).slice(0,2);for(let i=0;i<=200;i++){const p=i/200,q=lidGeometry(p);assert.deepEqual(q.slice(0,2),hinge);for(const v of [...q,...lidLowerGeometry(p)].flat())assert.ok(Number.isFinite(v));const reverse=lidGeometry(1-(200-i)/200);q.flat().forEach((v,j)=>assert.ok(Math.abs(v-reverse.flat()[j])<1e-9));}});
test('closed lid seals the mouth and open lid matches the reference registration',()=>{lidGeometry(0).flat().forEach((v,i)=>assert.ok(Math.abs(v-[280,342,729,381,517,445,134,397][i])<1e-9));const q=lidGeometry(1);assert.ok(Math.hypot(q[2][0]-694,q[2][1]-139)<20);assert.ok(Math.hypot(q[3][0]-272,q[3][1]-123)<20);});
