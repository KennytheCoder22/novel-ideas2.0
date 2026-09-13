import { CASCADE_LEVELS, createActiveLevel, decodeBoard, encodeBoard, catalystOptions, applyCatalyst, applySwap, findLegalMoves, levelWon } from '../lib/recommendationGames/alchemistsCascade';
const config = CASCADE_LEVELS[10];
const initial = createActiveLevel(config, '2026-09-13T00:00:00.000Z');
const board = decodeBoard(initial.board)!;
const boost = applyCatalyst(board, initial.rngState, catalystOptions(board, 'audit', 0, initial.rngState, config.goals)[0]);
let beam = [{ ...initial, board: encodeBoard(boost.board), rngState: boost.rng.state, score: boost.scoreDelta, collected: boost.collected, catalystUsed: true, path: [] as unknown[] }];
for (let depth = 0; depth < config.moves; depth++) {
  const next = new Map<string, typeof beam[number]>();
  for (const state of beam) {
    const current = decodeBoard(state.board)!;
    for (const move of findLegalMoves(current, config.goals)) {
      const result = applySwap(current, state.rngState, move.from, move.to, config.goals);
      const candidate = { ...state, board: encodeBoard(result.board), rngState: result.rng.state, score: state.score + result.scoreDelta, collected: state.collected.map((v, i) => v + result.collected[i]), movesRemaining: state.movesRemaining - 1, path: [...state.path, { from: move.from, to: move.to }] };
      if (levelWon(candidate, config)) { console.log(JSON.stringify({ won: true, moves: depth + 1, score: candidate.score, collected: candidate.collected, path: candidate.path })); process.exit(0); }
      const key = `${candidate.board}:${candidate.rngState}:${candidate.collected.join(',')}`;
      next.set(key, candidate);
    }
  }
  const rank = (s: typeof beam[number]) => config.goals.reduce((n, g) => n + Math.min(g.target, s.collected[g.kind]) / g.target, 0) * 10000 + Math.min(s.score, config.scoreTarget) / 100;
  beam = [...next.values()].sort((a,b) => rank(b)-rank(a)).slice(0, 500);
  console.error(`depth ${depth+1}, candidates ${next.size}, best ${beam[0]?.collected.join(',')}`);
}
console.log('No solution found within this bounded search; not proof of impossibility.');
