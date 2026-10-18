/* Empty background train. Original scene coordinates; no interactive surface. */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const DURATION = 9300, SPACING = 31;
  // Wheel contact follows the wooden running deck, below the service guardrail.
  const TRACK = 'M 944 350 C 922 300 873 222 807 180 C 761 147 715 130 665 130 C 596 128 543 149 493 182 C 419 231 376 280 312 319 C 258 350 211 370 174 381';
  function element(name, attributes = {}) {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }
  window.CarnivalCoaster = Object.freeze({
    mount(plane) {
      const view = plane.parentElement;
      const svg = element('svg', {class:'coaster-atmosphere', viewBox:'0 0 1671 941',
        'aria-hidden':'true', focusable:'false', 'data-coaster-state':'loading'});
      const defs = element('defs');
      const track = element('path', {d:TRACK});
      const mask = element('mask', {id:'coaster-foreground-mask', maskUnits:'userSpaceOnUse',
        x:0, y:0, width:1671, height:941, 'mask-type':'luminance'});
      mask.append(element('rect', {width:1671, height:941, fill:'white'}));
      // Existing flag poles, marquee, tent roof and lighthouse remain in front.
      for (const attributes of [
        {x:647, y:0, width:12, height:430},
        {x:732, y:48, width:7, height:165},
        {x:853, y:77, width:7, height:220},
      ]) mask.append(element('rect', {...attributes, fill:'black'}));
      for (const d of [
        'M 718 185 L 844 179 L 859 245 L 717 250 Z',
        'M 897 251 L 922 229 L 946 207 L 984 251 L 1012 413 L 897 430 Z',
        'M 0 409 L 0 375 L 141 294 L 210 376 L 257 410 Z',
      ]) mask.append(element('path', {d, fill:'black'}));
      mask.append(element('path', {d:'M 0 150 C 240 231 452 327 646 336 S 1000 287 1180 180',
        fill:'none', stroke:'black', 'stroke-width':4}));
      const sheet = element('image', {id:'coaster-car-sheet', href:'./coaster-train-sheet.png',
        width:2158, height:729});
      const engineClip = element('clipPath', {id:'coaster-engine-crop', clipPathUnits:'userSpaceOnUse'});
      // Keep the engine and its flag, excluding the separate rail above it on the sheet.
      engineClip.append(element('path', {d:'M12 682 V601 L44 537 L52 499 L108 467 L153 463 L174 449 V410 H285 V449 H236 V466 H440 V682 Z'}));
      defs.append(track, mask, sheet, engineClip); svg.append(defs);
      const train = element('g', {mask:'url(#coaster-foreground-mask)', class:'coaster-train'});
      const cars = [];
      for (let index = 0; index < 4; index++) {
        const car = element('g', {class:'coaster-car', opacity:0});
        // SVG viewports crop the supplied sheet; labels and loose track are excluded.
        const sprite = element('svg', {x:-17, y:-22, width:34, height:23,
          viewBox:index === 0 ? '12 390 428 292' : '470 450 360 232',
          preserveAspectRatio:'none', overflow:'hidden'});
        const art = element('use', {href:'#coaster-car-sheet'});
        if (index === 0) art.setAttribute('clip-path', 'url(#coaster-engine-crop)');
        // Mirror each crop in place so the engine's nose leads toward the right.
        art.setAttribute('transform', `translate(${index === 0 ? 452 : 1300} 0) scale(-1 1)`);
        sprite.append(art);
        car.append(sprite); train.append(car); cars.push(car);
      }
      svg.append(train); plane.append(svg);
      // Sample the rail once, avoiding layout/path queries in the animation loop.
      const length = track.getTotalLength(), samples = [];
      for (let i = 0; i <= 256; i++) {
        const distance = length * i / 256;
        const p = track.getPointAtLength(distance);
        const q = track.getPointAtLength(Math.min(length, distance + 1));
        const previous = track.getPointAtLength(Math.max(0, distance - 1));
        let angle = Math.atan2(q.y - previous.y, q.x - previous.x) * 180 / Math.PI - 180;
        const last = samples.at(-1)?.angle;
        while (angle - last > 180) angle -= 360;
        while (angle - last < -180) angle += 360;
        samples.push({x:p.x, y:p.y, angle});
      }
      function render(progress) {
        const head = progress * (length + SPACING * 5) - SPACING;
        cars.forEach((car, index) => {
          // Traverse the traced curve left-to-right, with the remaining cars behind.
          const distance = length - head + index * SPACING;
          if (distance <= 0 || distance >= length) { car.setAttribute('opacity', 0); return; }
          const position = distance / length * 256;
          const i = Math.min(255, Math.floor(position)), f = position - i;
          const a = samples[i], b = samples[i + 1];
          const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
          car.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(a.angle + (b.angle - a.angle) * f).toFixed(2)})`);
          car.setAttribute('opacity', Math.min(1, distance / 18, (length - distance) / 22) * .84);
        });
      }
      const reduced = matchMedia('(prefers-reduced-motion: reduce)');
      const query = new URLSearchParams(location.search);
      const still = query.get('motion') === 'still';
      // Local, static visual review: never speeds up the production cadence.
      const reviewValue = query.get('coaster-frame');
      const review = ['localhost', '127.0.0.1'].includes(location.hostname) && reviewValue !== null &&
        Number.isFinite(Number(reviewValue)) ? Math.max(0, Math.min(1, Number(reviewValue))) : null;
      let timer = null, frame = null, started = null, loaded = false, disposed = false;
      function visible() {
        return !document.hidden && !view.inert && view.style.visibility !== 'hidden' &&
          !document.documentElement.hasAttribute('data-travelling');
      }
      function stop() {
        clearTimeout(timer); cancelAnimationFrame(frame);
        timer = frame = started = null;
        cars.forEach(car => car.setAttribute('opacity', 0));
        delete svg.dataset.nextDelay;
      }
      function schedule(delay = 50000 + Math.random() * 20000) {
        svg.dataset.coasterState = 'waiting';
        svg.dataset.nextDelay = String(Math.round(delay));
        timer = setTimeout(pass, delay);
      }
      function pass() {
        timer = null;
        if (!visible() || reduced.matches || still) { sync(); return; }
        started = performance.now();
        svg.dataset.coasterState = 'passing';
        svg.dataset.passStarted = String(started);
        delete svg.dataset.nextDelay;
        frame = requestAnimationFrame(tick);
      }
      function tick(now) {
        if (!visible() || reduced.matches || still) { sync(); return; }
        const progress = Math.min(1, (now - started) / DURATION);
        render(progress);
        if (progress < 1) frame = requestAnimationFrame(tick);
        else {
          frame = null; started = null;
          cars.forEach(car => car.setAttribute('opacity', 0));
          schedule(50000 + Math.random() * 20000 - DURATION);
        }
      }
      function sync() {
        if (disposed || !loaded) return;
        if (!visible() || (review === null && (reduced.matches || still))) {
          stop(); svg.dataset.coasterState = 'inactive'; return;
        }
        if (review !== null) {
          stop(); render(review); svg.dataset.coasterState = 'review'; return;
        }
        if (timer === null && frame === null) schedule();
      }
      const watcher = new MutationObserver(sync);
      watcher.observe(view, {attributes:true, attributeFilter:['inert', 'style']});
      const travelWatcher = new MutationObserver(sync);
      travelWatcher.observe(document.documentElement, {attributes:true, attributeFilter:['data-travelling']});
      document.addEventListener('visibilitychange', sync);
      reduced.addEventListener('change', sync);
      const preload = new Image(); preload.src = './coaster-train-sheet.png';
      preload.decode().then(() => { loaded = true; sync(); }).catch(() => {
        svg.dataset.coasterState = 'unavailable'; // A decoration must never block travel.
      });
      return () => {
        disposed = true; stop(); watcher.disconnect(); travelWatcher.disconnect();
        document.removeEventListener('visibilitychange', sync);
        reduced.removeEventListener('change', sync); svg.remove();
      };
    },
  });
})();
