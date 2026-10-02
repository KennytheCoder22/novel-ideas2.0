import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applySwap, createBoard, decodeBoard, encodeBoard, findLegalMoves, normalizeCascadeEvent } from './alchemistsCascade';
import { chooseSchool, createExperiment, diagnostics, forecast, playMove, preview, RECIPE, restoreExperiment, retryExperiment, type ExperimentSave, type School } from './cascadeSchoolsExperiment';

function next(s:ExperimentSave, optimal=true) {
  const moves=findLegalMoves(decodeBoard(s.board)!,RECIPE.goals);
  assert.ok(moves.length);
  const utility=(m:typeof moves[number])=>{const r=forecast(s,m.from,m.to);return RECIPE.goals.reduce((sum,g)=>sum+Math.min(Math.max(0,g.target-s.collected[g.kind]),r.collected[g.kind]),0)*100 + Math.min(Math.max(0,RECIPE.scoreTarget-s.score),r.scoreDelta);};
  moves.sort((a,b)=>utility(b)-utility(a));
  const m=optimal?moves[0]:moves.at(-1)!;
  if(s.school==='oracle') s=preview(s,m.from,m.to);
  return playMove(s,m.from,m.to);
}
function trials(seed=123):ExperimentSave {
  let s=createExperiment('qa','teens',seed);
  for(let i=0;i<4;i++)s=next(s);
  assert.equal(s.stage,'choose');assert.equal(s.trialsDone,2);
  return s;
}
function round(s:ExperimentSave, optimal=true, decision:'keep'|'switch'|'fate'='keep') {
  for(let i=0;i<RECIPE.moves+1 && !['won','lost'].includes(s.stage);i++) {
    if(s.stage==='midpoint') s=chooseSchool(s,decision==='fate'?'fate':decision==='keep'?s.school:s.school==='oracle'?'veiled':'oracle');
    s=next(s,optimal);
    assert.deepEqual(restoreExperiment(JSON.stringify(s),s.scope),s);
  }
  assert.ok(['won','lost'].includes(s.stage));return s;
}
test('both interactive trials mandatory, matched boards, counterbalanced, no semantic events',()=>{
  for(const seed of [123,124]){
    let s=createExperiment('qa','kids',seed); const initial=s.board;
    assert.throws(()=>chooseSchool(s,'oracle'));
    s=next(next(s));assert.equal(s.board,initial);assert.equal(s.trialsDone,1);assert.throws(()=>chooseSchool(s,'fate'));
    s=next(next(s));assert.equal(s.events.length,2);assert.ok(s.events.every(e=>!e.recommendationEligible));
    assert.deepEqual(s.events.map(e=>e.activeSchool),s.order);
    assert.equal(s.events[1].bothTrialsCompleted,true);
  }
  assert.notDeepEqual(createExperiment('qa','kids',123).order,createExperiment('qa','kids',124).order);
});
test('Oracle shows exact deterministic outcome without consuming board/moves/RNG; Veiled actually transforms',()=>{
  const start=trials();let o=chooseSchool(start,'oracle');let v=chooseSchool(start,'veiled');
  assert.equal(o.board,v.board);
  const m=findLegalMoves(decodeBoard(o.board)!)[0];const before=JSON.stringify(o);const predicted=forecast(o,m.from,m.to);
  const seen=preview(o,m.from,m.to);assert.equal(JSON.stringify(o),before);assert.equal(seen.board,o.board);assert.equal(seen.rng,o.rng);assert.equal(seen.moves,o.moves);
  o=playMove(seen,m.from,m.to);assert.equal(o.board,encodeBoard(predicted.board));assert.equal(o.uses.oracle,1);assert.equal(o.previewsPlayed,1);
  assert.throws(()=>preview(v,m.from,m.to));
  for(let i=0;i<3;i++)v=next(v);
  const vm=findLegalMoves(decodeBoard(v.board)!)[0];const base=forecast(v,vm.from,vm.to);
  const after=playMove(v,vm.from,vm.to);assert.notEqual(after.board,encodeBoard(base.board));assert.equal(after.score,v.score+base.scoreDelta);assert.equal(after.uses.veiled,1);
});
test('Keep/Switch/Fate resume identical stable board; exact reload at every boundary',()=>{
  const initial=trials();assert.deepEqual(restoreExperiment(JSON.stringify(initial),'qa'),initial);
  assert.equal(restoreExperiment(JSON.stringify(initial),'other-age'),null);
  let s=chooseSchool(initial,'oracle');
  for(let i=0;i<RECIPE.moves/2;i++)s=next(s,false);
  assert.equal(s.stage,'midpoint');
  for(const choice of ['oracle','veiled','fate'] as const){
    const n=chooseSchool(s,choice);assert.equal(n.board,s.board);assert.equal(n.rng,s.rng);assert.equal(n.moves,s.moves);assert.equal(n.stage,'play');assert.equal(n.midpointDone,true);
    assert.deepEqual(restoreExperiment(JSON.stringify(n),'qa'),n);assert.equal(n.events.at(-1)?.recommendationEligible,false);
    assert.deepEqual(n.events.at(-1)?.alternatives,['keep','switch','fate']);
  }
});
test('both schools can win, lose and retry; raw observations preserve context, never recommendation events',()=>{
  for(const school of ['oracle','veiled'] as School[]){
    const won=round(chooseSchool(trials(123),school));assert.equal(won.stage,'won',school);
    const lost=round({...chooseSchool(trials(123),school),moves:1},false);assert.equal(lost.stage,'lost');
    const retry=retryExperiment(lost);assert.equal(retry.attempt,2);assert.equal(retry.stage,'choose');assert.equal(retry.trialsDone,2);
    assert.deepEqual(restoreExperiment(JSON.stringify(retry),'qa'),retry);
    const choice=won.events.find(e=>e.kind==='first_choice')!;assert.equal(choice.recipeId,RECIPE.id);assert.equal(choice.ageBand,'teens');assert.equal(choice.seed,123);assert.equal(choice.context.moves,RECIPE.moves);assert.ok(choice.context.checksum);
    assert.ok(won.events.every(e=>e.recommendationEligible===false && normalizeCascadeEvent(e)===null));assert.ok(won.events.at(-1)?.context.uses[school]);
  }
});
test('diagnostic probes are read-only and flag low-move confounds; no false win probability',()=>{
  const s={...chooseSchool(trials(),'fate'),moves:3};const before=JSON.stringify(s);const d=diagnostics(s);
  assert.equal(JSON.stringify(s),before);assert.equal(d.winProbability,null);assert.equal(d.confounded,true);assert.ok(d.reasons.includes('low_moves'));
});
test('experimental route cannot import production evidence plumbing; original engine is unmodified',()=>{
  for(const name of ['app/games/cascade-schools.tsx','lib/recommendationGames/cascadeSchoolsExperiment.ts']){
    const source=readFileSync(name,'utf8');assert.doesNotMatch(source,/useGameRecommendationMilestone|adaptAlchemistsCascade|createCascadeEvent|transactCascade|fetch\(/);
  }
  const a=createBoard(123),b=createBoard(123);const m=findLegalMoves(a.board)[0];
  assert.deepEqual(applySwap(a.board,a.rng.state,m.from,m.to),applySwap(b.board,b.rng.state,m.from,m.to));
});
