// One physical room, metres. All three apertures view the same perspective camera.
export const INTRO_SECONDS=34;
export const clamp=v=>Math.max(0,Math.min(1,v));
export const ease=v=>{v=clamp(v);return v*v*(3-2*v);};
const mix=(a,b,p)=>a+(b-a)*p;
export const ROOM=Object.freeze({
 camera:{position:[0,.65,6],target:[0,.8,0],fov:50,aspect:1671/941},
 glassZ:2.45,rearZ:-3.65,
 // These depth-writing solids remain fixed for the entire scene. In particular
 // the return passage runs BEHIND the doorway's rear wall, not through its opening.
 solids:[
  {name:'hall-floor',center:[0,-.08,-1],size:[15,.12,12]},
  {name:'left-rear-wall',center:[-3.6,1.65,-4.05],size:[7.3,3.3,.18]},
  {name:'middle-rear-wall',center:[2.5,1.65,-4.05],size:[2.2,3.3,.18]},
  {name:'right-rear-wall',center:[5.95,1.65,-4.05],size:[3.1,3.3,.18]},
  {name:'middle-right-partition',center:[1.83,1.7,-2.8],size:[2.30,3.4,.22]},
  {name:'right-door-jamb-wall',center:[5.45,1.7,-2.8],size:[3.80,3.4,.22]},
  {name:'doorway-back-wall',center:[3.29,1.7,-4.8],size:[.68,3.4,.18]},
  {name:'middle-vertical-beam',center:[.70,1.55,-1.5],size:[.30,3.1,.30]}
 ]
});
export function choreography(seconds){
 const t=Math.max(0,Math.min(INTRO_SECONDS,seconds));
 const p={position:[-3.9,0,ROOM.rearZ],turn:0,sit:1,notice:0,walk:0,reach:0,wallSupport:0,peek:0,duck:0,headYaw:0,phase:'seated',gaze:'down',emotion:'resignation'};
 if(t<3)return p;
 p.phase='recognition';p.gaze='toward-player';p.emotion='suspicion';
 // There is deliberately a held look before the head moves. The supplied mesh
 // has no eye joints or facial morphs; this is gaze staging, not an eye animation.
 p.notice=ease((t-3.35)/.65);
 if(t<4)return p;
 p.phase='wall-supported-rise';p.emotion='disbelief';p.wallSupport=ease((t-4)/.5)*(1-ease((t-8.6)/.8));
 p.sit=1-ease((t-4.55)/3.65);p.headYaw=.09*Math.sin((t-4)*1.1);
 if(t<10)return p;
 p.sit=0;p.wallSupport=0;p.phase='rear-crossing';p.emotion='wary';p.turn=Math.PI/2;
 // A five-second cautious rear traverse. Kit's depth does not move toward glass.
 if(t<15){const u=(t-10)/5;p.position[0]=mix(-3.9,2.5,ease(u));p.walk=Math.sin(Math.PI*clamp(u))*.55+.35;p.headYaw=-.45;return p;}
 p.phase='behind-right-wall';p.walk=.45;p.turn=Math.PI/2;p.position[0]=mix(2.5,4.07,ease((t-15)/.8));
 if(t<15.8)return p;
 p.position[0]=4.07;p.walk=0;p.turn=Math.PI/2;p.phase='right-door-peek';p.emotion='disbelief';
 p.peek=ease((t-15.8)/.65)*(1-ease((t-18.05)/.30));p.headYaw=-.12;p.gaze='toward-player';
 if(t<18.35)return p;
 p.phase='startled-retreat';p.peek=0;p.duck=ease((t-18.35)/.35);p.position[2]=mix(ROOM.rearZ,-4.25,ease((t-18.35)/.65));
 if(t<19)return p;
 p.phase='concealed-return';p.duck=0;p.walk=.4;p.turn=Math.PI;
 if(t<20){p.position=[4.07,0,mix(-4.25,-5.45,ease(t-19))];return p;}
 if(t<21.4){p.turn=-Math.PI/2;p.position=[mix(4.07,.98,ease((t-20)/1.4)),0,-5.45];return p;}
 if(t<22){p.turn=0;p.position=[.98,0,mix(-5.45,ROOM.rearZ,ease((t-21.4)/.6))];return p;}
 p.position=[.98,0,ROOM.rearZ];p.turn=0;p.walk=0;p.phase='middle-beam-peek';p.emotion='curiosity';p.peek=ease((t-22)/.65);p.headYaw=-.08;
 if(t<23)return p;
 p.phase='stepping-into-view';p.emotion='fragile-hope';p.position[0]=mix(.98,0,ease(t-23));p.peek=1-ease(t-23);p.walk=.35*Math.sin(Math.PI*clamp(t-23));
 if(t<24)return p;
 p.position=[0,0,mix(ROOM.rearZ,2.0,ease((t-24)/6.1))];p.phase='slow-approach';p.walk=.42*(1-ease((t-29.4)/.7));p.turn=0;p.peek=0;
 if(t<30.1)return p;
 p.position=[0,0,2];p.walk=0;p.phase='studying-player';p.headYaw=.045*Math.sin((t-30.1)*1.5);
 if(t<31.1)return p;
 p.phase='palm-to-glass';p.reach=ease((t-31.1)/1.8);p.headYaw=0;
 if(t>=33){p.phase='silent-appeal';p.reach=1;p.emotion='fragile-hope';}
 return p;
}
