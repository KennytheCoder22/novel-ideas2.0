// Model-only overrides. Slot geometry, poles, crop cameras and motion belong to
// the existing mount modules and must never be recalculated by a style change.
const identities=['horse','rocket','griffin','ostrich','rabbit','wolf','polar-bear','fox','brown-horse','elephant','tiger','stag','grizzly','unicorn','cat','zebra','flamingo','dragon','moon-loveseat','snail'];
export const mountVariants=Object.fromEntries(identities.map(identity=>[identity,{
  ornate:{url:`./carousel/${identity==='horse'?'horse-comparison':identity}.glb`,scale:1,yaw:0,offset:[0,0,0]},
  plain:{url:`./carousel/variants/optimized/plain/${identity}.glb`,scale:1,yaw:0,offset:[0,0,0]},
  stuffed:{url:`./carousel/variants/optimized/stuffed/${identity}.glb`,scale:1,yaw:0,offset:[0,0,0]},
}]));
// These exports use different source axes from their Ornate counterparts.
mountVariants['brown-horse'].stuffed.yaw=Math.PI/2;
mountVariants.flamingo.stuffed.yaw=Math.PI/2;
mountVariants.griffin.plain.yaw=-Math.PI/2;
mountVariants.cat.plain.yaw=mountVariants.cat.stuffed.yaw=28.933873070460407*Math.PI/180;

// Per-variant pommel corrections from the pole/limb rotation review.
// These shift only the loaded asset; the canonical slot, pole and motion remain fixed.
mountVariants['polar-bear'].plain.offset=[0,0,-0.12];
mountVariants['polar-bear'].stuffed.offset=[0,0,-0.17];
mountVariants['polar-bear'].stuffed.scale=0.95;
mountVariants.cat.stuffed.offset=[-0.0242,0,-0.04375];
mountVariants.cat.stuffed.scale=0.955;

export function resolveMountVariant(identity,style){
 const mapping=mountVariants[identity];
 if(!mapping)throw new Error("Unknown Carousel mount: "+identity);
 return mapping[style]?.url?mapping[style]:mapping.ornate;
}
