import {registerVariantMount} from './carousel-variants.js';
import {cropCanvas} from './crop-canvas.js';
import {sharedMountRenderer} from './shared-mount-renderer.js';
import {carouselPoleMaterial} from './carousel-pole-material.js';
import * as T from './vendor/three.module.js';
import {mountRigs} from './mount-rigs.js';
const NS='http://www.w3.org/2000/svg';
// Moon Loveseat: one rigid two-person seat, +Z faces forward; mount is its socket axis.
// Dragon: front pommel axis stays ahead of the wing roots; supplied tack stays rigid.
// Flamingo: folded wings hide side tack; the pole crosses the forward saddle, clear of neck.
// Griffin uses its front pommel axis and a short body sleeve.
// Rocket retains its cleaned saddle/socket axis; its nose faces source -X.
const specs=[{name:'unicorn',label:'Unicorn',slotIndex:16,worldScale:.50,mount:[0,.25,.20]},{name:'rocket',label:'Rocket',slotIndex:4,worldScale:.52,mount:[.01,.242,0]},{name:'griffin',label:'Griffin',slotIndex:5,worldScale:.46,mount:[0,.40,.28]},{name:'flamingo',label:'Flamingo',slotIndex:19,worldScale:.50,mount:[0,.32,.23]},{name:'dragon',label:'Dragon',slotIndex:20,worldScale:.60,mount:[0,.105,.29]},{name:'moon-loveseat',label:'Moon Loveseat',mountType:'loveseat',slotIndex:1,worldScale:.40,mount:[.136494,.873874,-.402161]},{name:'snail',slotIndex:2,worldScale:.43,mount:[0,.338,.44]},{name:'brown-horse',slotIndex:11,worldScale:.52,mount:[0,.35,.21]},{name:'elephant',slotIndex:12,worldScale:.53,mount:[0,.41,.06]},{name:'grizzly',slotIndex:15,worldScale:.56,mount:[0,.40,.11]},{name:'wolf',slotIndex:8,worldScale:.52,mount:[0,.28,.22]},{name:'rabbit',slotIndex:7,worldScale:.50,mount:[0,.20,.33],localYaw:Math.PI/2-.025},{name:'fox',slotIndex:10,worldScale:.50,mount:[0,.24,.35],localYaw:Math.PI/3-.025},{name:'tiger',slotIndex:13,worldScale:.57,mount:[0,.32,.18],localYaw:Math.PI/6-.025},{name:'stag',slotIndex:14,worldScale:.52,mount:[0,.14,.25],localYaw:Math.PI/6+.025},{name:'cat',slotIndex:17,worldScale:.46,mount:[.08,.30,.05],localYaw:.025},{name:'ostrich',slotIndex:6,worldScale:.52,mount:[0,.26,.44]},{name:'polar-bear',label:'Polar Bear',slotIndex:9,worldScale:.52,mount:[-.023712,.40,-.0739895]},{name:'zebra',label:'Zebra',slotIndex:18,worldScale:.50,mount:[0,.335,.225]}];
window.carouselAnimalComparisons=[];
let started=false;
async function start(){
 const svg=document.querySelector('.carousel-dressing');if(!svg||started)return;started=true;
 for(const spec of specs)await mount(svg,spec);
}
async function mount(svg,spec){
 const slot=svg.querySelector(`[data-carousel-slot="${spec.slotIndex+1}"]`),anchor=slot.querySelector('.carousel-mount-anchor');
 const rig=mountRigs[spec.name],model=new T.Group();
 const bounds=new T.Box3(new T.Vector3(...rig.bounds.min),new T.Vector3(...rig.bounds.max)),size=bounds.getSize(new T.Vector3());
 const mountPoint=new T.Vector3(...spec.mount),scale=spec.worldScale;
 const scene=new T.Scene();scene.add(new T.HemisphereLight(0xfff2de,0x514958,1.5));
 const light=new T.DirectionalLight(0xffecd3,2);light.position.set(-2,3,4);scene.add(light);
 const carouselFrame=new T.Group(),turn=new T.Group(),registration=new T.Group();
 turn.rotation.y=Math.PI-Math.floor(spec.slotIndex/3)/window.CarnivalCarousel.rowCount*2*Math.PI-([0,.025,-.025][spec.slotIndex%3]);
 // Cat's saddle/body axis is angled in the supplied GLB; rotate about the registered pommel.
 if(spec.name==='rocket')turn.rotation.y+=Math.PI/2;
 if(spec.name==='cat')turn.rotation.y-=28.933873070460407*Math.PI/180;
 registration.scale.setScalar(scale);registration.position.copy(mountPoint).multiplyScalar(-scale);
 registration.add(model);turn.add(registration);carouselFrame.add(turn);scene.add(carouselFrame);
 const span=.7324974536895752*1.5;
 const camera=new T.OrthographicCamera(-span*5/6,span*5/6,span*2/3,-span,.01,20);camera.position.set(0,.12,3);camera.lookAt(0,0,0);
 const holder=document.createElementNS(NS,'foreignObject');
 for(const [k,v]of Object.entries({x:-250,y:-200,width:500,height:500,class:'carousel-animal-3d-comparison','data-animal':spec.name}))holder.setAttribute(k,v);
 holder.style.pointerEvents='none';holder.style.visibility='hidden';const canvas=document.createElementNS('http://www.w3.org/1999/xhtml','canvas');canvas.style.cssText='width:500px;height:500px;display:block';holder.append(canvas);anchor.append(holder);
 const renderer=(spec.name==='unicorn'||spec.name==='rocket'||spec.name==='griffin'||spec.name==='flamingo'||spec.name==='dragon')?sharedMountRenderer(T,canvas):new T.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(1000,1000,false);renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;
 // This is a carousel shaft segment, separate from the unmodified imported asset.
 // The GLB and shaft share a depth buffer throughout the animal's vertical extent.
 const top=rig.pole.y+rig.pole.height*rig.pole.scaleY/2,bottom=rig.pole.y-rig.pole.height*rig.pole.scaleY/2;
 const pole=new T.Mesh(new T.CylinderGeometry(span*4/300,span*4/300,top-bottom,24,1,true),carouselPoleMaterial(T,top-bottom,span));pole.position.y=(top+bottom)/2;
 scene.add(pole);
 cropCanvas(T,{name:spec.name,scene,camera,carouselFrame,renderer,holder});
 // Reference model scale stays fixed; the whole slot uses the carousel depth factor.
 // Scaling about the slot origin keeps the pole and registered saddle point aligned.
 // Use a conservative rotated-bounds projection for deck clearance at every yaw.
 const rx=Math.max(Math.abs(bounds.min.x-mountPoint.x),Math.abs(bounds.max.x-mountPoint.x));
 const rz=Math.max(Math.abs(bounds.min.z-mountPoint.z),Math.abs(bounds.max.z-mountPoint.z));
 const downwardPixels=((mountPoint.y-bounds.min.y)*scale+Math.hypot(rx,rz)*scale*.04)*300/span;
 const bobAmplitude=12,mountHeight=Math.ceil(downwardPixels+bobAmplitude+8);
 slot.dataset.constantScale='0';slot.dataset.mountHeight=String(mountHeight);slot.dataset.bobAmplitude=String(bobAmplitude);
 const initialPose=window.CarnivalCarousel.pose(spec.slotIndex,Number(svg.dataset.phase||0));
 slot.setAttribute('transform',`translate(${initialPose.x} ${initialPose.y}) scale(${initialPose.scale})`);
 anchor.setAttribute('transform',`translate(0 ${-mountHeight-initialPose.lift*bobAmplitude/28})`);
 slot.style.opacity='1';slot.querySelector('.carousel-crank-collar').style.visibility='hidden';
 const entry={...spec,model,renderer,scene,camera,carouselFrame,turn,registration,mountPoint,scale,pole,slot,anchor,holder,mountHeight,bobAmplitude,downwardPixels};window.carouselAnimalComparisons.push(entry);
 let previous=null;
 const opacityChildren=[...slot.children].filter(child=>child!==anchor).map(child=>({child,shaft:child.matches('.carousel-pole-shaft')}));
 const assembly=svg.querySelector('.carousel-assembly');
 function render(){if(!svg.isConnected){renderer.dispose();return;}const yaw=Number(assembly.dataset.yaw||0);
 if(holder.style.visibility!=='hidden'&&yaw!==previous&&!document.hidden){carouselFrame.rotation.y=-yaw;for(const {child,shaft} of opacityChildren){const opacity=shaft?'1':slot.getAttribute('opacity');if(child.style.opacity!==opacity)child.style.opacity=opacity;}renderer.render(scene,camera);previous=yaw;}
 requestAnimationFrame(render);}
 render();holder.dataset.ready='true';
 registerVariantMount({identity:spec.name,slotNumber:spec.slotIndex+1,model,registration,mountPoint,turn,carouselFrame,scene,camera,renderer,holder,slot,invalidate:()=>{previous=null;}});
}
const observer=new MutationObserver(()=>start().catch(console.error));observer.observe(document.body,{childList:true,subtree:true});start().catch(console.error);

