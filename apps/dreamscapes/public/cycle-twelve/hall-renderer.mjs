import {ease} from './kit-renderer.mjs';
export const APERTURES=[
 new Path2D('M292 254 C293 197 311 167 371 161 C447 150 504 171 513 247 L504 603 Q502 640 479 651 L322 659 Q300 654 299 611 Z'),
 new Path2D('M708 249 C711 189 742 157 830 157 C913 152 963 180 965 248 L962 640 Q839 659 708 642 Z'),
 new Path2D('M1165 253 C1173 200 1212 165 1291 158 C1365 154 1400 185 1403 249 L1407 613 Q1401 655 1373 668 L1208 658 Q1176 651 1171 613 Z')
];
const MIRRORS=[{x:285,y:155,w:233,h:510,kind:'tall'},{x:703,y:153,w:268,h:505,kind:'wide'},{x:1163,y:154,w:248,h:522,kind:'endless'}];
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
export function createHall(plane,kit){
 const surface=canvas(1280,721);surface.className='kit-hall';surface.setAttribute('aria-hidden','true');plane.append(surface);
 const context=surface.getContext('2d'),source=canvas(1671,941),ink=source.getContext('2d');
 const warped=canvas(1671,941),w=warped.getContext('2d');let lost=false;
 const effects={cue:'',start:0};
 function draw(t,pose,cue='',cueTime=0){
  if(lost)return;kit.draw(t,pose);ink.clearRect(0,0,1671,941);
  // The camera projects the fixed-size character and room together. No sprite
  // translation, scale, phase masks or per-mirror character copies exist here.
  ink.globalAlpha=.8;ink.drawImage(kit.canvas,0,0,1671,941);ink.globalAlpha=1;
  // Story marks are drawn in reflected space before the same optical distortion.
  paintStory(ink,cue,cueTime,pose);
  context.setTransform(surface.width/1671,0,0,surface.height/941,0,0);context.clearRect(0,0,1671,941);
  MIRRORS.forEach((mirror,index)=>{
   const examined=plane.querySelector('.funhouse-mirror--'+mirror.kind)?.classList.contains('is-examined');
   w.clearRect(0,0,1671,941);
   // Scanline refraction is applied after skeletal rendering. The original
   // mirror controls drive both background and character optical treatments.
   const strength=examined?[.12,.20,.16][index]:[.025,.035,.03][index];
   for(let y=mirror.y;y<mirror.y+mirror.h;y+=3){
    const phase=(y-mirror.y)/mirror.h,sx=index===0?1-strength*.8:index===1?1+strength:1+strength*.5;
    const offset=Math.sin(phase*Math.PI*2+(index*.7))*strength*35;
    const sy=index===0?1+strength*.65:index===1?1-strength*.4:1;
    const sourceY=mirror.y+mirror.h/2+(y-mirror.y-mirror.h/2)/sy;
    w.drawImage(source,mirror.x,sourceY,mirror.w,3/sy,mirror.x+mirror.w*(1-sx)/2+offset,y,mirror.w*sx,3.5);
   }
   context.save();context.clip(APERTURES[index]);
   context.filter=examined?['brightness(1.12) sepia(.10)','brightness(.9) hue-rotate(12deg)','contrast(1.12) brightness(.85)'][index]:'none';
   context.drawImage(warped,0,0);context.filter='none';
   context.restore();
  });
  surface.dataset.phase=pose.phase||'story';surface.dataset.worldX=pose.position[0].toFixed(3);surface.dataset.worldZ=pose.position[2].toFixed(3);surface.dataset.seconds=t.toFixed(3);surface.dataset.cue=cue;
 }
 function resize(){const width=Math.min(1280,Math.max(800,Math.round(plane.clientWidth)));if(surface.width!==width){surface.width=width;surface.height=Math.round(width*941/1671);kit.resize(surface.width,surface.height);}}
 const observer=new ResizeObserver(resize);observer.observe(plane);resize();
 kit.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;surface.dispatchEvent(new CustomEvent('kit-render-unavailable',{bubbles:true}));});
 return {surface,draw,project:kit.project,snapshot:kit.snapshot,dispose(){observer.disconnect();surface.remove();kit.dispose();}};
}
function paintStory(c,cue,t,pose){
 const p=ease(t/1.2);c.save();c.lineWidth=2;c.strokeStyle='#ffe0a8';c.fillStyle='#ffe0a8';c.globalAlpha=.82*p;
 if(['point-shadow','shadow-approach','lantern-boundary','shadow-friend'].includes(cue)){
  const x=cue==='shadow-approach'?730+50*ease(t/2):cue==='lantern-boundary'?780-90*ease(t/2):735;
  if(cue!=='shadow-friend'||t<1.8){c.fillStyle='#15121ddd';c.beginPath();c.ellipse(x,480,22,60,-.3,0,Math.PI*2);c.fill();}
  if(cue==='shadow-approach'||cue==='lantern-boundary'){c.strokeStyle='#ffc879';c.shadowColor='#ffd18b';c.shadowBlur=16;c.beginPath();c.ellipse(877,610,85,16,0,0,Math.PI*2);c.stroke();}
 }
 if(['reveal-ticket','paper-door'].includes(cue)){
  c.translate(740,428);c.rotate(-.10);c.fillStyle='#d9b978';c.fillRect(-20,-36,40,72);c.strokeStyle='#74552e';c.strokeRect(-16,-32,32,64);c.setLineDash([2,4]);c.beginPath();c.moveTo(-18,18);c.lineTo(18,18);c.stroke();c.setLineDash([]);
  if(cue==='paper-door'){c.fillStyle='#322337';c.fillRect(-13,-27,26*ease(t/1.6),52);c.fillStyle='#ffe4af';c.beginPath();c.arc(0,-10,4,0,7);c.fill();c.fillRect(-3,-5,6,18);}
 }
 if(cue==='secret-room'){
  c.strokeStyle='#d0b9ec';c.shadowColor='#bd91d8';c.shadowBlur=13;c.strokeRect(740,280,190,210);c.beginPath();c.moveTo(755,460);c.lineTo(790,380);c.lineTo(840,409);c.lineTo(881,324);c.lineTo(917,297);c.stroke();for(const [x,y]of [[790,380],[840,409],[881,324]]){c.beginPath();c.arc(x,y,5,0,7);c.stroke();}
 }
 if(['share-memory','shared-song'].includes(cue)){
  c.fillStyle='#ffd28a';c.shadowColor='#ffd28a';c.shadowBlur=20;for(let i=0;i<5;i++){const x=740+i*42,y=295+Math.sin(t*2+i)*8;c.beginPath();c.arc(x,y,cue==='shared-song'?5:3,0,7);c.fill();}
  if(cue==='shared-song'){c.font='30px Georgia';c.fillText('♪',942,385);c.fillText('♫',725,425);}
 }
 if(cue==='kept-name'){c.font='28px Georgia';c.fillText('KIT',887,347);c.beginPath();c.moveTo(887,354);c.lineTo(942,354);c.stroke();}
 if(cue==='shadow-friend'&&t>=1.8){const x=775+70*(1-ease((t-1.8)/1.3)),y=420-25*Math.sin(ease((t-1.8)/1.3)*Math.PI);c.fillStyle='#f1dbb8';c.beginPath();c.moveTo(x-22,y-17);c.lineTo(x,y);c.lineTo(x+25,y-20);c.lineTo(x+11,y+9);c.lineTo(x,y+4);c.lineTo(x-12,y+9);c.closePath();c.fill();}
 c.restore();
}
