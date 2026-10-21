import {getAgeBand,selectAgeBand} from '../age-band.js';
const buttons=[...document.querySelectorAll('[data-age-band]')];
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
function update(){
 const selected=getAgeBand().id;
 for(const button of buttons){
  const active=button.dataset.ageBand===selected;
  button.setAttribute('aria-pressed',String(active));
  if(!active)button.classList.remove('is-illuminating');
 }
 buttons[0]?.parentElement.classList.add('age-band-ready');
}
for(const button of buttons){
 button.addEventListener('click',()=>{
  selectAgeBand(button.dataset.ageBand);
  if(reduced.matches)return;
  button.classList.remove('is-illuminating');
  void button.offsetWidth; // Restart the brief pulse on repeated activation too.
  button.classList.add('is-illuminating');
 });
 button.addEventListener('animationend',()=>button.classList.remove('is-illuminating'));
}
reduced.addEventListener('change',()=>{if(reduced.matches)for(const button of buttons)button.classList.remove('is-illuminating');});
document.addEventListener('dreamscapes-age-band',update);
window.addEventListener('pageshow',update);
update();
