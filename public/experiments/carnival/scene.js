'use strict';
if (new URLSearchParams(location.search).get('motion') === 'still') {
  document.documentElement.dataset.motion = 'still';
}
const wheel = document.querySelector('.wheel');
const status = document.querySelector('[role="status"]');
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
