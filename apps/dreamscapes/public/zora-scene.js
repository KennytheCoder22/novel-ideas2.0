// A scene is ready only after its approved composite has been drawn, not merely
// after the background (which still contains the original trunk) has downloaded.
let encounters;
const images=new Map(),styles=new Map(),scenes=new WeakMap();
const artwork=[
 '/experiments/carnival/locations/fortune-teller.png',
 '/cycle-seven/trunk-reference.png','/cycle-seven/chest-clean-plate.png',
 '/cycle-zora/zora.png','/cycle-zora/ball.png',
 '/experiments/carnival/platform/loose-ticket.png',
 '/experiments/carnival/dream-worlds/Moonlit%20(Griffin)%20Citadel%20Among%20Misty%20Peaks.png'
];
const sheets=['/cycle-zora/living.css','/cycle-seven/echo.css','/cycle-eight/afterimages.css','/cycle-nine/story.css'];
export function initializeEncounters(){
 if(!encounters)encounters=(async()=>{
  await import('/cycle-zora/zora-prototype.js');
  const living=await import('/cycle-zora/living.js');
  const chest=await import('/cycle-seven/echo.js');
  const afterimages=await import('/cycle-eight/afterimages.js');
  await import('/cycle-ten/reading.js');
  await import('/cycle-nine/encounter.js');
  return {living,chest,afterimages};
 })().catch(error=>{encounters=null;throw error;});
 return encounters;
}
function imageReady(url,speculative){
 let entry=images.get(url);
 if(!entry){
  const image=new Image();image.decoding='async';image.fetchPriority=speculative?'low':'auto';image.src=url;
  const ready=image.decode().catch(error=>{images.delete(url);throw error;});
  entry={image,ready};images.set(url,entry);
 }
 if(!speculative)entry.image.fetchPriority='auto';
 return entry.ready;
}
function styleReady(url){
 const loaded=[...document.querySelectorAll('link[rel="stylesheet"]')].some(link=>link.href===new URL(url,location.href).href&&link.sheet);
 if(loaded)return Promise.resolve();
 if(!styles.has(url)){
  const link=document.createElement('link');link.rel='stylesheet';link.href=url;
  const ready=new Promise((resolve,reject)=>{
   link.onload=resolve;link.onerror=()=>{styles.delete(url);link.remove();reject(Error('Scene stylesheet unavailable: '+url));};
  });styles.set(url,ready);document.head.append(link);
 }
 return styles.get(url);
}
export function preloadZoraScene(){
 // Only nearby scenes call this. Other navigation never awaits these images.
 return Promise.all([initializeEncounters(),...artwork.map(url=>imageReady(url,true)),...sheets.map(styleReady)]);
}
export function prepareZoraScene(plane){
 if(!scenes.has(plane)){
  const ready=(async()=>{
   const [modules]=await Promise.all([initializeEncounters(),...artwork.map(url=>imageReady(url,false)),...sheets.map(styleReady)]);
   await Promise.all([modules.living.prepareLiving(plane),modules.chest.prepareChest(plane)]);
   modules.afterimages.prepareAfterimages();
   // Both decoded textures and the saved lock state are now in the first frame.
   await new Promise(requestAnimationFrame);
   plane.parentElement.dataset.zoraReady='true';
  })().catch(error=>{scenes.delete(plane);throw error;});
  scenes.set(plane,ready);
 }
 return scenes.get(plane);
}
