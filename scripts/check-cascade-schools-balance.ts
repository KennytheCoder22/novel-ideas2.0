// Small deterministic sanity probe, not a human preference study or solvability proof.
import { decodeBoard, findLegalMoves } from '../lib/recommendationGames/alchemistsCascade';
import { chooseSchool, createExperiment, forecast, playMove, preview, RECIPE, type ExperimentSave, type School } from '../lib/recommendationGames/cascadeSchoolsExperiment';
function move(s:ExperimentSave) {
  const goals=RECIPE.goals.filter(g=>s.collected[g.kind]<g.target);
  const moves=findLegalMoves(decodeBoard(s.board)!,goals).sort((a,b)=>b.estimatedGoalHits-a.estimatedGoalHits || b.estimatedScore-a.estimatedScore);
  let m=moves[0];
  if(s.school==='oracle') {
    s=preview(s,m.from,m.to);
    const known=forecast(s,m.from,m.to);
    const hits=goals.reduce((n,g)=>n+Math.min(g.target-s.collected[g.kind],known.collected[g.kind]),0);
    // One actual preview only. Alternative assessed using visible immediate matches.
    if(moves[1] && moves[1].estimatedGoalHits>hits) m=moves[1];
  }
  return playMove(s,m.from,m.to);
}
for(const school of ['oracle','veiled'] as School[]) {
  const rows=[];
  for(let seed=120;seed<132;seed++) {
    let s=createExperiment('balance','teens',seed);
    for(let t=0;t<4;t++)s=move(s);
    s=chooseSchool(s,school);
    for(let t=0;t<RECIPE.moves && !['won','lost'].includes(s.stage);t++) {
      if(s.stage==='midpoint')s=chooseSchool(s,school);
      s=move(s);
    }
    rows.push({seed,outcome:s.stage,movesLeft:s.moves,goalProgress:RECIPE.goals.map(g=>Math.min(g.target,s.collected[g.kind])),uses:s.uses});
  }
  console.log(JSON.stringify({school,policy:'visible-goals-one-oracle-preview',wins:rows.filter(r=>r.outcome==='won').length,runs:rows.length,rows}));
}
