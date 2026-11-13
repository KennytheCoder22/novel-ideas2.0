import {createTrunk} from './trunk-renderer.mjs';
import {initial,turn,solved,clamp,readBand} from './chest-state.mjs';
const art='/experiments/carnival/locations/fortune-teller.png',base='/cycle-seven/';
const band=()=>window.DreamscapesObservations?.snapshot().ageBand||'adults';
let age=band(),saved=readBand(sessionStorage,age),wheels=initial(saved.round),phase='idle',plane,trunk,lock,opened=false,run=null,prepared;
const quiet=matchMedia('(prefers-reduced-motion: reduce)');
const tour=['rides-games','skee-ball','rides-games','ferris-platform','midway','tent-row','behind-carnival','forest-edge','behind-carnival','tent-row','fortune-teller'];
const button=(text,label,fn)=>{const b=document.createElement('button');b.textContent=text;b.setAttribute('aria-label',label);b.onclick=fn;return b;};
const panel=document.createElement('dialog');panel.className='chest-puzzle';panel.setAttribute('aria-label','The chest’s linked brass lock');
const title=document.createElement('p');title.textContent='Three windows. One light.';
const hint=document.createElement('p');hint.className='chest-hint';hint.textContent='Turn all three arrows to the right. Each wheel turns its neighbour, too.';
const gears=document.createElement('div');gears.className='chest-gears';
const controls=[0,1,2].map(i=>{const b=button('➜','Turn brass window '+(i+1),()=>{if(phase!=='puzzle')return;wheels=turn(wheels,i);render();if(solved(wheels))void sequence();});gears.append(b);return b;});
const reset=button('↻ Reset','Reset the linked wheels',()=>{if(phase==='puzzle'){wheels=initial(++saved.round);persist();render();}});
const close=button('Close','Close the padlock puzzle',()=>{if(phase==='puzzle'){panel.close();phase='idle';lock.focus();}});
panel.append(title,hint,gears,reset,close);document.body.append(panel);
panel.addEventListener('cancel',e=>{if(phase!=='puzzle')e.preventDefault();else phase='idle';});
const status=document.createElement('p');status.className='chest-status';status.setAttribute('role','status');status.hidden=true;status.tabIndex=-1;document.body.append(status);
const skip=button('Skip tour','Skip the tour and return to the chest',()=>{if(run)run.skip=true;});skip.className='chest-skip';skip.hidden=true;document.body.append(skip);
const light=document.createElement('div');light.className='chest-light';light.hidden=true;light.setAttribute('aria-hidden','true');document.body.append(light);
function persist(){try{sessionStorage.setItem('dreamscapes.chest.v1.'+age,JSON.stringify(saved));}catch{}}
function say(text){status.textContent=text;status.hidden=!text;}
function render(){controls.forEach((b,i)=>{b.style.setProperty('--angle',wheels[i]*90+'deg');b.disabled=phase!=='puzzle';b.dataset.lit=String(wheels.slice(0,i+1).every(v=>v===0));b.setAttribute('aria-label',`Turn brass window ${i+1}, facing ${['right','down','left','up'][wheels[i]]}; also turns window ${(i+1)%3+1}`);});}
function mount(){
 if(document.documentElement.dataset.location!=='fortune-teller'||document.documentElement.dataset.travelling)return;
 const target=document.querySelector('[data-scene="fortune-teller"] .location-plane');if(!target||target===plane)return;plane=target;
 trunk=createTrunk(plane);
 lock=button('','Examine the padlock on the wooden chest',openPuzzle);lock.className='chest-lock';lock.innerHTML='<svg viewBox="0 0 44 56" aria-hidden="true"><defs><linearGradient id="lock-brass"><stop stop-color="#b98a45"/><stop offset=".5" stop-color="#6b4825"/><stop offset="1" stop-color="#d2a357"/></linearGradient></defs><path class="chest-shackle" d="M11 27V15C11 2 33 2 33 15V27" fill="none" stroke="#372618" stroke-width="7"/><path class="chest-shackle" d="M11 27V15C11 2 33 2 33 15V27" fill="none" stroke="#c19b60" stroke-width="4"/><rect x="4" y="24" width="36" height="29" rx="5" fill="url(#lock-brass)" stroke="#352315" stroke-width="2"/><circle cx="22" cy="36" r="4" fill="#251a10"/><path d="M20 38L19 45H25L24 38" fill="#251a10"/></svg>';plane.append(lock);pose(0);
 lock.addEventListener('focus',()=>{if(!run){frameChest();requestAnimationFrame(frameChest);}});
}
function frameChest(){if(!plane)return;plane.parentElement.scrollLeft=0;const overflow=plane.offsetWidth-innerWidth;if(overflow>0)plane.style.left=-Math.max(0,Math.min(overflow,plane.offsetWidth*.70-innerWidth*.58))+'px';}
function pose(p){trunk?.pose(p);}
function atChest(dx=0,dy=0){const r=plane.getBoundingClientRect();return {x:r.left+r.width*(.70+dx),y:r.top+r.height*(.733+dy)};}
function place(point){light.style.left=point.x+'px';light.style.top=point.y+'px';}
async function animate(ms,fn,token,interruptible=true){const start=performance.now();return new Promise(resolve=>{function tick(now){if(token!==run||interruptible&&token.skip){resolve(false);return;}const t=clamp((now-start)/ms);fn(t);if(t===1)resolve(true);else requestAnimationFrame(tick);}requestAnimationFrame(tick);});}
async function openPuzzle(){if(phase!=='idle'||run)return;phase='preparing';frameChest();say('The brass lock catches the lamplight…');try{await prepare();if(phase!=='preparing')return;wheels=initial(saved.round);phase='puzzle';render();say('');panel.classList.remove('chest-solved');panel.showModal();controls[0].focus();}catch{phase='idle';say('The chest could not load. Try the lock again.');prepared=null;}}
function prepare(){return prepared||=Promise.all([trunk.ready,...['chest-clean-plate.png','chest-bare.png'].map(name=>new Promise((resolve,reject)=>{const img=new Image();img.onload=resolve;img.onerror=reject;img.src=base+name;})),window.CarnivalNavigation.prepareTour(tour)]);}
async function sequence(){if(phase!=='puzzle'||run)return;const token=run={skip:false,age};phase='unlocking';render();panel.classList.add('chest-solved');reset.disabled=close.disabled=true;document.documentElement.dataset.chestTour='true';skip.hidden=!saved.completed;if(!skip.hidden)skip.focus();else status.focus();say('The lock yields. Something stirs inside.');lock.classList.add('unlocked');
 try{
 await animate(600,()=>{},token);panel.close();
 await animate(quiet.matches?900:2800,t=>pose(t*t*(3-2*t)),token,false);saved.fallen=true;persist();pose(1);opened=true;
 light.hidden=false;const from=atChest(),to=atChest(0,-.15);place(from);phase='emerging';
 await animate(quiet.matches?500:2000,t=>place({x:from.x,y:from.y+(to.y-from.y)*t}),token);await animate(quiet.matches?300:900,t=>place({x:to.x+Math.sin(t*Math.PI*2)*3,y:to.y}),token);
 phase='tour';say('Follow the borrowed light.');
 for(let i=0;i<tour.length&&!token.skip;i++){
 const target={x:innerWidth*(i%2?.38:.65),y:innerHeight*(.38+(i%3)*.08)};const start={x:parseFloat(light.style.left),y:parseFloat(light.style.top)};
 const movement=animate(quiet.matches?350:1900,t=>{const u=t*t*(3-2*t);place({x:start.x+(target.x-start.x)*u,y:start.y+(target.y-start.y)*u});},token);
 const travelled=await window.CarnivalNavigation.tourTo(tour[i]);await movement;if(!travelled)throw Error('Tour destination unavailable');await animate(quiet.matches?350:260,()=>{},token);
 }
 }catch(error){console.error('Borrowed Light journey',error);say('The light finds its way back to the chest.');}
 finally{
 phase='returning';skip.hidden=true;if(document.documentElement.dataset.location!=='fortune-teller')await window.CarnivalNavigation.tourTo('fortune-teller');frameChest();pose(1);light.hidden=false;
 const target=atChest(),start={x:parseFloat(light.style.left)||target.x,y:parseFloat(light.style.top)||target.y-80};
 await animate(quiet.matches?500:1500,t=>place({x:start.x+(target.x-start.x)*t,y:start.y+(target.y-start.y)*t}),token,false);light.hidden=true;
 await animate(quiet.matches?600:1800,t=>pose(1-t*t*(3-2*t)),token,false);opened=false;lock.classList.remove('unlocked');panel.close();reset.disabled=close.disabled=false;
 saved.completed=true;saved.round++;persist();document.dispatchEvent(new CustomEvent('dreamscapes-borrowed-light-returned',{detail:{age:token.age}}));delete document.documentElement.dataset.chestTour;run=null;phase='idle';pose(0);say('The borrowed light rests inside. The lock is ready whenever you are.');lock.focus({preventScroll:true});setTimeout(()=>{if(!run)say('');},4500);
 if(age!==band()){age=band();saved=readBand(sessionStorage,age);wheels=initial(saved.round);pose(0);}
 }
}
new MutationObserver(()=>{mount();if(!run&&phase==='puzzle'&&document.documentElement.dataset.location!=='fortune-teller'){panel.close();phase='idle';}}).observe(document.documentElement,{attributes:true,attributeFilter:['data-location','data-travelling']});
document.addEventListener('dreamscapes-age-band',()=>{if(run){run.skip=true;return;}panel.close();phase='idle';age=band();saved=readBand(sessionStorage,age);wheels=initial(saved.round);pose(0);render();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&run&&saved.completed){e.preventDefault();run.skip=true;}});
document.addEventListener('click',e=>{if(run&&e.target.closest('main,.location-view')){e.preventDefault();e.stopImmediatePropagation();}},true);
document.addEventListener('keydown',e=>{if(run&&e.key==='Tab'){e.preventDefault();(skip.hidden?status:skip).focus();}},true);
addEventListener('resize',()=>{if(run||phase==='puzzle')frameChest();});
window.DreamscapesCycleSeven=Object.freeze({snapshot:()=>({age,phase,wheels:[...wheels],...saved}),});mount();
