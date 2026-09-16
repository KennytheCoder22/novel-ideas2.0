import assert from "node:assert/strict";
import test from "node:test";
import {melanieArtworkPhase} from "./melanieArtwork";
import {anonymousSynopsis,startStoryTournament,finishStoryRound,restoreStoryTournament,storySignals,type StoryBook} from "./melaniesRealBooks";
const pool:StoryBook[]=Array.from({length:30},(_,i)=>({id:`book-${i}`,source:"localLibrary",sourceId:`${i}`,title:`Title ${i}`,author:"Writer",synopsis:`A traveler explores strange worlds and discovers a secret that changes the future forever ${i}.`,description:"Catalog description",coverUrl:null,genres:[i%2?"fantasy":"mystery"],themes:[`theme-${i%4}`],tones:[],dynamics:[]}));
test("three rounds retain ranked survivors and introduce unseen real contenders",()=>{
 let s=startStoryTournament(pool,"library-a","session");const seen=new Set<string>();
 for(let round=0;round<3;round++){
  assert.equal(s.offered.length,6);s.offered.forEach(id=>seen.add(id));
  const selected=s.offered.slice(0,3);s=finishStoryRound({...s,phase:"rank",selected});
  if(round<2){assert(selected.every(id=>s.offered.includes(id)));assert.equal(s.offered.filter(id=>!seen.has(id)).length,3);}
 }
 assert.equal(s.phase,"reveal");assert.equal(seen.size,12);assert.equal(storySignals(s).length,12);
 assert.deepEqual(restoreStoryTournament(JSON.stringify(s),"library-a"),s);
 assert.equal(restoreStoryTournament(JSON.stringify(s),"library-b"),null);
 assert.equal(restoreStoryTournament(JSON.stringify({...s,selected:["unknown"]}),"library-a"),null);
});
test("catalog synopsis uses a sentence without author or title advertising",()=>{
 assert.equal(anonymousSynopsis("Bestselling author Jane Smith presents The Secret. A sailor is pursued by a shadow across the ocean while searching for her missing brother.","The Secret",["Jane Smith"]),"A sailor is pursued by a shadow across the ocean while searching for her missing brother.");
 assert.equal(anonymousSynopsis("Jane Smith presents The Secret, an award-winning new novel about her favorite subjects.","The Secret",["Jane Smith"]),null);
});
test("invalid rankings and insufficient catalogs cannot create imaginary replacements",()=>{
 assert.throws(()=>startStoryTournament(pool.slice(0,3),"x","x"));
 const s=startStoryTournament(pool,"x","x");assert.throws(()=>finishStoryRound({...s,phase:"rank",selected:[s.offered[0],s.offered[0],s.offered[1]]}));
});

test("limited catalogs complete and restore without invented challengers",()=>{
 for(const size of [4,5,6,7,8,9,10,11,12]){
  let s=startStoryTournament(pool.slice(0,size),"small","small");
  let turns=0;
  while(s.phase!=="reveal"){
   assert(s.offered.length>=4 && s.offered.length<=6);
   s=finishStoryRound({...s,phase:"rank",selected:s.offered.slice(0,3)});
   assert(++turns<=3);
   assert.deepEqual(restoreStoryTournament(JSON.stringify(s),"small"),s);
  }
  assert.equal(s.selected.length,3);
 }
});

test("artwork phases follow the live tournament state",()=>{
 assert.equal(melanieArtworkPhase(null,0),"opening");
 assert.equal(melanieArtworkPhase("choose",0),"opening");
 assert.equal(melanieArtworkPhase("rank",0),"ranking");
 assert.equal(melanieArtworkPhase("choose",1),"challenger");
 assert.equal(melanieArtworkPhase("rank",2),"ranking");
 assert.equal(melanieArtworkPhase("reveal",3),"reveal");
});
