/* Isolated navigation camera. Never replaces or edits the living Midway DOM. */
(() => {
  'use strict';
  const definitions = window.CarnivalScenes;
  const midway = document.querySelector('main');
  midway.tabIndex = -1;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const still = new URLSearchParams(location.search).get('motion') === 'still';
  const mounted = new Map([['midway', {view:midway, ready:Promise.resolve()}]]);
  const history = [];
  let current = 'midway';
  let busy = false;
  const live = document.createElement('span');
  live.className = 'sr-only'; live.setAttribute('role','status');
  document.body.append(live);
  const back = document.createElement('button');
  back.className = 'location-back'; back.textContent = '‹ Back · dev';
  back.title = 'Development only: return to the previous location';
  back.hidden = true;
  document.body.append(back);

  function mount(id) {
    if (mounted.has(id)) return mounted.get(id);
    const definition = definitions[id];
    const view = document.createElement('section');
    view.className = 'location-view'; view.dataset.scene = id;
    view.setAttribute('aria-label', definition.name); view.tabIndex = -1;
    view.style.visibility = 'hidden'; view.inert = true;
    // One aspect-correct plane leaves room for later independent layers, without
    // adding any ambient, object, state or interaction system in this pass.
    const plane = document.createElement('div'); plane.className = 'location-plane';
    const image = new Image(definition.width, definition.height);
    image.className = 'location-background'; image.alt = definition.name;
    image.draggable = false; image.src = definition.background;
    plane.append(image); view.append(plane);
    const look = document.createElement('nav'); look.className = 'location-look';
    look.setAttribute('aria-label','Look around '+definition.name);
    let framing = definition.framing;
    function layout() {
      const scale = Math.max(innerWidth / definition.width, innerHeight / definition.height);
      const width = definition.width * scale, height = definition.height * scale;
      plane.style.width = width + 'px'; plane.style.height = height + 'px';
      plane.style.left = -(width-innerWidth) * framing + 'px';
      plane.style.top = (innerHeight-height)/2 + 'px';
      look.hidden = width <= innerWidth + 1;
    }
    for (const [label,glyph,value] of [['Look left','‹',0],['Look toward the center','·',.5],['Look right','›',1]]) {
      const button = document.createElement('button'); button.textContent = glyph;
      button.setAttribute('aria-label',label);
      button.addEventListener('click',()=>{framing=value;layout();}); look.append(button);
    }
    view.append(look); document.body.append(view);
    addEventListener('resize',layout); layout();
    const entry = {view, ready:image.decode(), dispose:()=>removeEventListener('resize',layout)};
    mounted.set(id,entry);
    return entry;
  }

  async function travel(id, trigger, returning = false) {
    if (busy || !definitions[id] || id === current) return false;
    busy = true; back.disabled = true;
    const sourceId = current;
    const source = mounted.get(sourceId).view;
    const animations = [];
    let target;
    try {
      target = mount(id);
      source.inert = true;
      await target.ready; // Keep the current location visible if an asset is slow.
      document.documentElement.dataset.travelling = 'true';
      source.inert = true;
      const rect = returning ? null : trigger?.getBoundingClientRect();
      const x = rect ? rect.left + rect.width*.5 : innerWidth*.5;
      const y = rect ? rect.top + rect.height*.72 : innerHeight*.56;
      const quiet = motion.matches || still;
      const duration = quiet ? 350 : 2400;
      source.style.transformOrigin = `${x}px ${y}px`;
      const push = quiet ? 'none' : `translate(${(innerWidth*.5-x)*.22}px,${(innerHeight*.52-y)*.16}px) scale(${returning?1.16:1.42})`;
      target.view.style.opacity = '0'; target.view.style.visibility = 'visible';
      animations.push(source.animate([
        {transform:'none',opacity:1,offset:0},
        {transform:quiet?'none':`scale(${returning?1.07:1.20})`,opacity:1,offset:.48},
        {transform:push,opacity:0,offset:.93},
        {transform:push,opacity:0,offset:1},
      ],{duration,easing:'ease-in-out',fill:'forwards'}));
      animations.push(target.view.animate([
        {opacity:0,transform:quiet?'none':'scale(1.025)',offset:0},
        {opacity:0,transform:quiet?'none':'scale(1.025)',offset:.48},
        {opacity:1,transform:'none',offset:1},
      ],{duration,easing:'ease-in-out',fill:'forwards'}));
      await Promise.all(animations.map(animation=>animation.finished));
      source.style.visibility = 'hidden';
      target.view.style.opacity = ''; target.view.inert = false;
      current = id;
      if (returning) history.pop(); else history.push({id:sourceId,trigger});
      document.documentElement.dataset.location = id;
      back.hidden = history.length === 0;
      live.textContent = definitions[id].name;
      if (returning && trigger?.isConnected && !trigger.hidden) trigger.focus({preventScroll:true});
      else target.view.focus({preventScroll:true});
      return true;
    } catch (error) {
      if (target) {target.view.style.visibility='hidden';target.view.inert=true;}
      source.style.visibility='visible';source.inert=false;
      // A failed decode must be retryable on the next visit.
      if (target && id !== 'midway') { target.dispose(); target.view.remove(); mounted.delete(id); }
      live.textContent = 'This location could not load. Please try again.';
      console.error('Carnival location transition failed',error);
      return false;
    } finally {
      animations.forEach(animation=>animation.cancel());
      source.style.transformOrigin = '';
      delete document.documentElement.dataset.travelling;
      busy = false; back.disabled = false;
    }
  }
  back.addEventListener('click',()=>{
    const previous = history.at(-1);
    if (previous) travel(previous.id,previous.trigger,true);
  });
  window.CarnivalNavigation = Object.freeze({
    go(destination, trigger) {
      const id = definitions[current].destinations?.[destination];
      return id ? travel(id,trigger) : Promise.resolve(false);
    },
  });
  // Explicit development links allow review of installed but unconnected stages.
  // These are not in-world paths and add no speculative Midway hotspots.
  const preview = new URLSearchParams(location.search).get('scene');
  if (preview && preview !== 'midway' && definitions[preview]) travel(preview,null);
})();
