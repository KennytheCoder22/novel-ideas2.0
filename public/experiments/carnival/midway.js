/* Experimental scene interactions. Does not change the accepted wheel clock. */
(() => {
  'use strict';
  const scene = document.querySelector('.composition');
  const dialog = document.querySelector('.inspection');
  const art = document.querySelector('.inspection-art');
  const copy = document.querySelector('.destination-copy');
  const crow = document.querySelector('.crow');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const still = new URLSearchParams(location.search).get('motion') === 'still';
  let lastFocus;
  let inspection = null;
  let inspectedAt = null;
  let visibleTime = 0;
  let posterSeen = false;
  let posterAltered = false;
  let foxGone = false;
  let stopFox = () => {};
  const woman = document.querySelector('.woman');
  // Bounded, session-only raw observations; no production API or taste inference.
  const observations = [];
  function record(type, target, extra = {}) {
    observations.push({type, target, at:Date.now(), ...extra});
    if (observations.length > 200) observations.shift();
    try { sessionStorage.setItem('carnival-experiment-observations', JSON.stringify(observations)); } catch (_) { /* Storage may be unavailable. */ }
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem('carnival-experiment-observations') || '[]');
    if (Array.isArray(saved)) observations.push(...saved.slice(-200));
  } catch (_) { /* A fresh session is sufficient. */ }
  function openFox() {
    stopFox = window.startFoxCinema({scene, dialog, art, motion, still, record,
      vanish() { foxGone = true; document.querySelector('.fox').hidden = true; }});
  }
  function open(target, destination = false) {
    if (target === 'fox' && foxGone) return;
    lastFocus = document.activeElement;
    inspection = target;
    visibleTime = 0;
    inspectedAt = performance.now();
    if (posterSeen && target !== 'poster') {
      posterAltered = true;
      document.querySelector('.poster img').src = './poster-altered.png';
    }
    if (target === 'poster') posterSeen = true;
    art.replaceChildren();
    copy.hidden = !destination;
    if (destination) copy.querySelector('h1').textContent = target;
    else if (target === 'fox') openFox();
    else {
      const image = document.createElement('img');
      image.src = `./${target === "poster" && posterAltered ? "poster-altered" : target}.png`;
      image.alt = {puddle:'Lamplight and a distant figure reflected in the water.',fox:'An abandoned muddy stuffed fox.',poster:'An old Luna Creek traveling circus poster.'}[target] || '';
      art.append(image);
    }
    record(destination ? 'destination_chosen' : 'object_inspected', target);
    dialog.showModal();
    const image = art.querySelector('img');
    if (image && target !== 'fox' && !motion.matches && !still) {
      image.animate([{opacity:0, transform:'scale(.88)'},{opacity:1,transform:'scale(1)'}], {duration:650,easing:'ease-out'});
    }
  }
  document.querySelectorAll('[data-destination]').forEach(button => button.addEventListener('click', () => open(button.dataset.destination, true)));
  document.querySelector('.wheel').addEventListener('click', () => open('Ferris-Wheel Platform', true));
  document.querySelectorAll('[data-inspect]').forEach(button => button.addEventListener('click', () => open(button.dataset.inspect)));
  document.querySelector('.return').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    stopFox();
    if (inspectedAt !== null) visibleTime += performance.now() - inspectedAt;
    record('return_to_midway', inspection, {visibleInspectionMs:Math.round(visibleTime)});
    inspectedAt = null;
    woman.classList.add('departed');
    // A vanished fox cannot receive focus: return to the stable scene control.
    (lastFocus?.hidden ? document.querySelector('.wheel') : lastFocus)?.focus({preventScroll:true});
  });
  let framing = 'start';
  function pan(direction) {
    framing = direction;
    const sceneWidth = scene.getBoundingClientRect().width;
    const overflow = Math.max(0, sceneWidth - innerWidth);
    // CSS starts right-biased at 67% of the crop range. Pan the whole scene.
    const delta = {start:0,left:.67,center:.17,right:-.33}[direction] * overflow;
    scene.style.setProperty('--pan', `${delta}px`);
  }
  document.querySelectorAll('[data-pan]').forEach(button => button.addEventListener('click', () => pan(button.dataset.pan)));
  addEventListener('resize', () => pan(framing));
  let crowTimer;
  function scheduleCrow() {
    clearTimeout(crowTimer);
    crow.querySelector('img').src = './crow-perched.png';
    if (document.hidden || motion.matches || still || crow.classList.contains('departed')) return;
    crowTimer = setTimeout(() => {
      crow.querySelector('img').src = './crow-call.png';
      crowTimer = setTimeout(() => { crow.querySelector('img').src = './crow-perched.png'; scheduleCrow(); }, 1400);
    }, 17000 + Math.random() * 23000);
  }
  document.addEventListener('visibilitychange', () => {
    document.documentElement.dataset.hidden = String(document.hidden);
    if (dialog.open) {
      if (document.hidden && inspectedAt !== null) { visibleTime += performance.now() - inspectedAt; inspectedAt = null; }
      else if (!document.hidden) inspectedAt = performance.now();
    }
    scheduleCrow();
  });
  motion.addEventListener('change', scheduleCrow);
  scheduleCrow();
})();
