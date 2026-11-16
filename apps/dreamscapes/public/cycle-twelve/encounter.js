import {getAgeBand} from '/age-band.js';
import '/cycle-ten/reading.js';
import '/cycle-nine/encounter.js';
import {fresh,normalize,nodes,choose,contextLine,replay} from './story.mjs';
import {createKit,choreography,INTRO_SECONDS,ease} from './kit-renderer.mjs';
import {createHall} from './hall-renderer.mjs';
const root=document.documentElement,cache=new Map(),clocks=new Map(),motion=matchMedia('(prefers-reduced-motion: reduce)');
const key=b=>'dreamscapes.kit-living.v1.'+b,clockKey=b=>'dreamscapes.kit-arrival.v1.'+b;
let band=getAgeBand().id,state=load(band),elapsed=loadClock(band),host,plane,ui,line,planks,toolbar,caption,hall,kitPromise,raf,last=0,clock=0,cueStart=0,choiceUnlock=0,generation=0,failed=false,active=false,frames=0,lastFrame=0,audioContext,skip,focusNext=false;
function load(b){if(cache.has(b))return cache.get(b);try{return normalize(JSON.parse(localStorage.getItem(key(b))));}catch{return fresh();}}
function loadClock(b){if(clocks.has(b))return clocks.get(b);try{return Math.max(0,Math.min(INTRO_SECONDS,Number(sessionStorage.getItem(clockKey(b)))||0));}catch{return 0;}}
function save(){cache.set(band,state);try{localStorage.setItem(key(band),JSON.stringify(state));}catch{}}
function saveClock(){clocks.set(band,elapsed);try{sessionStorage.setItem(clockKey(band),String(elapsed));}catch{}}
function prior(){return {legacyKit:window.DreamscapesCycleNine?.snapshot(),afterimages:window.DreamscapesCycleEight?.snapshot(),cycleEleven:window.DreamscapesCycleEleven?.snapshot(),borrowedLight:window.DreamscapesCycleSeven?.snapshot()?.completed===true};}
const reduced=()=>motion.matches||root.dataset.motion==='still'||new URLSearchParams(location.search).get('motion')==='still';
const inRoom=()=>root.dataset.location==='fun-house'&&!root.dataset.travelling&&!root.dataset.chestTour&&!document.hidden;
const canRun=()=>inRoom()&&!document.querySelector('dialog[open]');
function small(text,fn,parent=toolbar){const b=document.createElement('button');b.type='button';b.className='kit-small';b.textContent=text;b.onclick=fn;parent.append(b);return b;}
function announce(text){if(caption)caption.textContent=text;}
function enableAudio(){if(audioContext)return;try{const C=window.AudioContext||window.webkitAudioContext;if(C){audioContext=new C();audioContext.resume().catch(()=>{});}}catch{}}
function tapSound(){if(!audioContext||audioContext.state!=='running')return;try{const o=audioContext.createOscillator(),g=audioContext.createGain();o.type='sine';o.frequency.setValueAtTime(780,audioContext.currentTime);o.frequency.exponentialRampToValueAtTime(210,audioContext.currentTime+.06);g.gain.setValueAtTime(.035,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+.09);o.connect(g).connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+.1);}catch{}}
function finishIntro(){elapsed=INTRO_SECONDS;state={...state,introSeen:true};save();saveClock();cueStart=clock;choiceUnlock=clock;paint();announce(reduced()?'Kit notices you, crosses the mirrors, peeks from the doorway, and taps three times.':'Kit taps three times. She has something to show you.');}
function paint(){
 if(!ui)return;const focus=document.activeElement,hadPlank=planks.contains(focus);line.replaceChildren();planks.replaceChildren();toolbar.replaceChildren();
 if(elapsed<INTRO_SECONDS&&!failed){
  ui.dataset.choiceCount='0';if(state.introSeen){skip=small('Skip arrival',finishIntro);}
  return;
 }
 skip=null;const node=nodes[state.node],text=document.createElement('span');text.textContent=node.line;line.append(text);
 const context=contextLine(state,prior(),band);if(context){const c=document.createElement('span');c.className='kit-context';c.textContent=context;line.append(c);}
 const choices=node.choices||[];ui.dataset.choiceCount=String(choices.length);
 if(!choices.length){
  addPlank('Explore another reflection',()=>{state=replay(state);save();cueStart=clock;choiceUnlock=clock;paint();});
  addPlank('A story to take with me',()=>window.DreamscapesReading?.openShelf(document.activeElement));
  ui.dataset.choiceCount='2';
 }else if(clock>=choiceUnlock||reduced()||failed){for(const choice of choices)addPlank(choice.label,()=>select(choice.id));}
 small(reduced()?'Recall Kit’s arrival':'Watch Kit’s arrival',()=>{if(reduced()){finishIntro();schedule();return;}elapsed=0;cueStart=clock;announce('Kit sits alone, far behind the left mirror.');paint();schedule();});
 if(prior().legacyKit?.node!=='opening'&&prior().legacyKit?.node)small('Our earlier promise',()=>host.querySelector('.story-nine-entry')?.click());
 small('Book shelf',()=>window.DreamscapesReading?.openShelf(document.activeElement));
 if((hadPlank||focusNext)&&planks.querySelector('button')){planks.querySelector('button').focus({preventScroll:true});focusNext=false;}
}
function addPlank(text,fn){const b=document.createElement('button');b.type='button';b.className='kit-plank';b.textContent=text;b.onclick=fn;planks.append(b);return b;}
function select(id){if(!canRun()||clock<choiceUnlock&&!reduced()&&!failed)return;const result=choose(state,id,{band,prior:prior()});if(!result.accepted)return;focusNext=true;state=result.state;window.DreamscapesReading?.recordNarrative(result.evidence);save();cueStart=clock;choiceUnlock=clock+(reduced()?0:1.6);paint();announce(nodes[state.node].line);schedule();}
function storyPose(t){const p=choreography(INTRO_SECONDS);p.phase='story';p.reach=0;p.walk=0;p.point=0;p.bob=0;
 const cue=nodes[state.node].cue,dt=t-cueStart;
 if(cue==='point-shadow')p.point=.55;
 if(cue==='reveal-ticket'||cue==='paper-door'){p.x=800;p.turn=-.15;p.point=.7;}
 if(cue==='share-memory'||cue==='shared-song'){p.reach=.35;p.turn=.12;p.bob=Math.sin(t*1.7)*.008;}
 if(cue==='kept-name'){p.turn=-.15;p.reach=.8;}
 if(cue==='secret-room'){p.x=835-52*ease(dt/2);p.height=436-80*ease(dt/2);p.feet=647-30*ease(dt/2);p.turn=.45;p.point=.6;}
 if(cue==='shadow-approach'||cue==='lantern-boundary'){p.x=810;p.turn=-.2;p.point=.8;p.reach=.3;}
 if(cue==='shadow-friend'){p.x=835+75*Math.sin(Math.min(1,dt/2.3)*Math.PI);p.walk=dt<2?1:0;p.turn=dt<1.2?.8:-.2;p.reach=dt>2?.6:0;}
 return p;}
function frame(now){raf=null;if(!active||!canRun()||!hall){last=0;return;}
 // A 30 Hz cap bounds canvas refraction and skinning on mobile. Hidden rooms
 // and background tabs run no clock, animation mixer or WebGL draw work.
 if(lastFrame&&now-lastFrame<32){schedule();return;}lastFrame=now;
 const dt=last?Math.min(.1,(now-last)/1000):0;last=now;clock+=dt;frames++;
 const before=elapsed;if(elapsed<INTRO_SECONDS)elapsed=Math.min(INTRO_SECONDS,elapsed+dt);
 for(const tap of [17.65,18.15,18.65])if(before<tap&&elapsed>=tap)tapSound();
 if(before<INTRO_SECONDS&&elapsed>=INTRO_SECONDS)finishIntro();
 if(elapsed<INTRO_SECONDS){const p=choreography(elapsed);hall.draw(elapsed,p);follow(p.x);if(Math.floor(before)!==Math.floor(elapsed))saveClock();
  const words={noticing:'Kit lifts her head. Someone is here.',standing:'Kit releases her knees and gets to her feet.','crossing-center':'Kit hurries through the center reflection.',peeking:'A face peeks around the doorway. Then she ducks away.',approaching:'Kit comes close to the glass.',tapping:'Three small taps on the glass.'};if(words[p.phase]&&ui.dataset.phase!==p.phase)announce(words[p.phase]);ui.dataset.phase=p.phase;
 }else{const pose=storyPose(clock);hall.draw(clock,pose,nodes[state.node].cue,reduced()?4:clock-cueStart);if(planks.childElementCount===0&&clock>=choiceUnlock)paint();}
 if(!reduced())schedule();
}
function follow(x){const overflow=plane.clientWidth-innerWidth;if(overflow<=0)return;const target=-Math.max(0,Math.min(overflow,plane.clientWidth*x/1671-innerWidth/2));plane.style.left=target+'px';}
function schedule(){if(!raf&&active&&hall&&canRun())raf=requestAnimationFrame(frame);}
async function prepare(){if(hall||kitPromise)return kitPromise;const token=generation;failed=false;announce('A reflection is stirring…');
 kitPromise=createKit().then(kit=>{if(token!==generation){kit.dispose();return;}hall=createHall(plane,kit);host.dataset.kitAsset='ready';hall.surface.addEventListener('kit-render-unavailable',unavailable);if(reduced()||state.introSeen)finishIntro();else announce('Kit sits alone, far behind the left mirror.');paint();sync();}).catch(error=>{console.error('Kit renderer unavailable',error);if(token===generation)unavailable();}).finally(()=>{kitPromise=null;});return kitPromise;}
function unavailable(){failed=true;host.dataset.kitAsset='unavailable';finishIntro();announce('Kit waits behind the glass. Animation is unavailable; her choices are still here.');small('Retry animation',()=>{hall?.dispose();hall=null;prepare();},toolbar);}
function mount(){const scene=document.querySelector('[data-scene="fun-house"]');if(!scene)return;if(host===scene)return;host=scene;plane=host.querySelector('.location-plane');host.dataset.kitLive='true';
 ui=document.createElement('section');ui.className='kit-encounter';ui.setAttribute('aria-label','Kit in the living mirrors');
 line=document.createElement('p');line.className='kit-lines';line.setAttribute('aria-live','polite');ui.append(line);
 planks=document.createElement('div');planks.className='kit-planks';planks.setAttribute('role','group');planks.setAttribute('aria-label','Choose what happens with Kit');ui.append(planks);
 toolbar=document.createElement('div');toolbar.className='kit-toolbar';ui.append(toolbar);
 caption=document.createElement('span');caption.className='sr-only';caption.setAttribute('role','status');ui.append(caption);host.append(ui);
 host.addEventListener('pointerdown',enableAudio,{passive:true});host.addEventListener('keydown',enableAudio);paint();
}
function sync(){mount();if(!host)return;const next=canRun();ui.hidden=!inRoom();if(next&&!active){active=true;last=0;lastFrame=0;if(state.introSeen&&elapsed===0)elapsed=INTRO_SECONDS;if(reduced()&&hall)finishIntro();prepare();paint();schedule();}else if(!next&&active){active=false;cancelAnimationFrame(raf);raf=null;last=0;saveClock();}else if(next)schedule();}
new MutationObserver(sync).observe(root,{attributes:true,attributeFilter:['data-location','data-travelling','data-chest-tour','data-motion']});
new MutationObserver(()=>{if(host)sync();}).observe(document.body,{attributes:true,subtree:true,attributeFilter:['open']});
new MutationObserver(()=>{if(hall&&active&&reduced()){hall.draw(clock,storyPose(clock),nodes[state.node].cue,4);}}).observe(document.body,{attributes:true,subtree:true,attributeFilter:['class']});
document.addEventListener('visibilitychange',sync);motion.addEventListener('change',()=>{if(reduced()&&hall)finishIntro();sync();});
document.addEventListener('dreamscapes-age-band',()=>{saveClock();band=getAgeBand().id;state=load(band);elapsed=state.introSeen?INTRO_SECONDS:loadClock(band);cueStart=clock;choiceUnlock=clock;last=0;paint();if(reduced()&&hall)finishIntro();sync();});
addEventListener('storage',e=>{if(e.key===null){cache.clear();clocks.clear();state=fresh();elapsed=0;paint();sync();}else if(e.key===key(band)){cache.delete(band);state=load(band);elapsed=state.introSeen?INTRO_SECONDS:elapsed;paint();sync();}else if(e.key?.startsWith('dreamscapes.kit-living.v1.'))cache.delete(e.key.slice('dreamscapes.kit-living.v1.'.length));});
addEventListener('pagehide',()=>{saveClock();cancelAnimationFrame(raf);raf=null;active=false;});addEventListener('pageshow',sync);
window.DreamscapesKit=Object.freeze({snapshot:()=>({band,...structuredClone(state),introSeconds:elapsed,phase:hall?.surface.dataset.phase||'loading',cue:nodes[state.node].cue,active,renderFrames:frames,assetReady:!!hall,failed}),replay(){state=replay(state);save();cueStart=clock;choiceUnlock=clock;paint();schedule();}});
sync();
