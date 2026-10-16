// Model-only overrides. Slot geometry, poles, crop cameras and motion belong to
// the existing mount modules and must never be recalculated by a style change.
const identities=['horse','rocket','griffin','ostrich','rabbit','wolf','polar-bear','fox','brown-horse','elephant','tiger','stag','grizzly','unicorn','cat','zebra','flamingo','dragon','moon-loveseat','snail'];
export const mountVariants=Object.fromEntries(identities.map(identity=>[identity,{
  ornate:{url:`./carousel/${identity==='horse'?'horse-comparison':identity}.glb`,scale:1,yaw:0,offset:[0,0,0]},
  plain:{url:`./carousel/variants/plain/${identity}.glb`,scale:1,yaw:0,offset:[0,0,0]},
  stuffed:{url:`./carousel/variants/stuffed/${identity}.glb`,scale:1,yaw:0,offset:[0,0,0]},
}]));
// These exports use different source axes from their Ornate counterparts.
mountVariants['brown-horse'].stuffed.yaw=Math.PI/2;
mountVariants.flamingo.stuffed.yaw=Math.PI/2;
mountVariants.griffin.plain.yaw=-Math.PI/2;
mountVariants.cat.plain.yaw=mountVariants.cat.stuffed.yaw=28.933873070460407*Math.PI/180;

export function resolveMountVariant(identity,style){
 const mapping=mountVariants[identity];
 if(!mapping)throw new Error("Unknown Carousel mount: "+identity);
 return mapping[style]?.url?mapping[style]:mapping.ornate;
}
