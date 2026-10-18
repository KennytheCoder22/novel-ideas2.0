import {getAgeBand,selectAgeBand} from '../age-band.js';
const buttons=[...document.querySelectorAll('[data-age-band]')];
function update(){for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.ageBand===getAgeBand().id));}
for(const button of buttons)button.addEventListener('click',()=>selectAgeBand(button.dataset.ageBand));
document.addEventListener('dreamscapes-age-band',update);update();
