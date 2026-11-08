import * as T from './vendor/three.module.js';

// Stable catalog IDs, never selection order or presentation labels.
// Only the supplied paintings are enabled; unassigned mounts keep the carnival.
const files={
 "castle-aerial":"(Dragon).png",
 "castle-ground":"(unicorn).png",
 "warren":"Cinematic Enchanted Woodland Warren(Rabbit).png",
 "countryside":"Golden-Hour Countryside Path(Fox).png",
 "wilderness":"Moonlit Alpine Valley with Howling Wolf(Grizzly,Wolf).png",
 "wildflower-valley":"Sunlit Wildflower Valley beneath Ancient Oaks(Stag).png",
 lagoon:'Endless Flamingo Mirror Lagoon.png',
 "living-room":"Retro Cat’s-Eye Living Room(Cat).png",
 "jungle-temple":"Sunset Jungle Temple with Wildlife(Tiger).png",
 arctic:'Aurora Over the Frozen Arctic (Polar Bear).png',
 lunar:'Vintage Lunar Crater Panorama(Moon Chair).png',
 garden:'Moonlit Creepy Garden Path(Snail).png',
 fortress:'Moonlit Valley and Cliffside Fortress(White Horse).png',
 alien:'Neon Alien World Panorama (Rocket).png',
 citadel:'Moonlit (Griffin) Citadel Among Misty Peaks.png',
 'red-rock':'Twilight Over the Red Rock Valley(Brown Horse).png',
 savannah:'Twilight Safari Under the Milky Way(Ostrich-Zebra).png'
};
export const dreamAssets=Object.freeze(Object.fromEntries(Object.entries(files).map(([id,file])=>[id,Object.freeze({id,url:new URL('./dream-worlds/'+encodeURIComponent(file),import.meta.url).href})])));
export const mountDreams=Object.freeze({'moon-loveseat':'lunar',snail:'garden',horse:'fortress',rocket:'alien',griffin:'citadel',ostrich:'savannah',zebra:'savannah',elephant:'savannah','brown-horse':'red-rock','polar-bear':'arctic',cat:'living-room',tiger:'jungle-temple',flamingo:'lagoon',dragon:'castle-aerial',unicorn:'castle-ground',rabbit:'warren',fox:'countryside',grizzly:'wilderness',wolf:'wilderness',stag:'wildflower-valley'});
// Horizon placement is reviewed per illustration; source pixels stay intact.
export const dreamFraming=Object.freeze({lunar:{horizon:.55,bearing:0},garden:{horizon:.53,bearing:0},fortress:{horizon:.46,bearing:45},alien:{horizon:.53,bearing:10},citadel:{horizon:.55,bearing:20},savannah:{horizon:.52,bearing:-20},'red-rock':{horizon:.52,bearing:0},arctic:{horizon:.46,bearing:0},'living-room':{horizon:.50,bearing:0},'jungle-temple':{horizon:.46,bearing:0},lagoon:{horizon:.28,bearing:0},'castle-aerial':{horizon:.32,bearing:0,spanDegrees:240},'castle-ground':{horizon:.39,bearing:0,spanDegrees:240},warren:{horizon:.50,bearing:0},countryside:{horizon:.43,bearing:0},wilderness:{horizon:.46,bearing:0},'wildflower-valley':{horizon:.45,bearing:0}});
const period=()=>globalThis.DreamscapesCarouselCatalog?.period||18000;
const secondStart=()=>2800+period();
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
// The supplied illustration has unmatched edges. Its seam crosses the view
// only in the normal-carnival interval, never during the visible dream arc.
export function dreamOpacity(elapsed,still=false){
 if(still)return 0;
 const duration=period(),relative=elapsed-2800;if(relative<0||relative>=duration*2)return 0;
 const phase=(relative%duration)/duration;
 return smooth((phase-16/72)/(9/72))*(1-smooth((phase-47/72)/(9/72)));
}
const images=new Map();
export async function preloadDream(mountId){
 const id=mountDreams[mountId];if(!id)return null;
 if(!images.has(id))images.set(id,(async()=>{const image=new Image();image.src=dreamAssets[id].url;await image.decode();return {id,image,error:null};})().catch(error=>{images.delete(id);return {id,image:null,error:String(error.message||error)};}));
 return images.get(id);
}
export function mountDream(scene,{textures,ownedGeometry,ownedMaterials}){
 let seam=null,alpha=0,enabled=false,visibleGap=null,asset=null,requested=0;
 const radius=13.90;
 const texture=new T.Texture();texture.colorSpace=T.SRGBColorSpace;texture.repeat.x=-1;texture.offset.x=1;textures.push(texture);
 const geometry=new T.CylinderGeometry(radius,radius,1,192,1,true);ownedGeometry.push(geometry);
 const material=new T.MeshBasicMaterial({map:texture,side:T.BackSide,transparent:true,opacity:0,depthWrite:false});ownedMaterials.push(material);
 const mesh=new T.Mesh(geometry,material);mesh.renderOrder=-10;mesh.visible=false;scene.add(mesh);
 const geometries=new Map([[360,geometry]]);
 let height=0,spanDegrees=360;
 return {
  async prepare(id){
   const token=++requested,next=await preloadDream(id);if(token!==requested)return;
   mesh.visible=false;material.opacity=0;enabled=false;
   if(next?.image){
    if(texture.image!==next.image){texture.dispose();texture.image=next.image;texture.needsUpdate=true;}
    spanDegrees=dreamFraming[next.id].spanDegrees||360;
    if(!geometries.has(spanDegrees)){const arc=new T.CylinderGeometry(radius,radius,1,192,1,true,0,spanDegrees*Math.PI/180);geometries.set(spanDegrees,arc);ownedGeometry.push(arc);}
    mesh.geometry=geometries.get(spanDegrees);
    height=2*Math.PI*radius*(spanDegrees/360)/(next.image.width/next.image.height);mesh.scale.y=height;
    mesh.position.y=1.4+(dreamFraming[next.id].horizon-.5)*height;
   }
   asset=next;
  },
  begin(id){enabled=!!asset?.image&&asset.id===mountDreams[id];seam=null;alpha=0;mesh.visible=false;material.opacity=0;},
  update(elapsed,followQuaternion,camera,still){
   const forward=new T.Vector3(0,0,-1).applyQuaternion(followQuaternion),heading=Math.atan2(forward.x,forward.z);
   if(seam===null){seam=heading+(secondStart()-elapsed)/period()*Math.PI*2+(asset?.image?dreamFraming[asset.id].bearing:0)*Math.PI/180+(360-spanDegrees)*Math.PI/360;mesh.rotation.y=seam;}
   alpha=enabled?dreamOpacity(elapsed,still):0;
   // An aspect-ratio safety gate also handles unusually wide browser windows.
   // It measures the actual camera-to-seam ray, including the rider's orbit.
   forward.set(0,0,-1).applyQuaternion(camera.quaternion);const viewingHeading=Math.atan2(forward.x,forward.z);
   const ray=bearing=>{const point=new T.Vector3(Math.sin(bearing)*radius,camera.position.y,Math.cos(bearing)*radius).sub(camera.position);return Math.atan2(point.x,point.z);};
   const distance=angle=>Math.abs(Math.atan2(Math.sin(angle),Math.cos(angle))),startRay=ray(seam);
   visibleGap=distance(startRay-viewingHeading);let inside=true;
   if(spanDegrees<360){const endRay=ray(seam+spanDegrees*Math.PI/180),wrap=angle=>(angle%(Math.PI*2)+Math.PI*2)%(Math.PI*2);visibleGap=Math.min(visibleGap,distance(endRay-viewingHeading));inside=wrap(viewingHeading-startRay)<=wrap(endRay-startRay);}
   const halfHFov=Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect),safe=inside?smooth((visibleGap-halfHFov-.04)/.10):0;
   alpha*=safe;material.opacity=alpha;mesh.visible=alpha>0;
   return {enabled,asset:asset?.id||null,opacity:alpha,seamBearing:seam,seamViewGap:visibleGap,halfHFov,seamSafety:safe,projection:'fixed-cylinder',radius,height,spanDegrees,sourceAspect:asset?.image?asset.image.width/asset.image.height:null,textureId:texture.uuid,textureVersion:texture.version,horizon:asset?.image?dreamFraming[asset.id].horizon:null,error:asset?.error||null};
  }
 };
}
