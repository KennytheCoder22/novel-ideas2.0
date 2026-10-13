'use strict';
if (new URLSearchParams(location.search).get('motion') === 'still') {
  document.documentElement.dataset.motion = 'still';
}
const wheel = document.querySelector('.wheel');
const status = document.querySelector('[role="status"]');
const assembly = document.querySelector('.assembly');
const gondolas = document.querySelector('.gondolas');
for (let index = 0; index < 12; index++) {
  const orbit = document.createElement('span');
  orbit.className = 'orbit';
  orbit.style.setProperty('--offset', `${-90 + index * 30}deg`);
  const hanger = document.createElement('span');
  hanger.className = 'hanger';
  const cabin = document.createElement('img');
  cabin.src = './gondola-01.png';
  cabin.alt = '';
  cabin.draggable = false;
  hanger.append(cabin);
  orbit.append(hanger);
  gondolas.append(orbit);
}
// One clock for frame + all orbital transforms; no React, canvas, or per-cabin timers.
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const forceStill = document.documentElement.dataset.motion === 'still';
let elapsed = 0;
let previousTime = null;
let animationFrame = null;
function tick(time) {
  if (previousTime !== null) elapsed += time - previousTime;
  previousTime = time;
  assembly.style.setProperty('--angle', `${(elapsed % 60000) / 60000 * 360}deg`);
  animationFrame = requestAnimationFrame(tick);
}
function syncMotion() {
  if (animationFrame !== null) cancelAnimationFrame(animationFrame);
  animationFrame = null;
  previousTime = null;
  if (reducedMotion.matches || forceStill) {
    elapsed = 0;
    assembly.style.setProperty('--angle', '0deg');
  } else if (!document.hidden) {
    animationFrame = requestAnimationFrame(tick);
  }
}
reducedMotion.addEventListener('change', syncMotion);
document.addEventListener('visibilitychange', syncMotion);
syncMotion();
let acknowledgment;
wheel.addEventListener('click', () => {
  clearTimeout(acknowledgment);
  wheel.classList.add('acknowledged');
  status.textContent = 'The Ferris wheel lights answer softly.';
  acknowledgment = setTimeout(() => {
    wheel.classList.remove('acknowledged');
    status.textContent = '';
  }, 900);
});
