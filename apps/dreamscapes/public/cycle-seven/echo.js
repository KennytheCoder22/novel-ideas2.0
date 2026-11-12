import {initial,turn,solved,clamp,propPose,readBand} from './chest-state.mjs';
const art='/experiments/carnival/locations/fortune-teller.png',base='/cycle-seven/';
const band=()=>window.DreamscapesObservations?.snapshot().ageBand||'adults';
let age=band(),saved=readBand(sessionStorage,age),wheels=initial(saved.round),phase='idle',plane,svg,lock,opened=false,run=null,prepared;
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
function imageClip(id,points){return `<clipPath id="${id}"><polygon points="${points}"/></clipPath>`;}
function mount(){
 if(document.documentElement.dataset.location!=='fortune-teller'||document.documentElement.dataset.travelling)return;
 const target=document.querySelector('[data-scene="fortune-teller"] .location-plane');if(!target||target===plane)return;plane=target;
 svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 1672 941');svg.classList.add('chest-art');svg.setAttribute('aria-hidden','true');
 svg.innerHTML=`<defs>
 ${imageClip('chest-patch','1054,650 1139,651 1140,615 1165,611 1160,560 1180,520 1220,490 1258,526 1282,600 1284,842 1053,842')}
 ${imageClip('chest-body','1060,678 1175,700 1279,685 1275,819 1174,841 1060,801')}
 ${imageClip('chest-lid','1062,657 1167,649 1278,670 1176,699 1060,678')}
 ${imageClip('chest-book','1141,615 1237,620 1269,632 1267,667 1158,662 1140,653')}
 ${imageClip('chest-plant','1170,614 1162,594 1173,579 1157,567 1174,559 1173,541 1186,548 1181,528 1198,536 1204,518 1220,524 1232,494 1244,512 1254,516 1259,535 1251,550 1271,554 1263,569 1276,579 1263,590 1257,611 1233,623 1190,621')}
 <clipPath id="chest-rear-space"><rect width="1672" height="810"/></clipPath><linearGradient id="chest-inner" x2="0" y2="1"><stop stop-color="#42250c"/><stop offset="1" stop-color="#110d0a"/></linearGradient>
 <radialGradient id="chest-warm"><stop stop-color="#ffe0a0" stop-opacity=".8"/><stop offset="1" stop-color="#f9aa45" stop-opacity="0"/></radialGradient></defs>
 <image class="chest-settled" href="${base}chest-bare.png" width="1672" height="941" clip-path="url(#chest-patch)" visibility="hidden"/><g class="chest-replacement" visibility="hidden"><image href="${base}chest-clean-plate.png" width="1672" height="941" clip-path="url(#chest-patch)"/>
 <g clip-path="url(#chest-rear-space)"><g class="chest-book"><image href="${art}" width="1672" height="941" clip-path="url(#chest-book)"/></g>
 <g class="chest-plant"><image href="${art}" width="1672" height="941" clip-path="url(#chest-plant)"/></g></g>
 <polygon points="1062,657 1167,649 1278,670 1175,699 1061,678" fill="url(#chest-inner)" stroke="#624426" stroke-width="2"/>
 <ellipse class="chest-glow" cx="1171" cy="672" rx="153" ry="94" fill="url(#chest-warm)" opacity="0"/>
 <g class="chest-lid"><polygon points="1062,657 1167,649 1278,670 1176,699 1060,678" fill="#53331b" stroke="#987344" stroke-width="3"/><image href="${base}chest-bare.png" width="1672" height="941" clip-path="url(#chest-lid)"/></g>
 <image href="${art}" width="1672" height="941" clip-path="url(#chest-body)"/>
 </g>`;plane.append(svg);
 lock=button('','Examine the padlock on the wooden chest',openPuzzle);lock.className='chest-lock';lock.innerHTML='<svg viewBox="0 0 44 56" aria-hidden="true"><defs><linearGradient id="lock-brass"><stop stop-color="#b98a45"/><stop offset=".5" stop-color="#6b4825"/><stop offset="1" stop-color="#d2a357"/></linearGradient></defs><path class="chest-shackle" d="M11 27V15C11 2 33 2 33 15V27" fill="none" stroke="#372618" stroke-width="7"/><path class="chest-shackle" d="M11 27V15C11 2 33 2 33 15V27" fill="none" stroke="#c19b60" stroke-width="4"/><rect x="4" y="24" width="36" height="29" rx="5" fill="url(#lock-brass)" stroke="#352315" stroke-width="2"/><circle cx="22" cy="36" r="4" fill="#251a10"/><path d="M20 38L19 45H25L24 38" fill="#251a10"/></svg>';plane.append(lock);pose(0);
 lock.addEventListener('focus',()=>{if(!run)frameChest();});
}
function frameChest(){if(!plane)return;const overflow=plane.offsetWidth-innerWidth;if(overflow>0)plane.style.left=-Math.max(0,Math.min(overflow,plane.offsetWidth*.70-innerWidth*.58))+'px';}
function pose(p){if(!svg)return;const group=svg.querySelector('.chest-replacement');group.setAttribute('visibility',p>0?'visible':'hidden');svg.querySelector('.chest-settled').setAttribute('visibility',p===0&&saved.fallen?'visible':'hidden');
 // Rear hinge follows the painted lid's sloping back edge. Front edge lifts toward it.
 svg.querySelector('.chest-lid').setAttribute('transform',`translate(1062 657) matrix(${1-p*.006} ${p*.216} ${p*.1} ${1-p*3.6} 0 0) translate(-1062 -657)`);
 for(const kind of ['book','plant']){const g=svg.querySelector('.chest-'+kind),v=propPose(p,kind);g.setAttribute('visibility',saved.fallen||v.hidden?'hidden':'visible');g.setAttribute('transform',`translate(${v.x} ${v.y}) rotate(${v.angle} 1200 638)`);}
 svg.querySelector('.chest-glow').setAttribute('opacity',String(p*.32));
}
function atChest(dx=0,dy=0){const r=plane.getBoundingClientRect();return {x:r.left+r.width*(.70+dx),y:r.top+r.height*(.70+dy)};}
function place(point){light.style.left=point.x+'px';light.style.top=point.y+'px';}
async function animate(ms,fn,token,interruptible=true){const start=performance.now();return new Promise(resolve=>{function tick(now){if(token!==run||interruptible&&token.skip){resolve(false);return;}const t=clamp((now-start)/ms);fn(t);if(t===1)resolve(true);else requestAnimationFrame(tick);}requestAnimationFrame(tick);});}
async function openPuzzle(){if(phase!=='idle'||run)return;phase='preparing';frameChest();say('The brass lock catches the lamplight…');try{await prepare();if(phase!=='preparing')return;wheels=initial(saved.round);phase='puzzle';render();say('');panel.classList.remove('chest-solved');panel.showModal();controls[0].focus();}catch{phase='idle';say('The chest could not load. Try the lock again.');prepared=null;}}
function prepare(){return prepared||=Promise.all([...['chest-clean-plate.png','chest-bare.png'].map(name=>new Promise((resolve,reject)=>{const img=new Image();img.onload=resolve;img.onerror=reject;img.src=base+name;})),window.CarnivalNavigation.prepareTour(tour)]);}
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
 await animate(quiet.matches?600:1800,t=>pose(1-t),token,false);opened=false;lock.classList.remove('unlocked');panel.close();reset.disabled=close.disabled=false;
 saved.completed=true;saved.round++;persist();delete document.documentElement.dataset.chestTour;run=null;phase='idle';pose(0);say('The borrowed light rests inside. The lock is ready whenever you are.');lock.focus({preventScroll:true});setTimeout(()=>{if(!run)say('');},4500);
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
