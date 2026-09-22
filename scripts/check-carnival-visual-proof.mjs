import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../public/experiments/carnival/', import.meta.url);
const hash = file => createHash('sha256').update(readFileSync(new URL(file, root))).digest('hex');
assert.equal(hash('midway.png'), 'f370fcb22aeae37e4b1da0c922e41a4a634d5d64030301e889dc7e95bdb2a96a');
assert.equal(hash('wheel.png'), 'e207b1116e693d5c45f7d1ae11459081a9195ca37b9fb37f96cf753552bed6e2');
const css = readFileSync(new URL('scene.css', root), 'utf8');
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.assembly\s*\{\s*--angle:\s*0deg !important;/);
assert.match(css, /rotate\(calc\(-1 \* \(var\(--angle\) \+ var\(--offset\)\)\)\)/);
const source = readFileSync(new URL('scene.js', root), 'utf8');
assert.doesNotMatch(source, /fetch\(|localStorage|sessionStorage|sendBeacon/);
for (const search of ['', '?motion=still', '?system-reduced']) {
  const classes = new Set(); const listeners = {}; const timers = new Map(); let serial = 0;
  const wheel = { classList: { add: v => classes.add(v), remove: v => classes.delete(v) }, addEventListener: (event, fn) => { listeners[event] = fn; } };
  const status = { textContent: '' }; const documentElement = { dataset: {} };
  const node = () => ({ children: [], properties: {}, style: { setProperty(key, value) { this[key] = value; } }, append(child) { this.children.push(child); } });
  const assembly = node(); const gondolas = node(); const raf = new Map(); let rafSerial = 0;
  const media = { matches: search === '?system-reduced', addEventListener: (name, fn) => { listeners.motion = fn; } };
  const document = { hidden: false, documentElement, createElement: node, addEventListener: (name, fn) => { listeners[name] = fn; }, querySelector: selector => ({ '.wheel': wheel, '.assembly': assembly, '.gondolas': gondolas })[selector] || status };
  vm.runInNewContext(source, {
    document, matchMedia: () => media,
    requestAnimationFrame: fn => { raf.set(++rafSerial, fn); return rafSerial; }, cancelAnimationFrame: id => raf.delete(id),
    location: { search }, URLSearchParams,
    setTimeout: fn => { timers.set(++serial, fn); return serial; }, clearTimeout: id => timers.delete(id),
  });
  assert.equal(documentElement.dataset.motion, search === '?motion=still' ? 'still' : undefined);
  assert.equal(gondolas.children.length, 12);
  if (!search) {
    for (let ms = 0; ms <= 60000; ms += 100) {
      assert.equal(raf.size, 1); const [id, callback] = [...raf][0]; raf.delete(id); callback(ms);
      const angle = parseFloat(assembly.style['--angle']);
      assert.ok(Math.abs(angle - (ms % 60000) * .006) < .00001);
      for (const orbit of gondolas.children) {
        const orbitAngle = angle + parseFloat(orbit.style['--offset']);
        assert.equal(orbitAngle + -orbitAngle, 0);
      }
    }
    document.hidden = true; listeners.visibilitychange(); assert.equal(raf.size, 0);
    document.hidden = false; listeners.visibilitychange(); assert.equal(raf.size, 1);
    media.matches = true; listeners.motion(); assert.equal(raf.size, 0); assert.equal(assembly.style['--angle'], '0deg');
  } else { assert.equal(raf.size, 0); assert.equal(assembly.style['--angle'], '0deg'); }
  listeners.click(); assert.ok(classes.has('acknowledged')); assert.ok(status.textContent);
  listeners.click(); assert.equal(timers.size, 1);
  [...timers.values()][0](); assert.equal(classes.has('acknowledged'), false); assert.equal(status.textContent, '');
}
console.log('PASS: artwork integrity, 12 cabins, 60-second clock and wrap, one animation loop, hidden-page pause, reduced-motion state/change, click cleanup and no data collection.');
