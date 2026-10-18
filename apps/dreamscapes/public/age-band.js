import {preloadMountStyle} from './mount-preload.js';
export const bands=Object.freeze({kids:{label:'Kids',style:'stuffed'},'pre-teens':{label:'Pre-Teens',style:'stuffed'},teens:{label:'Teens',style:'plain'},adults:{label:'Adults',style:'ornate'}});
const key='dreamscapes.age-band';
let saved;try{saved=localStorage.getItem(key);}catch{}
let current=Object.hasOwn(bands,saved)?saved:'adults';
export function getAgeBand(){return {id:current,...bands[current]};}
export function selectAgeBand(id){
 if(!Object.hasOwn(bands,id))return;
 current=id;try{localStorage.setItem(key,id);}catch{}
 document.dispatchEvent(new CustomEvent('dreamscapes-age-band',{detail:getAgeBand()}));
}
window.addEventListener('storage',event=>{if(event.key===key){current=Object.hasOwn(bands,event.newValue)?event.newValue:'adults';document.dispatchEvent(new CustomEvent('dreamscapes-age-band',{detail:getAgeBand()}));}});
const badge=document.createElement('output');badge.className='age-band-indicator';badge.setAttribute('aria-live','polite');badge.setAttribute('aria-label','Active reader band and mount style');
badge.style.cssText='position:fixed;left:8px;bottom:8px;z-index:60;padding:3px 7px;border-radius:4px;background:#101725dc;color:#ffedc4;font:11px/1.4 system-ui;pointer-events:none';
let active, loading;
function update(){const band=getAgeBand();const style=active||band.style;badge.textContent=band.label+' · '+style[0].toUpperCase()+style.slice(1)+(loading?' (loading '+loading+')':'');}
document.addEventListener('dreamscapes-age-band',update);
document.addEventListener('carousel-variant-loading',event=>{active=event.detail.style;loading=event.detail.target;update();});
document.addEventListener('carousel-variant-changed',event=>{active=event.detail.style;loading=null;update();if(event.detail.failures)badge.textContent+=' · '+event.detail.failures+' Ornate fallback'+(event.detail.failures===1?'':'s');});
document.body.append(badge);update();
document.addEventListener('dreamscapes-age-band',()=>preloadMountStyle(getAgeBand().style));
// No speculative Ornate prefetch before a first-time visitor chooses a band.
if(saved||location.pathname.includes('/carnival/'))preloadMountStyle(getAgeBand().style);
