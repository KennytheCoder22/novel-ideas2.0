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
  let posterAltered = false;
  const poster = document.querySelector('.poster');
  function setPosterAltered(altered) {
    posterAltered = altered;
    poster.classList.toggle('is-aged', altered);
  }
  poster.addEventListener('pointerenter', event => { if(event.pointerType !== 'touch') setPosterAltered(true); });
  poster.addEventListener('pointerleave', () => setPosterAltered(false));
  // Touch previews the altered artwork in the existing inspection; returning resets it.
  poster.addEventListener('pointerdown', event => { if(event.pointerType === 'touch') setPosterAltered(true); });
  poster.addEventListener('pointercancel', () => setPosterAltered(false));
  poster.addEventListener('focus', () => { if(poster.matches(':focus-visible')) setPosterAltered(true); });
  poster.addEventListener('blur', () => setPosterAltered(false));
  let foxGone = false;
  let stopFox = () => {};
  const woman = document.querySelector('.woman');
  const groundTag = document.querySelector('.ground-tag');
  const remainsKey = 'carnival-mara-remains';
  try { foxGone = sessionStorage.getItem(remainsKey) === '1'; } catch (_) {}
  document.querySelector('.fox').hidden = foxGone;
  groundTag.hidden = !foxGone;
  let approachProgress = 0;
  let approachFrame = 0;
  let approaching = false;
  let approachBase = null;
  const retreat = document.createElement('button');
  retreat.className = 'midway-retreat'; retreat.textContent = 'Step back'; retreat.hidden = true;
  document.querySelector('main').append(retreat);
  // The physical figure follows this live Midway camera's progress only.
  // Fox inspection uses a separate camera and must not change her geography.
  function cameraDepth() {
    const progress = Math.max(0, Math.min(1, approachProgress));
    woman.style.opacity = String(1 - progress * progress * (3 - 2 * progress));
  }
  let remainsWritten = foxGone;
  function landTag() {
    groundTag.hidden = false;
    if (!remainsWritten) {
      try { sessionStorage.setItem(remainsKey, '1'); } catch (_) {}
      remainsWritten = true;
    }
  }
  cameraDepth();
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
    stopFox = window.startFoxCinema({scene, dialog, art, motion, still, record, cameraDepth, landTag,
      vanish() { foxGone = true; document.querySelector('.fox').hidden = true; }});
  }
  function open(target, destination = false) {
    if (approaching) return;
    if (target === 'puddle' && approachProgress < 1) { approach(1); return; }
    if (target === 'fox' && foxGone) return;
    lastFocus = document.activeElement;
    inspection = target;
    visibleTime = 0;
    inspectedAt = performance.now();
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
    stopFox = () => {};
    if (inspectedAt !== null) visibleTime += performance.now() - inspectedAt;
    record('return_to_midway', inspection, {visibleInspectionMs:Math.round(visibleTime)});
    inspectedAt = null;
    cameraDepth();
    // A vanished fox cannot receive focus: return to the stable scene control.
    (lastFocus?.hidden ? document.querySelector('.wheel') : lastFocus)?.focus({preventScroll:true});
    if (inspection === 'poster') setPosterAltered(false);
  });
  function renderApproach() {
    if (!approachBase) return;
    const p = approachProgress;
    const scale = 1 + 2.4 * p;
    const sw = scene.offsetWidth, sh = scene.offsetHeight;
    // Interpolate toward a fixed endpoint so every scene point follows a straight path.
    const endX = innerWidth * .5 - sw * .501 * 3.4;
    const endY = innerHeight * .56 - sh * .592 * 3.4;
    const x = approachBase.x + (endX - approachBase.x) * p;
    const y = approachBase.y + (endY - approachBase.y) * p;
    cameraDepth();
    scene.style.transformOrigin = '0 0';
    scene.style.transform = 'translate(' + (x-scene.offsetLeft) + 'px,' + (y-scene.offsetTop) + 'px) scale(' + scale + ')';
  }
  function approach(target) {
    cancelAnimationFrame(approachFrame);
    if (!approachBase) {
      const rect=scene.getBoundingClientRect();
      approachBase={x:rect.x,y:rect.y,transform:scene.style.transform,origin:scene.style.transformOrigin};
    }
    const from=approachProgress;
    let previous=null,elapsed=0;
    approaching=true;
    retreat.hidden=false;
    const duration=motion.matches||still?200:(target===1?3100:2100);
    function tick(now) {
      if (previous!==null && !document.hidden) elapsed+=Math.min(now-previous,50);
      previous=now;
      const t=Math.min(1,elapsed/duration), eased=t*t*(3-2*t);
      approachProgress=from+(target-from)*eased;
      renderApproach();
      if(t<1) approachFrame=requestAnimationFrame(tick);
      else {
        approaching=false;
        if(target===0) {
          scene.style.transform=approachBase.transform;
          scene.style.transformOrigin=approachBase.origin;
          approachBase=null;retreat.hidden=true;
          document.querySelector('.woman-approach').focus({preventScroll:true});
        }
      }
    }
    approachFrame=requestAnimationFrame(tick);
  }
  document.querySelector('.woman-approach').addEventListener('click',()=>approach(1));
  retreat.addEventListener('click',()=>approach(0));
  addEventListener('keydown',event=>{if(event.key==='Escape'&&!dialog.open&&approachProgress>0)approach(0);});
  let framing = 'start';
  function pan(direction) {
    if (approachProgress > 0 || approaching) return;
    framing = direction;
    const sceneWidth = scene.getBoundingClientRect().width;
    const overflow = Math.max(0, sceneWidth - innerWidth);
    // CSS starts right-biased at 67% of the crop range. Pan the whole scene.
    const delta = {start:0,left:.67,center:.17,right:-.33}[direction] * overflow;
    scene.style.setProperty('--pan', `${delta}px`);
  }
  document.querySelectorAll('[data-pan]').forEach(button => button.addEventListener('click', () => pan(button.dataset.pan)));
  addEventListener('resize', () => approachBase ? renderApproach() : pan(framing));
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
