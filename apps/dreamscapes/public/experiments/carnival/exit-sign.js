/* A shared foreground prop, registered inside each scene's camera plane. */
(() => {
  'use strict';
  window.CarnivalExit = Object.freeze({
    mount(plane) {
      const sign = document.createElement('a');
      sign.className = 'carnival-exit';
      sign.href = '/';
      sign.setAttribute('aria-label', 'Exit Creepy Carnival and return to Dreamscapes. Get out while you still can.');
      const face = document.createElement('span');
      face.className = 'carnival-exit-face';
      const title = document.createElement('strong');
      title.textContent = 'EXIT';
      const warning = document.createElement('em');
      warning.textContent = 'Get out while you still can';
      face.append(title, warning);
      sign.append(face);
      plane.append(sign);
      let frame;
      function place() {
        frame = null;
        const rect = plane.getBoundingClientRect();
        const sx = rect.width / plane.offsetWidth, sy = rect.height / plane.offsetHeight;
        if (!sx || !sy) return;
        const box = sign.getBoundingClientRect();
        const margin = Math.max(16, innerWidth * .035);
        const obstacles = [...plane.parentElement.querySelectorAll('button')].filter(button => !button.hidden)
          .map(button => button.getBoundingClientRect());
        let best;
        // Stay on the foreground ground, choosing the clear side of the path.
        // Mobile crops can expose a different path, so test the visible camera.
        for (const floor of [.96, .81, .68]) {
          for (const x of [margin, innerWidth - margin - box.width]) {
            const y = innerHeight * floor - box.height;
            const overlap = obstacles.reduce((sum, b) => sum +
              Math.max(0, Math.min(x + box.width + 8, b.right) - Math.max(x - 8, b.left)) *
              Math.max(0, Math.min(y + box.height + 8, b.bottom) - Math.max(y - 8, b.top)), 0);
            if (!best || overlap < best.overlap) best = {x, y, overlap};
            if (!overlap) break;
          }
          if (!best.overlap) break;
        }
        sign.style.left = (best.x - rect.left) / sx + 'px';
        sign.style.top = (best.y - rect.top) / sy + 'px';
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
