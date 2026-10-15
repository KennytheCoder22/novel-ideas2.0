/* A shared foreground prop, registered inside each scene's camera plane. */
(() => {
  'use strict';
  window.CarnivalExit = Object.freeze({
    mount(plane) {
      const prop = document.createElement('span');
      prop.className = 'carnival-exit-prop';
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
        const rect = plane.getBoundingClientRect();
        const sx = rect.width / plane.offsetWidth, sy = rect.height / plane.offsetHeight;
        if (!sx || !sy) return;
        const box = prop.getBoundingClientRect();
        const margin = Math.max(16, innerWidth * .035);
        const obstacles = [...plane.parentElement.querySelectorAll('button')].filter(button => !button.hidden)
          .map(button => button.getBoundingClientRect());
        const lookControls = [...plane.parentElement.querySelectorAll('.look-controls, .location-look')]
          .map(control => control.getBoundingClientRect()).filter(box => box.height > 0);
        const ground = Math.min(innerHeight * .96, ...lookControls.map(box => box.top - 10));
        let best;
        // Keep the prop in the requested lower-left foreground. Choose the
        // clearest ground level in the visible camera, including mobile crops.
        for (const bottom of [ground, innerHeight * .81, innerHeight * .68]) {
          const x = margin, y = bottom - box.height;
          const overlap = obstacles.reduce((sum, b) => sum +
            Math.max(0, Math.min(x + box.width + 8, b.right) - Math.max(x - 8, b.left)) *
            Math.max(0, Math.min(y + box.height + 8, b.bottom) - Math.max(y - 8, b.top)), 0);
          if (!best || overlap < best.overlap) best = {x, y, overlap};
          if (!best.overlap) break;
        }
        prop.style.left = (best.x - rect.left) / sx + 'px';
        prop.style.top = (best.y - rect.top) / sy + 'px';
      }
      function schedule() {
        if (!frame) frame = requestAnimationFrame(place);
      }
      const resize = new ResizeObserver(schedule);
      resize.observe(plane);
      const camera = new MutationObserver(schedule);
      camera.observe(plane, {attributes:true, attributeFilter:['style']});
      addEventListener('resize', schedule);
      document.fonts.ready.then(schedule);
      place();
      return () => {
        resize.disconnect(); camera.disconnect();
        removeEventListener('resize', schedule);
        cancelAnimationFrame(frame);
      };
    },
  });
})();
