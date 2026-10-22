import {coverMountDepth,limitMountPoleBottom} from './mount-pole-depth.js';
import {registerVariantMount} from './carousel-variants.js';
import {sharedMountRenderer} from './shared-mount-renderer.js';
import {cropCanvas} from './crop-canvas.js';
import {carouselPoleMaterial} from './carousel-pole-material.js';
// Local-only 3D mount; the carousel clock supplies orbit and depth.
import * as THREE from './vendor/three.module.js';
import {mountRigs} from './mount-rigs.js';
const NS='http://www.w3.org/2000/svg';
const slotIndex=3; // Existing empty outer-ring pole, two rows after the 2D mount.
let mounted=false;
async function mount(){
 const svg=document.querySelector('.carousel-dressing');
 const slot=svg?.querySelector(`[data-carousel-slot="${slotIndex+1}"]`);
 if(!slot||mounted)return;
 mounted=true;
 const anchor=slot.querySelector('.carousel-mount-anchor');
 // The source collar is wider than both existing traced post outlines at y=740.
 // Clear its isolated footprint only; actual relocated posts use separate images.
 const collarRemoval=document.createElementNS(NS,'rect');
 for(const [key,value] of Object.entries({x:1296,y:700,width:52,height:75,fill:'black'}))collarRemoval.setAttribute(key,value);
 svg.querySelector('#carousel-stationary-shell-mask').append(collarRemoval);
 // Slot depth fading must not make the solid horse transparent.
 slot.style.opacity='1';
 const holder=document.createElementNS(NS,'foreignObject');
 for(const [k,v] of Object.entries({x:-200,y:-150,width:400,height:300,class:'carousel-horse-3d-comparison'}))holder.setAttribute(k,v);
 holder.style.pointerEvents='none';holder.style.visibility='hidden';
 const canvas=document.createElementNS('http://www.w3.org/1999/xhtml','canvas');
 canvas.style.cssText='width:400px;height:300px;display:block;background:transparent';
 holder.append(canvas);anchor.append(holder);
 const renderer=sharedMountRenderer(THREE,canvas);
 renderer.setSize(800,600,false);
 renderer.setClearColor(0x000000,0);
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;
 const scene=new THREE.Scene();
 scene.add(new THREE.HemisphereLight(0xfff2de,0x514958,1.5));
 const light=new THREE.DirectionalLight(0xffecd3,2);light.position.set(-2,3,4);scene.add(light);
 const rig=mountRigs.horse,model=new THREE.Group();
 const box=new THREE.Box3(new THREE.Vector3(...rig.bounds.min),new THREE.Vector3(...rig.bounds.max)),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
 // Parent transforms affect presentation only; imported nodes/materials/geometry remain intact.
 const carouselFrame=new THREE.Group(),turn=new THREE.Group(),registration=new THREE.Group();
 const assembly=svg.querySelector(".carousel-assembly");
 // GLB nose points along -X. At the rightmost pole the 2D horse faces away (-Z).
 // Negate the slot angle to convert the carousel X/depth plane to Three Y yaw.
 // This fixed tangent heading is applied once; only the carousel parent rotates.
 turn.rotation.y=-Math.floor(slotIndex/3)/window.CarnivalCarousel.rowCount*2*Math.PI-Math.PI/2;
 // Model-space saddle-front center, registered to the existing crank anchor.
 const mountPoint=new THREE.Vector3(-.12,.055,-.03);
 registration.position.copy(mountPoint).multiplyScalar(-1);registration.add(model);turn.add(registration);carouselFrame.add(turn);scene.add(carouselFrame);
 const span=size.y*1.5;
 const camera=new THREE.OrthographicCamera(-span*2/3,span*2/3,span/2,-span/2,.01,20);
 camera.position.set(0,.12,3);camera.lookAt(0,0,0);
 // Use the verified shaft endpoints without downloading an Ornate placeholder.
 const top=rig.pole.y+rig.pole.height*rig.pole.scaleY/2,bottom=rig.pole.y-rig.pole.height*rig.pole.scaleY/2;
 const pole=new THREE.Mesh(new THREE.CylinderGeometry(span*4/300,span*4/300,rig.pole.height,24,1,true),carouselPoleMaterial(THREE,top-bottom,span));
 pole.scale.y=rig.pole.scaleY;pole.position.y=rig.pole.y;
 scene.add(pole);
 cropCanvas(THREE,{name:'horse',scene,camera,carouselFrame,renderer,holder});
 pole.userData.originalScaleY=pole.scale.y;
 coverMountDepth(THREE,pole,camera);
 limitMountPoleBottom(pole,camera,holder,135-28);
 // Keep the original shaft continuous outside the horse overlap. The aligned
 // depth-tested segment can pass in front of the mane and behind the body.
 slot.querySelectorAll('.carousel-pole-shaft').forEach(e=>e.removeAttribute('mask'));
 slot.querySelector('.carousel-crank-collar').style.visibility='hidden';
 holder.dataset.ready='true';
 let previous=-1;
 const opacityChildren=[...slot.children].filter(child=>child!==anchor).map(child=>({child,shaft:child.matches('.carousel-pole-shaft')}));
 function render(){
  if(!svg.isConnected){renderer.dispose();mounted=false;return;}
  const yaw=Number(assembly.dataset.yaw||0);
  if(holder.style.visibility!=='hidden'&&yaw!==previous&&!document.hidden){
   // SVG positive depth maps to +Z; Three Y rotation therefore reverses SVG yaw.
   carouselFrame.rotation.y=-yaw;
   const pose=window.CarnivalCarousel.pose(slotIndex,Number(svg.dataset.phase||0));
   for(const {child,shaft} of opacityChildren){const opacity=shaft?'1':slot.getAttribute('opacity');if(child.style.opacity!==opacity)child.style.opacity=opacity;}
   renderer.render(scene,camera);holder.dataset.yaw=String(carouselFrame.rotation.y+turn.rotation.y);previous=yaw;
  }
  requestAnimationFrame(render);
 }
 render();
 registerVariantMount({identity:'horse',slotNumber:slotIndex+1,model,registration,mountPoint,turn,carouselFrame,scene,camera,renderer,holder,slot,invalidate:()=>{previous=-1;}});
 window.carouselHorseComparison={slot:slotIndex+1,sourceBounds:box.toArray?.()||{min:box.min.toArray(),max:box.max.toArray()},renderer,model,turn,carouselFrame,camera,mountPoint,registration,pole};
}
const observer=new MutationObserver(()=>mount().catch(report));
function report(error){console.error(error)}
observer.observe(document.body,{childList:true,subtree:true});
mount().catch(report);
