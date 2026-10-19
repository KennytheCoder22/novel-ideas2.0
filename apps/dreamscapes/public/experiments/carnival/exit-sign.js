/* A shared foreground prop, registered inside each scene's camera plane. */
(() => {
  'use strict';
  // Each pose is a ground anchor [centre x, feet y, height] in scene fractions.
  // Portrait crops have their own composition; neither side nor scale is shared.
  const placements = {
    'midway':         {wide:[.105,.89,.22], cropped:[.105,.89,.22]},
    'ferris-platform':{wide:[.332,1.025,.17], cropped:[.65,.915,.18], cropFeet:true},
    'fun-house': {wide:[.91,.83,.10],cropped:[.91,.83,.10]},
    'skee-ball': {wide:[.91,.98,.075],cropped:[.91,.98,.075]},
    'tent-row':       {wide:[.13,.92,.20], cropped:[.62,.81,.17],
      // Source-space clearance between the near post and the barrel's left edge.
      // Hiding the frame behind those baked-in props also removes its hit area.
      occlusion:[[.70,.075,.205],[.73,.085,.176],[.80,.115,.171],[.90,.115,.168],[1,.115,.168]]},
    'fortune-teller': {wide:[.034,.84,.32], cropped:[.60,.985,.145], besideLook:true,
      wideAspect:1.7, maxViewportHeight:.34, cropLeft:true,
      // Existing black placard hides only the right edge of the EXIT frame.
      occlusion:[[.50,0,.115],[.56,0,.105],[.65,0,.098],[.75,0,.089],[.85,0,.080],[1,0,.072]]},
    'rides-games':    {wide:[.73,.965,.15], cropped:[.64,.805,.17]},
    'behind-carnival':{wide:[.075,.985,.2625], cropped:[.50,.90,.2375]},
    'forest-edge':    {wide:[.80,.725,.135], cropped:[.53,.73,.135]},
  };
  window.CarnivalExit = Object.freeze({
    mount(plane, scene) {
      const placement = placements[scene];
      if (!placement) throw new Error('Missing EXIT placement for ' + scene);
      const prop = document.createElement('span');
      prop.className = 'carnival-exit-prop';
      prop.dataset.exitScene = scene;
      const sign = document.createElement('a');
      sign.className = 'carnival-exit';
      sign.href = '/';
      sign.setAttribute('aria-label', 'Exit Creepy Carnival and return to Dreamscapes. Get out while you still can.');
      sign.title = 'Exit to Dreamscapes — Get out while you still can';
      const image = new Image(1122, 1402);
      image.alt = '';
      image.draggable = false;
      image.src = './exit-sign.png';
      sign.append(image);
      prop.append(sign);
      plane.append(prop);
      // Keyboard users can return to the reviewed camera framing after panning.
      let focusFrame;
      sign.addEventListener('focus', () => {
        if (!sign.matches(':focus-visible')) return;
        focusFrame = requestAnimationFrame(() => {
          // Native focus may scroll an overflow-hidden camera before this frame.
          plane.parentElement.scrollLeft = 0;
          plane.parentElement.scrollTop = 0;
          plane.dispatchEvent(new Event('carnival-exit-focus'));
        });
      });
      image.decode().then(() => {
        prop.classList.add('is-ready');
        schedule();
      }).catch(() => {
        // Preserve an accessible, visible exit if the artwork fails to load.
        sign.textContent = 'EXIT — Get out while you still can';
        prop.classList.add('is-ready', 'art-unavailable');
        schedule();
      });
      let frame;
      function place() {
        frame = null;
        const width = plane.offsetWidth, height = plane.offsetHeight;
        if (!width || !height) return;
        const cropped = innerWidth / innerHeight < (placement.wideAspect || 1.2);
        const pose = placement[cropped ? 'cropped' : 'wide'];
        let signHeight = Math.min(height * pose[2], innerHeight * (cropped ? .29 : placement.maxViewportHeight || .29));
        // Zora's open rug corner sits beside, rather than above, the look controls.
        // Fit that scene's side gutter even on small phones without covering them.
        const look = plane.parentElement.querySelector('.location-look');
        if (cropped && placement.besideLook && look && !look.hidden)
          signHeight = Math.min(signHeight, Math.max(44, (innerWidth - look.offsetWidth) / 2 - 20) * 1402 / 1122);
        if (!prop.classList.contains('art-unavailable')) prop.style.height = signHeight + 'px';
        const signWidth = prop.offsetWidth, boxHeight = prop.offsetHeight;
        const framing = scene === 'midway' ? (innerWidth / innerHeight < 1.5 ? 0 : .5)
          : window.CarnivalScenes[scene].framing;
        const entryLeft = Math.max(0, width - innerWidth) * framing;
        // Fit the entry camera on resize, never chase its position while panning.
        const preferredX = width * pose[0] - signWidth / 2;
        // Zora's wide pose can crop the unused back frame at the left edge.
        const x = placement.cropLeft && !cropped ? preferredX : Math.max(entryLeft + 12,
          Math.min(entryLeft + innerWidth - signWidth - 12, preferredX));
        // Ferris' narrow barrel/queue-sign gap permits the feet below the frame.
        // Limit that crop to the bottom 14% of the artwork, below all lettering.
        const bottomInset = placement.cropFeet && !cropped ? -boxHeight * .14 : 10;
        const bottom = Math.min(height * pose[1], (height + innerHeight) / 2 - bottomInset);
        prop.style.left = x + 'px';
        const top = bottom - boxHeight;
        prop.style.top = top + 'px';
        const profile = placement.occlusion;
        if (profile && !cropped && !prop.classList.contains('art-unavailable')) {
          const edge = (y, side) => {
            let i = 0;
            while (i < profile.length - 2 && y > profile[i + 1][0]) i++;
            const a = profile[i], b = profile[i + 1];
            const t = Math.max(0, Math.min(1, (y - a[0]) / (b[0] - a[0])));
            return Math.max(0, Math.min(signWidth, (a[side] + (b[side] - a[side]) * t) * width - x));
          };
          const ys = [top / height, ...profile.map(p => p[0]).filter(y => y > top / height && y < bottom / height), bottom / height];
          const outline = [...ys.map(y => [edge(y, 1), y * height - top]),
            ...ys.toReversed().map(y => [edge(y, 2), y * height - top])];
          prop.style.clipPath = 'polygon(' + outline.map(([x,y]) => x + 'px ' + y + 'px').join(',') + ')';
        } else prop.style.clipPath = '';
      }
      function schedule() {
        if (!frame) frame = requestAnimationFrame(place);
      }
      const resize = new ResizeObserver(schedule);
      resize.observe(plane);
      addEventListener('resize', schedule);
      document.fonts.ready.then(schedule);
      place();
      return () => {
        resize.disconnect();
        removeEventListener('resize', schedule);
        cancelAnimationFrame(frame); cancelAnimationFrame(focusFrame);
      };
    },
  });
})();
