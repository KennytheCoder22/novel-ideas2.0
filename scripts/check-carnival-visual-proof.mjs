import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../public/experiments/carnival/', import.meta.url);
const hash = file => createHash('sha256').update(readFileSync(new URL(file, root))).digest('hex');
assert.equal(hash('midway.png'), 'f370fcb22aeae37e4b1da0c922e41a4a634d5d64030301e889dc7e95bdb2a96a');
assert.equal(hash('wheel.png'), 'e207b1116e693d5c45f7d1ae11459081a9195ca37b9fb37f96cf753552bed6e2');
const css = readFileSync(new URL('scene.css', root), 'utf8');
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.wheel img\s*\{\s*animation:\s*none;/);
assert.doesNotMatch(css, /rotate\(/);
const source = readFileSync(new URL('scene.js', root), 'utf8');
assert.doesNotMatch(source, /fetch\(|localStorage|sessionStorage|sendBeacon/);
for (const search of ['', '?motion=still']) {
  const classes = new Set(); const listeners = {}; const timers = new Map(); let serial = 0;
  const wheel = { classList: { add: v => classes.add(v), remove: v => classes.delete(v) }, addEventListener: (event, fn) => { listeners[event] = fn; } };
  const status = { textContent: '' }; const documentElement = { dataset: {} };
  vm.runInNewContext(source, {
    document: { documentElement, querySelector: selector => selector === '.wheel' ? wheel : status },
    location: { search }, URLSearchParams,
    setTimeout: fn => { timers.set(++serial, fn); return serial; }, clearTimeout: id => timers.delete(id),
  });
  assert.equal(documentElement.dataset.motion, search ? 'still' : undefined);
  listeners.click(); assert.ok(classes.has('acknowledged')); assert.ok(status.textContent);
  listeners.click(); assert.equal(timers.size, 1);
  [...timers.values()][0](); assert.equal(classes.has('acknowledged'), false); assert.equal(status.textContent, '');
}
console.log('PASS: exact supplied artwork hashes, reduced-motion rule, no rotation/data collection, repeated activation and timed acknowledgment cleanup.');
