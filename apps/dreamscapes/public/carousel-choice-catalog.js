/* Reviewed existing objects, not a book taxonomy or recommendation adapter. */
(() => {
 'use strict';
 const names=[['dragon','Dragon'],['rocket','Rocket'],['horse','Horse'],['griffin','Griffin'],['unicorn','Unicorn'],['moon-loveseat','Moon Loveseat'],['snail','Snail'],['brown-horse','Brown Horse'],['elephant','Elephant'],['grizzly','Grizzly Bear'],['wolf','Wolf'],['rabbit','Rabbit'],['fox','Fox'],['tiger','Tiger'],['stag','Stag'],['cat','Cat'],['ostrich','Ostrich'],['polar-bear','Polar Bear'],['zebra','Zebra'],['flamingo','Flamingo']];
 const mounts=names.map(([id,label])=>Object.freeze({id,label}));
 const byId=Object.fromEntries(mounts.map(m=>[m.id,m]));
 const limitation='Tentative object association only: selection may reflect appearance, softness, color or familiarity, not a literary preference. Unchosen mounts imply no dislike.';
 const styleFor=band=>({kids:'stuffed','pre-teens':'stuffed',teens:'plain',adults:'ornate'})[band]||null;
 function association(style,id){
  if(!['ornate','plain','stuffed'].includes(style)||!Object.hasOwn(byId,id))return [];
  let value,rationale;
  if(id==='rocket'){value='science-fiction';rationale='The existing finned rocket suggests a space vehicle; liking the object may be purely aesthetic.';}
  if(['dragon','unicorn','griffin'].includes(id)){
   value='fantasy';rationale=id==='dragon'&&style==='stuffed'?'This asset named Dragon is a winged plush horse-like creature: fantasy is possible but the visual association differs from the other styles.':'The existing mythical creature suggests fantasy imagery; choosing it is not a stated preference for fantasy books.';
  }
  return value?[{dimension:'genres',value,rationale}]:[];
 }
 function interpret(style,id,offered,already=[]){
  const proposedAttributes=association(style,id);
  const families=new Set(offered.flatMap(option=>association(style,option).map(a=>a.value)));
  let status='unsupported';
  if(proposedAttributes.length)status=!families.has('fantasy')||!families.has('science-fiction')?'insufficient-comparison':already.includes(proposedAttributes[0].value)?'repeat-suppressed':'tentative';
  return {status,proposedAttributes,limitation};
 }
 globalThis.DreamscapesCarouselCatalog=Object.freeze({version:'carousel-1',period:18000,rideTurns:2,mounts:Object.freeze(mounts),byId:Object.freeze(byId),styleFor,association,interpret,limitation});
})();
