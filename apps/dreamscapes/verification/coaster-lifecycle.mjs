import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/experiments/carnival/coaster-train.js', import.meta.url), 'utf8');
async function fixture(search = '') {
  const timers = new Map(), frames = new Map(), watchers = [], events = new Map();
  let id = 0, now = 0;
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.dataset = {}; this.style = {}; }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    append(...children) { this.children.push(...children); }
    remove() { this.removed = true; }
    getTotalLength() { return 1000; }
    getPointAtLength(distance) { return {x:1000 - distance, y:100}; }
  }
  const html = {travelling:false, hasAttribute() { return this.travelling; }};
  const document = {
    hidden:false, documentElement:html, createElementNS:(_, tag) => new Element(tag),
    addEventListener:(name, fn) => events.set(name, fn),
    removeEventListener:name => events.delete(name),
  };
  const reduced = {matches:false, addEventListener:(_, fn) => { reduced.change = fn; }, removeEventListener() {}};
  const math = Object.create(Math); math.random = () => .5;
  const window = {};
  vm.runInNewContext(source, {
    window, document, Math:math, URLSearchParams, location:{search, hostname:'example.test'},
    performance:{now:() => now}, matchMedia:() => reduced,
    Image:class { decode() { return Promise.resolve(); } },
    MutationObserver:class { constructor(fn) { this.fn = fn; watchers.push(this); } observe() {} disconnect() {} },
    setTimeout:(fn, delay) => { timers.set(++id, {fn, delay}); return id; },
    clearTimeout:key => timers.delete(key),
    requestAnimationFrame:fn => { frames.set(++id, fn); return id; },
    cancelAnimationFrame:key => frames.delete(key),
  });
  const view = new Element('section'); view.inert = true; view.style.visibility = 'hidden';
  const plane = new Element('div'); plane.parentElement = view;
  const dispose = window.CarnivalCoaster.mount(plane);
  await Promise.resolve();
  const sync = () => watchers.forEach(w => w.fn());
  const activate = () => { view.inert = false; view.style.visibility = 'visible'; sync(); };
  const tick = time => { now = time; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(time)); };
  return {timers, frames, view, document, reduced, html, dispose, activate, sync, tick,
    svg:plane.children[0], setNow:value => { now = value; }};
}

const f = await fixture();
assert.equal(f.timers.size, 0, 'Inactive scenes must not schedule trains');
f.activate();
assert.equal([...f.timers.values()][0].delay, 60000);
assert.equal(f.frames.size, 0, 'There must be no animation-frame loop between passes');
f.setNow(60000);
const first = [...f.timers.entries()][0]; f.timers.delete(first[0]); first[1].fn();
assert.equal(f.svg.dataset.coasterState, 'passing');
f.tick(61550);
const cars = f.svg.children[1].children;
assert.equal(cars.filter(car => Number(car.attributes.opacity) > 0).length, 4);
f.tick(63100);
assert.equal(f.frames.size, 0);
assert.ok(cars.every(car => car.attributes.opacity === '0'));
assert.equal([...f.timers.values()][0].delay, 56900, 'Pass starts remain 60 seconds apart');
f.document.hidden = true; f.sync();
assert.equal(f.timers.size, 0);
assert.equal(f.svg.dataset.coasterState, 'inactive');
f.document.hidden = false; f.sync();
assert.equal([...f.timers.values()][0].delay, 60000, 'Returning tabs start a fresh wait, without catch-up');
f.reduced.matches = true; f.reduced.change();
assert.equal(f.timers.size, 0);
f.reduced.matches = false; f.reduced.change();
f.view.inert = true; f.sync();
assert.equal(f.timers.size, 0, 'Leaving the scene cancels the next pass');
f.activate(); f.dispose();
assert.equal(f.timers.size, 0); assert.equal(f.frames.size, 0);
assert.ok(f.svg.removed);
const still = await fixture('?motion=still'); still.activate();
assert.equal(still.timers.size, 0);
const production = await fixture('?coaster-frame=0.5'); production.activate();
assert.equal(production.svg.dataset.coasterState, 'waiting', 'Local review parameters must not affect production cadence');
const interrupted = await fixture(); interrupted.activate();
const pending = [...interrupted.timers.entries()][0];
interrupted.timers.delete(pending[0]); pending[1].fn();
interrupted.tick(1550);
assert.equal(interrupted.frames.size, 1);
interrupted.document.hidden = true; interrupted.sync();
assert.equal(interrupted.frames.size, 0, 'Hiding a tab must stop an active pass immediately');
assert.ok(interrupted.svg.children[1].children.every(car => car.attributes.opacity === '0'));
console.log('Coaster lifecycle: cadence, idle frames, pass duration, visibility, reduced motion, scene exit, cleanup, and production review guard passed.');
