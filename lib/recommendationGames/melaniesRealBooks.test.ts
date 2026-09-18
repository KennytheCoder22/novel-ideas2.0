import assert from "node:assert/strict";
import test from "node:test";
import { melanieArtworkPhase } from "./melanieArtwork";
import { createGameRecommendationSlateFeedbackEvent, isGameRecommendationSlateFeedbackEventV1, gameRecommendationFeedbackMaxLength } from "./gameRecommendationFeedback";
import { anonymousSynopsis, startStoryTournament, saveStoryDeal, rankSecretHand, canRankSecretHand, finishStoryRound, restoreStoryTournament, storySignals, type StoryBook } from "./melaniesRealBooks";
const pool: StoryBook[] = Array.from({length:30},(_,i)=>({id:`book-${i}`,source:"localLibrary",sourceId:`${i}`,title:`Title ${i}`,author:"Writer",synopsis:`A traveler explores strange worlds and discovers a secret that changes the future forever ${i}.`,description:"Catalog description",coverUrl:null,genres:[i%2?"fantasy":"mystery"],themes:[`theme-${i%4}`],tones:[],dynamics:[]}));
const start = () => startStoryTournament(pool,"library-a:teens","session");

for (const count of [0,1,2,3,5,6]) test(`saving ${count} genuine picks deals six entirely unseen books`,()=>{
  const s = start(); const selected = s.offered.slice(0,count).reverse();
  const next = saveStoryDeal({...s,selected});
  assert.deepEqual(next.held,selected); assert.equal(next.offered.length,6);
  assert(next.offered.every(id=>!s.offered.includes(id)));
  assert.deepEqual(next.deals,[{offered:s.offered,saved:selected}]); assert.deepEqual(next.selected,[]);
  assert.equal(storySignals(next).length,count);
  assert(storySignals(next).every(signal=>signal.action==="like" && signal.weight===0.6));
  assert.deepEqual(restoreStoryTournament(JSON.stringify(next),s.scope),next);
});
test("five picks proceed immediately; reveal is exactly the saved ranking",()=>{
  const s=start(); const chosen=s.offered.slice(0,5); const ranked=rankSecretHand({...s,selected:chosen});
  assert.equal(ranked.phase,"rank"); assert.deepEqual(ranked.held,chosen);
  const revealed=finishStoryRound({...ranked,selected:[...chosen].reverse()});
  assert.equal(revealed.phase,"reveal"); assert.deepEqual(revealed.selected,[...chosen].reverse());
  assert.deepEqual(restoreStoryTournament(JSON.stringify(revealed),s.scope),revealed);
  assert.equal(storySignals(revealed).length,5);
  assert.equal(storySignals(revealed).find(signal=>signal.id?.endsWith(chosen[4]))!.weight,1);
  assert(storySignals(revealed).every(signal=>signal.action==="like"));
});
test("selective player can rank three across several deals without recording an untouched deal",()=>{
  let s=start(); const seen=new Set<string>();
  for(const count of [0,1,0,2]) {
    assert(s.offered.every(id=>!seen.has(id))); s.offered.forEach(id=>seen.add(id));
    s=saveStoryDeal({...s,selected:s.offered.slice(0,count)});
  }
  assert.equal(s.held.length,3); assert(canRankSecretHand(s));
  const ranked=rankSecretHand(s); assert.deepEqual(ranked.selected,s.held); assert.equal(ranked.deals.length,4);
});
test("small catalogs exhaust honestly without forced interest, repeats or invented books",()=>{
  for(const size of [4,5,6,7,8,9,10,11,12]) for(const picks of [0,1,2]) {
    let s=startStoryTournament(pool.slice(0,size),"small","small"); const seen=new Set<string>();
    while(s.offered.length) {
      assert(s.offered.every(id=>!seen.has(id))); s.offered.forEach(id=>seen.add(id));
      s=saveStoryDeal({...s,selected:s.held.length ? [] : s.offered.slice(0,picks)});
      assert.deepEqual(restoreStoryTournament(JSON.stringify(s),"small"),s);
    }
    assert.equal(seen.size,size); assert.equal(storySignals(s).length,picks); assert.equal(canRankSecretHand(s),picks>0);
    if(picks) assert.equal(finishStoryRound(rankSecretHand(s)).selected.length,picks); else assert.throws(()=>rankSecretHand(s));
    assert.throws(()=>saveStoryDeal(s));
  }
});
test("partial deal and hand restore only in exact age/source/library scope",()=>{
  let s=start(); s=saveStoryDeal({...s,selected:s.offered.slice(0,2)}); s={...s,selected:s.offered.slice(0,1)};
  assert.deepEqual(restoreStoryTournament(JSON.stringify(s),s.scope),s);
  for(const scope of ["library-a:kids","library-b:teens","library-a:teens:other-source"]) assert.equal(restoreStoryTournament(JSON.stringify(s),scope),null);
  assert.equal(restoreStoryTournament(JSON.stringify({...s,held:["unknown"]}),s.scope),null);
  assert.equal(restoreStoryTournament(JSON.stringify({...s,offered:[s.held[0]]}),s.scope),null);
  assert.equal(restoreStoryTournament(JSON.stringify({...s,deals:[...s.deals,...s.deals]}),s.scope),null);
});
test("rankings contain every held book exactly once, never additional unselected books",()=>{
  const s=start(); const r=rankSecretHand({...s,selected:s.offered.slice(0,6)});
  assert.throws(()=>finishStoryRound({...r,selected:r.selected.slice(0,3)}));
  assert.throws(()=>finishStoryRound({...r,selected:[...r.selected.slice(0,5),r.selected[0]]}));
  assert.throws(()=>finishStoryRound({...r,selected:[...r.selected.slice(0,5),r.offered[0]]}));
  assert.throws(()=>saveStoryDeal({...s,selected:[s.offered[0],s.offered[0]]}));
  assert.throws(()=>startStoryTournament(pool.slice(0,3),"x","x"));
});
test("legacy in-progress and revealed tournaments migrate without losing confirmed choices",()=>{
  const s=start(); const old={version:1,scope:s.scope,sessionId:s.sessionId,pool,offered:s.offered,selected:s.offered.slice(0,3),rounds:[],phase:"rank"};
  const migrated=restoreStoryTournament(JSON.stringify(old),s.scope)!;
  assert.equal(migrated.version,2); assert.deepEqual(migrated.held,old.selected);
  assert.deepEqual(restoreStoryTournament(JSON.stringify(migrated),s.scope),migrated);
  const final={...old,phase:"reveal",rounds:Array.from({length:3},()=>({offered:s.offered,ranked:old.selected})),shownAt:new Date().toISOString()};
  const revealed=restoreStoryTournament(JSON.stringify(final),s.scope)!;
  assert.equal(revealed.phase,"reveal"); assert.deepEqual(revealed.selected,old.selected);
  assert.deepEqual(restoreStoryTournament(JSON.stringify(revealed),s.scope),revealed);
});
test("catalog synopsis uses a sentence without author or title advertising",()=>{
  assert.equal(anonymousSynopsis("Bestselling author Jane Smith presents The Secret. A sailor is pursued by a shadow across the ocean while searching for her missing brother.","The Secret",["Jane Smith"]),"A sailor is pursued by a shadow across the ocean while searching for her missing brother.");
  assert.equal(anonymousSynopsis("Jane Smith presents The Secret, an award-winning new novel about her favorite subjects.","The Secret",["Jane Smith"]),null);
});
test("existing artwork phase contract is preserved",()=>{
  assert.equal(melanieArtworkPhase(null,0),"opening"); assert.equal(melanieArtworkPhase("rank",0),"ranking");
  assert.equal(melanieArtworkPhase("choose",1),"challenger"); assert.equal(melanieArtworkPhase("reveal",3),"reveal");
});
test("full hand feedback accepts six and larger Melanie hands without widening other games",()=>{
  for(const count of [1,3,5,6,30,180]) {
    const recommendations=Array.from({length:count},(_,i)=>({id:`book-${i}`,source:"localLibrary",sourceId:String(i),title:`Real book ${i}`,author:"Author",rank:i+1}));
    const event=createGameRecommendationSlateFeedbackEvent({game:"melanies_game",anonymousPlayerId:"qa",gameSessionId:"secret",evidenceSnapshotVersion:"v1",evidenceSnapshot:{signalCount:count,positiveSignalCount:count,negativeSignalCount:0,sources:["melanies_game"],semanticTags:[]},evidenceMode:"semantic_only",recommendations,ranking:recommendations.map(b=>b.id),preferredBookId:null,ageBand:"teens",library:{libraryId:"library-a",localCollectionOnly:true},shownAt:"2026-09-17T00:00:00.000Z",respondedAt:"2026-09-17T00:01:00.000Z"});
    assert(isGameRecommendationSlateFeedbackEventV1(event));
    assert.equal(isGameRecommendationSlateFeedbackEventV1({...event,game:"media_mania"}),count<=5);
    assert.equal(gameRecommendationFeedbackMaxLength({...event,game:"media_mania"}),12000);
    assert.equal(isGameRecommendationSlateFeedbackEventV1({...event,ranking:["not-held"]}),false);
  }
});
