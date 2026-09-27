/* Distant, silent migration. No inputs, observations or recommendation evidence. */
(() => {
  'use strict';
  const scene = document.querySelector('.composition');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const still = new URLSearchParams(location.search).get('motion') === 'still';
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  layer.setAttribute('viewBox', '0 0 1536 1024');
  layer.setAttribute('preserveAspectRatio', 'none');
  layer.setAttribute('aria-hidden', 'true');
  layer.setAttribute('focusable', 'false');
  layer.classList.add('geese-layer');
  layer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;overflow:hidden';
  // Clear-sky contours follow the original painted cloud banks. A narrow feather
  // lets silhouettes disappear into their soft edges; nothing covers/repaints the scene.
  layer.innerHTML = `<defs>
    <filter id="geese-cloud-feather" x="-5%" y="-10%" width="110%" height="120%"><feGaussianBlur stdDeviation="1.4"/></filter>
    <mask id="geese-sky" maskUnits="userSpaceOnUse" x="0" y="0" width="1536" height="1024" style="mask-type:luminance">
      <rect width="1536" height="1024" fill="black"/>
      <g fill="white" filter="url(#geese-cloud-feather)">
        <path d="M557 49 C565 50 568 44 577 45 L582 49 C589 45 596 51 606 51 L616 59 C627 57 630 69 640 69 L649 79 L659 80 L652 92 C660 96 666 101 676 101 L704 115 L696 154 L637 164 L599 139 L599 126 L596 114 L584 109 L585 99 L577 94 L583 88 L575 82 L580 75 L571 71 L570 61 L561 60Z"/>
        <path d="M599 126 C610 119 620 125 631 111 C643 114 649 123 659 113 C670 119 679 105 691 111 C705 120 713 108 725 114 C737 106 748 118 760 113 C771 121 787 119 794 132 L835 129 C829 139 820 139 820 149 C811 146 812 158 803 157 C800 166 792 161 788 171 C779 166 779 178 770 175 C766 185 756 178 751 188 C741 182 738 194 729 188 C718 185 708 194 697 186 C685 185 682 171 670 174 C664 161 650 172 641 161 C630 164 626 151 615 154Z"/>
      </g>
      <!-- The small detached cloud below/right of the bright star stays in front. -->
      <path d="M589 78 C595 75 598 81 603 78 L608 74 L620 73 C618 78 613 79 613 83 L606 88 L603 94 L598 91 L594 88Z" fill="black" filter="url(#geese-cloud-feather)"/>
    </mask>
  </defs><g mask="url(#geese-sky)"><image class="geese-flock" href="./geese.png" x="529" y="14" width="42" height="28" style="filter:brightness(.16) saturate(.2);opacity:0"/></g>`;
  scene.querySelector('.midway').after(layer);
  const flock = layer.querySelector('.geese-flock');
  // Temporary tuning cadence. Restore rare timing only after Ken approves it.
  const delay = 4000;
  const duration = 28000;
  let frame = 0;
  let previous = null;
  let clearTime = 0;
  let flightTime = 0;
  let started = false;
  let firstPass = true;
  let interval = 0;
  let restTime = 0;
  function rest() {
    started = false;
    firstPass = false;
    flightTime = 0;
    restTime = 0;
    interval = 8000;
    layer.dataset.phase = 'resting';
    flock.style.opacity = '0';
  }
  function position(progress) {
    // Curve from the star opening, behind its small cloud, to the accepted exit.
    // The formation's native point is ~4 degrees below horizontal; align that
    // point with the curve's tangent, rather than rotating around a screen corner.
    const travel = 1.12 * progress - .12 * progress * progress;
    const remaining = 1 - travel;
    const x = remaining * remaining * 550 + 2 * remaining * travel * 625 + travel * travel * 806;
    const y = remaining * remaining * 28 + 2 * remaining * travel * 150 + travel * travel * 179;
    const angle = Math.atan2(remaining * 122 + travel * 29, remaining * 75 + travel * 181) * 180 / Math.PI - 4;
    const size = 42 * (1 - (2 / 3) * progress);
    flock.setAttribute('x', String(x - size / 2));
    flock.setAttribute('y', String(y - size / 3));
    flock.setAttribute('width', String(size));
    flock.setAttribute('height', String(size / 1.5));
    flock.setAttribute('transform', `rotate(${angle} ${x} ${y})`);
  }
  layer.dataset.phase = 'waiting';
  function tick(now) {
    const delta = previous === null ? 0 : now - previous;
    previous = now;
    if (!started) {
      if (firstPass) {
        clearTime += delta;
      } else restTime += delta;
      if (firstPass ? clearTime >= delay : restTime >= interval) {
        started = true;
        layer.dataset.phase = 'flying';
        position(0);
        flock.style.opacity = '.88';
      }
    } else {
      flightTime += delta;
      const progress = Math.min(1, flightTime / duration);
      position(progress);
      if (progress === 1) {
        rest();
      }
    }
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame);
    previous = null;
    if (reduced.matches || still) {
      flock.style.opacity = '0';
      if (started) rest();
      return;
    }
    if (!document.hidden) frame = requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  sync();
})();
