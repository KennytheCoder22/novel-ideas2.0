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
        <path d="M449 115 C466 105 478 123 492 115 C510 103 515 124 532 128 L551 144 C529 141 526 157 509 151 C493 155 481 141 466 146 L436 146Z" opacity=".48"/>
        <path d="M599 126 C610 119 620 125 631 111 C643 114 649 123 659 113 C670 119 679 105 691 111 C705 120 713 108 725 114 C737 106 748 118 760 113 C771 121 787 119 794 132 L835 129 C829 139 820 139 820 149 C811 146 812 158 803 157 C800 166 792 161 788 171 C779 166 779 178 770 175 C766 185 756 178 751 188 C741 182 738 194 729 188 C718 185 708 194 697 186 C685 185 682 171 670 174 C664 161 650 172 641 161 C630 164 626 151 615 154Z"/>
        <path d="M855 151 C868 142 877 149 887 139 C899 146 914 137 923 149 C934 146 943 156 957 154 L975 163 C958 170 946 169 932 183 C919 176 907 186 894 177 C883 183 874 170 861 173 L842 163Z" opacity=".42"/>
      </g>
    </mask>
  </defs><g mask="url(#geese-sky)"><image class="geese-flock" href="./geese.png" x="565" y="104" width="42" height="28" style="filter:brightness(.16) saturate(.2);opacity:0"/></g>`;
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
    // Modest deceleration, 33% recession, fixed artwork coordinates: the V
    // passes through the moon's lower half before the far cloud bank hides it.
    const travel = 1.12 * progress - .12 * progress * progress;
    const size = 42 * (1 - .33 * progress);
    flock.setAttribute('x', String(565 + 355 * travel));
    flock.setAttribute('y', String(104 + 108 * travel));
    flock.setAttribute('width', String(size));
    flock.setAttribute('height', String(size / 1.5));
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
